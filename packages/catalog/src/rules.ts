import { hash } from "./hash";

export interface RuleNode {
  id: string;
  kind: "chapter" | "section" | "rule" | "glossary" | "source";
  title: string;
  text: string;
  startLine: number;
  endLine: number;
  byteStart: number;
  byteEnd: number;
  sha256: string;
  applicability: "unresolved" | "source-reference-only";
  references: string[];
}

interface Marker {
  line: number;
  id: string;
  kind: RuleNode["kind"];
  title: string;
}

function bodyMarkers(lines: string[], bodyStart: number, glossaryStart: number): Marker[] {
  const markers: Marker[] = [];
  for (let line = bodyStart; line < glossaryStart; line++) {
    const content = lines[line]?.trim() ?? "";
    const rule = /^(\d{3}(?:\.\d+[a-z]?)?)\.?\s+(.+)$/.exec(content);
    const chapter = /^(\d)\.\s+(.+)$/.exec(content);
    if (rule?.[1])
      markers.push({
        line,
        id: rule[1],
        kind: rule[1].includes(".") ? "rule" : "section",
        title: rule[2] ?? "",
      });
    else if (chapter?.[1])
      markers.push({ line, id: `chapter:${chapter[1]}`, kind: "chapter", title: chapter[2] ?? "" });
  }
  return markers;
}

/** Lossless source segmentation; no parsed entry is claimed to have implemented semantics. */
export function parseRules(text: string): {
  nodes: RuleNode[];
  unresolvedReferences: { from: string; to: string }[];
  effectiveDate: string;
  bytes: number;
} {
  const reported = /These rules are effective as of ([^.]+)\./.exec(text)?.[1];
  if (!reported) throw new Error("Comprehensive Rules effective-date header missing");
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const firstRule = lines.findIndex((line) => /^100\.1\.\s/.test(line));
  if (firstRule < 0) throw new Error("Rules body sentinel 100.1 missing");
  let bodyStart = firstRule;
  for (let line = 0; line < firstRule; line++)
    if (lines[line]?.trim() === "1. Game Concepts") bodyStart = line;
  let glossaryStart = -1;
  let creditsStart = lines.length;
  for (let line = bodyStart; line < lines.length; line++) {
    if (lines[line]?.trim() === "Glossary") glossaryStart = line;
    if (lines[line]?.trim() === "Credits") creditsStart = line;
  }
  if (glossaryStart < bodyStart || creditsStart < glossaryStart)
    throw new Error("Rules glossary/credits boundary missing");
  const markers: Marker[] = [
    {
      line: 0,
      id: "source:preamble-and-contents",
      kind: "source",
      title: "Preamble and table of contents",
    },
    ...bodyMarkers(lines, bodyStart, glossaryStart),
    { line: glossaryStart, id: "source:glossary-heading", kind: "source", title: "Glossary" },
  ];
  let glossaryOrdinal = 0;
  for (let line = glossaryStart + 1; line < creditsStart; line++) {
    const term = lines[line]?.trim();
    if (term && !lines[line - 1]?.trim() && lines[line + 1]?.trim()) {
      markers.push({ line, id: `glossary:${++glossaryOrdinal}`, kind: "glossary", title: term });
    }
  }
  if (glossaryOrdinal === 0) throw new Error("No glossary definitions parsed");
  if (creditsStart < lines.length)
    markers.push({ line: creditsStart, id: "source:credits", kind: "source", title: "Credits" });
  const offsets = [0];
  for (const line of lines) offsets.push((offsets.at(-1) ?? 0) + Buffer.byteLength(line));
  const ids = new Set<string>();
  const definedIds = new Set(markers.map((marker) => marker.id));
  const nodes = markers.map((marker, index): RuleNode => {
    if (ids.has(marker.id)) throw new Error(`Duplicate rules ID: ${marker.id}`);
    ids.add(marker.id);
    const end = markers[index + 1]?.line ?? lines.length;
    const content = lines.slice(marker.line, end).join("");
    const references =
      marker.kind === "source"
        ? []
        : [
            ...new Set(
              [...content.matchAll(/\b(\d{3}(?:\.\d+[a-z]?)?)\b/g)]
                .filter((match) => {
                  const target = match[1] ?? "";
                  return (
                    definedIds.has(target) ||
                    target.includes(".") ||
                    /rules?\s+$/.test(content.slice(0, match.index))
                  );
                })
                .map((match) => match[1])
                .filter((id): id is string => Boolean(id && id !== marker.id)),
            ),
          ];
    return {
      ...marker,
      text: content,
      startLine: marker.line + 1,
      endLine: end,
      byteStart: offsets[marker.line] ?? 0,
      byteEnd: offsets[end] ?? 0,
      sha256: hash(content),
      applicability: marker.kind === "source" ? "source-reference-only" : "unresolved",
      references,
    };
  });
  if (nodes.map((node) => node.text).join("") !== text)
    throw new Error("Rules source accounting lost text");
  const unresolvedReferences = nodes.flatMap((node) =>
    node.references.filter((id) => !ids.has(id)).map((to) => ({ from: node.id, to })),
  );
  return {
    nodes,
    unresolvedReferences,
    effectiveDate: new Date(reported).toISOString().slice(0, 10),
    bytes: Buffer.byteLength(text),
  };
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, value: string) => String.fromCodePoint(Number(value)))
    .replace(/&#x([a-f\d]+);/gi, (_, value: string) =>
      String.fromCodePoint(Number.parseInt(value, 16)),
    )
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseCommanderBans(section: string): {
  namedBans: string[];
  companionBans: string[];
  categoryEvidence: string[];
} {
  const items = [...section.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((match) =>
    plainText(match[1] ?? ""),
  );
  if (!items.length) throw new Error("Commander policy has no restriction items");
  const namedBans: string[] = [],
    companionBans: string[] = [],
    categoryEvidence: string[] = [];
  for (const item of items) {
    const companion = /^(.+?)\s*-\s*only banned as a companion\./.exec(item);
    if (companion?.[1]) companionBans.push(companion[1]);
    else if (item.includes("Click") || item.includes("cards with") || item.includes("Cards whose"))
      categoryEvidence.push(item);
    else namedBans.push(item);
  }
  return { namedBans, companionBans, categoryEvidence };
}
