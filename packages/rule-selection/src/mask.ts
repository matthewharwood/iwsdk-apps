import { SelectionError } from "./schema";
import type { SelectionView } from "./view";

/** Ordinals are local to this immutable view; they are never durable object IDs. */
export class Mask {
  readonly #bits: Uint32Array;
  constructor(
    readonly view: SelectionView,
    ordinals: Iterable<number> = [],
  ) {
    this.#bits = new Uint32Array(Math.ceil(view.candidates.length / 32));
    for (const ordinal of ordinals) {
      if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= view.candidates.length)
        throw new SelectionError("IncompatibleUniverse", `Invalid ordinal ${ordinal}`);
      const word = ordinal >>> 5;
      this.#bits[word] = (this.#bits[word] ?? 0) | (1 << (ordinal & 31));
    }
  }
  static all(view: SelectionView): Mask {
    return new Mask(view, view.candidates.keys());
  }
  has(ordinal: number): boolean {
    return (
      Number.isInteger(ordinal) &&
      ordinal >= 0 &&
      ordinal < this.view.candidates.length &&
      ((this.#bits[ordinal >>> 5] ?? 0) & (1 << (ordinal & 31))) !== 0
    );
  }
  ordinals(): number[] {
    return Array.from(this.view.candidates.keys()).filter((i) => this.has(i));
  }
  ids(): string[] {
    return this.ordinals().map((i) => this.view.candidates[i]?.id ?? "");
  }
  #compatible(other: Mask): void {
    // Rebuilt views deliberately invalidate even if the caller forgot to advance its epoch.
    if (this.view !== other.view)
      throw new SelectionError(
        "IncompatibleUniverse",
        "Masks belong to different domains, universes, generations, or evaluation views",
      );
  }
  and(other: Mask): Mask {
    this.#compatible(other);
    const result = new Mask(this.view);
    for (let i = 0; i < this.#bits.length; i++)
      result.#bits[i] = (this.#bits[i] ?? 0) & (other.#bits[i] ?? 0);
    return result;
  }
  or(other: Mask): Mask {
    this.#compatible(other);
    const result = new Mask(this.view);
    for (let i = 0; i < this.#bits.length; i++)
      result.#bits[i] = (this.#bits[i] ?? 0) | (other.#bits[i] ?? 0);
    return result;
  }
  not(): Mask {
    const result = new Mask(this.view);
    for (let i = 0; i < this.#bits.length; i++) result.#bits[i] = ~(this.#bits[i] ?? 0);
    const tail = this.view.candidates.length % 32;
    const last = result.#bits.length - 1;
    if (tail > 0) result.#bits[last] = (result.#bits[last] ?? 0) & (0xffffffff >>> (32 - tail));
    return result;
  }
}
export interface Bounds {
  lower: Mask;
  upper: Mask;
}
export function exactBounds(mask: Mask): Bounds {
  return { lower: mask, upper: mask };
}
export function unknownBounds(view: SelectionView): Bounds {
  return { lower: new Mask(view), upper: Mask.all(view) };
}
