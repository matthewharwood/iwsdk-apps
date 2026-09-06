import { beforeAll, expect, test } from "bun:test";
import { canonicalJson, emptyMana, semanticHash } from "@iwsdk-apps/contracts";
import { createFullExecutionRegistry } from "../../compiler/src/prepared";
import {
  returnSourceAnswer,
  returnSourceCard,
  returnSourceCards,
  returnSourceCommand,
  returnSourceFixture,
  returnSourceRelease,
  returnSourceSnapshot,
} from "../test-fixtures/return-source";
import { move, player } from "./common";
import { transition } from "./index";

// Independently read complete Oracle bodies and printed costs, not program-derived expectations.
const cases = [
  { name: "Unsummon", generic: 0, draw: false, type: "Instant" },
  { name: "Drown in Shapelessness", generic: 1, draw: false, type: "Instant" },
  { name: "Repulse", generic: 2, draw: true, type: "Instant" },
  { name: "Drag Under", generic: 2, draw: true, type: "Sorcery" },
  { name: "Symbol of Unsummoning", generic: 2, draw: true, type: "Sorcery" },
] as const;

beforeAll(async () => {
  const { hash, ...body } = returnSourceSnapshot;
  expect(hash).toBe("6c4f4eecafa9338bfa18d54fc071a2974890dd251527c1929aa8f1d1d1d5e071");
  expect(await semanticHash(body)).toBe(hash);
  expect(returnSourceSnapshot.originReleaseHash).toBe(
    "dac4f923e99a94e3e54031e635609dca4c91ad3f26c0bf85c4eb1bc3b35fa900",
  );
  expect(returnSourceCards).toHaveLength(9);
  for (const row of returnSourceCards) expect(await semanticHash(row.definition)).toBe(row.hash);
});

for (const scenario of cases)
  for (const destination of ["ordinary-hand", "commander-hand", "commander-command"] as const)
    test(`${scenario.name}: authenticated cast/payment resolves to ${destination} in printed order`, async () => {
      const card = returnSourceCard(scenario.name);
      expect(card.oracleText).toBe(
        `Return target creature to its owner's hand.${scenario.draw ? "\nDraw a card." : ""}`,
      );
      expect(card.types).toEqual([scenario.type]);
      expect(card.manaCost).toEqual({ ...emptyMana(), U: 1, generic: scenario.generic });
      const commander = destination !== "ordinary-hand";
      const f = await returnSourceFixture(scenario.name, commander);
      expect(Object.isFrozen(f.registry.definitions[card.id])).toBe(true);
      expect(f.registry.sourceReleaseHash).not.toBe(returnSourceSnapshot.originReleaseHash);
      expect(
        f.state.manifest.seats.every(
          (seat) => seat.deck.entries.reduce((sum, entry) => sum + entry.count, 0) === 100,
        ),
      ).toBe(true);
      const target = structuredClone(f.state.objects[f.target]);
      if (!target) throw new Error("Missing authentic target");
      const library = player(f.state, "A").library.length;
      const opponentLibrary = player(f.state, "B").library.length;
      returnSourceAnswer(f, { kind: "cast", card: f.source });
      const top = f.state.stack.at(-1);
      if (top?.kind !== "spell") throw new Error("Authentic return spell absent");
      const source = top.objectId;
      expect(f.state.decision?.cards).toContain(f.target);
      returnSourceAnswer(f, { kind: "target", target: f.target });
      expect(f.state.decision?.cost).toEqual({ ...emptyMana(), U: 1, generic: scenario.generic });
      const total = scenario.generic + 1;
      const pay = {
        kind: "payment" as const,
        sources: f.lands.slice(0, total).map((object) => ({ object, color: "U" as const })),
        spend: { ...emptyMana(), U: total },
      };
      const beforePayment = canonicalJson(f.state);
      expect(
        transition(
          f.state,
          returnSourceCommand(f, {
            ...pay,
            sources: pay.sources.slice(0, total - 1),
            spend: { ...emptyMana(), U: total - 1 },
          }),
          f.registry,
        ),
      ).toMatchObject({ status: "rejected", code: "IllegalCommand" });
      expect(canonicalJson(f.state)).toBe(beforePayment);
      returnSourceAnswer(f, pay);
      expect(f.state.events.find((event) => event.type === "SpellCast")?.data.paid).toEqual(
        pay.spend,
      );
      returnSourceAnswer(f, { kind: "pass" });
      returnSourceAnswer(f, { kind: "pass" });
      if (commander) {
        expect(f.state.decision).toMatchObject({ kind: "commander-replacement", actor: "B" });
        expect(f.state.priorityPlayer).toBeNull();
        expect(f.state.objects[f.target]).toEqual(target);
        expect(f.state.objects[source]?.zone).toBe("stack");
        expect(player(f.state, "A").library).toHaveLength(library);
        expect(f.state.events.some((event) => event.type === "CardDrawn")).toBe(false);
        returnSourceAnswer(f, {
          kind: "commander-replacement",
          move: destination === "commander-command",
        });
      }
      const returned = Object.values(f.state.objects).find((row) => row.lineage === target.lineage);
      expect(returned).toMatchObject({
        owner: "B",
        controller: "B",
        zone: destination === "commander-command" ? "command" : "hand",
        generation: target.generation + 1,
      });
      expect(f.state.objects[f.target]).toBeUndefined();
      expect(f.state.objects[source]).toBeUndefined();
      expect(
        Object.values(f.state.objects).find(
          (row) => row.owner === "A" && row.definition === card.id,
        )?.zone,
      ).toBe("graveyard");
      expect(player(f.state, "A").library).toHaveLength(library - Number(scenario.draw));
      expect(player(f.state, "B").library).toHaveLength(opponentLibrary);
      expect(player(f.state, "A").mana).toEqual(emptyMana());
      expect(f.lands.slice(0, total).every((id) => f.state.objects[id]?.tapped)).toBe(true);
      expect(f.state.frames).toEqual([]);
      expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
      const returnedEvent = f.state.events.find(
        (event) => event.type === "ReturnInstructionCompleted",
      );
      const drawn = f.state.events.filter((event) => event.type === "CardDrawn");
      const resolved = f.state.events.find((event) => event.type === "SpellResolved");
      expect(returnedEvent?.data.before).toBe(f.target);
      expect(returnedEvent?.index).toBeLessThan(resolved?.index ?? -1);
      expect(drawn).toHaveLength(Number(scenario.draw));
      if (scenario.draw) {
        expect(returnedEvent?.index).toBeLessThan(drawn[0]?.index ?? -1);
        expect(drawn[0]?.index).toBeLessThan(resolved?.index ?? -1);
      }
    });

for (const name of ["Repulse", "Drag Under", "Symbol of Unsummoning"])
  test(`${name}: no draw or replacement choice when the sole actual source target has left`, async () => {
    const f = await returnSourceFixture(name, true);
    returnSourceAnswer(f, { kind: "cast", card: f.source });
    returnSourceAnswer(f, { kind: "target", target: f.target });
    returnSourceAnswer(f, {
      kind: "payment",
      sources: f.lands.map((object) => ({ object, color: "U" })),
      spend: { ...emptyMana(), U: 3 },
    });
    const library = player(f.state, "A").library.length;
    // Explicit changed-board precondition isolates608.2b; ordinary lower-spell chains have core tests.
    move(f.state, f.target, "command", "constructed departed target precondition");
    returnSourceAnswer(f, { kind: "pass" });
    returnSourceAnswer(f, { kind: "pass" });
    expect(player(f.state, "A").library).toHaveLength(library);
    expect(f.state.frames).toEqual([]);
    expect(f.state.events.some((event) => event.type === "SpellDidNotResolve")).toBe(true);
    expect(
      f.state.events.some((event) =>
        ["CardDrawn", "CommanderHandReplacementRequested"].includes(event.type),
      ),
    ).toBe(false);
  });

for (const scenario of cases)
  test(`${scenario.name}: printed ${scenario.type} timing is enforced in an ordinary beginning-combat priority window`, async () => {
    const f = await returnSourceFixture(scenario.name, false);
    returnSourceAnswer(f, { kind: "pass" });
    returnSourceAnswer(f, { kind: "pass" });
    expect(f.state.step).toBe("begin-combat");
    expect(f.state.decision).toMatchObject({ kind: "priority", actor: "A" });
    if (scenario.type === "Sorcery") {
      expect(f.state.decision?.cards).not.toContain(f.source);
      const before = canonicalJson(f.state);
      expect(
        transition(f.state, returnSourceCommand(f, { kind: "cast", card: f.source }), f.registry),
      ).toMatchObject({ status: "rejected", code: "IllegalCommand" });
      expect(canonicalJson(f.state)).toBe(before);
      return;
    }
    expect(f.state.decision?.cards).toContain(f.source);
    returnSourceAnswer(f, { kind: "cast", card: f.source });
    returnSourceAnswer(f, { kind: "target", target: f.target });
    returnSourceAnswer(f, {
      kind: "payment",
      sources: f.lands.slice(0, scenario.generic + 1).map((object) => ({ object, color: "U" })),
      spend: { ...emptyMana(), U: scenario.generic + 1 },
    });
    returnSourceAnswer(f, { kind: "pass" });
    returnSourceAnswer(f, { kind: "pass" });
    expect(f.state.events.some((event) => event.type === "ReturnInstructionCompleted")).toBe(true);
    expect(f.state.step).toBe("begin-combat");
  });

test("production source admission rejects a rehashed Repulse with its mandatory draw removed", async () => {
  const release = await returnSourceRelease();
  const card = release.definitions[returnSourceCard("Repulse").id];
  if (!card?.spellProgram) throw new Error("Missing authentic Repulse program");
  card.spellProgram.effects.pop();
  const { hash: _hash, ...body } = release;
  release.hash = await semanticHash(body);
  await expect(createFullExecutionRegistry(release)).rejects.toThrow("Unauthenticated definition");
});
