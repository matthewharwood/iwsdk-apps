const simpleSymbols = new Set(["W", "U", "B", "R", "G", "C", "T", "Q", "S", "E", "P", "CHAOS"]);
const generic = /^(?:\d+|X|Y|Z|∞)$/;
const manaParts = new Set(["W", "U", "B", "R", "G", "C", "S", "P"]);
const coloredParts = new Set(["W", "U", "B", "R", "G"]);

export function isKnownSymbol(symbol: string): boolean {
  if (simpleSymbols.has(symbol) || generic.test(symbol)) return true;
  const parts = symbol.split("/");
  return parts.length === 2 && parts.every((part) => manaParts.has(part) || generic.test(part));
}

export function manaDisplayOrder(symbols: readonly string[]): number[] {
  const result = symbols.map((_, index) => index);
  const isMana = (symbol: string) =>
    isKnownSymbol(symbol) &&
    symbol.split("/").every((part) => manaParts.has(part) || generic.test(part));
  let start = 0;
  while (start < symbols.length) {
    if (!isMana(symbols[start] ?? "")) {
      start++;
      continue;
    }
    let end = start + 1;
    while (end < symbols.length && isMana(symbols[end] ?? "")) end++;
    const segment = symbols.slice(start, end);
    if (segment.some((symbol) => symbol.split("/").some((part) => coloredParts.has(part)))) {
      const indexes = segment.map((_, index) => start + index);
      const ordered = [
        ...indexes.filter((index) => !generic.test(symbols[index] ?? "")),
        ...indexes.filter((index) => generic.test(symbols[index] ?? "")),
      ];
      ordered.forEach((sourceIndex, position) => {
        result[sourceIndex] = start + position;
      });
    }
    start = end;
  }
  return result;
}

export type TextPart = { kind: "text"; text: string; start: number; end: number };
export type SymbolPart = {
  symbol: string;
  raw: string;
  start: number;
  end: number;
  known: boolean;
  order: number;
};
export type RichTextPart =
  | TextPart
  | { kind: "symbols"; symbols: SymbolPart[]; start: number; end: number };

export function oracleParagraphs(
  text: string,
): { text: string; start: number; paragraph: number }[] {
  let start = 0;
  return text.split("\n").map((value, paragraph) => {
    const entry = { text: value, start, paragraph };
    start += value.length + 1;
    return entry;
  });
}

/** Tokenization only: no ability classification, legality, or rules interpretation. */
export function tokenizeCardText(text: string): RichTextPart[] {
  const result: RichTextPart[] = [];
  let cursor = 0;
  for (const run of text.matchAll(/\{[^{}\n]+\}(?:[ \t]*\{[^{}\n]+\})*/g)) {
    if (run.index > cursor)
      result.push({
        kind: "text",
        text: text.slice(cursor, run.index),
        start: cursor,
        end: run.index,
      });
    const matches = [...run[0].matchAll(/\{([^{}\n]+)\}/g)];
    const order = manaDisplayOrder(matches.map((match) => match[1] ?? ""));
    result.push({
      kind: "symbols",
      start: run.index,
      end: run.index + run[0].length,
      symbols: matches.map((match, index) => ({
        symbol: match[1] ?? "",
        raw: match[0],
        start: run.index + match.index,
        end: run.index + match.index + match[0].length,
        known: isKnownSymbol(match[1] ?? ""),
        order: order[index] ?? index,
      })),
    });
    cursor = run.index + run[0].length;
  }
  if (cursor < text.length)
    result.push({ kind: "text", text: text.slice(cursor), start: cursor, end: text.length });
  return result;
}

export function highlightRanges(
  text: string,
  phrases: readonly string[],
): { start: number; end: number }[] {
  const ordered = [...new Set(phrases)].filter(Boolean).sort((a, b) => b.length - a.length);
  const result: { start: number; end: number }[] = [];
  for (let start = 0; start < text.length; ) {
    const phrase = ordered.find((item) => text.startsWith(item, start));
    if (phrase) {
      result.push({ start, end: start + phrase.length });
      start += phrase.length;
    } else start++;
  }
  return result;
}
