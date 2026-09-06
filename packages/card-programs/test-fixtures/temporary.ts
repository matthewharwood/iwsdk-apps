import type { CatalogCard } from "@iwsdk-apps/catalog";
import {
  TEMPORARY_CREATURE_ARCHIVE,
  TEMPORARY_CREATURE_SOURCE_BUNDLE,
  type TemporaryCreatureSource,
} from "../src/temporary-creature";
/** Source-bound constructor metadata; this minimal envelope is not a full archival payload. */
export function temporaryCandidate(recipe: TemporaryCreatureSource): CatalogCard {
  return {
    identity: recipe.identity,
    versionHash: recipe.sourceVersion,
    sourceArchiveHash: TEMPORARY_CREATURE_ARCHIVE,
    sourceOrdinal: recipe.sourceOrdinal,
    bundleHash: TEMPORARY_CREATURE_SOURCE_BUNDLE,
    eligibility: [
      {
        role: "main-deck",
        status: "candidate",
        reason: "reviewed temporary-spell source tuple fixture",
        sourceHash: TEMPORARY_CREATURE_ARCHIVE,
      },
    ],
    oracle: {
      object: "card",
      id: recipe.identity,
      oracle_id: recipe.identity,
      name: recipe.name,
      layout: "normal",
      lang: "en",
      released_at: "2020-01-01",
      set: "fixture",
      collector_number: "1",
      legalities: { commander: "legal" },
      games: ["paper"],
      colors: [...recipe.colors],
      color_identity: [...recipe.colorIdentity],
      keywords: [],
      type_line: recipe.typeLine,
      mana_cost: recipe.manaCost,
      cmc: recipe.manaValue,
      oracle_text: recipe.oracleText,
    },
  };
}
