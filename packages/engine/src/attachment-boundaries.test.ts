import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, RulesState } from "@iwsdk-apps/contracts";
import { attachmentFixture, auraProgram, equip, equipProgram } from "../test-fixtures/attachments";
import { answer, cast, command, locate, resolveOne } from "../test-fixtures/counterspells";
import { observerProgram } from "../test-fixtures/entry-observers";
import { proctorSourceCard } from "../test-fixtures/proctor-source";
import { resolveReturn } from "../test-fixtures/return-resolution";
import { enter, replaceDefinition } from "../test-fixtures/static-bonus";
import { characteristics } from "./characteristics";
import { checkpoint } from "./checkpoints";
import { definition, move, object, player } from "./common";
import { assertInvariants, transition } from "./index";
import { givePriority } from "./turns";

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
// All cases are explicit constructed initial boards/programs. Normal cast, cost, response,
// resolution and checkpoint commands exercise the mechanism, not authenticated full games.
for (const mode of modes) {
  test(`${mode}: Flash Aura responds to an announced targeted spell; granted shroud changes only future targeting`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "enchantment-creature", {
      keywords: ["flash"],
      attachmentProgram: auraProgram(0, 0, ["shroud"]),
    });
    const target = enter(f, "creature");
    givePriority(f.state, f.registry, "B");
    cast(f, "B", "destroy-spell", target);
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    const aura = locate(f, "A", "enchantment-creature").id;
    expect(f.state.attachments?.[aura]?.target).toBe(target);
    resolveOne(f);
    expect(object(f.state, target).zone).toBe("battlefield");
    expect(locate(f, "B", "destroy-spell").zone).toBe("graveyard");
    expect(f.state.events.some((e) => e.type === "SpellDidNotResolve")).toBe(true);
  });
  test(`${mode}: intrinsic Aura shroud does not protect the stack spell from Counterspell`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "enchantment-creature", {
      keywords: ["shroud"],
      attachmentProgram: auraProgram(0, 0, ["shroud"]),
    });
    const target = enter(f, "creature");
    const spell = cast(f, "A", "enchantment-creature", target);
    cast(f, "B", "counter", spell);
    resolveOne(f);
    expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
    expect(characteristics(f.state, f.registry, target).keywords).toEqual([]);
    expect(f.state.attachments).toBeUndefined();
  });
  test(`${mode}: successful re-equip changes target once, timestamp and both live bonus sets`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "artifact-creature", {
      attachmentProgram: equipProgram(0, 0, 0, ["haste"]),
    });
    const source = enter(f, "artifact-creature"),
      old = enter(f, "creature"),
      next = enter(f, "trigger-creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, old);
    resolveOne(f);
    const first = f.state.attachments?.[source]?.attachedAtEvent ?? -1;
    equip(f, source, next);
    expect(characteristics(f.state, f.registry, old).keywords).toContain("haste");
    resolveOne(f);
    expect(characteristics(f.state, f.registry, old).keywords).not.toContain("haste");
    expect(characteristics(f.state, f.registry, next).keywords).toContain("haste");
    expect(f.state.attachments?.[source]?.attachedAtEvent).toBeGreaterThan(first);
    expect(f.state.events.filter((e) => e.type === "AttachmentChanged")).toHaveLength(1);
  });
  test(`${mode}: target control changes before equip resolution invalidate target; after resolution they do not detach`, () => {
    const f = attachmentFixture(mode, 4),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    object(f.state, target).controller = "C";
    resolveOne(f);
    expect(f.state.attachments?.[source]).toBeUndefined();
    object(f.state, target).controller = "A";
    givePriority(f.state, f.registry, "A");
    equip(f, source, target);
    resolveOne(f);
    object(f.state, target).controller = "C";
    checkpoint(f.state, f.registry);
    expect(f.state.attachments?.[source]?.target).toBe(target);
    expect(characteristics(f.state, f.registry, target).power).toBe(4);
  });
  test(`${mode}: source role loss/restoration during an effect uses extant relation; actual SBA detaches`, () => {
    const f = attachmentFixture(mode),
      target = enter(f, "creature");
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    const source = locate(f, "A", "enchantment-creature").id;
    const card = definition(f.registry, "enchantment-creature");
    card.subtypes = [];
    expect(characteristics(f.state, f.registry, target).toughness).toBe(4);
    card.subtypes = ["Aura"];
    checkpoint(f.state, f.registry);
    expect(f.state.attachments?.[source]?.target).toBe(target);
    card.subtypes = [];
    checkpoint(f.state, f.registry);
    expect(f.state.attachments?.[source]).toBeUndefined();
    expect(object(f.state, source).zone).toBe("battlefield");
    expect(characteristics(f.state, f.registry, target).toughness).toBe(2);
  });
  test(`${mode}: simultaneous source zero toughness and target lethal eligibility uses one prefact batch`, () => {
    const f = attachmentFixture(mode),
      target = enter(f, "creature");
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    const source = locate(f, "A", "enchantment-creature").id;
    // Constructed earlier-layer animation, not an admitted type-changing source.
    const card = definition(f.registry, "enchantment-creature");
    card.types = ["Enchantment", "Creature"];
    card.power = 0;
    card.toughness = 0;
    object(f.state, target).damage = 3;
    f.state.events = [];
    checkpoint(f.state, f.registry);
    const batches = f.state.events.filter((e) => e.type === "CreaturesDiedBatch");
    expect(batches).toHaveLength(2);
    expect(batches[0]?.data.objects).toEqual([
      { before: source, after: locate(f, "A", "enchantment-creature").id },
    ]);
    expect(batches[1]?.data.objects).toEqual([
      { before: target, after: locate(f, "A", "creature").id },
    ]);
  });
  test(`${mode}: removal after a protected completed deathtouch check does not invent another deathtouch death`, () => {
    for (const priorCheck of [false, true]) {
      const f = attachmentFixture(mode);
      replaceDefinition(f, "enchantment-creature", {
        attachmentProgram: auraProgram(0, 0, ["indestructible"]),
      });
      const target = enter(f, "creature");
      cast(f, "A", "enchantment-creature", target);
      resolveOne(f);
      const source = locate(f, "A", "enchantment-creature").id;
      object(f.state, target).damage = 1;
      object(f.state, target).deathtouchDamage = true;
      if (priorCheck) checkpoint(f.state, f.registry);
      move(f.state, source, "exile", "constructed source removal");
      checkpoint(f.state, f.registry);
      expect(locate(f, "A", "creature").zone).toBe(priorCheck ? "battlefield" : "graveyard");
    }
  });
  test(`${mode}: Aura entry observer and Proctor capture after attachment, then independent cohorts`, () => {
    const f = attachmentFixture(mode);
    replaceDefinition(f, "protected-creature", {
      keywords: [],
      triggerPrograms: [
        observerProgram({
          types: ["Enchantment"],
          controller: "any",
          excludeSource: true,
          token: "any",
        }),
      ],
    });
    replaceDefinition(f, "trigger-creature", {
      triggerPrograms: structuredClone(proctorSourceCard("Strict Proctor").triggerPrograms),
    });
    enter(f, "protected-creature");
    enter(f, "trigger-creature", "B");
    const target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    cast(f, "A", "enchantment-creature", target);
    resolveOne(f);
    expect(characteristics(f.state, f.registry, target).toughness).toBe(4);
    const abilities = Object.values(f.state.abilities);
    expect(abilities).toHaveLength(2);
    const lower = abilities.find((a) => !("referencedTrigger" in a)),
      meta = abilities.find((a) => "referencedTrigger" in a);
    expect(lower).toBeDefined();
    if (!lower) throw new Error("Missing ordinary observer");
    expect(meta && "referencedTrigger" in meta ? meta.referencedTrigger.captured.id : null).toBe(
      lower?.id,
    );
    const changed = f.state.events.findIndex((e) => e.type === "AttachmentChanged"),
      captured = f.state.events.findIndex((e) => e.type === "TriggerCaptured");
    expect(captured).toBeGreaterThan(changed);
  });
  for (const replace of [false, true])
    test(`${mode}: commander return ${replace}: pause preserves both links; movement and draw precede Aura SBA`, () => {
      const f = attachmentFixture(mode);
      replaceDefinition(f, "draw-spell", {
        spellProgram: {
          schema: "commander-spell/1",
          target: "creature",
          effects: [
            { kind: "return-to-hand" },
            { kind: "draw", recipient: "controller", amount: 1 },
          ],
        },
      });
      const source = enter(f, "artifact-creature"),
        target = enter(f, "commander");
      givePriority(f.state, f.registry, "A");
      equip(f, source, target);
      resolveOne(f);
      cast(f, "A", "enchantment-creature", target);
      resolveOne(f);
      const aura = locate(f, "A", "enchantment-creature").id,
        links = canonicalJson(f.state.attachments),
        library = player(f.state, "B").library.length;
      cast(f, "B", "draw-spell", target);
      resolveReturn(f);
      expect(f.state.decision?.kind).toBe("commander-replacement");
      expect(canonicalJson(f.state.attachments)).toBe(links);
      expect(player(f.state, "B").library).toHaveLength(library);
      const paused = RulesState.parse(JSON.parse(canonicalJson(f.state)));
      assertInvariants(paused, f.registry);
      f.state = paused;
      answer(f, { kind: "commander-replacement", move: replace });
      expect(locate(f, "A", "commander").zone).toBe(replace ? "command" : "hand");
      expect(f.state.attachments).toEqual({});
      expect(player(f.state, "B").library).toHaveLength(library - 1);
      expect(locate(f, "A", "enchantment-creature").zone).toBe("graveyard");
      expect(object(f.state, source).zone).toBe("battlefield");
      const draw = f.state.events.findIndex((e) => e.type === "CardDrawn"),
        ended = f.state.events.findIndex((e) => e.type === "AttachmentEnded"),
        auraMoved = f.state.events.findIndex(
          (e) => e.type === "ObjectMoved" && e.cause === "state-based illegal Aura",
        );
      expect(ended).toBeGreaterThanOrEqual(0);
      expect(draw).toBeGreaterThan(ended);
      expect(auraMoved).toBeGreaterThan(draw);
      expect(f.state.objects[aura]).toBeUndefined();
    });
  test(`${mode}: invalid equip payment cancellation preserves owned priority`, () => {
    const f = attachmentFixture(mode),
      source = enter(f, "artifact-creature"),
      target = enter(f, "creature");
    givePriority(f.state, f.registry, "A");
    player(f.state, "A").mana = emptyMana();
    answer(f, { kind: "activate", source, programIndex: 0 });
    answer(f, { kind: "activation-target", target });
    const prior = canonicalJson(f.state);
    expect(
      transition(
        f.state,
        command(f, { kind: "activation-payment", sources: [], spend: emptyMana() }),
        f.registry,
      ).status,
    ).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(prior);
    answer(f, { kind: "cancel-activation" });
    expect(f.state.decision?.actor).toBe("A");
    expect(f.state.attachments).toBeUndefined();
  });
}
