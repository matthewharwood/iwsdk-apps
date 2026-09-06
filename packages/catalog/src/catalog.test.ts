import { Database } from "bun:sqlite";
import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { commanderSection, fetchSources, fetchTabletopEligibilityEvidence } from "./acquire";
import { bundleHash, hash } from "./hash";
import { importSources, readInventory } from "./import";
import { buildObligationLedger, selectRiskSample } from "./investigation";
import { parseCommanderBans, parseRules } from "./rules";
import { authorHighRiskScenarios } from "./scenarios";
import { type Archive, IMPORTER_VERSION, SourceManifestSchema } from "./schemas";

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const card = {
  object: "card",
  id: "00000000-0000-4000-8000-000000000001",
  oracle_id: "00000000-0000-4000-8000-000000000002",
  name: "Lutri, the Spellchaser",
  layout: "normal",
  lang: "en",
  released_at: "2027-01-01",
  set: "test",
  collector_number: "1",
  legalities: { commander: "legal" },
  games: ["paper"],
  color_identity: ["U", "R"],
  colors: ["U", "R"],
  keywords: ["Companion"],
  type_line: "Legendary Creature — Test",
  power: "*",
  toughness: "1+*",
  mana_cost: "",
  oracle_text: "",
  unknown_future_field: { retained: true },
};
const craft = {
  ...card,
  id: "00000000-0000-4000-8000-000000000003",
  oracle_id: "00000000-0000-4000-8000-000000000004",
  name: "Fixture Spacecraft",
  keywords: [],
  type_line: "Legendary Artifact — Spacecraft",
};
const rules = `Fixture comprehensive rules\nThese rules are effective as of August 7, 2026.\n\nContents\n1. Game Concepts\n100. General\n\n1. Game Concepts\n\n100. General\n100.1. First fixture paragraph. See rule 100.1a.\nContinuation and example retain this text.\n\n100.1a Fixture subrule. See rule 999.1.\n\nGlossary\n\nFixture term\nFixture definition. See rule 100.1.\n\nCredits\nFixture author\n`;
const policy =
  "<section><h3>Commander Banned Cards</h3><ul><li>Lutri, the Spellchaser - only banned as a companion. Click here for more details.</li><li>Fixture Banned</li><li>25 cards with the Card Type Conspiracy. Click here for list.</li></ul></section><section><h3>Another Format</h3><li>Not Commander Banned</li></section>";

async function fixture(
  options: {
    malformed?: boolean;
    changed?: boolean;
    truncate?: boolean;
    root?: string;
    extraCards?: number;
  } = {},
) {
  const root = options.root ?? (await mkdtemp(join(tmpdir(), "commander-catalog-test-")));
  if (!options.root) roots.push(root);
  await mkdir(join(root, "archives"), { recursive: true });
  const second = options.changed ? { ...craft, oracle_text: "Changed Oracle source." } : craft;
  const clues = [
    "Partner",
    "An additional cost",
    "Target player",
    "Instead of damage",
    "When this enters",
    "Creatures get +1/+1",
    "Trample",
    "Copy an object",
    "Shuffle your library",
    "Your commander",
    "Secretly vote",
    "Restart the game",
  ];
  const extra = Array.from({ length: options.extraCards ?? 0 }, (_, index) => ({
    ...card,
    id: `10000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    oracle_id: `20000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`,
    name: `Research fixture ${index}`,
    oracle_text: clues[index % clues.length] ?? "",
  }));
  const records = [card, second, ...extra];
  const oracle = `${records.map((value) => JSON.stringify(value)).join("\n")}\n${options.malformed ? "{broken-json\n" : ""}`;
  const printing = `${records
    .map((value) => JSON.stringify({ ...value, released_at: "2020-01-01" }))
    .join("\n")}\n`;
  const ruling = `${JSON.stringify({
    object: "ruling",
    oracle_id: card.oracle_id,
    source: "scryfall",
    published_at: "2026-08-01",
    comment: "Fixture note.",
    extra: "preserve",
  })}\n`;
  const sources: [Archive["kind"], Archive["format"], string][] = [
    ["oracle_cards", "gzip-jsonl", oracle],
    ["default_cards", "gzip-jsonl", printing],
    ["rulings", "gzip-jsonl", ruling],
    ["comprehensive-rules", "text", rules],
    ["banned-restricted", "html", policy],
  ];
  const archives: Archive[] = [];
  for (const [kind, format, content] of sources) {
    let bytes = format === "gzip-jsonl" ? gzipSync(content) : Buffer.from(content);
    if (options.truncate && kind === "oracle_cards") bytes = bytes.subarray(0, -8);
    const sha256 = hash(bytes),
      extension = format === "gzip-jsonl" ? "jsonl.gz" : format === "text" ? "txt" : "html";
    const path = `archives/${sha256}.${extension}`;
    await writeFile(join(root, path), bytes);
    archives.push({
      kind,
      format,
      url: `https://api.scryfall.com/fixture/${kind}`,
      resolvedUrl: `https://api.scryfall.com/fixture/${kind}`,
      retrievedAt: "2026-09-06T00:00:00.000Z",
      updatedAt: null,
      effectiveDate: kind === "comprehensive-rules" ? "2026-08-07" : null,
      contentType: null,
      httpContentEncoding: null,
      etag: null,
      lastModified: null,
      expectedBytes: bytes.length,
      bytes: bytes.length,
      sha256,
      hashLayer: "http-entity-identity-encoding",
      path,
    });
  }
  const manifest = SourceManifestSchema.parse({
    schemaVersion: 1,
    importerVersion: IMPORTER_VERSION,
    createdAt: "2026-09-06T00:00:00.000Z",
    bundleHash: bundleHash(archives),
    archives,
    certification: "source-acquisition-only",
  });
  const manifestPath = join(root, `manifest-${manifest.bundleHash}.json`),
    dbPath = join(root, "catalog.sqlite");
  await writeFile(manifestPath, JSON.stringify(manifest));
  return { root, manifestPath, dbPath, manifest };
}

describe("catalog provenance and publication", () => {
  test("imports unknown/symbolic fields, source spans, origin, print identity and role-specific eligibility without certification", async () => {
    const f = await fixture();
    const result = await importSources(f.manifestPath, f.dbPath, { batchSize: 1 });
    expect(result).toMatchObject({
      status: "complete",
      cards: 2,
      printings: 2,
      rulings: 1,
      sourceRecords: 5,
      normalizedRecords: 5,
      quarantinedRecords: 0,
      glossaryTerms: 1,
      semanticCertification: "unreviewed",
    });
    using db = new Database(f.dbPath, { readonly: true });
    const raw = db
      .query<{ payload_json: string }, [string]>(
        "SELECT payload_json FROM card_versions WHERE identity=?",
      )
      .get(card.oracle_id);
    expect(JSON.parse(raw?.payload_json ?? "{}")).toMatchObject({
      mana_cost: "",
      power: "*",
      toughness: "1+*",
      unknown_future_field: { retained: true },
    });
    expect(db.query("SELECT source FROM rulings").get()).toEqual({ source: "scryfall" });
    expect(
      db
        .query("SELECT status FROM eligibility WHERE identity=? AND role='main-deck'")
        .get(card.oracle_id),
    ).toEqual({ status: "candidate" });
    expect(
      db
        .query("SELECT status FROM eligibility WHERE identity=? AND role='companion'")
        .get(card.oracle_id),
    ).toEqual({ status: "excluded" });
    expect(
      db
        .query("SELECT status FROM eligibility WHERE identity=? AND role='commander'")
        .get(craft.oracle_id),
    ).toEqual({ status: "candidate" });
    expect(readInventory(f.dbPath)?.importId).toBe(result.importId);
  });
  test("exact offline reimport is idempotent; independent database produces the same semantic hash", async () => {
    const f = await fixture();
    const one = await importSources(f.manifestPath, f.dbPath);
    const repeated = await importSources(f.manifestPath, f.dbPath);
    expect(repeated).toEqual(one);
    const rebuilt = await importSources(f.manifestPath, join(f.root, "rebuilt.sqlite"));
    expect(rebuilt.semanticHash).toBe(one.semanticHash);
    expect(rebuilt.importId).not.toBe(one.importId);
  });
  test("quarantine reconciles every record and leaves previous active source intact", async () => {
    const f = await fixture();
    const prior = await importSources(f.manifestPath, f.dbPath);
    const broken = await fixture({ root: f.root, malformed: true, changed: true });
    const result = await importSources(broken.manifestPath, f.dbPath);
    expect(result.status).toBe("quarantined");
    expect(result.sourceRecords).toBe(6);
    expect(result.normalizedRecords + result.quarantinedRecords).toBe(6);
    expect(result.quarantinedRecords).toBe(1);
    expect(readInventory(f.dbPath)?.importId).toBe(prior.importId);
  });
  test("interrupted staging does not publish and exact source can be retried", async () => {
    const f = await fixture();
    const prior = await importSources(f.manifestPath, f.dbPath);
    const changed = await fixture({ root: f.root, changed: true });
    const abort = new AbortController();
    await expect(
      importSources(changed.manifestPath, f.dbPath, {
        batchSize: 1,
        signal: abort.signal,
        onProgress() {
          abort.abort(new Error("fixture interruption"));
        },
      }),
    ).rejects.toThrow("fixture interruption");
    expect(readInventory(f.dbPath)?.importId).toBe(prior.importId);
    const resumed = await importSources(changed.manifestPath, f.dbPath);
    expect(resumed.status).toBe("complete");
    expect(resumed.semanticHash).not.toBe(prior.semanticHash);
    using db = new Database(f.dbPath, { readonly: true });
    expect(
      db
        .query<{ n: number }, []>("SELECT count(*) n FROM import_runs WHERE status='interrupted'")
        .get()?.n,
    ).toBe(1);
  });
  test("truncated gzip fails at EOF and corruption fails before any publish", async () => {
    const f = await fixture({ truncate: true });
    await expect(importSources(f.manifestPath, f.dbPath)).rejects.toThrow();
    expect(readInventory(f.dbPath)).toBeNull();
    const g = await fixture();
    await writeFile(join(g.root, g.manifest.archives[0]?.path ?? ""), "changed bytes");
    await expect(importSources(g.manifestPath, g.dbPath)).rejects.toThrow(
      "Archive integrity mismatch",
    );
  });
});

test("source ledger accounts for all source nodes and keeps source clues unclassified", async () => {
  const f = await fixture();
  await importSources(f.manifestPath, f.dbPath);
  const ledger = buildObligationLedger(f.dbPath);
  expect(ledger).toMatchObject({
    status: "incomplete",
    fullCoverage: false,
    sourceObjects: 2,
    mainDeckCandidates: 2,
    executedAssertions: 0,
    reviewedObligations: 0,
    unresolvedObligations: 5,
  });
  expect(ledger.sourceNodeDispositions.reduce((sum, item) => sum + item.count, 0)).toBe(8);
  expect(buildObligationLedger(f.dbPath)).toEqual(ledger);
  expect(() => authorHighRiskScenarios(f.dbPath)).toThrow("missing rule 903.3");
});

test("risk sampling is deterministic, unique, source-bound and covers all twelve clue groups without certifying them", async () => {
  const f = await fixture({ extraCards: 310 });
  await importSources(f.manifestPath, f.dbPath);
  const sample = selectRiskSample(f.dbPath);
  expect(sample.size).toBe(300);
  expect(new Set(sample.members.map((card) => card.identity)).size).toBe(300);
  expect(sample.familyCounts).toHaveLength(12);
  expect(sample.familyCounts.every((family) => family.count >= 12)).toBe(true);
  expect(sample.members.every((card) => /^[a-f0-9]{64}$/.test(card.sourceVersion))).toBe(true);
  expect(sample.reviewStatus).toBe("not-reviewed");
  expect(selectRiskSample(f.dbPath)).toEqual(sample);
  expect(() => selectRiskSample(f.dbPath, { size: 299 })).toThrow("between 300 and 10000");
});

test("rules parser partitions every source byte, separates contents, and reports unresolved references", () => {
  const parsed = parseRules(rules);
  expect(parsed.nodes.map((node) => node.text).join("")).toBe(rules);
  expect(parsed.nodes.find((node) => node.id === "100.1")?.text).toContain(
    "Continuation and example",
  );
  expect(parsed.nodes.find((node) => node.id === "100.1")?.applicability).toBe("unresolved");
  expect(parsed.nodes.filter((node) => node.id === "100")).toHaveLength(1);
  expect(parsed.unresolvedReferences).toContainEqual({ from: "100.1a", to: "999.1" });
  for (const node of parsed.nodes)
    expect(Buffer.from(rules).subarray(node.byteStart, node.byteEnd).toString()).toBe(node.text);
  expect(() => parseRules(rules.replace("100.1a Fixture", "100.1. Fixture"))).toThrow(
    "Duplicate rules ID",
  );
});

test("policy parser scopes Commander separately from adjacent format lists", () => {
  expect(parseCommanderBans(commanderSection(policy))).toEqual({
    namedBans: ["Fixture Banned"],
    companionBans: ["Lutri, the Spellchaser"],
    categoryEvidence: ["25 cards with the Card Type Conspiracy. Click here for list."],
  });
});

test("acquisition refuses unexpected HTTP encoding and does not publish a manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "commander-catalog-download-"));
  roots.push(root);
  const fetcher = (async (_url: unknown, init?: RequestInit) => {
    expect(new Headers(init?.headers).get("user-agent")).toContain("iwsdk-apps");
    return new Response("encoded", { headers: { "content-encoding": "gzip" } });
  }) as typeof fetch;
  await expect(fetchSources(root, { fetch: fetcher })).rejects.toThrow("identity encoding");
});

test("supplement acquisition preserves original snapshot archives and reuses its pinned evidence without network", async () => {
  const f = await fixture();
  const urls: string[] = [];
  const fetcher = (async (url: string) => {
    urls.push(url);
    return new Response(`<html>Fixture primary page ${url}</html>`, {
      headers: { "content-type": "text/html" },
    });
  }) as typeof fetch;
  const result = await fetchTabletopEligibilityEvidence(f.manifestPath, { fetch: fetcher });
  expect(urls).toEqual([
    "https://www.mtgo.com/news/june-2024-vintage-cube-update",
    "https://www.mtgo.com/news/mtgo-blog-05142024",
  ]);
  expect(result.manifest.archives.slice(0, f.manifest.archives.length)).toEqual(
    f.manifest.archives,
  );
  expect(result.manifest.createdAt).toBe(f.manifest.createdAt);
  expect(result.manifest.importerVersion).toBe(f.manifest.importerVersion);
  expect(result.manifest.bundleHash).not.toBe(f.manifest.bundleHash);
  expect(SourceManifestSchema.parse(await Bun.file(f.manifestPath).json())).toEqual(f.manifest);
  const again = await fetchTabletopEligibilityEvidence(result.manifestPath, {
    fetch: (async (_url: unknown): Promise<Response> => {
      throw new Error("Unexpected repeated fetch");
    }) as typeof fetch,
  });
  expect(again).toEqual(result);
});

test("inventory reads do not initialize or migrate a catalog", async () => {
  const f = await fixture();
  expect(readInventory(f.dbPath)).toBeNull();
  expect(await Bun.file(f.dbPath).exists()).toBe(false);
  const result = await importSources(f.manifestPath, f.dbPath);
  {
    using db = new Database(f.dbPath);
    db.exec("DROP TABLE eligibility_decisions");
  }
  expect(readInventory(f.dbPath)).toEqual(result);
  using db = new Database(f.dbPath, { readonly: true });
  expect(
    db
      .query("SELECT name FROM sqlite_master WHERE type='table' AND name='eligibility_decisions'")
      .get(),
  ).toBeNull();
});
