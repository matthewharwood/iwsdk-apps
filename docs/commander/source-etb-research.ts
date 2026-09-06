/** Research-only source enumeration. This file emits no executable release or supported-card claim. */
import { Database } from "bun:sqlite";
import { readCandidateCards, readInventory, canonical, hash } from "../../packages/catalog/src/index";
import { KEYWORD_RULES, parsePlainManaCost } from "../../packages/card-programs/src/index";

const database = process.argv[2] ?? ".commander/catalog-v2.sqlite";
const destination = process.argv[3] ?? ".commander/research/etb-source-research.json";
const inventory = readInventory(database);
if (!inventory) throw new Error("Missing source inventory");
const cards = readCandidateCards(database);
const keywordNames = new Set(Object.keys(KEYWORD_RULES).map((word) => word.replaceAll("-", " ")));
const drawAmounts = new Map<string, number>([["a", 1], ["one", 1], ["two", 2], ["three", 3], ["four", 4], ["five", 5], ["six", 6], ["seven", 7], ["eight", 8], ["nine", 9], ["ten", 10]] as const);
const records = [];
let creatureIdentities = 0;
for (const card of cards) {
  if (hash(canonical(card.oracle)) !== card.versionHash) throw new Error(`Source hash mismatch: ${card.identity}`);
  const faces = card.oracle.card_faces ?? [card.oracle];
  const creatureFaces = faces.map((face, index) => ({face, index})).filter(({face}) => /\bCreature\b/.test(face.type_line ?? ""));
  if (creatureFaces.length) creatureIdentities++;
  for (const {face, index} of creatureFaces) {
    const text = face.oracle_text ?? "";
    const lines = text.split("\n");
    const broad = lines.filter(line => /(?:When|Whenever) [^\n]*\benters\b[^\n]*(?:\bdraw\b|\bgain\b[^\n]*\blife\b)/.test(line));
    if (!broad.length) continue;
    const failures: string[] = [];
    const prefixes = [`When this creature enters, `, `When this permanent enters, `, `When ${face.name} enters, `, `When ${face.name} enters the battlefield, `];
    const effects: {line:number; kind:"draw"|"gain-life"; amount:number; optional:boolean; exactClause:string}[] = [];
    const keywords: string[] = [], manaAbilities: string[] = [], unaccounted: {line:number;text:string}[] = [];
    for (const [lineNumber, line] of lines.entries()) {
      const prefix = prefixes.find(value => line.startsWith(value));
      const body = prefix ? line.slice(prefix.length) : "";
      const draw = /^(?:you (may )?)?draw (a|one|two|three|four|five|six|seven|eight|nine|ten) cards?\.$/.exec(body);
      const gain = /^you (may )?gain ([1-9][0-9]*) life\.$/.exec(body);
      if (draw) {
        const amount = drawAmounts.get(draw[2] ?? "");
        if (!amount) throw new Error("Unexpected finite draw token");
        effects.push({line:lineNumber,kind:"draw",amount,optional:draw[1]!==undefined,exactClause:line});
        continue;
      }
      if (gain && Number.isSafeInteger(Number(gain[2]))) {
        effects.push({line:lineNumber,kind:"gain-life",amount:Number(gain[2]),optional:gain[1]!==undefined,exactClause:line});
        continue;
      }
      const mana = /^\{T\}: Add \{([WUBRGC])\}\.$/.exec(line);
      if (mana?.[1]) {manaAbilities.push(mana[1]);continue;}
      const clauses = line.split(", ").map(clause => clause.toLowerCase());
      if (clauses.every(clause => keywordNames.has(clause))) {keywords.push(...clauses);continue;}
      unaccounted.push({line:lineNumber,text:line});
    }
    if (card.oracle.layout !== "normal" || card.oracle.card_faces) failures.push("requires-normal-single-face");
    const types = (face.type_line ?? "").split(" — ")[0]?.split(" ") ?? [];
    if (!types.includes("Creature") || types.some(type => !["Legendary","Artifact","Enchantment","Creature"].includes(type))) failures.push("unreviewed-characteristic-type");
    for (const key of ["power","toughness"] as const) if (typeof face[key] !== "string" || !/^-?\d+$/.test(face[key] as string) || !Number.isSafeInteger(Number(face[key]))) failures.push(`requires-fixed-integer-${key}`);
    const manaCost = parsePlainManaCost(face.mana_cost ?? "");
    if (!manaCost || Object.values(manaCost).reduce((sum,value)=>sum+value,0)!==card.oracle.cmc) failures.push("requires-plain-fixed-mana-cost");
    if (effects.length !== 1) failures.push("requires-exactly-one-self-enter-constant-effect");
    if (unaccounted.length) failures.push("unaccounted-complete-body-text");
    if (new Set(keywords).size!==keywords.length || new Set(manaAbilities).size!==manaAbilities.length) failures.push("duplicate-existing-ability-clause");
    if (card.oracle.keywords.some(keyword=>!keywordNames.has(keyword.toLowerCase()))) failures.push("unaccounted-provider-keyword");
    const exact = effects[0];
    const disposition = failures.length ? "outside-initial-scope" : exact?.optional ? "optional-requires-resolution-choice" : "mandatory-research-candidate";
    const unresolvedClues = [
      ["optional-resolution-choice",/\bmay\b/], ["conditional-or-variable-effect",/\bif\b|\bunless\b|\bfor each\b|\bequal to\b|\bX\b/],
      ["target-domain",/\btarget\b/], ["generated-or-external-definition",/\bcreate\b|\bcopy\b|\btoken/],
      ["additional-zone-transition",/\bdiscard\b|\breturn\b|\bexile\b|\bsacrifice\b/], ["delayed-or-linked-trigger",/\bnext\b|\bwhen you do\b/i],
      ["reminder-body-needs-explicit-review",/[()]/],
    ] as const;
    records.push({
      identity:card.identity,name:card.oracle.name,faceName:face.name,faceOrdinal:index,sourceVersion:card.versionHash,
      sourceArchiveHash:card.sourceArchiveHash,sourceOrdinal:card.sourceOrdinal,bundleHash:card.bundleHash,
      layout:card.oracle.layout,typeLine:face.type_line??null,manaCost:face.mana_cost??null,manaValue:card.oracle.cmc??null,
      power:face.power??null,toughness:face.toughness??null,colors:face.colors??card.oracle.colors??[],colorIdentity:card.oracle.color_identity,
      providerKeywords:card.oracle.keywords,completeOracleText:text,completeBodyHash:hash(text),broadETBLines:broad,
      proposedEffects:effects,otherAbilities:{keywords,manaAbilities},unaccounted,disposition,failures,
      dependencies:{externalDefinitions:failures.length?null:[],requiredCore:["committed-zone-events","effective-ability-snapshot","pending-trigger-queue","apnap-placement","controller-order-decision","ability-stack-object","resolution","state-based-actions","priority","serializer"],clues:unresolvedClues.filter(([,pattern])=>pattern.test(text)).map(([label])=>label),assessment:failures.length?"unresolved":"candidate-constant-effects-no-external-definitions; requires-semantic-review"},
      semanticReview:"not-certified",executed:false,
    });
  }
}
using db = new Database(database,{readonly:true});
const ruleIds=["101.4","101.4b","109.5","113.7a","117.2a","117.2e","117.3b","117.4","117.5","201.5","400.7","400.7a","603.1","603.2","603.2c","603.2g","603.3","603.3a","603.3b","603.3d","603.4","603.5","603.6a","603.6b","603.6d","603.10","603.10a","608.2h","608.2n","704.4","800.4a","800.4d"];
const ruleSources=ruleIds.map(id=>{const row=db.query<{document_hash:string;node_id:string;text_hash:string;start_line:number;end_line:number;byte_start:number;byte_end:number;text:string},[string,string]>("SELECT document_hash,node_id,text_hash,start_line,end_line,byte_start,byte_end,text FROM rule_nodes WHERE import_id=? AND node_id=?").get(inventory.importId,id);if(!row)throw new Error(`Missing rule ${id}`);return row;});
const mandatory=records.filter(row=>row.disposition==="mandatory-research-candidate"),optional=records.filter(row=>row.disposition==="optional-requires-resolution-choice");
const families=[...new Set([...mandatory,...optional].map(row=>`${row.proposedEffects[0]?.kind}:${row.proposedEffects[0]?.amount}:${row.proposedEffects[0]?.optional?"optional":"mandatory"}`))].sort().map(family=>({family,count:[...mandatory,...optional].filter(row=>`${row.proposedEffects[0]?.kind}:${row.proposedEffects[0]?.amount}:${row.proposedEffects[0]?.optional?"optional":"mandatory"}`===family).length}));
const base={schema:"etb-source-research/1",status:"research-only-no-release",sourceBundle:inventory.bundleHash,sourceInventoryHash:inventory.semanticHash,candidateDenominator:cards.length,creatureIdentities,broadFaceMatches:records.length,mandatoryCandidates:mandatory.length,optionalCandidates:optional.length,rejectedBodyOrCharacteristics:records.length-mandatory.length-optional.length,families,records,ruleSources,sourceObligationsResolved:0,executedTests:0,executedGames:0,fullSemanticCoverage:false};
await Bun.write(destination,JSON.stringify({...base,hash:hash(canonical(base))},null,2)+"\n");
console.log(JSON.stringify({destination,hash:hash(canonical(base)),counts:{creatureIdentities,broad:records.length,mandatory:mandatory.length,optional:optional.length},families,mandatory:mandatory.map(row=>({name:row.name,program:row.proposedEffects,keywords:row.otherAbilities.keywords})),optional:optional.map(row=>({name:row.name,text:row.completeOracleText}))},null,2));
