import { beforeAll, expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { canonicalJson, Keyword, type RulesState, semanticHash } from "@iwsdk-apps/contracts";
import { REVIEWED_SOURCE_BINDINGS } from "../../compiler/src/reviewed-source-bindings";
import {
  attachmentSourceAnswer as answer,
  attachmentSourceCast as cast,
  attachmentSourceFixture as fixture,
  attachmentSourceObject as object,
  attachmentSourceResolve as resolve,
  attachmentSourceSnapshot as snapshot,
  attachmentSourceCard as sourceCard,
} from "../test-fixtures/attachment-source";
import { tokenSourcePayment } from "../test-fixtures/token-source";
import { characteristics } from "./characteristics";
import { assertInvariants } from "./index";

beforeAll(async () => {
  const { hash, ...payload } = snapshot;
  expect(hash).toBe("8a649ed0ee21d63bda8ce42e500d46629a0c84629d06e077a354345f0568d300");
  expect(await semanticHash(payload)).toBe(hash);
  expect(snapshot.parentDraftReleaseHash).toBe(
    "c70aa375fb6bf828af53a74dc8046dcf0bae115f444b1fa476b791dba6b8276b",
  );
  expect(snapshot.cases).toHaveLength(151);
  expect(new Set(snapshot.cases.map((row) => row.oracleId)).size).toBe(151);
  for (const row of snapshot.cards) {
    const binding = REVIEWED_SOURCE_BINDINGS[row.definition.oracleId];
    if (!binding) throw new Error("Source fixture missing closed registry membership");
    expect(await semanticHash(row.definition)).toBe(binding.definitionHash);
  }
});

const modes = ["full-scan", "prepared-scan", "prepared-indexed"] as const;
const comparisons = new Map<string, { state: string; history: string }>();
const output = Bun.env.ATTACHMENT_SOURCE_OUTPUT;
if (output) mkdirSync(output, { recursive: true });
function normalized(state: RulesState) {
  const copy = structuredClone(state);
  copy.manifest.resolver = "full-scan";
  delete copy.manifest.preparedArtifactHash;
  return canonicalJson(copy);
}
// Every printed program is executed through actual full/prepared source admission and legal
// 100-card lists. Hands and basic lands are explicitly constructed; these are not dealt games.
for (const mode of modes)
  for (const row of snapshot.cases)
    test(`${mode}: actual ${row.name} casts and executes its complete attached modifier`, async () => {
      const f = await fixture(
          "Sliver Hivelord",
          ["Gigantosaurus", row.name],
          "Tobias Andrion",
          [],
          mode,
        ),
        card = sourceCard(row.name),
        meaning = row.independentlyExpectedMeaning;
      const initial = structuredClone(f.state);
      f.history = [];
      expect(
        f.state.manifest.seats.every(
          (seat) => seat.deck.entries.reduce((sum, x) => sum + x.count, 0) === 100,
        ),
      ).toBe(true);
      expect(f.registry.preparedArtifactHash === null).toBe(mode === "full-scan");
      expect(Object.keys(f.registry.definitions).length).toBe(mode === "full-scan" ? 167 : 9);
      expect(card.sourceVersion).toBe(row.sourceVersion);
      expect(card.oracleText).toBe(row.completeOracleBody);
      expect(card.typeLine).toBe(row.typeLine);
      expect([...card.keywords].sort()).toEqual(
        row.sourceIntrinsicKeywords.map((value) => Keyword.parse(value)).sort(),
      );
      cast(f, "A", "Gigantosaurus");
      resolve(f);
      const target = object(f, "A", "Gigantosaurus").id;
      expect(characteristics(f.state, f.registry, target)).toEqual({
        power: 10,
        toughness: 10,
        keywords: [],
      });
      const paid = cast(f, "A", row.name, meaning.kind === "aura" ? target : undefined);
      expect(f.state.objects[paid.id]?.zone).toBe("stack");
      expect(paid.event?.data.paid).toEqual(paid.payment.spend);
      expect(f.state.attachments).toBeUndefined();
      expect(characteristics(f.state, f.registry, target).power).toBe(10);
      resolve(f);
      const source = object(f, "A", row.name).id;
      if (meaning.kind === "equipment") {
        expect(f.state.attachments).toBeUndefined();
        expect(meaning.equipCost).not.toBeNull();
        if (!meaning.equipCost) throw new Error("Independent equipment meaning lacks cost");
        answer(f, { kind: "activate", source, programIndex: 0 });
        expect(f.state.decision?.kind).toBe("activation-target");
        expect(f.state.decision?.cards).toContain(target);
        answer(f, { kind: "activation-target", target });
        const payment = tokenSourcePayment(f, "A", `{${meaning.equipCost.generic}}`);
        answer(f, { kind: "activation-payment", sources: payment.sources, spend: payment.spend });
        expect(f.state.attachments).toBeUndefined();
        resolve(f);
      }
      const link = f.state.attachments?.[source];
      expect(link?.target).toBe(target);
      expect(link?.origin.kind).toBe(meaning.kind === "aura" ? "aura-spell" : "equip");
      const final = characteristics(f.state, f.registry, target);
      expect(final.power).toBe(10 + meaning.powerDelta);
      expect(final.toughness).toBe(10 + meaning.toughnessDelta);
      expect([...final.keywords].sort()).toEqual(
        meaning.recipientKeywords.map((value) => Keyword.parse(value)).sort(),
      );
      expect([...characteristics(f.state, f.registry, source).keywords].sort()).toEqual(
        row.sourceIntrinsicKeywords.map((value) => Keyword.parse(value)).sort(),
      );
      expect(f.state.continuousEffects).toEqual([]);
      expect(f.state.frames).toEqual([]);
      expect(f.state.outcome.kind).toBe("ongoing");
      assertInvariants(f.state, f.registry);
      const actual = { state: normalized(f.state), history: canonicalJson(f.history) };
      if (mode === "full-scan") comparisons.set(row.oracleId, actual);
      else {
        const baseline = comparisons.get(row.oracleId);
        if (!baseline) throw new Error("Missing full-scan source comparison");
        expect(actual).toEqual(baseline);
      }
      if (output)
        await Bun.write(
          join(output, `${mode}-${row.oracleId}.json`),
          canonicalJson({
            schema: "attachment-actual-source-segment/1",
            scope: snapshot.scope,
            parentRelease: snapshot.parentDraftReleaseHash,
            subsetRelease: f.release.hash,
            source: row,
            mode,
            definitionCount: Object.keys(f.registry.definitions).length,
            templateCount: Object.keys(f.registry.tokenTemplates).length,
            initial,
            commands: f.history,
            final: f.state,
            finalStateHash: await semanticHash(f.state),
            completeGames: 0,
          }),
        );
    }, 30000);
