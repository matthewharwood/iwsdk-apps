import { expect, test } from "bun:test";
import {
  ORDINARY_ACTIVATED_PERMANENTS,
  ORDINARY_ACTIVATED_VERSION,
  reviewedOrdinaryActivatedDefinition,
} from "@iwsdk-apps/card-programs";
import {
  type CardDefinition,
  type ContentRelease,
  canonicalJson,
  DeckRevision,
  ENGINE_VERSION,
  semanticHash,
} from "@iwsdk-apps/contracts";
import { activationFixtureSource } from "../test-fixtures/ordinary-activated";
import {
  buildDevelopmentMatchPlan,
  MATCH_PLAN_VERSION,
  ORDINARY_ACTIVATED_CORE_CAPABILITIES,
} from "./plan";
import {
  admitPreparedMatchArtifact,
  createFullExecutionRegistry,
  createPreparedMatchArtifact,
  verifySourceRelease,
} from "./prepared";
import { REVIEWED_BINDING_SNAPSHOT, REVIEWED_SOURCE_BINDINGS } from "./reviewed-source-bindings";

async function rehash<T extends { hash: string }>(input: T): Promise<T> {
  const { hash: _hash, ...body } = input;
  return { ...body, hash: await semanticHash(body) } as T;
}
async function fixture() {
  const full = await activationFixtureSource();
  const needed = new Set([
    "Tobias Andrion",
    "Plains",
    "Island",
    "Master Decoy",
    "Azure Mage",
    "Advanced Hoverguard",
    "Giant Crab",
    "Glimmering Angel",
    "Horror of the Dim",
    "Soulmender",
    "Char-Rumbler",
    "Flowstone Hellion",
    "Tuknir Deathlock",
    "Pavel Maliki",
    "Riven Turnbull",
    "Swamp",
  ]);
  return rehash({
    ...full,
    definitions: Object.fromEntries(
      Object.entries(full.definitions).filter(([, d]) => needed.has(d.name)),
    ),
    tokenTemplates: {},
  });
}
function named(source: ContentRelease, name: string) {
  const card = Object.values(source.definitions).find((row) => row.name === name);
  if (!card) throw Error(`Missing source ${name}`);
  return card;
}
async function deck(source: ContentRelease, legacy = false) {
  const names = legacy
    ? ["Tobias Andrion"]
    : [
        "Tobias Andrion",
        "Master Decoy",
        "Azure Mage",
        "Advanced Hoverguard",
        "Giant Crab",
        "Glimmering Angel",
        "Soulmender",
      ];
  const commander = named(source, "Tobias Andrion");
  const body = {
    id: `activation-admission:${legacy ? "legacy" : "programmed"}`,
    commander: commander.id,
    entries: [
      ...names.map((name) => ({ definition: named(source, name).id, count: 1 })),
      { definition: named(source, "Plains").id, count: 45 },
      { definition: named(source, "Island").id, count: 55 - names.length },
    ].sort((a, b) => (a.definition < b.definition ? -1 : a.definition > b.definition ? 1 : 0)),
  };
  return DeckRevision.parse({ ...body, hash: await semanticHash(body) });
}

test("closed1437 source membership contains all239 exact new definitions and separately20 token templates", async () => {
  const source = await activationFixtureSource();
  expect(Object.keys(REVIEWED_SOURCE_BINDINGS)).toHaveLength(1437);
  expect(await semanticHash(REVIEWED_SOURCE_BINDINGS)).toBe(REVIEWED_BINDING_SNAPSHOT.bindingsHash);
  expect(Object.keys(source.tokenTemplates ?? {})).toHaveLength(20);
  const full = await createFullExecutionRegistry(source);
  expect(Object.keys(full.definitions)).toHaveLength(Object.keys(source.definitions).length);
  for (const recipe of ORDINARY_ACTIVATED_PERMANENTS) {
    const definition = named(source, recipe.name);
    expect(reviewedOrdinaryActivatedDefinition(definition)).toBe(true);
    expect(await semanticHash(definition)).toBe(
      REVIEWED_SOURCE_BINDINGS[recipe.identity]?.definitionHash ?? "missing",
    );
    expect(definition.implementationRevision).toBe(ORDINARY_ACTIVATED_VERSION);
    expect(Object.isFrozen(full.definitions[definition.id]?.activatedPrograms)).toBe(true);
  }
});

test("actual activated roots retain every runtime capability while unused source cards remain prunable", async () => {
  const source = await fixture(),
    d = await deck(source),
    artifact = await createPreparedMatchArtifact(source, [d, d]),
    registry = await admitPreparedMatchArtifact(artifact, source, [d, d]);
  expect(artifact.compilerVersion).toBe(MATCH_PLAN_VERSION);
  expect(artifact.closure.blockers).toEqual([]);
  expect(artifact.closure.widened).toEqual([]);
  expect(Object.keys(registry.definitions).sort()).toEqual(
    d.entries.map((row) => row.definition).sort(),
  );
  expect(Object.keys(registry.definitions)).not.toContain(named(source, "Char-Rumbler").id);
  expect(registry.sourceReleaseHash).toBe(source.hash);
  expect(registry.preparedArtifactHash).toBe(artifact.hash);
  for (const capability of ORDINARY_ACTIVATED_CORE_CAPABILITIES)
    expect(artifact.requiredCoreCapabilities).toContain(capability);
  expect(Object.keys(registry.tokenTemplates)).toEqual([]);
});

for (const capability of ORDINARY_ACTIVATED_CORE_CAPABILITIES)
  test(`rehashed prepared omission rejects ${capability}`, async () => {
    const source = await fixture(),
      d = await deck(source),
      artifact = await createPreparedMatchArtifact(source, [d, d]);
    const altered = structuredClone(artifact);
    altered.requiredCoreCapabilities = altered.requiredCoreCapabilities.filter(
      (c) => c !== capability,
    );
    altered.closure.retainedCoreCapabilities = altered.closure.retainedCoreCapabilities.filter(
      (c) => c !== capability,
    );
    await expect(
      admitPreparedMatchArtifact(await rehash(altered), source, [d, d]),
    ).rejects.toThrow();
  });
const changes: Record<string, (d: CardDefinition) => void> = {
  erasedProgram: (d) => {
    delete d.activatedPrograms;
  },
  legacyDowngrade: (d) => {
    delete d.activatedPrograms;
    d.implementationRevision = "commander-development-recipes/1";
    d.oracleText = "";
  },
  sourceIdentity: (d) => {
    d.oracleId = "unknown-activation-source";
    d.id = "oracle:unknown-activation-source";
  },
  completeFabrication: (d) => {
    d.oracleId = "unknown-activation-source";
    d.id = "oracle:unknown-activation-source";
    d.sourceVersion = "1".repeat(64);
    d.name = "Fabricated Vanilla";
    d.oracleText = "";
    d.implementationRevision = "commander-development-recipes/1";
    delete d.activatedPrograms;
  },
  manaCost: (d) => {
    const p = d.activatedPrograms?.[0];
    if (p) p.cost.mana = { generic: 0, W: 0, U: 0, B: 0, R: 0, G: 0, C: 0 };
  },
  tapCost: (d) => {
    const p = d.activatedPrograms?.[0];
    if (p) p.cost.tapSource = false;
  },
  targetRecipient: (d) => {
    const p = d.activatedPrograms?.[0];
    if (p) {
      p.target = null;
      p.effects = [{ kind: "draw", recipient: "controller", amount: 1 }];
    }
  },
  ordinaryBody: (d) => {
    d.oracleText += "\nDraw a card.";
  },
};
for (const [name, mutate] of Object.entries(changes))
  test(`full and prepared factories reject coherently rehashed ${name}`, async () => {
    const source = await fixture(),
      d = await deck(source);
    const original = named(source, "Master Decoy");
    const altered = structuredClone(original);
    mutate(altered);
    expect(canonicalJson(altered)).not.toBe(canonicalJson(original));
    delete source.definitions[original.id];
    source.definitions[altered.id] = altered;
    const forged = await rehash(source);
    await expect(createFullExecutionRegistry(forged)).rejects.toThrow();
    await expect(createPreparedMatchArtifact(forged, [d, d])).rejects.toThrow();
  });

test("wrong ABI rejects both factories even when reachable roots contain no activated programs", async () => {
  const source = await fixture(),
    legacy = await deck(source, true);
  for (const processorAbi of ["commander-engine/0.17.0", "commander-engine/0.19.0"]) {
    const altered = await rehash({ ...source, processorAbi });
    await expect(verifySourceRelease(altered)).resolves.toBeDefined();
    await expect(createFullExecutionRegistry(altered)).rejects.toThrow("ABI");
    await expect(createPreparedMatchArtifact(altered, [legacy, legacy])).rejects.toThrow("ABI");
  }
  expect(source.processorAbi).toBe(ENGINE_VERSION);
});

test("missing source roots, deck drift, copied artifact pins and unknown constructors cannot authorize pruning", async () => {
  const source = await fixture(),
    d = await deck(source),
    artifact = await createPreparedMatchArtifact(source, [d, d]);
  const changedDeck = await rehash({ ...d, id: `${d.id}:different` });
  await expect(admitPreparedMatchArtifact(artifact, source, [d, changedDeck])).rejects.toThrow();
  const missing = structuredClone(source);
  delete missing.definitions[named(source, "Master Decoy").id];
  await expect(createPreparedMatchArtifact(await rehash(missing), [d, d])).rejects.toThrow();
  const unknown = structuredClone(source);
  named(unknown, "Master Decoy").implementationRevision = "unknown-activation/1";
  const invalid = await rehash(unknown);
  const plan = await buildDevelopmentMatchPlan(invalid, [d, d]);
  expect(plan.closure.blockers.length).toBeGreaterThan(0);
  await expect(createPreparedMatchArtifact(invalid, [d, d])).rejects.toThrow();
  const forgedArtifact = structuredClone(artifact);
  forgedArtifact.sourceReleaseHash = "1".repeat(64);
  await expect(
    admitPreparedMatchArtifact(await rehash(forgedArtifact), source, [d, d]),
  ).rejects.toThrow();
});
