import { z } from "zod";
import type { CardDefinition } from "./index";

const Id = z.string().min(1).max(240);
const Digest = z.string().regex(/^[a-f0-9]{64}$/);
const Ids = z.array(Id).max(50_000);
export const PreparedDefinitionReference = z.strictObject({
  identity: Id,
  definitionHash: Digest,
  sourceVersion: Digest,
});
export const PreparedClosure = z.strictObject({
  roots: Ids,
  retained: Ids,
  excluded: Ids,
  retainedCoreCapabilities: Ids,
  blockers: Ids,
  widened: z.array(z.strictObject({ identity: Id, reason: Id })).max(50_000),
  iterations: z.number().int().nonnegative().max(50_000),
});
export const PreparedMatchArtifact = z.strictObject({
  schema: z.literal("prepared-match/1"),
  id: Id,
  hash: Digest,
  sourceReleaseHash: Digest,
  sourceBundle: Digest,
  rulesHash: Digest,
  profile: z.literal("tabletop-commander"),
  processorAbi: Id,
  compilerVersion: Id,
  recipeRegistryHash: Digest,
  deckHashes: z
    .array(Digest)
    .min(2)
    .max(4)
    .refine(
      (values) => values.length === 2 || values.length === 4,
      "Prepared Commander matches require two or four decks",
    ),
  closure: PreparedClosure,
  retainedDefinitions: z.array(PreparedDefinitionReference).max(50_000),
  requiredCoreCapabilities: Ids,
  analysisHash: Digest,
  assurance: z.literal("development-subset"),
  fullRegistryAvailable: z.literal(false),
});
export type PreparedMatchArtifact = z.infer<typeof PreparedMatchArtifact>;
/** An admitted executable lookup is separate from the complete authenticated content release. */
export interface ExecutionRegistry {
  sourceReleaseHash: string;
  preparedArtifactHash: string | null;
  definitions: Record<string, CardDefinition>;
}
