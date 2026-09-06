import { Fragment, type ReactNode } from "react";
import { ManaSymbol } from "./symbols";
import { highlightRanges, tokenizeCardText } from "./text";

type Range = { start: number; end: number };

function punctuation(text: string, from: number, to: number, activation: boolean): ReactNode {
  if (!activation) return text.slice(from, to);
  const matches = [...text.matchAll(/[:,;()]|(?<!\S)[-–—](?!\S)/g)];
  const nodes: ReactNode[] = [];
  let cursor = from;
  for (const match of matches) {
    if (match.index < from || match.index >= to) continue;
    nodes.push(
      text.slice(cursor, match.index),
      <span className="ability-punctuation" key={match.index}>
        {match[0]}
      </span>,
    );
    cursor = match.index + match[0].length;
  }
  nodes.push(text.slice(cursor, to));
  return nodes;
}

export function TextRuns({
  text,
  ranges,
  offset = 0,
  activation = false,
}: {
  text: string;
  ranges: readonly Range[];
  offset?: number;
  activation?: boolean;
}) {
  return (
    <>
      {tokenizeCardText(text).map((part) => {
        if (part.kind === "symbols")
          return (
            <span className="pip-group" key={part.start}>
              {part.symbols.map((symbol) => (
                <ManaSymbol
                  key={symbol.start}
                  symbol={symbol.symbol}
                  order={symbol.order}
                  marked={ranges.some(
                    (range) =>
                      range.start < offset + symbol.end && range.end > offset + symbol.start,
                  )}
                />
              ))}
            </span>
          );
        const start = part.start + offset;
        const end = part.end + offset;
        const nodes: ReactNode[] = [];
        let cursor = start;
        for (const range of ranges) {
          if (range.end <= start || range.start >= end) continue;
          const from = Math.max(start, range.start);
          const to = Math.min(end, range.end);
          nodes.push(punctuation(text, cursor - offset, from - offset, activation));
          nodes.push(
            <mark key={from}>{punctuation(text, from - offset, to - offset, activation)}</mark>,
          );
          cursor = to;
        }
        nodes.push(punctuation(text, cursor - offset, end - offset, activation));
        return <Fragment key={part.start}>{nodes}</Fragment>;
      })}
    </>
  );
}

export function RulesText({
  text,
  highlights = [],
}: {
  text: string;
  highlights?: readonly string[];
}) {
  return <TextRuns text={text} ranges={highlightRanges(text, highlights)} />;
}
