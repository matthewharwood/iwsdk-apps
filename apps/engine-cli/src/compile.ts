import {
  compileConditionalSelfEntryDraft,
  compileCounterSpellDraft,
  compileCreatureReturnDraft,
  compileDamageReplacementDraft,
  compileDevelopmentRelease,
  compileEntryObserverDraft,
  compileFixedTokenDraft,
  compileKeywordReminderDraft,
  compileOrdinaryActivatedDraft,
  compileSelfEntryDraft,
  compileSpellFamilyDraft,
  compileStaticBonusDraft,
  compileStaticEvasionDraft,
  compileStaticKeywordGrantDraft,
  compileStrictProctorDraft,
  makeConditionalSelfEntryDecks,
  makeCounterSpellDecks,
  makeCreatureReturnDecks,
  makeDamageReplacementDecks,
  makeDevelopmentDecks,
  makeEntryObserverDecks,
  makeFixedTokenDecks,
  makeKeywordReminderDecks,
  makeOrdinaryActivatedDecks,
  makeStaticBonusDecks,
  makeStaticEvasionDecks,
  makeStaticKeywordGrantDecks,
  makeStrictProctorDecks,
} from "@iwsdk-apps/compiler";
import { ContentRelease, semanticHash } from "@iwsdk-apps/contracts";

// Reproduce historical fixture identity only. These releases are never executed
// under a newer ABI; exact content hashes prevent accidental historical relabeling.
export async function historicalFixtureRelease(
  release: ContentRelease,
  expectedHash: string,
  processorAbi = "commander-engine/0.9.0",
): Promise<ContentRelease> {
  const { hash: _hash, ...current } = release;
  const body = { ...current, processorAbi };
  const hash = await semanticHash(body);
  if (hash !== expectedHash) throw new Error("Historical fixture source changed");
  return ContentRelease.parse({ ...body, hash });
}
async function reviewedFixtureDecks(
  catalogPath: string,
  content: ContentRelease,
  mode: "ordinary-activated" | "static-evasion" | "static-keyword-grant",
) {
  const base = await compileDevelopmentRelease(catalogPath, {
    spellFamilies: true,
    selfEntryTriggers: true,
    selfEntrySequences: true,
    temporaryCreatureSpells: true,
  });
  const historical = await historicalFixtureRelease(
    base.release,
    "671c50aa072e6004b9fe286d387fc07edc722cf7b4a57c7f5653c8c113b655ba",
  );
  const prior24 = await makeDevelopmentDecks(historical, {
    includeFamilyDecks: true,
    includeTriggerDecks: true,
    includeTemporaryDecks: true,
  });
  const reminderRelease = await compileKeywordReminderDraft(catalogPath);
  const historicalReminders = await historicalFixtureRelease(
    reminderRelease.release,
    "8abe41532a96354af76d414d6c1c56e74c8142b126bb6cb7b8cac806c7380edd",
  );
  const reminders = await makeKeywordReminderDecks(historicalReminders, prior24);
  const counterRelease = await compileCounterSpellDraft(catalogPath);
  const historicalCounters = await historicalFixtureRelease(
    counterRelease.release,
    "58b8f2dd09d699ef232ba49257e0287eb8ca204902a9addddb499f73e3084739",
    "commander-engine/0.10.0",
  );
  const counters = await makeCounterSpellDecks(historicalCounters, reminders.decks);
  const returnRelease = await compileCreatureReturnDraft(catalogPath);
  const historicalReturns = await historicalFixtureRelease(
    returnRelease.release,
    "dac4f923e99a94e3e54031e635609dca4c91ad3f26c0bf85c4eb1bc3b35fa900",
    "commander-engine/0.11.0",
  );
  const returns = await makeCreatureReturnDecks(historicalReturns, counters.decks);
  const tokenRelease = await compileFixedTokenDraft(catalogPath);
  const historicalTokens = await historicalFixtureRelease(
    tokenRelease.release,
    "fd5d52dc3d11284940cae72faace2ca0ead11deaa11508c12ea6b179967912a4",
    "commander-engine/0.12.0",
  );
  const tokens = await makeFixedTokenDecks(historicalTokens, returns.decks);
  const staticRelease = await compileStaticBonusDraft(catalogPath);
  const historicalStatics = await historicalFixtureRelease(
    staticRelease.release,
    "7f1e1b65f7134dce4add33ded2019720f74b44f0c9c194dbc34e182383914bdf",
    "commander-engine/0.13.0",
  );
  const statics = await makeStaticBonusDecks(historicalStatics, tokens.decks);
  const observerRelease = await compileEntryObserverDraft(catalogPath);
  const historicalObservers = await historicalFixtureRelease(
    observerRelease.release,
    "19b625376b02555521b2f0cea2a33097299bac813e65b682725982e61bfd948d",
    "commander-engine/0.14.0",
  );
  const observers = await makeEntryObserverDecks(historicalObservers, statics.decks);
  const conditionalRelease = await compileConditionalSelfEntryDraft(catalogPath);
  const historicalConditional = await historicalFixtureRelease(
    conditionalRelease.release,
    "ee7d9fe069b1c829325ac3a87d8622fab2893c2dc85e7e065537fb2cfb9782a0",
    "commander-engine/0.15.0",
  );
  const conditional = await makeConditionalSelfEntryDecks(historicalConditional, observers.decks);
  const proctorRelease = await compileStrictProctorDraft(catalogPath);
  const historicalProctor = await historicalFixtureRelease(
    proctorRelease.release,
    "13f3654940711c24cd84ff2665d126644687a536749d098f92dea2e52db957e4",
    "commander-engine/0.16.0",
  );
  const proctor = await makeStrictProctorDecks(historicalProctor, conditional.decks);
  const damageRelease = await compileDamageReplacementDraft(catalogPath);
  const historicalDamage = await historicalFixtureRelease(
    damageRelease.release,
    "77857dc934ac410326f5a1136bca66757c33ae7ae74326c9d3f0f354432810de",
    "commander-engine/0.17.0",
  );
  const damage = await makeDamageReplacementDecks(historicalDamage, proctor.decks);
  const ordinarySource =
    mode !== "ordinary-activated"
      ? await historicalFixtureRelease(
          (await compileOrdinaryActivatedDraft(catalogPath)).release,
          "4efc85ff671b5628c45d617a136f31a5f1d6e4b64067efe39d95525ec61f7e93",
          "commander-engine/0.18.0",
        )
      : content;
  const ordinary = await makeOrdinaryActivatedDecks(ordinarySource, damage.decks);
  const evasionSource =
    mode === "static-keyword-grant"
      ? await historicalFixtureRelease(
          (await compileStaticEvasionDraft(catalogPath)).release,
          "58cccbdc3ce7d5813398d5fd5bb245bf79f9ccdf64540cc22536a3198c039628",
          "commander-engine/0.19.0",
        )
      : content;
  const evasion =
    mode !== "ordinary-activated"
      ? await makeStaticEvasionDecks(evasionSource, ordinary.decks)
      : null;
  const newest =
    mode === "static-keyword-grant"
      ? await makeStaticKeywordGrantDecks(content, evasion?.decks ?? [])
      : (evasion ?? ordinary);
  return {
    ...newest,
    evasionReport: evasion?.report,
    ordinaryReport: ordinary.report,
    damageReport: damage.report,
    proctorReport: proctor.report,
    conditionalReport: conditional.report,
    observerReport: observers.report,
    staticReport: statics.report,
    tokenReport: tokens.report,
    returnReport: returns.report,
    counterReport: counters.report,
    reminderReport: reminders.report,
  };
}

export type CompilationMode =
  | "development"
  | "spell-families"
  | "self-entry"
  | "ordinary-activated"
  | "static-evasion"
  | "static-keyword-grant";
export function selectCompileMode(args: readonly string[]): CompilationMode {
  if (args.includes("--all-reviewed") || args.includes("--static-keyword-grants"))
    return "static-keyword-grant";
  if (args.includes("--static-evasion")) return "static-evasion";
  if (args.includes("--ordinary-activated-abilities")) return "ordinary-activated";
  if (args.includes("--self-entry-triggers")) return "self-entry";
  return args.includes("--spell-families") ? "spell-families" : "development";
}
export function expansionReportName(mode: CompilationMode): string {
  return {
    development: "development-expansion.json",
    "spell-families": "spell-family-expansion.json",
    "self-entry": "self-entry-expansion.json",
    "ordinary-activated": "ordinary-activated-expansion.json",
    "static-evasion": "static-evasion-expansion.json",
    "static-keyword-grant": "static-keyword-grant-expansion.json",
  }[mode];
}
export async function compileArtifacts(catalogPath: string, mode: CompilationMode) {
  const result =
    mode === "static-keyword-grant"
      ? await compileStaticKeywordGrantDraft(catalogPath)
      : mode === "static-evasion"
        ? await compileStaticEvasionDraft(catalogPath)
        : mode === "ordinary-activated"
          ? await compileOrdinaryActivatedDraft(catalogPath)
          : mode === "self-entry"
            ? await compileSelfEntryDraft(catalogPath)
            : mode === "spell-families"
              ? await compileSpellFamilyDraft(catalogPath)
              : await compileDevelopmentRelease(catalogPath);
  const reviewed =
    mode === "ordinary-activated" || mode === "static-evasion" || mode === "static-keyword-grant"
      ? await reviewedFixtureDecks(catalogPath, result.release, mode)
      : null;
  const decks =
    reviewed?.decks ??
    (await makeDevelopmentDecks(result.release, {
      includeFamilyDecks: mode !== "development",
      includeTriggerDecks: mode === "self-entry",
    }));
  const reports: Record<string, unknown> = reviewed
    ? {
        "keyword-reminder-decks.json": reviewed.reminderReport,
        "counter-spell-decks.json": reviewed.counterReport,
        "creature-return-decks.json": reviewed.returnReport,
        "fixed-token-decks.json": reviewed.tokenReport,
        "static-bonus-decks.json": reviewed.staticReport,
        "entry-observer-decks.json": reviewed.observerReport,
        "conditional-self-entry-decks.json": reviewed.conditionalReport,
        "strict-proctor-decks.json": reviewed.proctorReport,
        "damage-replacement-decks.json": reviewed.damageReport,
        "ordinary-activated-decks.json": reviewed.ordinaryReport,
        ...(mode !== "ordinary-activated"
          ? { "static-evasion-decks.json": reviewed.evasionReport }
          : {}),
        ...(mode === "static-keyword-grant"
          ? { "static-keyword-grant-decks.json": reviewed.report }
          : {}),
      }
    : {};
  const expansion =
    "expansion" in result
      ? {
          name: expansionReportName(mode),
          value: result.expansion,
        }
      : null;
  return { ...result, decks, reports, expansion };
}
