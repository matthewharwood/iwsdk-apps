import { type AiObservation, AiObservationSchema, type Take } from "@iwsdk-apps/schemas";

export interface DecisionPolicy {
  choose(observation: AiObservation, signal?: AbortSignal): Promise<Take>;
  close(): void;
}

export function chooseHeuristic(input: AiObservation): Take {
  const observation = AiObservationSchema.parse(input);
  // Leave a multiple of four whenever possible. Rules still validate the result.
  const preferred = observation.remaining % 4;
  const best = observation.legalChoices.find((take) => take === preferred);
  const fallback = observation.legalChoices[0];
  if (!fallback) throw new Error("No legal AI move exists.");
  return best ?? fallback;
}

export function encodeObservation(input: AiObservation): Float32Array<ArrayBuffer> {
  const observation = AiObservationSchema.parse(input);
  return new Float32Array([observation.remaining / 15]);
}

export function chooseScoredAction(input: AiObservation, scores: ArrayLike<number>): Take {
  const observation = AiObservationSchema.parse(input);
  if (scores.length !== 3 || !Array.from(scores).every(Number.isFinite))
    throw new Error("The model returned invalid action scores.");
  let best = chooseHeuristic(observation);
  let bestScore = -Infinity;
  for (const take of observation.legalChoices) {
    const score = scores[take - 1];
    if (score !== undefined && score > bestScore) {
      best = take;
      bestScore = score;
    }
  }
  return best;
}

export async function chooseWithFallback(
  policy: DecisionPolicy | null,
  observation: AiObservation,
  signal?: AbortSignal,
): Promise<Take> {
  signal?.throwIfAborted();
  try {
    const take = policy ? await policy.choose(observation, signal) : chooseHeuristic(observation);
    signal?.throwIfAborted();
    if (!observation.legalChoices.includes(take))
      throw new Error("The policy proposed an illegal move.");
    return take;
  } catch {
    signal?.throwIfAborted();
    return chooseHeuristic(observation);
  }
}
