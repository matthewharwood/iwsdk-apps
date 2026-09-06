import { beforeAll, expect, test } from "bun:test";
import { canonicalJson, emptyMana, semanticHash } from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import {
  counterSourceCards,
  counterSourceRelease,
  counterSourceSnapshot,
  seat,
  sourceAnswer,
  sourceCard,
  sourceCommand,
  sourceCounterFixture,
  sourcePayment,
  targetCast,
} from "../test-fixtures/counter-source";
import { observe, transition } from "./index";

// Expectations were authored independently of compiled programs from the seven
// complete Oracle bodies and printed mana costs; target cards are also unchanged
// authenticated definitions. Land/hand placement is a constructed precondition.
const cases = [
  {
    name: "Cancel",
    text: "Counter target spell.",
    blue: 2,
    generic: 1,
    target: "Revitalize",
    targetColor: "W",
    targetCost: 2,
  },
  {
    name: "Counterspell",
    text: "Counter target spell.",
    blue: 2,
    generic: 0,
    target: "Inspiration",
    targetColor: "U",
    targetCost: 4,
  },
  {
    name: "Essence Scatter",
    text: "Counter target creature spell.",
    blue: 1,
    generic: 1,
    target: "Priest of Ancient Lore",
    targetColor: "W",
    targetCost: 3,
  },
  {
    name: "False Summoning",
    text: "Counter target creature spell.",
    blue: 1,
    generic: 1,
    target: "Priest of Ancient Lore",
    targetColor: "W",
    targetCost: 3,
  },
  {
    name: "Negate",
    text: "Counter target noncreature spell.",
    blue: 1,
    generic: 1,
    target: "Divination",
    targetColor: "U",
    targetCost: 3,
  },
  {
    name: "Preemptive Strike",
    text: "Counter target creature spell.",
    blue: 1,
    generic: 1,
    target: "Priest of Ancient Lore",
    targetColor: "W",
    targetCost: 3,
  },
  {
    name: "Remove Soul",
    text: "Counter target creature spell.",
    blue: 1,
    generic: 1,
    target: "Priest of Ancient Lore",
    targetColor: "W",
    targetCost: 3,
  },
] as const;

beforeAll(async () => {
  const { hash, ...body } = counterSourceSnapshot;
  expect(hash).toBe("ffe21a93950ea2adee205b6bdf440580af580aff70d896a4be4925a2916441fe");
  expect(await semanticHash(body)).toBe(hash);
  expect(counterSourceSnapshot.originReleaseHash).toBe(
    "58b8f2dd09d699ef232ba49257e0287eb8ca204902a9addddb499f73e3084739",
  );
  expect(counterSourceCards).toHaveLength(14);
  for (const row of counterSourceCards) expect(await semanticHash(row.definition)).toBe(row.hash);
});

for (const scenario of cases)
  test(`${scenario.name}: authenticated source cost and whole counter instruction execute against ${scenario.target}`, async () => {
    const source = sourceCard(scenario.name);
    expect(source.oracleText).toBe(scenario.text);
    expect(source.manaCost).toEqual({
      ...emptyMana(),
      U: scenario.blue,
      generic: scenario.generic,
    });
    const f = await sourceCounterFixture(scenario.name, scenario.target);
    expect(f.registry.sourceReleaseHash).toBe(f.release.hash);
    expect(f.release.hash).not.toBe(counterSourceSnapshot.originReleaseHash);
    expect(Object.isFrozen(f.registry.definitions[source.id])).toBe(true);
    expect(
      f.state.manifest.seats.every(
        (row) => row.deck.entries.reduce((sum, card) => sum + card.count, 0) === 100,
      ),
    ).toBe(true);
    const target = targetCast(
      f,
      scenario.targetColor,
      scenario.targetCost,
      scenario.target === "Inspiration" ? "A" : undefined,
    );
    const targetSnapshot = f.state.objects[target];
    if (!targetSnapshot) throw new Error("Actual target spell absent");
    expect(targetSnapshot.controller).toBe("A");
    expect(targetSnapshot.definition).toBe(sourceCard(scenario.target).id);
    if (scenario.text === "Counter target creature spell.")
      expect(sourceCard(scenario.target).types).toContain("Creature");
    if (scenario.text === "Counter target noncreature spell.")
      expect(sourceCard(scenario.target).types).not.toContain("Creature");
    const library = seat(f, "A").library.length,
      life = seat(f, "A").life;
    sourceAnswer(f, { kind: "cast", card: f.counterHandId });
    const top = f.state.stack.at(-1);
    if (top?.kind !== "spell") throw new Error("Counter not announced");
    const counterId = top.objectId;
    expect(f.state.decision).toMatchObject({
      kind: "target",
      actor: "B",
      cards: [target],
      players: [],
    });
    expect(f.state.decision?.cards).not.toContain(counterId);
    sourceAnswer(f, { kind: "target", target });
    expect(f.state.decision?.cost).toEqual({
      ...emptyMana(),
      U: scenario.blue,
      generic: scenario.generic,
    });
    const total = scenario.blue + scenario.generic;
    const before = canonicalJson(f.state);
    const underpay = transition(
      f.state,
      sourceCommand(f, sourcePayment(f.blueLandIds, "U", total - 1)),
      f.registry,
    );
    expect(underpay).toMatchObject({ status: "rejected", code: "IllegalCommand" });
    expect(canonicalJson(f.state)).toBe(before);
    sourceAnswer(f, sourcePayment(f.blueLandIds, "U", total));
    expect(f.state.events.find((event) => event.type === "SpellCast")?.data).toMatchObject({
      object: counterId,
      definition: source.id,
      paid: { ...emptyMana(), U: total },
    });
    expect(
      observe(f.state, f.registry, "A").objects.find((row) => row.id === counterId)?.spellState,
    ).toEqual({ target });
    sourceAnswer(f, { kind: "pass" });
    expect(f.state.objects[counterId]?.zone).toBe("stack");
    sourceAnswer(f, { kind: "pass" });
    expect(f.state.stack).toEqual([]);
    expect(f.state.objects[counterId]).toBeUndefined();
    expect(f.state.objects[target]).toBeUndefined();
    const targetGrave = Object.values(f.state.objects).find(
      (row) => row.lineage === targetSnapshot.lineage,
    );
    expect(targetGrave).toMatchObject({
      owner: "A",
      controller: "A",
      zone: "graveyard",
      generation: targetSnapshot.generation + 1,
    });
    const counterGrave = Object.values(f.state.objects).find(
      (row) => row.owner === "B" && row.definition === source.id,
    );
    expect(counterGrave?.zone).toBe("graveyard");
    expect(seat(f, "A").library).toHaveLength(library);
    expect(seat(f, "A").life).toBe(life);
    expect(seat(f, "B").mana).toEqual(emptyMana());
    expect(f.blueLandIds.slice(0, total).every((id) => f.state.objects[id]?.tapped)).toBe(true);
    expect(f.state.abilities).toEqual({});
    expect(
      f.state.events.some((event) =>
        ["CardDrawn", "LifeGained", "PermanentSpellResolved", "TriggerCreated"].includes(
          event.type,
        ),
      ),
    ).toBe(false);
    const counterEvent = f.state.events.find((event) => event.type === "SpellCountered");
    expect(counterEvent?.data).toMatchObject({
      source: counterId,
      before: target,
      definition: targetSnapshot.definition,
      owner: "A",
      controller: "A",
    });
    const resolved = f.state.events.find((event) => event.type === "SpellResolved");
    expect(resolved?.data.definition).toBe(source.id);
    expect(counterEvent?.index).toBeLessThan(resolved?.index ?? -1);
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
  });

test("fixture authentication rejects altered source semantics even after recalculating its subset hash", async () => {
  const source = await counterSourceRelease();
  const changed = structuredClone(source);
  const card = changed.definitions[sourceCard("Counterspell").id];
  if (!card) throw new Error("Missing authentic counterspell");
  card.spellProgram = {
    schema: "commander-spell/1",
    target: null,
    effects: [{ kind: "draw", recipient: "controller", amount: 1 }],
  };
  const { hash: _hash, ...body } = changed;
  changed.hash = await semanticHash(body);
  await expect(createFullExecutionRegistry(changed)).rejects.toThrow("Unauthenticated definition");
});
