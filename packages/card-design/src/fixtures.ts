import { CardDisplaySchema } from "./model";
import source from "./proof-fixtures.json";
import metadata from "./proof-sources.json";

// Archived display fixtures from the studio, not a current Oracle catalog or executable content.
export const cardProofFixtures = source.map((card) => CardDisplaySchema.parse(card));
export const cardProofSources = z
  .record(
    z.string(),
    z.object({
      sources: z.array(
        z.url().refine((url) => url.startsWith("https://"), "Research links must use HTTPS."),
      ),
      researchedOn: z.string(),
      wording: z.string(),
    }),
  )
  .parse(metadata);

import { z } from "zod";
