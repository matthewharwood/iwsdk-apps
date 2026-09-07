import { expect, test } from "bun:test";
import { canonicalJson } from "@iwsdk-apps/contracts";
import { observe } from "../../engine/src/index";
import {
  type AttachmentSourceFixture,
  attachmentSourceAnswer as answer,
  attachmentSourceCast as cast,
  attachmentSourceFixture as fixture,
  attachmentSourceObject as object,
  attachmentSourceResolve as resolve,
} from "../../engine/test-fixtures/attachment-source";
import { tokenSourcePayment } from "../../engine/test-fixtures/token-source";
import { continuousEvidence } from "./spell-evidence";

function evidence(f: AttachmentSourceFixture, records = f.history) {
  return continuousEvidence(
    { records },
    { current: () => f.state, view: (actor: string) => observe(f.state, f.registry, actor) },
  );
}

// Real source programs and accepted commands from explicitly selected hands and
// basic lands. This verifies the proof reader; it is not a durable game archive.
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`${mode}: a paid Equip resolves without becoming a temporary creature modifier`, async () => {
    const f = await fixture("Sliver Hivelord", ["Memnite", "Shuko"], "Tobias Andrion", [], mode);
    cast(f, "A", "Memnite");
    resolve(f);
    cast(f, "A", "Shuko");
    resolve(f);
    const source = object(f, "A", "Shuko").id;
    const target = object(f, "A", "Memnite").id;
    answer(f, { kind: "activate", source, programIndex: 0 });
    answer(f, { kind: "activation-target", target });
    const payment = tokenSourcePayment(f, "A", "{0}");
    answer(f, { kind: "activation-payment", sources: payment.sources, spend: payment.spend });
    resolve(f);
    expect(f.state.attachments?.[source]?.target).toBe(target);
    expect(f.state.attachments?.[source]?.origin.kind).toBe("equip");
    const before = canonicalJson({ state: f.state, history: f.history });
    expect(evidence(f).created).toEqual({});
    expect(evidence(f).active).toEqual([]);
    expect(canonicalJson({ state: f.state, history: f.history })).toBe(before);

    // An Equip completion cannot authenticate a fabricated temporary modifier.
    const counterfeit = structuredClone(f.history);
    const row = counterfeit.find((r) =>
      r.events.some((event) => event.type === "ActivatedAbilityResolved"),
    );
    const index = row?.events.findIndex((event) => event.type === "ActivatedAbilityResolved");
    const completion = index === undefined ? undefined : row?.events[index];
    if (!row || index === undefined || !completion)
      throw new Error("Missing actual Equip completion");
    row.events.splice(index, 0, {
      ...structuredClone(completion),
      type: "ContinuousEffectCreated",
      data: { source, programIndex: 0 },
    });
    expect(() => evidence(f, counterfeit)).toThrow(
      "Modifier ability resolution differs from its paid captured source",
    );

    // The broader program parser still authenticates payment against its source.
    const wrongPayment = structuredClone(f.history);
    const paid = wrongPayment
      .flatMap((r) => r.events)
      .find((event) => event.type === "AbilityActivated");
    if (!paid) throw new Error("Missing actual Equip payment");
    paid.data.source = "unannounced-source@1";
    expect(() => evidence(f, wrongPayment)).toThrow(
      "Modifier ability payment differs from its announced source",
    );
    expect(canonicalJson({ state: f.state, history: f.history })).toBe(before);
  });
}
