import { expect, test } from "bun:test";
import { canonicalJson, emptyMana, type MatchManifest } from "@iwsdk-apps/contracts";
import {
  activationSourceAnswer as answer,
  activationSourceCommand as command,
  activationSourceFixture as fixture,
  activationSourcePermanent as permanent,
} from "../test-fixtures/activation-source";
import { assertInvariants, transition } from "./index";
import { givePriority } from "./turns";

// Persisted regression from the independently reproduced defect, pinned CR602.2,
// CR733.1/.2 and117.4. Source cards/decks are authenticated; selected hands,
// basic lands and exhausted opposing mana are explicit constructed preconditions.
// This is neither an ordinary dealt history nor a completed game.
const modes: MatchManifest["resolver"][] = ["full-scan", "prepared-scan", "prepared-indexed"];
for (const mode of modes) {
  test(`${mode}: failed activation reversed without a mana action preserves earlier priority pass`, async () => {
    const f = await fixture("Tobias Andrion", [], "Tobias Andrion", ["Spectral Sailor"], mode);
    const source = permanent(f, "B", "Spectral Sailor");
    for (const object of Object.values(f.state.objects)) {
      if (
        object.controller === "B" &&
        object.zone === "battlefield" &&
        f.registry.definitions[object.definition]?.types.includes("Land")
      )
        object.tapped = true;
    }
    givePriority(f.state, f.registry, "A");
    assertInvariants(f.state, f.registry);
    expect(f.state.step).toBe("main1");
    answer(f, { kind: "pass" });
    expect(f.state.decision?.actor).toBe("B");
    expect(f.state.consecutivePasses).toBe(1);
    answer(f, { kind: "activate", source, programIndex: 0 });
    const before = canonicalJson(f.state);
    const rejected = transition(
      f.state,
      command(f, {
        kind: "activation-payment",
        sources: [],
        spend: emptyMana(),
      }),
      f.registry,
    );
    expect(rejected.status).toBe("rejected");
    expect(canonicalJson(f.state)).toBe(before);
    answer(f, { kind: "cancel-activation" });
    expect(f.state.decision?.actor).toBe("B");
    expect(f.state.consecutivePasses).toBe(1);
    answer(f, { kind: "pass" });
    expect(f.state.step).toBe("begin-combat");
    expect(f.state.decision?.actor).toBe("A");
  });
  test(`${mode}: accepted mana before cancellation resets passes and retains its permanent payment`, async () => {
    const f = await fixture("Tobias Andrion", [], "Tobias Andrion", ["Spectral Sailor"], mode);
    const source = permanent(f, "B", "Spectral Sailor");
    givePriority(f.state, f.registry, "A");
    answer(f, { kind: "pass" });
    expect(f.state.consecutivePasses).toBe(1);
    answer(f, { kind: "activate", source, programIndex: 0 });
    const mana = f.state.decision?.manaSources.find((row) => row.colors.includes("U"));
    if (!mana) throw new Error("Missing actual Island mana ability");
    answer(f, { kind: "mana", source: { object: mana.object, color: "U" } });
    expect(f.state.consecutivePasses).toBe(0);
    answer(f, { kind: "cancel-activation" });
    expect(f.state.objects[mana.object]?.tapped).toBe(true);
    expect(f.state.players.find((row) => row.id === "B")?.mana.U).toBe(1);
    answer(f, { kind: "pass" });
    expect(f.state.step).toBe("main1");
    expect(f.state.decision?.actor).toBe("A");
  });
}
