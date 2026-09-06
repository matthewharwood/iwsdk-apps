import { openCatalog } from "./database";
import { canonical, hash } from "./hash";
import { buildObligationLedger, RISK_GROUPS, type RiskGroup } from "./investigation";

interface ScenarioDraft {
  id: string;
  group: RiskGroup;
  rules: string[];
  assumptions: string[];
  action: string;
  expected: string[];
}
type DraftTuple = [string, RiskGroup, string[], string, string, string[]];

// These expectations were authored from the pinned source, before observing runtime results.
// They are research fixtures until someone implements and independently reviews each production-path test.
const TUPLES: DraftTuple[] = [
  [
    "SRC-SET-01",
    "setup-admission",
    ["903.3", "903.5a", "903.5b", "903.5c"],
    "An ordinary legendary creature commander; 100 cards including it; unique nonbasic English names; all colors inside commander identity; no special construction abilities.",
    "Submit the deck for admission.",
    [
      "Ordinary composition constraints pass; repeated basic lands are permitted.",
      "Admission does not certify executable card support.",
    ],
  ],
  [
    "SRC-SET-02",
    "setup-admission",
    ["903.5a", "903.5b", "903.5c"],
    "Begin with the valid ordinary composition from SRC-SET-01.",
    "Separately submit a 99-card deck, a duplicate nonbasic-name variant, and an off-color variant.",
    [
      "Each variant is rejected for its specific construction violation.",
      "The previously accepted immutable deck revision is unchanged.",
    ],
  ],
  [
    "SRC-CAST-01",
    "casting-payment",
    ["601.2f", "601.2h"],
    "A spell costs one generic plus black and sacrificing a creature; the sacrificed creature supplies a one-generic reduction while total cost is determined.",
    "Lock the total cost, then sacrifice that reducer while paying.",
    ["The locked mana cost remains black; removal during payment does not recalculate it."],
  ],
  [
    "SRC-CAST-02",
    "casting-payment",
    ["601.2h"],
    "A spell requires two colored mana; the proposed payment supplies only one, with no modifying effects.",
    "Attempt to complete casting with the insufficient payment.",
    [
      "Partial payment cannot complete casting.",
      "Missing implementation is reported separately from rules illegality.",
    ],
  ],
  [
    "SRC-TGT-01",
    "targets-selections",
    ["608.2b"],
    "A spell has one creature target and an untargeted benefit; the creature left its original zone before resolution.",
    "Attempt resolution after priority passes.",
    [
      "The spell does not resolve and goes from stack to its owner's graveyard.",
      "The untargeted benefit does not happen either.",
    ],
  ],
  [
    "SRC-TGT-02",
    "targets-selections",
    ["608.2b"],
    "A spell has two independent targets; one remains legal and the other becomes illegal.",
    "Resolve the spell.",
    [
      "Resolution proceeds for the legal target as instructed.",
      "The illegal target is not affected by parts for which it is illegal; unavailable information is not invented.",
    ],
  ],
  [
    "SRC-REP-01",
    "replacement-prevention",
    ["616.1", "614.5"],
    "A two-damage event is affected by two distinct independent damage-doubling replacement instances, with no earlier-priority replacement class.",
    "Have the affected chooser apply the replacements to the evolving event.",
    [
      "Each instance applies once; damage becomes eight.",
      "One replacement cannot keep applying itself indefinitely to its rewritten event.",
    ],
  ],
  [
    "SRC-REP-02",
    "replacement-prevention",
    ["616.1"],
    "Two ordinary applicable replacements compete over an event affecting an opponent's creature.",
    "Determine the chooser for replacement selection.",
    [
      "The affected object's controller chooses, or its owner if it has no controller.",
      "Selector specificity and active-player convenience do not choose an effect.",
    ],
  ],
  [
    "SRC-TRG-01",
    "triggers-history",
    ["603.3b"],
    "Both players control multiple waiting triggers, including a trigger caused by another ability triggering.",
    "Perform the pending-trigger checkpoint.",
    [
      "Use the two-part APNAP stacking procedure; each controller chooses their order within each part.",
      "Process state-based actions and new triggers before returning priority.",
    ],
  ],
  [
    "SRC-TRG-02",
    "triggers-history",
    ["603.4"],
    "An intervening-if condition is true at the trigger event and false before resolution.",
    "Resolve the trigger; contrast with a run where its condition was false at the event.",
    [
      "In the first run it triggered, but leaves the stack without its effect at resolution.",
      "In the contrast it never triggered.",
    ],
  ],
  [
    "SRC-LAY-01",
    "continuous-characteristics",
    ["613.8", "613.8a", "613.8b"],
    "Two same-layer effects satisfy the exact dependency conditions; timestamps would otherwise place the dependent effect first.",
    "Evaluate characteristics in that layer.",
    [
      "Apply the prerequisite effect before the dependent one despite timestamps.",
      "Boolean discovery does not establish semantic ordering.",
    ],
  ],
  [
    "SRC-LAY-02",
    "continuous-characteristics",
    ["613.8b"],
    "Several same-layer effects form a dependency loop.",
    "Evaluate the effects in the loop.",
    [
      "Ignore dependency waiting within the loop and use timestamp order.",
      "Do not invent fixed-point iteration as effect semantics.",
    ],
  ],
  [
    "SRC-COM-01",
    "combat-damage",
    ["702.19b"],
    "An unmodified six-power trampler is blocked by one undamaged two-toughness creature.",
    "Compare allocations of two/four and one/five to blocker/defending player.",
    [
      "Two to the blocker and four to the player is legal.",
      "One to the blocker and five to the player fails lethal-assignment constraints.",
    ],
  ],
  [
    "SRC-COM-02",
    "combat-damage",
    ["510.1c"],
    "A blocked attacker has no blockers remaining at damage assignment and lacks trample or another permission.",
    "Assign combat damage.",
    ["It assigns no combat damage; losing its blocker does not make it unblocked."],
  ],
  [
    "SRC-OBJ-01",
    "identity-copies",
    ["400.7"],
    "A creature changes zones and returns; none of the listed 400.7 exceptions applies to the tested reference.",
    "Evaluate an effect still holding the prior object-generation reference.",
    [
      "The returned creature is a new object; the old reference does not silently retarget by physical lineage.",
    ],
  ],
  [
    "SRC-OBJ-02",
    "identity-copies",
    ["707.2"],
    "A base two/two creature has a plus-one counter and an ordinary temporary characteristic modification.",
    "Create an ordinary copy with no copy-setting exceptions.",
    [
      "Copy copiable values, not counters, tapped status, or the ordinary temporary effect.",
      "A flattened displayed characteristic value is not necessarily a copiable value.",
    ],
  ],
  [
    "SRC-ZON-01",
    "zones-chance",
    ["401.2"],
    "A library has a known fixture order; the ordinary player lacks permission to inspect or rearrange it.",
    "Request a player observation and unauthorized rearrangement.",
    [
      "The player view reveals neither hidden identities nor order through candidate identifiers.",
      "The rearrangement is unavailable; inspection leaves the ordered library unchanged.",
    ],
  ],
  [
    "SRC-ZON-02",
    "zones-chance",
    ["701.23b", "701.23d"],
    "One effect searches a hidden library for a stated quality; another requests a fixed number without a quality restriction.",
    "Try to find zero qualifying cards despite a match, then too few in the unrestricted-number search.",
    [
      "The quality search may fail to find a qualifying card.",
      "The unrestricted search must find the requested number, or as many as possible if fewer exist.",
    ],
  ],
  [
    "SRC-CMD-01",
    "commander-elimination",
    ["903.9a", "903.9b"],
    "A commander is about to move to graveyard, or to its owner's hand in a separate run.",
    "Take the owner through the respective destination choice.",
    [
      "Graveyard/exile return occurs at the state-based-action boundary after entry.",
      "Hand/library return is a replacement choice; these are distinct timing mechanisms.",
    ],
  ],
  [
    "SRC-CMD-02",
    "commander-elimination",
    ["800.4a"],
    "A departing player owns objects and controls an opponent-owned creature through a control-changing effect.",
    "Eliminate the departing player.",
    [
      "Owned objects leave immediately; control-giving effects end before still-controlled objects are exiled.",
      "Ending the control effect can return the opponent-owned creature to its previous controller.",
    ],
  ],
  [
    "SRC-HID-01",
    "hidden-simultaneous",
    ["101.4a", "101.4b"],
    "An effect has each player choose a card from their hidden hand without revealing it.",
    "Collect choices in the required order.",
    [
      "Chosen cards may remain face down while clearly identified as the choices.",
      "Later players do not automatically learn their hidden identities.",
    ],
  ],
  [
    "SRC-HID-02",
    "hidden-simultaneous",
    ["101.4", "101.4b"],
    "Multiple players make ordinary public simultaneous choices.",
    "Collect choices, then perform the simultaneous actions.",
    [
      "Players choose in APNAP order and know earlier public choices.",
      "Actions happen together after choices; selecting one does not prematurely commit its effect.",
    ],
  ],
  [
    "SRC-LOOP-01",
    "exceptional-workflows",
    ["104.4b"],
    "The game has no limited-range-of-influence option and an unavoidable loop of mandatory actions.",
    "Establish that the loop has no stopping choice.",
    [
      "The rules outcome is a draw.",
      "A computation budget expiring without that proof is an incomplete run, not a draw.",
    ],
  ],
  [
    "SRC-LOOP-02",
    "exceptional-workflows",
    ["104.4b", "732.3"],
    "Optional independent choices keep returning a fragmented loop to the same game state.",
    "Reach the repeated state again.",
    [
      "The active involved player, or first involved player in turn order, must make a different choice.",
      "An optional loop does not itself establish a draw.",
    ],
  ],
];

export interface AuthoredScenario extends ScenarioDraft {
  version: string;
  sourceBundle: string;
  sourceReferences: {
    documentHash: string;
    rule: string;
    textHash: string;
    byteStart: number;
    byteEnd: number;
  }[];
  execution: "not-run";
  independentReview: "pending";
  author: "source-investigation-agent";
  assurance: "authored-source-expectation-not-executed-proof";
}

export function authorHighRiskScenarios(dbPath: string): {
  ledgerId: string;
  scenarios: AuthoredScenario[];
  familyCounts: { group: RiskGroup; count: number }[];
  executed: 0;
} {
  const ledger = buildObligationLedger(dbPath);
  const db = openCatalog(dbPath);
  try {
    const scenarios = TUPLES.map(
      ([id, group, rules, assumption, action, expected]): AuthoredScenario => {
        const draft: ScenarioDraft = {
          id,
          group,
          rules,
          assumptions: [assumption],
          action,
          expected,
        };
        const sourceReferences = rules.map((rule) => {
          const source = db
            .query<
              { document_hash: string; text_hash: string; byte_start: number; byte_end: number },
              [string, string]
            >(
              "SELECT document_hash,text_hash,byte_start,byte_end FROM rule_nodes WHERE import_id=? AND node_id=? AND kind='rule'",
            )
            .get(ledger.importId, rule);
          if (!source) throw new Error(`Authored scenario references missing rule ${rule}`);
          return {
            documentHash: source.document_hash,
            rule,
            textHash: source.text_hash,
            byteStart: source.byte_start,
            byteEnd: source.byte_end,
          };
        });
        return {
          ...draft,
          version: hash(canonical({ draft, sourceReferences })),
          sourceBundle: ledger.bundleHash,
          sourceReferences,
          execution: "not-run",
          independentReview: "pending",
          author: "source-investigation-agent",
          assurance: "authored-source-expectation-not-executed-proof",
        };
      },
    );
    const familyCounts = RISK_GROUPS.map((group) => ({
      group,
      count: scenarios.filter((scenario) => scenario.group === group).length,
    }));
    if (familyCounts.some((family) => family.count < 2))
      throw new Error("Authored scenario floor missing a risk family");
    db.transaction(() => {
      for (const scenario of scenarios)
        db.query("INSERT OR IGNORE INTO authored_scenarios VALUES(?,?,?)").run(
          scenario.id,
          ledger.id,
          JSON.stringify(scenario),
        );
    })();
    return { ledgerId: ledger.id, scenarios, familyCounts, executed: 0 };
  } finally {
    db.close();
  }
}
