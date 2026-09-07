import { expect, test } from "bun:test";
import {
  canonicalJson,
  type DamageReplacementResponse,
  type MatchManifest,
  RulesState,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  damageSourceAnswer as answer,
  damageSourceCard as card,
  damageSourceCast as cast,
  damageSourceCommand as command,
  damageSourceFixture as fixture,
  damageSourceMain as main,
  damageSourceObject as object,
  damageSourceResolve as resolve,
  damageSourceSnapshot as snapshot,
} from "../test-fixtures/damage-source";
import { checkpoint } from "./checkpoints";
import { player } from "./common";
import { assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

type Fixture = Awaited<ReturnType<typeof fixture>>;
export function nextRewrite(
  f: Fixture,
  provider?: string,
  occurrenceId?: string,
): DamageReplacementResponse {
  const d = f.state.decision?.damageReplacement;
  const entry = d?.occurrences.find(
    (entry) =>
      (!occurrenceId || entry.id === occurrenceId) &&
      (!provider || entry.effects.some((effect) => effect.definition === card(provider).id)),
  );
  const effect = entry?.effects.find(
    (effect) => !provider || effect.definition === card(provider).id,
  );
  if (!d || !entry || !effect) throw Error(`Missing owned damage rewrite ${provider}`);
  return {
    kind: "damage-replacement",
    eventId: d.eventId,
    eventVersion: d.version,
    occurrenceId: entry.id,
    effectId: effect.id,
  };
}
function frame(f: Fixture) {
  const result = f.state.frames[0];
  if (result?.kind !== "pending-damage") throw Error("No pending damage frame");
  return result;
}
function finish(f: Fixture) {
  for (let n = 0; n < 100 && f.state.decision?.kind === "damage-replacement"; n++)
    answer(f, nextRewrite(f));
  if (f.state.decision?.kind === "damage-replacement") throw Error("Damage bound exhausted");
}
async function doublers(mode: MatchManifest["resolver"]) {
  const f = await fixture(
    "Lady Orca",
    ["Furnace of Rath", "Dictate of the Twin Gods", "Sorin's Thirst"],
    "Jasmine Boreal",
    ["Ancient Brontodon"],
    mode,
  );
  cast(f, "A", "Furnace of Rath");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Ancient Brontodon");
  resolve(f);
  // Dictate's actual Flash allows it at nonactive main priority.
  cast(f, "A", "Dictate of the Twin Gods");
  resolve(f);
  cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
  resolve(f);
  return f;
}
test("Five complete source definitions are authenticated; static distinctions and actual keyword metadata are retained", async () => {
  const { hash, ...body } = snapshot;
  expect(await semanticHash(body)).toBe(hash);
  for (const row of snapshot.cards)
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
  for (const name of [
    "Furnace of Rath",
    "Dictate of the Twin Gods",
    "Benevolent Unicorn",
    "Urza's Armor",
    "Excruciator",
  ]) {
    const definition = card(name);
    const record = snapshot.sourceRecords.find((r) => r.identity === definition.oracleId);
    expect(record?.versionHash).toBe(definition.sourceVersion);
    expect(record?.oracle.oracle_text).toBe(definition.oracleText);
  }
  expect(card("Dictate of the Twin Gods").keywords).toEqual(["flash"]);
  expect(card("Furnace of Rath").keywords).toEqual([]);
  expect(card("Benevolent Unicorn").damagePrograms?.[0]?.kind).toBe("replacement");
  expect(card("Urza's Armor").damagePrograms?.[0]?.kind).toBe("prevention");
  expect(card("Excruciator").damagePrograms?.[0]?.kind).toBe("damage-cannot-be-prevented");
});
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`DR01/12/15 ${mode}: two source doublers yield exact2→4→8 while actual Sorin life gain and damage remain uncommitted`, async () => {
    const f = await doublers(mode);
    const origin = canonicalJson(frame(f).origin);
    const life = player(f.state, "A").life;
    expect(f.state.decision?.actor).toBe("B");
    expect(frame(f).occurrences[0]?.amount).toBe(2);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(0);
    expect(f.state.priorityPlayer).toBeNull();
    expect(observe(f.state, f.registry, "A").decision).toBeNull();
    expect(
      observe(f.state, f.registry, "B").decision?.damageReplacement?.occurrences[0]?.effects,
    ).toHaveLength(2);
    for (const response of [
      { kind: "pass" },
      { kind: "cancel-cast" },
      { kind: "mana", source: { object: f.lands.B?.W?.[0] ?? "missing", color: "W" } },
      { kind: "cast", card: object(f, "A", "Lady Orca").id },
    ] as const)
      expect(transition(f.state, command(f, response), f.registry).status).toBe("rejected");
    expect(() => checkpoint(f.state, f.registry)).toThrow("No checkpoint");
    expect(() => givePriority(f.state, f.registry, "A")).toThrow("No priority");
    const one = nextRewrite(f, "Furnace of Rath");
    answer(f, one);
    expect(frame(f).version).toBe(1);
    expect(frame(f).occurrences[0]?.amount).toBe(4);
    expect(frame(f).occurrences[0]?.applied).toHaveLength(1);
    expect(player(f.state, "A").life).toBe(life);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(0);
    expect(canonicalJson(frame(f).origin)).toBe(origin);
    expect(f.state.events.some((e) => e.type === "DamageBatchProposed")).toBe(false);
    expect(transition(f.state, command(f, one), f.registry).status).toBe("rejected");
    f.state = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    assertInvariants(f.state, f.registry);
    answer(f, nextRewrite(f, "Dictate of the Twin Gods"));
    expect(f.state.frames).toEqual([]);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(8);
    expect(player(f.state, "A").life).toBe(life + 2);
    expect(object(f, "A", "Sorin's Thirst").zone).toBe("graveyard");
    const events = f.state.events;
    expect(events.filter((e) => e.type === "NoncombatDamageDealt")).toHaveLength(1);
    expect(events.find((e) => e.type === "NoncombatDamageDealt")?.data.amount).toBe(8);
    expect(events.findIndex((e) => e.type === "NoncombatDamageDealt")).toBeLessThan(
      events.findIndex((e) => e.type === "LifeGained"),
    );
    expect(events.filter((e) => e.type === "SpellResolved")).toHaveLength(1);
  });
  test(`DR02 ${mode}: affected opponent chooses actual Unicorn before Furnace or the reverse, yielding2 versus3`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Jasmine Boreal",
      ["Benevolent Unicorn", "Ancient Brontodon"],
      mode,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Benevolent Unicorn");
    resolve(f);
    cast(f, "B", "Ancient Brontodon");
    resolve(f);
    cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
    resolve(f);
    const saved = structuredClone(f.state);
    for (const [first, expected] of [
      ["Benevolent Unicorn", 2],
      ["Furnace of Rath", 3],
    ] as const) {
      f.state = structuredClone(saved);
      answer(f, nextRewrite(f, first));
      finish(f);
      expect(object(f, "B", "Ancient Brontodon").damage).toBe(expected);
    }
  });
}

function attackWindow(f: Fixture) {
  for (let n = 0; n < 40 && f.state.decision?.kind !== "attack"; n++) answer(f, { kind: "pass" });
  if (f.state.decision?.kind !== "attack") throw Error("Attack window not reached");
}
function toDamage(f: Fixture, blocks: { blocker: string; attacker: string }[] = []) {
  for (let n = 0; n < 40 && f.state.decision?.kind !== "damage-replacement"; n++) {
    const d = f.state.decision;
    if (!d) throw Error("No combat decision");
    if (d.kind === "block")
      answer(f, {
        kind: "block",
        blocks: blocks.filter((b) => f.state.objects[b.blocker]?.controller === d.actor),
      });
    else if (d.kind === "damage")
      answer(f, {
        kind: "damage",
        allocations: d.damageDomain.map((entry) => {
          const target = entry.targets[0];
          if (!target || entry.targets.length !== 1)
            throw Error("Source helper requires a single combat assignment target");
          return { source: entry.source, target: target.id, amount: entry.power };
        }),
      });
    else if (d.kind === "priority") answer(f, { kind: "pass" });
    else throw Error(`Unexpected combat choice ${d.kind}`);
  }
  if (f.state.decision?.kind !== "damage-replacement") throw Error("No damage rewrite decision");
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`DR03/04/18 ${mode}: two actual Unicorns reduce Thirst2 to zero, exclude later Furnace, and still gain2`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Jasmine Boreal",
      ["Benevolent Unicorn", "Ancient Brontodon"],
      mode,
      4,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Benevolent Unicorn");
    resolve(f);
    cast(f, "B", "Ancient Brontodon");
    resolve(f);
    main(f, "D");
    cast(f, "D", "Benevolent Unicorn");
    resolve(f);
    cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
    resolve(f);
    const life = player(f.state, "A").life;
    answer(f, nextRewrite(f, "Benevolent Unicorn"));
    expect(frame(f).occurrences[0]?.amount).toBe(1);
    const first = frame(f).occurrences[0]?.applied[0];
    answer(f, nextRewrite(f, "Benevolent Unicorn"));
    expect(f.state.frames).toEqual([]);
    expect(object(f, "B", "Ancient Brontodon").damage).toBe(0);
    expect(player(f.state, "A").life).toBe(life + 2);
    expect(f.state.events.some((e) => e.type === "NoncombatDamageDealt")).toBe(false);
    const commit = f.state.events.find((e) => e.type === "DamageBatchCommitted");
    expect(commit?.data.version).toBe(2);
    const rewrites = commit?.data.rewrites as { effect: { id: string }; after: number }[];
    expect(rewrites[1]?.effect.id).not.toBe(first);
    expect(rewrites.map((r) => r.after)).toEqual([1, 0]);
  });
  test(`DR07/08 ${mode}: actual Excruciator combat is unpreventable, Armor still applies once at0, and Unicorn does not apply`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Excruciator", "Furnace of Rath"],
      "Tobias Andrion",
      ["Urza's Armor", "Benevolent Unicorn"],
      mode,
    );
    cast(f, "A", "Excruciator");
    resolve(f);
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Urza's Armor");
    resolve(f);
    cast(f, "B", "Benevolent Unicorn");
    resolve(f);
    main(f, "A");
    attackWindow(f);
    answer(f, {
      kind: "attack",
      attacks: [{ attacker: object(f, "A", "Excruciator").id, defender: "B" }],
    });
    toDamage(f);
    const saved = structuredClone(f.state);
    const life = player(f.state, "B").life;
    expect(
      f.state.decision?.damageReplacement?.occurrences[0]?.effects.map((e) => e.definition).sort(),
    ).toEqual([card("Urza's Armor").id, card("Furnace of Rath").id].sort());
    for (const first of ["Urza's Armor", "Furnace of Rath"]) {
      f.state = structuredClone(saved);
      answer(f, nextRewrite(f, first));
      expect(player(f.state, "B").life).toBe(life);
      finish(f);
      expect(player(f.state, "B").life).toBe(life - 14);
      const commit = f.state.events.find((e) => e.type === "DamageBatchCommitted");
      const rewrites = commit?.data.rewrites as {
        effect: { program: { kind: string } };
        prevented: number;
      }[];
      expect(rewrites.find((r) => r.effect.program.kind === "prevention")?.prevented).toBe(0);
      expect(rewrites).toHaveLength(2);
    }
  });
  test(`DR09 ${mode}: two source-created hasty Minotaurs attacking together each receive Armor1, never a shared shield`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Flurry of Horns"],
      "Tobias Andrion",
      ["Urza's Armor"],
      mode,
    );
    main(f, "B");
    cast(f, "B", "Urza's Armor");
    resolve(f);
    main(f, "A");
    cast(f, "A", "Flurry of Horns");
    resolve(f);
    const tokens = Object.values(f.state.objects).filter((o) => o.token && o.controller === "A");
    expect(tokens).toHaveLength(2);
    attackWindow(f);
    answer(f, { kind: "attack", attacks: tokens.map((t) => ({ attacker: t.id, defender: "B" })) });
    toDamage(f);
    const life = player(f.state, "B").life;
    expect(frame(f).occurrences).toHaveLength(2);
    answer(f, nextRewrite(f));
    expect(player(f.state, "B").life).toBe(life);
    expect(frame(f).occurrences.map((o) => o.amount)).toEqual([1, 2]);
    answer(f, nextRewrite(f));
    expect(player(f.state, "B").life).toBe(life - 2);
    const commit = f.state.events.find((e) => e.type === "DamageBatchCommitted");
    const rewrites = commit?.data.rewrites as {
      effect: { id: string };
      occurrenceId: string;
      prevented: number;
    }[];
    expect(new Set(rewrites.map((r) => r.effect.id)).size).toBe(1);
    expect(new Set(rewrites.map((r) => r.occurrenceId)).size).toBe(2);
    expect(rewrites.map((r) => r.prevented)).toEqual([1, 1]);
  });
  test(`DR11 ${mode}: actual Arvad lifelink and opposing hasty token damage commit together before zero-life SBA`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Memnite", "Flurry of Horns"],
      "Arvad the Cursed",
      ["Urza's Armor"],
      mode,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    cast(f, "A", "Memnite");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Arvad the Cursed");
    resolve(f);
    cast(f, "B", "Urza's Armor");
    resolve(f);
    main(f, "A");
    cast(f, "A", "Flurry of Horns");
    resolve(f);
    // Constructed consequence precondition only: B starts this source combat at three life.
    player(f.state, "B").life = 3;
    const token = Object.values(f.state.objects).find((o) => o.token && o.controller === "A");
    if (!token) throw Error("No source token");
    const memnite = object(f, "A", "Memnite").id;
    const arvad = object(f, "B", "Arvad the Cursed").id;
    attackWindow(f);
    answer(f, {
      kind: "attack",
      attacks: [
        { attacker: token.id, defender: "B" },
        { attacker: memnite, defender: "B" },
      ],
    });
    toDamage(f, [{ blocker: arvad, attacker: memnite }]);
    expect(f.state.decision?.actor).toBe("A");
    answer(f, nextRewrite(f, "Furnace of Rath"));
    expect(player(f.state, "B").life).toBe(3);
    expect(object(f, "A", "Memnite").zone).toBe("battlefield");
    expect(f.state.decision?.actor).toBe("B");
    answer(f, nextRewrite(f, "Furnace of Rath"));
    answer(f, nextRewrite(f, "Urza's Armor"));
    expect(player(f.state, "B").life).toBe(3);
    finish(f);
    expect(player(f.state, "B").life).toBe(6);
    expect(player(f.state, "B").lost).toBe(false);
    expect(object(f, "A", "Memnite").zone).toBe("graveyard");
  });
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`DR05 ${mode}: actual Repulse removes a live Unicorn before Thirst; only Furnace remains applicable`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Tobias Andrion",
      ["Benevolent Unicorn", "Repulse", "Darksteel Sentinel"],
      mode,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Benevolent Unicorn");
    resolve(f);
    cast(f, "B", "Darksteel Sentinel");
    resolve(f);
    cast(f, "A", "Sorin's Thirst", object(f, "B", "Darksteel Sentinel").id);
    const old = object(f, "B", "Benevolent Unicorn").id;
    cast(f, "B", "Repulse", old);
    resolve(f);
    expect(object(f, "B", "Benevolent Unicorn").zone).toBe("hand");
    expect(object(f, "B", "Benevolent Unicorn").id).not.toBe(old);
    resolve(f);
    expect(
      f.state.decision?.damageReplacement?.occurrences[0]?.effects.map((e) => e.definition),
    ).toEqual([card("Furnace of Rath").id]);
    rewriteFinish();
    function rewriteFinish() {
      answer(f, nextRewrite(f, "Furnace of Rath"));
      expect(object(f, "B", "Darksteel Sentinel").damage).toBe(4);
      expect(object(f, "B", "Darksteel Sentinel").zone).toBe("battlefield");
    }
  });
  test(`DR12/22 ${mode}: target made illegal by actual Repulse fizzles all Thirst effects; commander hand replacement remains its distinct procedure`, async () => {
    const f = await fixture(
      "Lady Orca",
      ["Furnace of Rath", "Sorin's Thirst"],
      "Tobias Andrion",
      ["Repulse"],
      mode,
    );
    cast(f, "A", "Furnace of Rath");
    resolve(f);
    main(f, "B");
    cast(f, "B", "Tobias Andrion");
    resolve(f);
    const old = object(f, "B", "Tobias Andrion").id;
    const life = player(f.state, "A").life;
    cast(f, "A", "Sorin's Thirst", old);
    cast(f, "B", "Repulse", old);
    resolve(f);
    expect(f.state.decision?.kind).toBe("commander-replacement");
    const response = { kind: "commander-replacement" as const, move: true };
    answer(f, response);
    expect(object(f, "B", "Tobias Andrion").zone).toBe("command");
    resolve(f);
    expect(player(f.state, "A").life).toBe(life);
    expect(f.state.events.some((e) => e.type === "DamageBatchProposed")).toBe(false);
    expect(f.state.events.find((e) => e.type === "SpellDidNotResolve")?.data.reason).toBe(
      "all-targets-illegal",
    );
  });
}
