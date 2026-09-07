import { Database } from "bun:sqlite";
import { afterAll, beforeAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type ContentRelease,
  canonicalJson,
  type MatchManifest,
  type RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  activationStorageCard,
  storageActivationFixture,
  submitActivationResponse,
} from "../test-fixtures/activation-source";
import {
  type CommandRecord,
  Coordinator,
  createRepository,
  exportMatch,
  importMatch,
  type Repository,
  replayMatch,
  type SqlDatabase,
} from "./index";
import { openNativeRepository } from "./native";

const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
const output =
  process.env.ACTIVATION_STORAGE_OUTPUT ?? mkdtempSync(join(tmpdir(), "activation-native-proof-"));
mkdirSync(output, { recursive: true });
type Boundary = { state: RulesState; save: string; last: CommandRecord };
type Run = {
  release: ContentRelease;
  boundaries: Record<string, Boundary>;
  execution: ReturnType<Coordinator["executionInfo"]>;
  file: string;
};
const runs = new Map<MatchManifest["resolver"], Run>();
const stages = ["target", "payment", "mana", "paid", "resolved", "source-left"] as const;
function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) throw new Error(message);
  return value;
}
function run(mode: MatchManifest["resolver"]) {
  return required(runs.get(mode), "Missing ordinary native history");
}
function boundary(value: Run, name: string) {
  return required(value.boundaries[name], `Missing native boundary ${name}`);
}
function ability(state: RulesState) {
  return required(Object.values(state.activatedAbilities ?? {})[0], "No saved noncard ability");
}
function stateSource(state: RulesState) {
  return Object.values(state.objects).find(
    (object) =>
      object.owner === "A" && object.definition === activationStorageCard("Nantuko Disciple").id,
  );
}
async function retain(
  repo: Repository,
  coordinator: Coordinator,
  release: ContentRelease,
  name: string,
  mode: string,
): Promise<Boundary> {
  const state = coordinator.current(),
    save = await exportMatch(repo, release, state.manifest.id);
  const last = required(
    repo.load(state.manifest.id)?.records.at(-1),
    "No accepted command at boundary",
  );
  writeFileSync(join(output, `${mode}-${name}.json`), save);
  return { state, save, last };
}
beforeAll(async () => {
  for (const mode of modes) {
    const source = await storageActivationFixture(`ordinary-activation:${mode}`, mode);
    writeFileSync(join(output, "source-release.json"), canonicalJson(source.release));
    const file = join(output, `${mode}.sqlite`),
      repo = openNativeRepository(file);
    const coordinator = await Coordinator.create(
      repo,
      source.release,
      source.manifest,
      source.artifact,
    );
    const boundaries: Record<string, Boundary> = {};
    try {
      for (let count = 0; count < 600; count++) {
        const state = coordinator.current(),
          decision = state.decision;
        if (!decision) throw new Error("Ordinary history ended before activation workflow");
        if (decision.kind === "activation-target" && !boundaries.target)
          boundaries.target = await retain(repo, coordinator, source.release, "target", mode);
        if (decision.kind === "activation-payment" && !boundaries.payment) {
          boundaries.payment = await retain(repo, coordinator, source.release, "payment", mode);
          const green = required(
            decision.manaSources.find((row) => row.colors.includes("G")),
            "No actual green mana source",
          );
          await submitActivationResponse(coordinator, {
            kind: "mana",
            source: { object: green.object, color: "G" },
          });
          boundaries.mana = await retain(repo, coordinator, source.release, "mana", mode);
          continue;
        }
        if (
          Object.values(state.activatedAbilities ?? {}).some((row) => row.payment) &&
          !boundaries.paid
        )
          boundaries.paid = await retain(repo, coordinator, source.release, "paid", mode);
        if (
          state.events.some((row) => row.type === "ActivatedAbilityResolved") &&
          !boundaries.resolved
        )
          boundaries.resolved = await retain(repo, coordinator, source.release, "resolved", mode);
        if (boundaries.resolved && stateSource(state)?.zone === "hand") {
          boundaries["source-left"] = await retain(
            repo,
            coordinator,
            source.release,
            "source-left",
            mode,
          );
          break;
        }
        await submitActivationResponse(coordinator);
      }
      for (const name of stages) required(boundaries[name], `Ordinary history missed ${name}`);
      runs.set(mode, {
        release: source.release,
        boundaries,
        execution: coordinator.executionInfo(),
        file,
      });
    } finally {
      await coordinator.close();
    }
  }
}, 120000);
afterAll(() => {
  const rows = [...runs.entries()].map(([mode, value]) => ({
    mode,
    releaseHash: value.release.hash,
    file: value.file,
    execution: value.execution,
    boundaries: Object.fromEntries(
      Object.entries(value.boundaries).map(([name, row]) => [
        name,
        {
          revision: row.state.revision,
          stateHash: row.last.receipt.stateHash,
          outcome: row.state.outcome,
          save: `${mode}-${name}.json`,
        },
      ]),
    ),
  }));
  writeFileSync(
    join(output, "histories.json"),
    JSON.stringify(
      {
        schema: "ordinary-activation-native/1",
        scope:
          "Ordinary legal100-card decks/normal shuffle and dealt history; stopped workflows, zero completed games. Seed14 separately qualified from1..14, no state edits.",
        modes: rows,
      },
      null,
      2,
    ),
  );
});

for (const mode of modes) {
  test(`ACT-SRC31 ${mode}: ordinary target/payment/mana/paid/effect/departure boundaries preserve exact source and costs`, () => {
    const value = run(mode),
      target = boundary(value, "target"),
      payment = boundary(value, "payment"),
      mana = boundary(value, "mana"),
      paid = boundary(value, "paid"),
      resolved = boundary(value, "resolved");
    expect(target.state.decision?.kind).toBe("activation-target");
    expect(ability(target.state).target).toBeNull();
    expect(ability(payment.state).target).toBe(
      required(stateSource(payment.state), "Missing actual source").id,
    );
    expect(ability(payment.state).payment).toBeNull();
    expect(stateSource(payment.state)?.tapped).toBe(false);
    expect(mana.state.players.find((row) => row.id === "A")?.mana.G).toBe(1);
    expect(ability(mana.state).id).toBe(ability(payment.state).id);
    expect(stateSource(paid.state)?.tapped).toBe(true);
    expect(ability(paid.state).payment?.spend.G).toBe(1);
    expect(ability(paid.state).payment?.sources).toEqual([]);
    expect(resolved.state.continuousEffects[0]?.activation?.id).toBe(ability(paid.state).id);
    expect(stateSource(boundary(value, "source-left").state)?.zone).toBe("hand");
    for (const name of stages) {
      const state = boundary(value, name).state;
      expect(state.outcome.kind).toBe("ongoing");
      for (const seat of state.players)
        expect(
          Object.values(state.objects).filter((row) => !row.token && row.owner === seat.id),
        ).toHaveLength(100);
    }
  });

  test(`ACT-SRC31 ${mode}: all six real SQLite checkpoints reopen/import/replay and return exact concurrent retries`, async () => {
    const value = run(mode);
    for (const name of stages) {
      const row = boundary(value, name),
        repo = openNativeRepository(join(output, `${mode}-${name}-import.sqlite`));
      await importMatch(repo, value.release, row.save);
      const coordinator = await Coordinator.open(repo, value.release, row.state.manifest.id);
      expect(canonicalJson(coordinator.current())).toBe(canonicalJson(row.state));
      expect(await replayMatch(repo, value.release, row.state.manifest.id)).toEqual(row.state);
      const results = await Promise.all([
        coordinator.submit(row.last.command.actor, row.last.command),
        coordinator.submit(row.last.command.actor, row.last.command),
      ]);
      for (const result of results)
        expect(result).toEqual({ status: "accepted", receipt: row.last.receipt });
      expect(
        (
          await coordinator.submit(row.last.command.actor, {
            ...row.last.command,
            decisionId: `${row.last.command.decisionId}:conflict`,
          })
        ).status,
      ).toBe("rejected");
      const snapshot = coordinator.current();
      for (const actor of ["A", "B"]) {
        const view = coordinator.view(actor);
        expect(
          view.objects.some(
            (object) =>
              object.zone === "library" || (object.zone === "hand" && object.owner !== actor),
          ),
        ).toBe(false);
        expect(view.activatedAbilities?.map((a) => a.id) ?? []).toEqual(
          Object.keys(snapshot.activatedAbilities ?? {}),
        );
      }
      await coordinator.close();
      const reopened = openNativeRepository(join(output, `${mode}-${name}-import.sqlite`));
      expect(await replayMatch(reopened, value.release, row.state.manifest.id)).toEqual(row.state);
      reopened.close();
    }
  }, 120000);

  test(`ACT-SRC31 ${mode}: three actual SQL failure points roll back mana, completed payment and publication`, async () => {
    const value = run(mode),
      from = boundary(value, "mana"),
      to = boundary(value, "paid");
    for (const failurePoint of [
      "INSERT INTO commander_commands",
      "UPDATE commander_matches",
      "COMMIT",
    ]) {
      const db = new Database(":memory:");
      let armed = false;
      const sql: SqlDatabase = {
        exec(query, bind) {
          if (armed && query.startsWith(failurePoint)) throw new Error(`Injected ${failurePoint}`);
          if (bind) db.run(query, bind);
          else db.exec(query);
        },
        rows(query, bind = []) {
          return db.query(query).all(...bind) as Record<string, unknown>[];
        },
        close() {
          db.close();
        },
      };
      const repo = createRepository(sql);
      await importMatch(repo, value.release, from.save);
      const coordinator = await Coordinator.open(repo, value.release, from.state.manifest.id);
      armed = true;
      expect((await coordinator.submit(to.last.command.actor, to.last.command)).status).toBe(
        "fault",
      );
      expect(coordinator.current()).toEqual(from.state);
      expect(repo.load(from.state.manifest.id)?.current).toEqual(from.state);
      expect(repo.findRecord(from.state.manifest.id, to.last.command.commandId)).toBeNull();
      armed = false;
      expect(await coordinator.submit(to.last.command.actor, to.last.command)).toEqual({
        status: "accepted",
        receipt: to.last.receipt,
      });
      await coordinator.close();
    }
  }, 60000);

  test(`ACT-SRC31 ${mode}: rehashed source/target/payment/origin/modifier forgeries fail real replay before import`, async () => {
    const value = run(mode);
    const mutations: [string, (state: RulesState) => void][] = [
      [
        "payment",
        (state) => {
          ability(state).source.generation++;
        },
      ],
      [
        "payment",
        (state) => {
          ability(state).target = "forged@1";
        },
      ],
      [
        "paid",
        (state) => {
          const paid = required(ability(state).payment, "paid context missing");
          paid.spend.G = 0;
        },
      ],
      [
        "paid",
        (state) => {
          ability(state).announcement.data.controller = "B";
        },
      ],
      [
        "resolved",
        (state) => {
          const effect = required(state.continuousEffects[0], "missing effect");
          effect.modifier.powerDelta++;
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
      const envelope = JSON.parse(boundary(value, name).save);
      mutate(envelope.payload.current);
      envelope.payload.currentHash = await semanticHash(envelope.payload.current);
      envelope.payload.records.at(-1).receipt.stateHash = envelope.payload.currentHash;
      envelope.checksum = await semanticHash(envelope.payload);
      const repo = openNativeRepository(":memory:");
      await expect(importMatch(repo, value.release, canonicalJson(envelope))).rejects.toThrow();
      expect(repo.list()).toEqual([]);
      repo.close();
    }
  }, 60000);
}
