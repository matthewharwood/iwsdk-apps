import { expect, test } from "bun:test";
import { reviewedTabletopExclusion, TABLETOP_EXCLUSION } from "./eligibility";
import sourceRecord from "./fixtures/mtgo-name-sticker-goblin.json";
import { canonical, hash } from "./hash";
import { type Archive, CardSchema } from "./schemas";

// Metadata fixture represents the output of the independently tested archive-byte verifier.
const archives: Archive[] = TABLETOP_EXCLUSION.evidence.map((row) => ({
  kind: "policy-evidence",
  url: row.url,
  resolvedUrl: row.url,
  retrievedAt: "2026-09-06T00:00:00.000Z",
  updatedAt: null,
  effectiveDate: null,
  contentType: "text/html",
  httpContentEncoding: null,
  etag: null,
  lastModified: null,
  expectedBytes: null,
  bytes: 1,
  sha256: row.sha256,
  hashLayer: "http-entity-identity-encoding",
  format: "html",
  path: `archives/${row.sha256}.html`,
}));
const card = CardSchema.parse(sourceRecord);
const version = hash(canonical(card));

test("reviewed tabletop exclusion binds exact Oracle payload and both verified primary evidence pins", () => {
  expect(version).toBe(TABLETOP_EXCLUSION.sourceVersion);
  const result = reviewedTabletopExclusion(card, version, null, archives);
  expect(result).toMatchObject({
    identity: TABLETOP_EXCLUSION.identity,
    status: "excluded",
    reason: "reviewed-online-only-object-not-tabletop-card",
    semanticCertification: "not-certified",
    primarySourceHash: TABLETOP_EXCLUSION.evidence[0].sha256,
    facts: { digital: true, games: ["mtgo"], firstPaperPrinting: null },
  });
  expect(result?.roles).toEqual(["main-deck", "commander", "additional-commander", "companion"]);
  expect(result?.evidence).toEqual([...TABLETOP_EXCLUSION.evidence]);
});

test("original or incomplete evidence bundles keep this classification unresolved", () => {
  for (const evidence of [[], archives.slice(0, 1), archives.slice(1)])
    expect(reviewedTabletopExclusion(card, version, null, evidence)).toBeNull();
  for (const field of ["sha256", "url", "kind", "format"] as const) {
    const changed = structuredClone(archives);
    const first = changed[0];
    if (!first) throw new Error("Missing fixture evidence");
    Object.assign(first, { [field]: "altered" });
    expect(reviewedTabletopExclusion(card, version, null, changed)).toBeNull();
  }
});

test("version drift, changed digital facts, any paper printing, and the distinct paper identity cannot inherit the exclusion", () => {
  expect(reviewedTabletopExclusion(card, "0".repeat(64), null, archives)).toBeNull();
  expect(reviewedTabletopExclusion(card, version, "2027-01-01", archives)).toBeNull();
  const changes = [
    { oracle_text: "Changed text." },
    { digital: false },
    { games: ["mtgo", "paper"] },
    { games: ["arena"] },
    { legalities: { ...card.legalities, commander: "not_legal" } },
    { oracle_id: "88222fd2-8316-426c-8218-64f6be5ca0f8", name: "_____ Goblin" },
  ];
  for (const change of changes) {
    const changed = { ...card, ...change };
    expect(reviewedTabletopExclusion(changed, version, null, archives)).toBeNull();
    expect(reviewedTabletopExclusion(changed, hash(canonical(changed)), null, archives)).toBeNull();
  }
});
