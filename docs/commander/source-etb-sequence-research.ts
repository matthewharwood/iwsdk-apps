/** Research enumeration only: no card binding, release, compiler or runtime mutation. */
import { Database } from "bun:sqlite";
import { KEYWORD_RULES, parsePlainManaCost } from "../../packages/card-programs/src/index";
import {
  canonical,
  hash,
  readCandidateCards,
  readInventory,
} from "../../packages/catalog/src/index";

const database = process.argv[2] ?? ".commander/catalog-v2.sqlite";
const destination = process.argv[3] ?? ".commander/research/etb-sequence-source-research.json";
const inventory = readInventory(database);
if (!inventory) throw new Error("Missing complete source inventory");
const cards = readCandidateCards(database);
const keywordNames = new Set(Object.keys(KEYWORD_RULES).map((word) => word.replaceAll("-", " ")));
const drawAmounts = new Map<string, number>([
  ["a", 1],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
] as const);
type ResearchEffect = {
  kind: "draw" | "gain-life";
  amount: number;
  recipient: "trigger-controller";
  optional: boolean;
};
function researchSequence(body: string): ResearchEffect[] | null {
  if (!body.endsWith(".")) return null;
  const effects: ResearchEffect[] = [];
  for (const part of body.slice(0, -1).split(/ and |, then |\. /)) {
    const draw =
      /^(?:[Yy]ou )?(may )?[Dd]raw (a|one|two|three|four|five|six|seven|eight|nine|ten) cards?$/.exec(
        part,
      );
    const gain = /^(?:[Yy]ou )?(may )?[Gg]ain ([1-9][0-9]*) life$/.exec(part);
    if (draw) {
      const amount = drawAmounts.get(draw[2] ?? "");
      if (!amount) return null;
      effects.push({
        kind: "draw",
        amount,
        recipient: "trigger-controller",
        optional: Boolean(draw[1]),
      });
    } else if (gain && Number.isSafeInteger(Number(gain[2]))) {
      effects.push({
        kind: "gain-life",
        amount: Number(gain[2]),
        recipient: "trigger-controller",
        optional: Boolean(gain[1]),
      });
    } else return null;
  }
  return effects;
}
const records = [];
let creatureIdentities = 0;
for (const card of cards) {
  if (hash(canonical(card.oracle)) !== card.versionHash)
    throw new Error(`Source hash mismatch: ${card.identity}`);
  const faces = card.oracle.card_faces ?? [card.oracle];
  if (faces.some((face) => /\bCreature\b/.test(face.type_line ?? ""))) creatureIdentities++;
  for (const [faceOrdinal, face] of faces.entries()) {
    const text = face.oracle_text ?? "";
    const lines = text.split("\n");
    const broad = lines.filter((line) =>
      /(?:When|Whenever) [^\n]*\benters\b[^\n]*(?:\bdraw\b|\bgain\b[^\n]*\blife\b)/.test(line),
    );
    if (!broad.length) continue;
    const creature = /\bCreature\b/.test(face.type_line ?? "");
    const aliases = [face.name, face.name.split(",")[0]];
    const prefixes = [
      ...["this creature", "this permanent", "this artifact", "this enchantment", "this Siege"],
      ...aliases,
    ].flatMap((name) => [`When ${name} enters, `, `When ${name} enters the battlefield, `]);
    const failures: string[] = [];
    const proposed: { line: number; completeClause: string; effects: ResearchEffect[] }[] = [];
    const keywords: string[] = [],
      manaAbilities: string[] = [],
      unaccounted: { line: number; text: string }[] = [];
    for (const [ordinal, line] of lines.entries()) {
      const prefix = prefixes.find((value) => line.startsWith(value));
      const effects = prefix ? researchSequence(line.slice(prefix.length)) : null;
      if (effects) {
        proposed.push({ line: ordinal, completeClause: line, effects });
        continue;
      }
      const mana = /^\{T\}: Add \{([WUBRGC])\}\.$/.exec(line);
      if (mana?.[1]) {
        manaAbilities.push(mana[1]);
        continue;
      }
      const clauses = line.split(", ").map((clause) => clause.toLowerCase());
      if (clauses.every((clause) => keywordNames.has(clause))) {
        keywords.push(...clauses);
        continue;
      }
      unaccounted.push({ line: ordinal, text: line });
    }
    if (card.oracle.layout !== "normal" || card.oracle.card_faces)
      failures.push("requires-normal-single-face");
    const types = (face.type_line ?? "").split(" — ")[0]?.split(" ") ?? [];
    if (
      !creature ||
      types.some((type) => !["Legendary", "Artifact", "Enchantment", "Creature"].includes(type))
    )
      failures.push("outside-ordinary-creature-characteristics");
    for (const key of ["power", "toughness"] as const)
      if (
        typeof face[key] !== "string" ||
        !/^-?\d+$/.test(face[key] as string) ||
        !Number.isSafeInteger(Number(face[key]))
      )
        failures.push(`requires-fixed-integer-${key}`);
    const manaCost = parsePlainManaCost(face.mana_cost ?? "");
    if (
      !manaCost ||
      Object.values(manaCost).reduce((sum, value) => sum + value, 0) !== card.oracle.cmc
    )
      failures.push("requires-plain-fixed-mana-cost");
    if (proposed.length !== 1) failures.push("requires-one-complete-self-entry-ability");
    if (unaccounted.length) failures.push("unaccounted-complete-body-text");
    if (
      new Set(keywords).size !== keywords.length ||
      new Set(manaAbilities).size !== manaAbilities.length
    )
      failures.push("duplicate-existing-ability-clause");
    if (card.oracle.keywords.some((keyword) => !keywordNames.has(keyword.toLowerCase())))
      failures.push("unaccounted-provider-keyword");
    const effects = proposed[0]?.effects ?? [];
    const optional = effects.some((effect) => effect.optional);
    if (optional && effects.length > 1)
      failures.push("optional-combined-clause-needs-manual-choice-scope");
    const disposition = failures.length
      ? "outside-research-scope"
      : optional
        ? "optional-research-candidate"
        : effects.length > 1
          ? "ordered-sequence-research-candidate"
          : "initial-single-effect-family";
    records.push({
      identity: card.identity,
      name: card.oracle.name,
      faceName: face.name,
      faceOrdinal,
      sourceVersion: card.versionHash,
      sourceArchiveHash: card.sourceArchiveHash,
      sourceOrdinal: card.sourceOrdinal,
      bundleHash: card.bundleHash,
      layout: card.oracle.layout,
      creatureFace: creature,
      typeLine: face.type_line ?? null,
      manaCost: face.mana_cost ?? null,
      manaValue: card.oracle.cmc ?? null,
      power: face.power ?? null,
      toughness: face.toughness ?? null,
      colors: face.colors ?? card.oracle.colors ?? [],
      colorIdentity: card.oracle.color_identity,
      providerKeywords: card.oracle.keywords,
      completeOracleText: text,
      completeBodyHash: hash(text),
      broadETBLines: broad,
      proposed,
      otherAbilities: { keywords, manaAbilities },
      unaccounted,
      failures,
      disposition,
      dependencyClues: [
        ...(text.includes("may") ? ["optional-resolution-choice-or-related-optional-clause"] : []),
        ...(/\bif\b|\bunless\b|\bfor each\b|\bequal to\b|\bX\b/.test(text)
          ? ["conditional-or-variable-semantics"]
          : []),
        ...(/\btarget\b|\beach opponent\b|\beach other player\b/.test(text)
          ? ["other-object-or-player-domain"]
          : []),
        ...(/\bdiscard\b|\bsacrifice\b|\bevok/i.test(text)
          ? ["additional-cost-or-zone-instruction"]
          : []),
        ...(/\bcreate\b|\btoken\b|\bcopy\b|\bsearch\b/.test(text)
          ? ["external-definition-or-library-search"]
          : []),
      ],
      externalDefinitionDependencies: failures.length ? null : [],
      implemented: false,
      executed: false,
      semanticCertification: false,
    });
  }
}
using db = new Database(database, { readonly: true });
const ruleIds = [
  "101.3",
  "109.5",
  "113.7a",
  "117.2a",
  "117.2e",
  "117.3b",
  "117.5",
  "119.3",
  "119.7",
  "121.1",
  "121.2",
  "121.2b",
  "121.3",
  "121.3a",
  "121.4",
  "121.6b",
  "402.3",
  "603.2",
  "603.3",
  "603.3a",
  "603.3b",
  "603.4",
  "603.5",
  "603.6a",
  "603.10",
  "608.1",
  "608.2c",
  "608.2d",
  "608.2e",
  "608.2g",
  "608.2h",
  "608.2m",
  "608.2n",
  "702.9",
  "704.3",
  "704.4",
  "704.5a",
  "704.5b",
  "800.4a",
  "800.4d",
  "800.4j",
];
const ruleSources = ruleIds.map((id) => {
  const row = db
    .query<
      {
        document_hash: string;
        node_id: string;
        text_hash: string;
        start_line: number;
        end_line: number;
        byte_start: number;
        byte_end: number;
      },
      [string, string]
    >(
      "SELECT document_hash,node_id,text_hash,start_line,end_line,byte_start,byte_end FROM rule_nodes WHERE import_id=? AND node_id=?",
    )
    .get(inventory.importId, id);
  if (!row) throw new Error(`Missing source rule ${id}`);
  return row;
});
const candidates = records.filter(
  (row) =>
    row.disposition === "ordered-sequence-research-candidate" ||
    row.disposition === "optional-research-candidate",
);
const base = {
  schema: "etb-sequence-source-research/1",
  status: "research-only-no-release",
  sourceBundle: inventory.bundleHash,
  sourceInventoryHash: inventory.semanticHash,
  candidateDenominator: cards.length,
  creatureIdentities,
  broadFaceMatches: records.length,
  broadCreatureFaceMatches: records.filter((row) => row.creatureFace).length,
  initialSingleEffectRecords: records.filter(
    (row) => row.disposition === "initial-single-effect-family",
  ).length,
  orderedCandidates: candidates.filter(
    (row) => row.disposition === "ordered-sequence-research-candidate",
  ).length,
  optionalCandidates: candidates.filter((row) => row.disposition === "optional-research-candidate")
    .length,
  optionalBroadCreatureRecords: records.filter(
    (row) => row.creatureFace && row.broadETBLines.some((line) => /\bmay\b/.test(line)),
  ).length,
  records,
  ruleSources,
  sourceObligationsResolved: 0,
  executedTests: 0,
  executedGames: 0,
  fullSemanticCoverage: false,
};
await Bun.write(
  destination,
  `${JSON.stringify({ ...base, hash: hash(canonical(base)) }, null, 2)}\n`,
);
console.log(
  JSON.stringify(
    {
      destination,
      hash: hash(canonical(base)),
      counts: {
        candidates: cards.length,
        creatureIdentities,
        broad: records.length,
        broadCreature: base.broadCreatureFaceMatches,
        initial: base.initialSingleEffectRecords,
        ordered: base.orderedCandidates,
        optional: base.optionalCandidates,
        optionalBroad: base.optionalBroadCreatureRecords,
      },
      candidates,
    },
    null,
    2,
  ),
);
