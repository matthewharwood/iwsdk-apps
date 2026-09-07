import { expect, test } from "bun:test";
import { canonicalJson, semanticHash } from "@iwsdk-apps/contracts";
import {
  type AttachmentSourceFixture,
  attachmentSourceAnswer as answer,
  attachmentSourceCast as cast,
  attachmentSourceFixture as fixture,
  attachmentSourceMain as main,
  attachmentSourceObject as object,
  attachmentSourceResolve as resolve,
} from "../test-fixtures/attachment-source";
import { tokenSourcePayment } from "../test-fixtures/token-source";
import { characteristics } from "./characteristics";
import { player } from "./common";

// Authenticated complete sources and actual full/prepared factories. Selected hands and
// basic lands are declared constructed preconditions; every subsequent action is a command.
function equip(f: AttachmentSourceFixture, source: string, target: string, printedCost: string) {
  answer(f, { kind: "activate", source, programIndex: 0 });
  answer(f, { kind: "activation-target", target });
  const payment = tokenSourcePayment(f, "A", printedCost);
  answer(f, { kind: "activation-payment", sources: payment.sources, spend: payment.spend });
  resolve(f);
}
function passes(f: AttachmentSourceFixture, count = 2) {
  for (let n = 0; n < count; n++) answer(f, { kind: "pass" });
}
async function retain(f: AttachmentSourceFixture, name: string, initial: unknown) {
  const output = Bun.env.ATTACHMENT_INTERACTION_OUTPUT;
  if (output)
    await Bun.write(
      `${output}/${f.state.manifest.resolver}-${name}.json`,
      canonicalJson({
        schema: "attachment-actual-source-interaction/1",
        scope:
          "Authenticated legal 100-card lists with explicitly constructed hands/basic lands; subsequent ordinary commands, not a dealt or complete game.",
        subsetRelease: f.release.hash,
        mode: f.state.manifest.resolver,
        name,
        initial,
        commands: f.history,
        final: f.state,
        finalStateHash: await semanticHash(f.state),
        completeGames: 0,
      }),
    );
}

for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`${mode}: actual Lifelink on an opposing creature gives that creature's controller combat life`, async () => {
    const f = await fixture(
      "Sliver Hivelord",
      ["Holy Strength", "Lifelink"],
      "Sliver Hivelord",
      ["Memnite"],
      mode,
    );
    const initial = structuredClone(f.state);
    f.history = [];
    main(f, "B");
    cast(f, "B", "Memnite");
    resolve(f);
    main(f, "A");
    const target = object(f, "B", "Memnite").id;
    cast(f, "A", "Holy Strength", target);
    resolve(f);
    cast(f, "A", "Lifelink", target);
    resolve(f);
    expect(characteristics(f.state, f.registry, target)).toEqual({
      power: 2,
      toughness: 3,
      keywords: ["lifelink"],
    });
    main(f, "B");
    passes(f, 4);
    expect(f.state.decision?.kind).toBe("attack");
    answer(f, { kind: "attack", attacks: [{ attacker: target, defender: "A" }] });
    passes(f);
    answer(f, { kind: "block", blocks: [] });
    passes(f);
    answer(f, { kind: "damage", allocations: [{ source: target, target: "A", amount: 2 }] });
    expect(player(f.state, "A").life).toBe(38);
    expect(player(f.state, "B").life).toBe(42);
    expect(
      Object.values(f.state.attachments ?? {}).every(
        (link) => f.state.objects[link.source]?.controller === "A",
      ),
    ).toBe(true);
    await retain(f, "opposing-lifelink", initial);
  });
  test(`${mode}: actual Alexi's Cloak makes Sorin's Thirst fail with neither damage nor printed gain`, async () => {
    const f = await fixture(
      "Sliver Hivelord",
      ["Memnite", "Holy Strength", "Alexi's Cloak"],
      "Sliver Hivelord",
      ["Sorin's Thirst"],
      mode,
    );
    const initial = structuredClone(f.state);
    f.history = [];
    cast(f, "A", "Memnite");
    resolve(f);
    const target = object(f, "A", "Memnite").id;
    cast(f, "A", "Holy Strength", target);
    resolve(f);
    const oldLink = structuredClone(f.state.attachments);
    cast(f, "B", "Sorin's Thirst", target);
    cast(f, "A", "Alexi's Cloak", target);
    resolve(f);
    expect(
      Object.values(oldLink ?? {}).every(
        (link) => canonicalJson(f.state.attachments?.[link.source]) === canonicalJson(link),
      ),
    ).toBe(true);
    resolve(f);
    expect(object(f, "A", "Memnite").zone).toBe("battlefield");
    expect(object(f, "A", "Memnite").damage).toBe(0);
    expect(player(f.state, "B").life).toBe(40);
    expect(object(f, "B", "Sorin's Thirst").zone).toBe("graveyard");
    expect(f.state.events.some((e) => e.type === "SpellDidNotResolve")).toBe(true);
    expect(
      f.state.events.some((e) =>
        ["DamageBatchProposed", "DamageDealt", "LifeGained"].includes(e.type),
      ),
    ).toBe(false);
    expect(Object.values(f.state.attachments ?? {})).toHaveLength(2);
    await retain(f, "cloak-thirst-no-effects", initial);
  });
  test(`${mode}: actual Barbed Battlegear makes Memnite zero toughness and remains unattached`, async () => {
    const f = await fixture(
      "Sliver Hivelord",
      ["Memnite", "Barbed Battlegear"],
      "Tobias Andrion",
      [],
      mode,
    );
    const initial = structuredClone(f.state);
    f.history = [];
    cast(f, "A", "Memnite");
    resolve(f);
    cast(f, "A", "Barbed Battlegear");
    resolve(f);
    const target = object(f, "A", "Memnite").id,
      source = object(f, "A", "Barbed Battlegear").id;
    equip(f, source, target, "{2}");
    expect(object(f, "A", "Memnite").zone).toBe("graveyard");
    expect(object(f, "A", "Barbed Battlegear").zone).toBe("battlefield");
    expect(f.state.attachments).toEqual({});
    const attach = f.state.events.findIndex((e) => e.type === "AttachmentChanged"),
      death = f.state.events.findIndex((e) => e.type === "CreaturesDiedBatch");
    expect(attach).toBeGreaterThanOrEqual(0);
    expect(death).toBeGreaterThan(attach);
    await retain(f, "battlegear-zero-toughness", initial);
  });
  test(`${mode}: actual Shuko zero-cost repeat pays and resolves with no new attachment timestamp`, async () => {
    const f = await fixture("Sliver Hivelord", ["Memnite", "Shuko"], "Tobias Andrion", [], mode);
    const initial = structuredClone(f.state);
    f.history = [];
    cast(f, "A", "Memnite");
    resolve(f);
    cast(f, "A", "Shuko");
    resolve(f);
    const source = object(f, "A", "Shuko").id,
      target = object(f, "A", "Memnite").id;
    equip(f, source, target, "{0}");
    const link = canonicalJson(f.state.attachments?.[source]);
    equip(f, source, target, "{0}");
    expect(canonicalJson(f.state.attachments?.[source])).toBe(link);
    expect(f.state.events.some((e) => e.type === "AttachmentChanged")).toBe(false);
    const resolved = f.history
      .flatMap((step) => step.events)
      .filter((e) => e.type === "ActivatedAbilityResolved");
    expect(resolved).toHaveLength(2);
    expect(resolved[0]?.data.ability).not.toBe(resolved[1]?.data.ability);
    expect(characteristics(f.state, f.registry, target).power).toBe(2);
    await retain(f, "shuko-paid-no-op", initial);
  });
  for (const name of ["Darksteel Axe", "Darksteel Plate"] as const)
    test(`${mode}: actual ${name} keeps intrinsic indestructibility distinct from its recipient grant`, async () => {
      const f = await fixture(
        "Sliver Hivelord",
        ["Memnite", name],
        "Sliver Hivelord",
        ["Murder"],
        mode,
      );
      const initial = structuredClone(f.state);
      f.history = [];
      cast(f, "A", "Memnite");
      resolve(f);
      cast(f, "A", name);
      resolve(f);
      const source = object(f, "A", name).id,
        target = object(f, "A", "Memnite").id;
      equip(f, source, target, "{2}");
      expect(characteristics(f.state, f.registry, source).keywords).toContain("indestructible");
      expect(characteristics(f.state, f.registry, target).keywords.includes("indestructible")).toBe(
        name === "Darksteel Plate",
      );
      cast(f, "B", "Murder", target);
      resolve(f);
      expect(object(f, "A", "Memnite").zone).toBe(
        name === "Darksteel Plate" ? "battlefield" : "graveyard",
      );
      expect(object(f, "A", name).zone).toBe("battlefield");
      expect(f.state.attachments?.[source]?.target ?? null).toBe(
        name === "Darksteel Plate" ? target : null,
      );
      expect(object(f, "B", "Murder").zone).toBe("graveyard");
      await retain(f, name === "Darksteel Plate" ? "plate-grant" : "axe-intrinsic-only", initial);
    });
}
