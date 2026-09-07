import { afterAll, expect, test } from "bun:test";
import {
  canonicalJson,
  type Keyword,
  type MatchManifest,
  semanticHash,
} from "@iwsdk-apps/contracts";
import {
  activationSourceAnswer as answer,
  activationSourceCommand as command,
  activationSourceMain as main,
} from "../test-fixtures/activation-source";
import {
  evasionSourceCard as card,
  evasionSourceCast as cast,
  type EvasionCase,
  type EvasionSourceFixture,
  evasionAttack,
  evasionCommanderFor,
  evasionCommanders,
  evasionSourceCases,
  evasionSourceDeck,
  evasionSourceRegistry,
  evasionSourceFixture as fixture,
  evasionSourceSnapshot as snapshot,
} from "../test-fixtures/evasion-source";
import { characteristics } from "./characteristics";
import { admitDeck, observe, transition } from "./index";

// Expected pairs come from all146 complete retained Oracle bodies and CR509.1b,
// 702.9b/13b/14c/28b/31b/36b/118b, not from runtime descriptors or blockDomain.
// The sources are authenticated and decks legal; selected hands/basic lands are
// constructed. These are partial cast/declaration scenarios, not full games.
const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
const walkColors: Record<string, string> = {
  Plainswalk: "W",
  Islandwalk: "U",
  Swampwalk: "B",
  Mountainwalk: "R",
  Forestwalk: "G",
};
function cannotBlock(source: EvasionCase): boolean {
  return source.oracleText.split("\n").includes("This creature can't block.");
}
function flyingOnly(source: EvasionCase): boolean {
  return source.oracleText
    .split("\n")
    .includes("This creature can block only creatures with flying.");
}
function sourceKeywords(source: EvasionCase): Keyword[] {
  // CR702.14a: "landwalk" is a generic category, not an additional printed
  // ability. Scryfall adds that metadata label beside the specific subtype walk.
  return source.printedKeywords
    .filter((keyword) => keyword !== "Landwalk")
    .map((keyword) => keyword.toLowerCase().replaceAll(" ", "-") as Keyword);
}
function gigaCanBlock(source: EvasionCase): boolean {
  if (source.oracleText.split("\n").includes("This creature can't be blocked.")) return false;
  if (
    source.printedKeywords.some((keyword) =>
      ["Flying", "Shadow", "Horsemanship", "Fear"].includes(keyword),
    )
  )
    return false;
  if (source.printedKeywords.includes("Intimidate") && !source.colors.includes("G")) return false;
  if (source.printedKeywords.includes("Skulk") && 10 > source.printedPower) return false;
  return !source.printedKeywords.some((keyword) => walkColors[keyword] !== undefined);
}
function defenderCommander(source: EvasionCase): string {
  const colors = [
    "G",
    ...source.printedKeywords.flatMap((keyword) =>
      walkColors[keyword] ? [walkColors[keyword]] : [],
    ),
  ];
  const commander = evasionCommanderFor(colors);
  if (!commander) throw new Error(`No legal green/matching-landwalk defender for ${source.name}`);
  return commander;
}
function rejection(f: EvasionSourceFixture, blocker: string, attacker: string) {
  const before = canonicalJson(f.state);
  const rejected = transition(
    f.state,
    command(f, { kind: "block", blocks: [{ blocker, attacker }] }),
    f.registry,
  );
  expect(rejected.status).toBe("rejected");
  expect(canonicalJson(f.state)).toBe(before);
}
const proofRows: unknown[] = [];
afterAll(async () => {
  const directory = Bun.env.EVASION_SOURCE_EVIDENCE_DIR;
  if (!directory) return;
  const { release } = await evasionSourceRegistry();
  await Bun.write(
    `${directory}/source-scenarios.json`,
    `${JSON.stringify(
      {
        schema: "authenticated-evasion-source-execution/1",
        parentReleaseHash: snapshot.qualifiedReleaseHash,
        fixtureReleaseHash: release.hash,
        fixtureInputHash: snapshot.hash,
        primaryDefinitions: snapshot.cards.length,
        constructedHandsAndLands: true,
        ordinaryDealtHistories: 0,
        completedGames: 0,
        sourceCases: proofRows,
      },
      null,
      2,
    )}\n`,
  );
});

test("evasion source inventory preserves146 exact raw-source identities and199 closed authenticated definitions", async () => {
  const { release } = await evasionSourceRegistry();
  const { hash, ...body } = snapshot;
  expect(await semanticHash(body)).toBe(hash);
  expect(evasionSourceCases).toHaveLength(146);
  expect(new Set(evasionSourceCases.map((source) => source.identity)).size).toBe(146);
  expect(snapshot.cards).toHaveLength(199);
  expect(evasionCommanders).toHaveLength(47);
  for (const row of snapshot.cards) {
    expect(await semanticHash(row.definition)).toBe(row.definitionHash);
    expect(release.definitions[row.definition.id]?.sourceVersion).toBe(row.sourceVersion);
  }
  const gaps = evasionSourceCases.filter((source) => !evasionCommanderFor(source.colorIdentity));
  expect(gaps.map((source) => source.name)).toEqual(["Storm Fleet Sprinter"]);
});

test("Storm Fleet Sprinter has no currently legal commander across all47 complete admitted profiles", async () => {
  const { registry } = await evasionSourceRegistry();
  for (const commander of evasionCommanders) {
    const deck = await evasionSourceDeck(commander.name, ["Storm Fleet Sprinter"]);
    expect(() => admitDeck(deck, registry)).toThrow("commander color identity");
  }
});

for (const mode of modes) {
  for (const source of evasionSourceCases) {
    const commander = evasionCommanderFor(source.colorIdentity);
    if (!commander) continue;
    test(`${mode}: actual ${source.name} cast and printed evasion against actual Gigantosaurus`, async () => {
      const f = await fixture(
        commander,
        [source.name],
        defenderCommander(source),
        ["Gigantosaurus"],
        mode,
      );
      const sourceCast = cast(f, "A", source.name);
      const actual = card(source.name);
      expect(actual.oracleId).toBe(source.identity);
      expect(actual.sourceVersion).toBe(source.sourceVersion);
      expect(actual.oracleText).toBe(source.oracleText);
      expect(Array.from(actual.colors, String).sort()).toEqual([...source.colors].sort());
      expect(sourceCast.cast.data.definition).toBe(actual.id);
      const derived = characteristics(f.state, f.registry, sourceCast.id);
      expect(derived).toMatchObject({
        power: source.printedPower,
        toughness: source.printedToughness,
      });
      expect([...derived.keywords].sort()).toEqual(sourceKeywords(source).sort());
      const opposingCast = cast(f, "B", "Gigantosaurus");
      expect(characteristics(f.state, f.registry, opposingCast.id)).toMatchObject({
        power: 10,
        toughness: 10,
      });
      // Normal turn advancement makes A's source eligible to attack and untaps B's lands.
      main(f, "A");
      evasionAttack(f, [sourceCast.id]);
      const view = observe(f.state, f.registry, "B");
      const domain = view.decision?.blockDomain?.find((row) => row.attacker === sourceCast.id);
      const expectedLegal = gigaCanBlock(source);
      expect(domain?.blockers.includes(opposingCast.id)).toBe(expectedLegal);
      const beforeDomain = structuredClone(domain);
      if (!expectedLegal) rejection(f, opposingCast.id, sourceCast.id);
      const declaration = {
        kind: "block" as const,
        blocks: expectedLegal ? [{ blocker: opposingCast.id, attacker: sourceCast.id }] : [],
      };
      answer(f, declaration);
      expect(f.state.combat.blocked.includes(sourceCast.id)).toBe(expectedLegal);
      proofRows.push({
        mode,
        role: "attacker",
        source: source.name,
        identity: source.identity,
        sourceVersion: source.sourceVersion,
        commander,
        defenderCommander: defenderCommander(source),
        sourceCast: sourceCast.cast,
        opposingCast: opposingCast.cast,
        expectedLegal,
        domain: beforeDomain,
        acceptedDeclaration: declaration,
        finalRevision: f.state.revision,
        finalStateHash: await semanticHash(f.state),
      });
    });

    const shadow = source.printedKeywords.includes("Shadow");
    if (!cannotBlock(source) && !flyingOnly(source) && !shadow) continue;
    test(`${mode}: actual ${source.name} blocker restriction against cast ground/flying${shadow ? "/shadow" : ""} attackers`, async () => {
      const attackerNames = ["Memnite", "Ornithopter", ...(shadow ? ["Soltari Foot Soldier"] : [])];
      const f = await fixture("Tobias Andrion", attackerNames, commander, [source.name], mode);
      const attackers = attackerNames.map((name) => ({ name, ...cast(f, "A", name) }));
      const blocker = cast(f, "B", source.name);
      main(f, "A");
      evasionAttack(
        f,
        attackers.map((row) => row.id),
      );
      const accepted = [];
      const pairEvidence = [];
      for (const attacker of attackers) {
        const expectedLegal =
          !cannotBlock(source) &&
          (shadow ? attacker.name === "Soltari Foot Soldier" : attacker.name === "Ornithopter");
        const domain = f.state.decision?.blockDomain?.find((row) => row.attacker === attacker.id);
        expect(domain?.blockers.includes(blocker.id)).toBe(expectedLegal);
        if (expectedLegal) accepted.push({ blocker: blocker.id, attacker: attacker.id });
        else rejection(f, blocker.id, attacker.id);
        pairEvidence.push({
          attacker: attacker.name,
          cast: attacker.cast,
          expectedLegal,
          domain: structuredClone(domain),
        });
      }
      expect(accepted.length).toBeLessThanOrEqual(1);
      answer(f, { kind: "block", blocks: accepted });
      proofRows.push({
        mode,
        role: "blocker",
        source: source.name,
        identity: source.identity,
        sourceVersion: source.sourceVersion,
        commander,
        sourceCast: blocker.cast,
        pairs: pairEvidence,
        acceptedBlocks: accepted,
        finalRevision: f.state.revision,
        finalStateHash: await semanticHash(f.state),
      });
    });
  }
}
