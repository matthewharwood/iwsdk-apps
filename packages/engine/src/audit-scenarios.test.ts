import { expect, test } from "bun:test";
import {
  type CardDefinition,
  CHANCE_VERSION,
  CONTRACT_VERSION,
  ENGINE_VERSION,
  type ExecutionRegistry,
  emptyMana,
  type MatchManifest,
  type Response,
  SERIALIZER_VERSION,
} from "@iwsdk-apps/contracts";
import { createMatch, observe, transition } from "./index";

// Independent expectation: CR 103.5 declarations are public and ordered;
// CR 402.3 keeps opponents' hand identities hidden. Source SHA-256:
// 4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f.
// Synthetic legal-size decks isolate projection behavior, not source-card certification.
function fixture(seatCount: 2 | 4) {
  const digest = "a".repeat(64);
  const commander: CardDefinition = {
    id: "commander",
    oracleId: "audit-commander",
    sourceVersion: digest,
    name: "Audit commander",
    typeLine: "Legendary Creature",
    types: ["Creature"],
    subtypes: [],
    supertypes: ["Legendary"],
    colors: ["G"],
    colorIdentity: ["G"],
    manaCost: { ...emptyMana(), generic: 0, G: 1 },
    manaValue: 1,
    power: 2,
    toughness: 2,
    keywords: [],
    manaAbilities: [],
    oracleText: "",
    commanderEligible: true,
    deckLimit: 1,
    obligations: [],
    implementationRevision: "audit-fixture/1",
  };
  const land: CardDefinition = {
    ...commander,
    id: "land",
    oracleId: "audit-land",
    name: "Audit Forest",
    typeLine: "Basic Land — Forest",
    types: ["Land"],
    subtypes: ["Forest"],
    supertypes: ["Basic"],
    colors: [],
    manaCost: null,
    manaValue: 0,
    power: null,
    toughness: null,
    manaAbilities: ["G"],
    commanderEligible: false,
    deckLimit: null,
  };
  const registry: ExecutionRegistry = {
    sourceReleaseHash: digest,
    preparedArtifactHash: null,
    definitions: { commander, land },
  };
  const manifest: MatchManifest = {
    schema: "commander-match/1",
    id: `setup-observation-${seatCount}`,
    releaseHash: digest,
    engineVersion: ENGINE_VERSION,
    serializer: SERIALIZER_VERSION,
    chance: CHANCE_VERSION,
    gameSeed: 4,
    driverSeed: 11,
    driverVersion: "audit-fixture/1",
    mode: seatCount === 2 ? "two-seat" : "four-seat",
    resolver: "full-scan",
    seats: ["A", "B", "C", "D"].slice(0, seatCount).map((id) => ({
      id,
      deck: {
        id: "audit-deck",
        hash: digest,
        commander: "commander",
        entries: [
          { definition: "commander", count: 1 },
          { definition: "land", count: 99 },
        ],
      },
    })),
  };
  let state = createMatch(manifest, registry);
  return {
    get state() {
      return state;
    },
    answer(response: Response) {
      const pending = state.decision;
      if (!pending) throw new Error("Expected setup decision");
      const next = transition(
        state,
        {
          schema: CONTRACT_VERSION,
          matchId: manifest.id,
          commandId: `audit:${state.revision}`,
          actor: pending.actor,
          revision: state.revision,
          decisionId: pending.id,
          response,
        },
        registry,
      );
      if (next.status !== "accepted") throw new Error(JSON.stringify(next));
      state = next.state;
    },
    view(actor: string) {
      return observe(state, registry, actor);
    },
  };
}

for (const seatCount of [2, 4] as const) {
  test(`SET-04 ${seatCount} seats see mulligan declarations and history while hands and bottom choices stay private`, () => {
    const f = fixture(seatCount);
    const starter = f.state.activePlayer;
    const initialHands = f.state.players.map((seat) => [...seat.hand]);
    for (const observer of f.state.players) {
      expect(f.view(observer.id).players.every((seat) => seat.mulliganDeclaration === null)).toBe(
        true,
      );
    }
    f.answer({ kind: "mulligan", keep: false });
    // No player has redrawn before every declaration is collected.
    expect(f.state.players.map((seat) => seat.hand)).toEqual(initialHands);
    for (const observer of f.state.players) {
      const visible = f.view(observer.id);
      expect(visible.players.find((seat) => seat.id === starter)).toMatchObject({
        mulligans: 0,
        keptHand: false,
        mulliganDeclaration: false,
      });
      expect(visible.objects.filter((entry) => entry.zone === "hand")).toHaveLength(7);
      expect(
        visible.objects.every(
          (entry) =>
            entry.zone !== "library" && (entry.zone !== "hand" || entry.owner === observer.id),
        ),
      ).toBe(true);
    }
    let priorKeeper: string | undefined;
    for (let index = 1; index < seatCount; index++) {
      if (priorKeeper) {
        for (const observer of f.state.players)
          expect(f.view(observer.id).players.find((seat) => seat.id === priorKeeper)).toMatchObject(
            {
              mulliganDeclaration: true,
            },
          );
      }
      priorKeeper = f.state.decision?.actor;
      f.answer({ kind: "mulligan", keep: true });
    }
    for (const observer of f.state.players) {
      const visible = f.view(observer.id);
      expect(visible.players.find((seat) => seat.id === starter)).toMatchObject({
        mulligans: 1,
        keptHand: false,
        mulliganDeclaration: null,
      });
      expect(
        visible.players.filter((seat) => seat.id !== starter).every((seat) => seat.keptHand),
      ).toBe(true);
      if (observer.id !== starter) expect(visible.decision).toBeNull();
    }
    // In multiplayer the first redraw is free. The next redraw is paid.
    if (seatCount === 4) f.answer({ kind: "mulligan", keep: false });
    expect(f.state.decision).toMatchObject({ kind: "bottom", actor: starter, count: 1 });
    const chosen = f.state.decision?.cards[0];
    if (!chosen) throw new Error("Missing bottom choice");
    f.answer({ kind: "bottom", cards: [chosen] });
    for (const observer of f.state.players) {
      const visible = f.view(observer.id);
      expect(visible.players.find((seat) => seat.id === starter)).toMatchObject({
        mulligans: seatCount === 2 ? 1 : 2,
        handCount: 6,
        keptHand: false,
        mulliganDeclaration: null,
      });
      expect(visible.objects.every((entry) => entry.zone !== "library")).toBe(true);
      if (observer.id !== starter)
        expect(
          visible.objects.some((entry) => entry.zone === "hand" && entry.owner === starter),
        ).toBe(false);
    }
    f.answer({ kind: "mulligan", keep: true });
    expect(f.state.step).toBe("upkeep");
    for (const observer of f.state.players) {
      const visible = f.view(observer.id);
      expect(
        visible.players.every((seat) => seat.keptHand && seat.mulliganDeclaration === null),
      ).toBe(true);
      expect(visible.players.find((seat) => seat.id === starter)?.mulligans).toBe(
        seatCount === 2 ? 1 : 2,
      );
    }
    // Projection objects do not alias authoritative setup history.
    const detached = f.view(starter);
    const seat = detached.players.find((entry) => entry.id === starter);
    if (!seat) throw new Error("Missing observer seat");
    seat.mulligans = 999;
    seat.mulliganDeclaration = false;
    expect(f.view(starter).players.find((entry) => entry.id === starter)?.mulligans).toBe(
      seatCount === 2 ? 1 : 2,
    );
  });
}
