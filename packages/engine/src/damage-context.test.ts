import { expect, test } from "bun:test";
import {
  canonicalJson,
  DamageStaticProgram,
  type PendingDamageFrame,
  type RulesState,
} from "@iwsdk-apps/contracts";
import {
  damageSourceAnswer as answer,
  damageSourceCard as card,
  damageSourceCast as cast,
  damageSourceCommand as command,
  damageSourceFixture as fixture,
  damageSourceMain as main,
  damageSourceObject as object,
  damageSourceResolve as resolve,
} from "../test-fixtures/damage-source";
import { assertDamageContinuation } from "./damage-context";
import { checkedDamageNumber, transformedDamage } from "./damage-domain";
import { commitDamageResults } from "./damage-results";
import { assertInvariants, transition } from "./index";

function pending(state: RulesState): PendingDamageFrame {
  const f = state.frames[0];
  if (f?.kind !== "pending-damage") throw Error("Missing damage frame");
  return f;
}
function choose(state: RulesState) {
  const d = state.decision?.damageReplacement;
  const o = d?.occurrences[0];
  const e = o?.effects[0];
  if (!d || !o || !e) throw Error("Missing rewrite");
  return {
    kind: "damage-replacement" as const,
    eventId: d.eventId,
    eventVersion: d.version,
    occurrenceId: o.id,
    effectId: e.id,
  };
}
async function established(mode: "full-scan" | "prepared-scan" | "prepared-indexed") {
  const f = await fixture(
    "Lady Orca",
    ["Furnace of Rath", "Dictate of the Twin Gods", "Sorin's Thirst"],
    "Jasmine Boreal",
    ["Ancient Brontodon"],
    mode,
  );
  cast(f, "A", "Furnace of Rath");
  resolve(f);
  main(f, "B");
  cast(f, "B", "Ancient Brontodon");
  resolve(f);
  cast(f, "A", "Dictate of the Twin Gods");
  resolve(f);
  cast(f, "A", "Sorin's Thirst", object(f, "B", "Ancient Brontodon").id);
  resolve(f);
  answer(f, choose(f.state));
  return f;
}
for (const mode of ["full-scan", "prepared-scan", "prepared-indexed"] as const) {
  test(`DR16 ${mode}: rewritten origin, cursor, recipient, instances and arithmetic cannot reach dispatch`, async () => {
    const f = await established(mode);
    const valid = canonicalJson(f.state);
    const response = choose(f.state);
    const mutations: [string, (s: RulesState, f: PendingDamageFrame) => void][] = [
      [
        "origin amount",
        (_s, p) => {
          p.origin.data.occurrences = [];
        },
      ],
      [
        "origin event",
        (_s, p) => {
          p.origin.index++;
        },
      ],
      [
        "epoch",
        (_s, p) => {
          p.origin.epoch++;
        },
      ],
      [
        "proposal revision",
        (_s, p) => {
          p.proposedAtRevision++;
        },
      ],
      [
        "host cursor",
        (_s, p) => {
          if (p.host.kind === "spell-instruction") p.host.effectIndex++;
        },
      ],
      [
        "host source controller",
        (_s, p) => {
          if (p.host.kind === "spell-instruction") p.host.controller = "B";
        },
      ],
      [
        "host source version",
        (_s, p) => {
          if (p.host.kind === "spell-instruction") p.host.sourceVersion = "0".repeat(64);
        },
      ],
      [
        "original source generation",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].original.source.object.generation++;
        },
      ],
      [
        "source spell kind",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].original.source.isSpell = false;
        },
      ],
      [
        "recipient kind",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].original.recipient = { kind: "player", id: "B" };
        },
      ],
      [
        "affected actor",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].original.affectedPlayer = "A";
        },
      ],
      [
        "original amount",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].original.amount++;
        },
      ],
      [
        "current amount",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].amount++;
        },
      ],
      [
        "applied cleared",
        (_s, p) => {
          if (p.occurrences[0]) p.occurrences[0].applied = [];
        },
      ],
      [
        "rewrite before",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].before++;
        },
      ],
      [
        "rewrite after",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].after++;
        },
      ],
      [
        "prevention forged",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].prevented = 1;
        },
      ],
      [
        "rewrite owner",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].actor = "A";
        },
      ],
      [
        "duplicate use",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites.push(structuredClone(p.rewrites[0]));
        },
      ],
      [
        "provider incarnation",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].effect.provider.generation++;
        },
      ],
      [
        "provider version",
        (_s, p) => {
          if (p.rewrites[0]) p.rewrites[0].effect.sourceVersion = "0".repeat(64);
        },
      ],
      [
        "provider program",
        (_s, p) => {
          if (p.rewrites[0])
            p.rewrites[0].effect.program = card("Urza's Armor")
              .damagePrograms?.[0] as (typeof p.rewrites)[0]["effect"]["program"];
        },
      ],
      [
        "unrelated mana domain",
        (s) => {
          s.decision?.manaSources.push({ object: "bogus", colors: ["W"] });
        },
      ],
      [
        "priority during damage",
        (s) => {
          s.priorityPlayer = "B";
        },
      ],
      [
        "stale view",
        (s) => {
          if (s.decision?.damageReplacement) s.decision.damageReplacement.version++;
        },
      ],
    ];
    for (const [name, mutate] of mutations) {
      const changed = structuredClone(f.state);
      mutate(changed, pending(changed));
      expect(() => assertInvariants(changed, f.registry), name).toThrow();
      const result = transition(changed, command({ ...f, state: changed }, response), f.registry);
      expect(result.status, name).toBe("fault");
    }
    expect(canonicalJson(f.state)).toBe(valid);
    assertDamageContinuation(f.state, f.registry);
  });
  test(`DR24 ${mode}: exact transform and aggregate numeric overflow rejects without partial damage publication`, async () => {
    const f = await established(mode);
    const p = pending(f.state);
    const effect = p.rewrites[0]?.effect;
    if (!effect) throw Error("Missing actual doubler");
    expect(() => transformedDamage(Number.MAX_SAFE_INTEGER, true, effect)).toThrow("safe-integer");
    expect(() => checkedDamageNumber(Number.MAX_SAFE_INTEGER + 1)).toThrow("safe-integer");
    // Constructed extreme numeric domain only; no source spell or admitted game claims this amount.
    const before = canonicalJson(f.state);
    const o = structuredClone(p.occurrences[0]);
    if (!o) throw Error("Missing actual occurrence");
    o.amount = Number.MAX_SAFE_INTEGER;
    expect(() => commitDamageResults(f.state, p.host, [o, o])).toThrow("safe-integer");
    expect(canonicalJson(f.state)).toBe(before);
  });
}
test("DR19–21/23: finite strict schema rejects controllerless recipients, other classes, redirection, optional shields and unknown programs", () => {
  const body = card("Furnace of Rath").damagePrograms?.[0];
  if (!body) throw Error("Missing source doubler");
  for (const altered of [
    { ...body, priority: "self-replacement" },
    { ...body, priority: "enter-copy" },
    { ...body, recipient: "owner-fallback" },
    { ...body, operation: { kind: "redirect", recipient: "opponent" } },
    { ...body, optional: true },
    { ...body, kind: "token-doubling" },
    { ...body, resource: 1 },
  ])
    expect(DamageStaticProgram.safeParse(altered).success).toBe(false);
});
