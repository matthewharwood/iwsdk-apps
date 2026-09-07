import { type MatchManifest, StaticKeywordGrant } from "@iwsdk-apps/contracts";
import { counterFixture } from "./counterspells";
import { replaceDefinition } from "./static-bonus";

export function grant(
  filter: Partial<StaticKeywordGrant["filter"]> = {},
  keywords: StaticKeywordGrant["grant"] = ["indestructible"],
): StaticKeywordGrant {
  return StaticKeywordGrant.parse({
    schema: "commander-static-keyword-grant/1",
    sourceZone: "battlefield",
    layer: 6,
    filter: {
      types: ["Creature"],
      color: null,
      subtype: "Sliver",
      controller: "source-controller",
      excludeSource: false,
      ...filter,
    },
    grant: keywords,
  });
}
/** Constructed rule scenarios, not authenticated card programs or complete games. */
export function keywordFixture(mode: MatchManifest["resolver"] = "full-scan", seats: 2 | 4 = 2) {
  const f = counterFixture(seats);
  f.state.manifest.resolver = mode;
  if (mode !== "full-scan") {
    const pin = "f".repeat(64);
    f.state.manifest.preparedArtifactHash = pin;
    f.registry.preparedArtifactHash = pin;
  }
  replaceDefinition(f, "protected-creature", {
    power: 5,
    toughness: 5,
    subtypes: ["Sliver"],
    keywords: [],
    staticKeywordPrograms: [grant()],
  });
  replaceDefinition(f, "creature", { power: 2, toughness: 2, subtypes: ["Sliver"] });
  replaceDefinition(f, "artifact-creature", { subtypes: ["Sliver"] });
  return f;
}
