import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import type { Archive } from "./schemas";

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function hash(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => compare(a, b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("Undefined is not canonical JSON");
  return result;
}

export function bundleHash(archives: Archive[]): string {
  return hash(
    canonical(
      archives
        .map(({ kind, sha256, format, updatedAt, effectiveDate }) => ({
          kind,
          sha256,
          format,
          updatedAt,
          effectiveDate,
        }))
        .sort((a, b) => compare(`${a.kind}:${a.sha256}`, `${b.kind}:${b.sha256}`)),
    ),
  );
}

export async function hashFile(path: string): Promise<{ sha256: string; bytes: number }> {
  const digest = createHash("sha256");
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    digest.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: digest.digest("hex"), bytes };
}
