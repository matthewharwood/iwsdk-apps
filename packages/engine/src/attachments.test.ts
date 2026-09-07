import { expect, test } from "bun:test";
import { canonicalJson, RulesState } from "@iwsdk-apps/contracts";
import { attachmentFixture, auraProgram, equip, equipProgram } from "../test-fixtures/attachments";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { enter, replaceDefinition } from "../test-fixtures/static-bonus";
import { canAttach } from "./attachments";
import { characteristics } from "./characteristics";
import { checkpoint } from "./checkpoints";
import { move, object } from "./common";
import { assertInvariants, observe, transition } from "./index";
import { givePriority } from "./turns";

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
// Synthetic definitions, selected physical 100-card boards/mana, ordinary commands thereafter.
// Modes execute real selector paths; these are not production-factory/source/dealt-game evidence.
for (const mode of modes) {
  test(`${mode}: Aura has a target/payment and enters already attached before entry publication`, () => {
    const f = attachmentFixture(mode),
      target = enter(f, "creature", "B");
    const spell = cast(f, "A", "enchantment-creature", target);
    expect(f.state.attachments).toBeUndefined();
    expect(f.state.objects[spell]?.spellState?.target).toBe(target);
    resolveOne(f);
    const aura = locate(f, "A", "enchantment-creature");
    expect(f.state.attachments?.[aura.id]?.target).toBe(target);
    expect(characteristics(f.state, f.registry, target)).toEqual({
      power: 3,
      toughness: 4,
      keywords: [],
    });
    expect(aura.controller).toBe("A");
    expect(object(f.state, target).controller).toBe("B");
    const changed = f.state.events.findIndex((e) => e.type === "AttachmentChanged"),
      entry = f.state.events.findIndex((e) => e.type === "BattlefieldEntryBatch");
    expect(changed).toBeGreaterThanOrEqual(0);
    expect(entry).toBeGreaterThan(changed);
    const restored = RulesState.parse(JSON.parse(canonicalJson(f.state)));
    assertInvariants(restored, f.registry);
    const view = observe(f.state, f.registry, "B");
    if (!view.attachments?.[0]) throw new Error("No public relation");
    view.attachments[0].target = "changed";
    expect(f.state.attachments?.[aura.id]?.target).toBe(target);
  });
  test(`${mode}: Aura target disappears in response: paid spell fails without entry`, () => {
    const f = attachmentFixture(mode),
      target = enter(f, "creature", "B");
    const before = f.state.players[0]?.mana.C ?? 0;
    cast(f, "A", "enchantment-creature", target);
    move(f.state, target, "exile", "constructed response departure");
    resolveOne(f);
    expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
    expect(f.state.players[0]?.mana.C).toBe(before - 1);
    expect(f.state.events.some((e) => e.type === "BattlefieldEntryBatch")).toBe(false);
    expect(f.state.events.some((e) => e.type === "AuraSpellDidNotResolve")).toBe(true);
  });
  test(`${mode}: Equipment casts unattached, then sorcery equip remains payable on its own stack`, () => {
    const f = attachmentFixture(mode);
    cast(f, "A", "artifact-creature");
    resolveOne(f);
    const source = locate(f, "A", "artifact-creature").id,
      target = enter(f, "creature");
    expect(f.state.attachments).toBeUndefined();
    givePriority(f.state, f.registry, "A");
    const before = f.state.players[0]?.mana.C ?? 0,
      id = equip(f, source, target);
    expect(f.state.attachments).toBeUndefined();
    expect(f.state.activatedAbilities?.[id]?.payment).toBeDefined();
    expect(f.state.players[0]?.mana.C).toBe(before - 1);
    resolveOne(f);
    expect(f.state.attachments?.[source]?.target).toBe(target);
    expect(characteristics(f.state, f.registry, target).power).toBe(4);
  });
  test(`${mode}: equip rejects opponent priority, instant windows and opposing targets atomically`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature", "B");
    givePriority(f.state, f.registry, "B");
    const saved = canonicalJson(f.state);
    expect(
      transition(f.state, command(f, { kind: "activate", source, programIndex: 0 }), f.registry)
        .status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(saved);
    const own = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    answer(f, { kind: "activate", source, programIndex: 0 });
    expect(f.state.decision?.cards).toContain(own);
    expect(f.state.decision?.cards).not.toContain(target);
    const paused = canonicalJson(f.state);
    expect(
      transition(f.state, command(f, { kind: "activation-target", target }), f.registry).status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(paused);
    answer(f, { kind: "cancel-activation" });
    f.state.step = "begin-combat";
    givePriority(f.state, f.registry, "A");
    expect(
      transition(f.state, command(f, { kind: "activate", source, programIndex: 0 }), f.registry)
        .status,
    ).toBe("rejected");
  });
  test(`${mode}: paid failed re-equip preserves old link and prior timestamp`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      old = enter(f, "creature"),
      next = enter(f, "trigger-creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, old);
    resolveOne(f);
    const prior = structuredClone(f.state.attachments?.[source]);
    equip(f, source, next);
    move(f.state, next, "exile", "constructed target departure");
    resolveOne(f);
    expect(f.state.attachments?.[source]).toEqual(prior);
    expect(characteristics(f.state, f.registry, old).power).toBe(4);
    expect(f.state.events.some((e) => e.type === "ActivatedAbilityDidNotResolve")).toBe(true);
  });
  test(`${mode}: zero-cost same-target equip is legal and resolves without new attachment timestamp`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "artifact-creature", { attachmentProgram: equipProgram(0, 1) });
    const source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    resolveOne(f);
    const prior = structuredClone(f.state.attachments?.[source]);
    equip(f, source, target);
    resolveOne(f);
    expect(f.state.attachments?.[source]).toEqual(prior);
    expect(f.state.events.some((e) => e.type === "AttachmentChanged")).toBe(false);
    expect(f.state.events.some((e) => e.type === "ActivatedAbilityResolved")).toBe(true);
  });
  test(`${mode}: existing links survive gained shroud and independent control changes`, () => {
    const f = attachmentFixture(mode, 4);
    replaceDefinition(f, "enchantment-creature", {
      attachmentProgram: auraProgram(0, 0, ["shroud"]),
    });
    const target = enter(f, "creature", "B");
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    const aura = locate(f, "A", "enchantment-creature").id;
    object(f.state, target).controller = "C";
    object(f.state, aura).controller = "D";
    checkpoint(f.state, f.registry);
    expect(f.state.attachments?.[aura]?.target).toBe(target);
    expect(canAttach(f.state, f.registry, aura, target)).toBe(true);
    expect(characteristics(f.state, f.registry, target).keywords).toContain("shroud");
    givePriority(f.state, f.registry, "B");
    expect(
      transition(
        f.state,
        command(f, { kind: "cast", card: locate(f, "B", "destroy-spell").id }),
        f.registry,
      ).status,
    ).toBe("rejected");
  });
  test(`${mode}: accepted equip retains captured activator after source control change`, () => {
    const f = attachmentFixture(mode, 4),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    object(f.state, source).controller = "C";
    resolveOne(f);
    expect(f.state.attachments?.[source]?.target).toBe(target);
    expect(object(f.state, source).controller).toBe("C");
    assertInvariants(f.state, f.registry);
  });
  test(`${mode}: source departure and new generation cannot satisfy a paid old equip`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    const hand = move(f.state, source, "hand", "constructed removal");
    const fresh = move(f.state, hand.id, "battlefield", "constructed reentry");
    resolveOne(f);
    expect(f.state.attachments?.[fresh.id]).toBeUndefined();
    expect(f.state.attachments?.[source]).toBeUndefined();
    expect(characteristics(f.state, f.registry, target).power).toBe(2);
    expect(f.state.events.some((e) => e.type === "ActivatedAbilityResolved")).toBe(true);
  });
  test(`${mode}: negative Aura kills creature first; unattached Aura follows at a later SBA`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "enchantment-creature", { attachmentProgram: auraProgram(-3, -3) });
    const target = enter(f, "creature", "B");
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    expect(locate(f, "B", "creature").zone).toBe("graveyard");
    expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
    const creatureBatch = f.state.events.findIndex((e) => e.type === "CreaturesDiedBatch"),
      auraMove = f.state.events.findIndex(
        (e) => e.type === "ObjectMoved" && e.cause === "state-based illegal Aura",
      );
    expect(auraMove).toBeGreaterThan(creatureBatch);
  });
  test(`${mode}: departure closes link now, Equipment stays and Aura waits for SBA`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    resolveOne(f);
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    const aura = locate(f, "A", "enchantment-creature").id;
    move(f.state, target, "hand", "constructed return instruction");
    expect(Object.keys(f.state.attachments ?? {})).toHaveLength(0);
    expect(f.state.objects[aura]?.zone).toBe("battlefield");
    checkpoint(f.state, f.registry);
    expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
    expect(f.state.objects[source]?.zone).toBe("battlefield");
  });
  test(`${mode}: intrinsic source protection never transfers as an attached bonus`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "artifact-creature", { keywords: ["indestructible"] });
    const source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    resolveOne(f);
    expect(characteristics(f.state, f.registry, source).keywords).toContain("indestructible");
    expect(characteristics(f.state, f.registry, target).keywords).not.toContain("indestructible");
    cast(f, "B", "destroy-spell", target);
    resolveOne(f);
    expect(locate(f, "A", "creature").zone).toBe("graveyard");
    expect(f.state.objects[source]?.zone).toBe("battlefield");
  });
  test(`${mode}: strict retained origin rejects altered target, timestamp and unpaid equip before dispatch`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    resolveOne(f);
    for (const mutate of [
      (s: RulesState) => {
        const l = s.attachments?.[source];
        if (l) l.target = "unknown";
      },
      (s: RulesState) => {
        const l = s.attachments?.[source];
        if (l) l.attachedAtEvent++;
      },
      (s: RulesState) => {
        const l = s.attachments?.[source];
        if (l?.origin.kind === "equip") l.origin.ability.payment = null;
      },
    ]) {
      const copy = structuredClone(f.state);
      mutate(copy);
      expect(
        transition(copy, command({ ...f, state: copy }, { kind: "pass" }), f.registry).status,
      ).toBe("fault");
    }
  });
}
