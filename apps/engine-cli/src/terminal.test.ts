import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  type ContentRelease,
  type DeckRevision,
  ENGINE_VERSION,
  emptyMana,
  type MatchManifest,
  SERIALIZER_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { Coordinator } from "@iwsdk-apps/storage";
import { openNativeRepository } from "@iwsdk-apps/storage/native";
import { runTerminal, TERMINAL_DRIVER_VERSION } from "./terminal";

const cleanups: (() => void | Promise<void>)[] = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), "commander-terminal-")));
  cleanups.push(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "game.sqlite");
  // A synthetic large hasty commander makes an actual terminal-driven game
  // finish quickly; this is an input/persistence fixture, not a real deck proof.
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "synthetic-terminal-commander",
    sourceVersion: "a".repeat(64),
    name: "Terminal fixture commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), generic: 0 },
    manaValue: 0,
    power: 40,
    toughness: 40,
    keywords: ["haste"],
    manaAbilities: [],
    oracleText: "Haste",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "terminal-fixture/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "synthetic-terminal-land",
    name: "Terminal fixture Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    colors: [],
    manaCost: null,
    power: null,
    toughness: null,
    keywords: [],
    oracleText: "",
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
  };
  const releaseBody = {
    schema: "commander-content/1" as const,
    id: "terminal-fixtures",
    sourceBundle: "synthetic-terminal-fixture",
    rulesHash: "a".repeat(64),
    profile: "tabletop-commander" as const,
    assurance: "development-subset" as const,
    definitions: { commander, land },
    unsupportedOracleIds: [],
    eligibleDenominator: 0,
    compilerVersion: "terminal-fixture/1",
    processorAbi: ENGINE_VERSION,
  };
  const release: ContentRelease = { ...releaseBody, hash: await semanticHash(releaseBody) };
  const deckBody = {
    id: "terminal-fixture-deck",
    commander: "commander",
    entries: [
      { definition: "commander", count: 1 },
      { definition: "land", count: 99 },
    ],
  };
  const deck: DeckRevision = { ...deckBody, hash: await semanticHash(deckBody) };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: "terminal-fixture-match",
    releaseHash: release.hash,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 4,
    driverSeed: 11,
    driverVersion: TERMINAL_DRIVER_VERSION,
    mode: "two-seat",
    seats: ["A", "B"].map((id) => ({ id, deck })),
    resolver: "full-scan",
  };
  const coordinator = await Coordinator.create(openNativeRepository(path), release, manifest);
  cleanups.push(() => coordinator.close());
  const reopen = async () => {
    const next = await Coordinator.open(openNativeRepository(path), release, manifest.id);
    cleanups.push(() => next.close());
    return next;
  };
  return { coordinator, release, manifest, path, directory, reopen };
}

describe("human terminal over the durable player command boundary", () => {
  test("malformed and illegal inputs reprompt unchanged; Enter commits once and quit preserves the next decision", async () => {
    const f = await fixture();
    const original = f.coordinator.current();
    const actor = f.coordinator.pendingActor;
    if (!actor) throw new Error("Missing fixture actor");
    const hiddenIds = original.players.flatMap((seat) => [
      ...seat.library,
      ...(seat.id === actor ? [] : seat.hand),
    ]);
    const output: string[] = [];
    const inputs = ["{", '{"kind":"pass"}', "", "quit"];
    let reads = 0;
    // Expose no privileged current() capability to the host under test.
    const boundary = {
      get pendingActor() {
        return f.coordinator.pendingActor;
      },
      view: f.coordinator.view.bind(f.coordinator),
      submit: f.coordinator.submit.bind(f.coordinator),
      close: f.coordinator.close.bind(f.coordinator),
    };
    expect(
      await runTerminal(boundary, 11, {
        write: (line) => output.push(line),
        readLine: () => {
          if (reads < 3) {
            expect(f.coordinator.current()).toEqual(original);
            const displayed = output.join("\n");
            for (const id of hiddenIds) expect(displayed).not.toContain(JSON.stringify(id));
          }
          return inputs[reads++] ?? null;
        },
      }),
    ).toEqual({ status: "paused", acceptedCommands: 1 });
    expect(output.some((line) => line.startsWith("Input rejected."))).toBe(true);
    expect(output.some((line) => line.startsWith("Command rejected:"))).toBe(true);
    const saved = f.coordinator.current();
    expect(saved.revision).toBe(1);
    expect((await f.reopen()).current()).toEqual(saved);
    expect(
      await f.coordinator.submit(actor, {
        schema: CONTRACT_VERSION,
        matchId: original.manifest.id,
        commandId: "after-close",
        actor,
        revision: original.revision,
        decisionId: original.decision?.id,
        response: { kind: "mulligan", keep: true },
      }),
    ).toMatchObject({ status: "fault", code: "Closed" });
  });

  test("a JSON override commits its own response and EOF preserves that pending mulligan round", async () => {
    const f = await fixture();
    let reads = 0;
    expect(
      await runTerminal(f.coordinator, 11, {
        write: () => {},
        readLine: () => (reads++ === 0 ? '{"kind":"mulligan","keep":false}' : null),
      }),
    ).toEqual({ status: "paused", acceptedCommands: 1 });
    const saved = (await f.reopen()).current();
    expect(saved.revision).toBe(1);
    expect(saved.setupChoices).toEqual({ A: false });
    expect(saved.decision).toMatchObject({ actor: "B", kind: "mulligan" });
  });

  test("reader failure closes the coordinator without inventing or committing a response", async () => {
    const f = await fixture();
    const before = f.coordinator.current();
    await expect(
      runTerminal(f.coordinator, 11, {
        write: () => {},
        readLine: () => {
          throw new Error("reader disconnected");
        },
      }),
    ).rejects.toThrow("reader disconnected");
    expect((await f.reopen()).current()).toEqual(before);
  });

  test("accepting proposals completes a real synthetic game and persists its terminal state", async () => {
    const f = await fixture();
    let reads = 0;
    const result = await runTerminal(f.coordinator, 11, {
      write: () => {},
      readLine: () => {
        if (++reads > 100) throw new Error("Fixture did not finish in 100 decisions");
        return "";
      },
    });
    expect(result.status).toBe("completed");
    expect(result.acceptedCommands).toBe(reads);
    const reopened = await f.reopen();
    expect(reopened.current().outcome).toMatchObject({ kind: "win", winner: "A" });
    expect(reopened.pendingActor).toBeNull();
    expect(reopened.current().revision).toBe(reads);
    expect(
      await runTerminal(reopened, 11, {
        write: () => {},
        readLine: () => {
          throw new Error("Completed game must not read input");
        },
      }),
    ).toEqual({ status: "completed", acceptedCommands: 0 });
  });

  test("native piped readline buffers Enter and quit then exits without a live input handle", async () => {
    const f = await fixture();
    await f.coordinator.close();
    const terminalPath = new URL("./terminal.ts", import.meta.url).pathname;
    const storagePath = new URL("../../../packages/storage/src/index.ts", import.meta.url).pathname;
    const nativePath = new URL("../../../packages/storage/src/native.ts", import.meta.url).pathname;
    const script = `
      import { runTerminal } from ${JSON.stringify(terminalPath)};
      import { Coordinator } from ${JSON.stringify(storagePath)};
      import { openNativeRepository } from ${JSON.stringify(nativePath)};
      const coordinator = await Coordinator.open(openNativeRepository(${JSON.stringify(f.path)}), ${JSON.stringify(f.release)}, ${JSON.stringify(f.manifest.id)});
      const result = await runTerminal(coordinator, 11);
      console.log("TERMINAL_RESULT=" + JSON.stringify(result));
    `;
    const child = Bun.spawn([process.execPath, "-e", script], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });
    child.stdin.write("\nquit\n");
    child.stdin.end();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const [exitCode, stdout, stderr] = await Promise.race([
        Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ]),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => reject(new Error("Native terminal did not exit")), 5000);
        }),
      ]);
      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain('TERMINAL_RESULT={"status":"paused","acceptedCommands":1}');
      expect((await f.reopen()).current().revision).toBe(1);
    } finally {
      clearTimeout(timeout);
      if (child.exitCode === null) child.kill();
    }
  }, 8000);
  test("the frozen CLI launcher persists piped Enter, pauses on quit, then resumes and replays after EOF", async () => {
    const f = await fixture();
    await f.coordinator.close();
    const releasePath = join(f.directory, "release.json");
    const decksPath = join(f.directory, "decks.json");
    await Bun.write(releasePath, JSON.stringify(f.release));
    await Bun.write(decksPath, JSON.stringify([f.manifest.seats[0]?.deck]));
    const root = new URL("../../../", import.meta.url).pathname;
    const matchId = "terminal-fixture-wrapper";
    const launch = async (command: string, options: string[], input: string) => {
      const child = Bun.spawn(
        [
          process.execPath,
          "run",
          "commander",
          command,
          "--data",
          f.directory,
          "--release",
          releasePath,
          "--decks",
          decksPath,
          ...options,
        ],
        { cwd: root, stdin: "pipe", stdout: "pipe", stderr: "pipe" },
      );
      child.stdin.write(input);
      child.stdin.end();
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const [exitCode, stdout, stderr] = await Promise.race([
          Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
          ]),
          new Promise<never>((_resolve, reject) => {
            timeout = setTimeout(() => reject(new Error("CLI terminal did not exit")), 15000);
          }),
        ]);
        expect({ exitCode, stderr }).toMatchObject({ exitCode: 0 });
        return stdout;
      } finally {
        clearTimeout(timeout);
        if (child.exitCode === null) child.kill();
      }
    };
    const first = await launch("play", ["--id", matchId], "\nquit\n");
    expect(first).toContain("Accepted revision 1.");
    expect(first).toContain('"status": "paused"');
    expect(first).toContain('"acceptedCommands": 1');
    const saved = await Coordinator.open(
      openNativeRepository(join(f.directory, "matches.sqlite")),
      f.release,
      matchId,
    );
    cleanups.push(() => saved.close());
    const pending = saved.current();
    expect(pending.revision).toBe(1);
    expect(pending.decision).not.toBeNull();
    await saved.close();
    const resumed = await launch("play", ["--resume", matchId], "");
    expect(resumed).toContain('"status": "paused"');
    expect(resumed).toContain('"acceptedCommands": 0');
    const reopened = await Coordinator.open(
      openNativeRepository(join(f.directory, "matches.sqlite")),
      f.release,
      matchId,
    );
    cleanups.push(() => reopened.close());
    expect(reopened.current()).toEqual(pending);
    await reopened.close();
    const replay = await launch("replay", ["--id", matchId], "");
    expect(replay).toContain('"verified": true');
    expect(replay).toContain('"revision": 1');
  }, 45000);
});
