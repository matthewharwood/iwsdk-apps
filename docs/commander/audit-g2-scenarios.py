#!/usr/bin/env python3
"""Rebuild the bounded G2 evidence join; never execute/mark draft scenarios by name."""
from pathlib import Path
import argparse
import collections
import hashlib
import json
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_RUN = ".commander/evidence/g2-audit-0.7-20260906T211430Z-3322f955"
HISTORICAL_MANIFEST = ".commander/evidence/g2-audit-0.7-20260906T211430Z-3322f955/audit-inputs.json"
HISTORICAL_MANIFEST_SHA256 = "cc726f15c7bc6b89997e4443a75f6c0f4135dff07094097b193bbb12e367ba5a"
_manifest_bytes = (ROOT / HISTORICAL_MANIFEST).read_bytes()
if hashlib.sha256(_manifest_bytes).hexdigest() != HISTORICAL_MANIFEST_SHA256:
    raise ValueError("Historical input manifest changed")
HISTORICAL_INPUTS = json.loads(_manifest_bytes)["files"]
RULES = "4381ad1b39ab2c05f7d03633a20f711ed37277074d3266dcba5f38cbb527423f"
# Curated after reading the assertion bodies and the independently authored source expectations.
# A JUnit name locates evidence; it never determines the semantic assessment.
TESTS = [
 ("setup", "packages/engine/src/engine.test.ts", "same pinned setup repeats physical cards and chance state; observations never expose any library or another hand", "Normal synthetic 100-card setup repeats; 40 life/7 hand/92 library and command zones are checked. Library and other hands are absent from object projections.", "ordinary-command-setup", ["SET-01", "SRC-SET-01", "SRC-ZON-01"]),
 ("payment", "packages/engine/src/effects.test.ts", "Divination pays {2}{U}, waits for passes, draws two separate cards and finishes in its graveyard", "Submitting U against 2U rejects while the announced spell remains on stack; U+2C succeeds and resolves after passes. This is a generic-plus-colored cost, not the draft's two-colored-cost fixture.", "constructed-board-real-transitions", ["CAST-02", "SRC-CAST-02"]),
 ("target-benefit", "packages/engine/src/effects.test.ts", "Sorin's Thirst completes life gain before lethal-damage SBAs; a response killing its sole target cancels all lower effects (CR608.2b example)", "A response kills the sole target; the lower spell emits SpellDidNotResolve and its caster receives no life gain. The test does not explicitly assert that lower spell's graveyard location.", "constructed-board-real-transitions", ["CAST-06", "SRC-TGT-01"]),
 ("target-graveyard", "packages/engine/src/effects.test.ts", "Final Reward responding to Murder exiles the target and the original Murder does not resolve", "The exiled target remains unchanged; Murder does not resolve and its card is asserted in the owner's graveyard. This spell has no untargeted benefit.", "constructed-board-real-transitions", ["CAST-06", "SRC-TGT-01"]),
 ("target-generation", "packages/engine/src/effects.test.ts", "a target leaving and returning is a new object and does not receive the old spell's damage", "Explicit synthetic exile/return creates a new generation; the old spell emits SpellDidNotResolve and deals zero damage to the returned object.", "constructed-zone-change-real-resolution", ["CAST-06", "SRC-OBJ-01"]),
 ("trample", "packages/engine/src/combat.test.ts", "trample allows lethal-plus-excess or all damage to blocker, not an underassignment", "A five-power trampler versus a 2/2 accepts 2/3 and all-to-blocker; 1/4 rejects without mutation. The draft specifies six power and 2/4 versus1/5, so these are analogous assertions.", "direct-combat-processors", ["COM-08", "SRC-COM-01"]),
 ("blocked", "packages/engine/src/integration-scenarios.test.ts", "COM-05 a blocker killed by a resolved spell leaves its nontrampling attacker blocked", "An ordinary cast/target/payment/pass sequence kills the declared blocker; blocked status survives, damage step advances and the defending player takes no damage.", "constructed-board-real-transitions", ["COM-05", "SRC-COM-02"]),
 ("apnap", "packages/engine/src/triggers.test.ts", "ETB11/13 each controller chooses their own cohort in APNAP order and sees earlier public stack choices", "Two ordinary triggers per controller are ordered C,D,A,B; each owner sees earlier public stack choices. There is no trigger-on-trigger second pass.", "constructed-entry-batch-real-transitions", ["ETB11", "ETB13", "PRI-05", "SRC-TRG-01"]),
 ("sba-entry", "packages/engine/src/triggers.test.ts", "ETB10 zero-toughness source dies at the real SBA checkpoint before its preserved trigger is placed", "A constructed zero-toughness source captures, dies at the real checkpoint, then its surviving trigger is placed and resolves.", "constructed-entry-batch-real-checkpoints", ["ETB10", "PRI-05", "SRC-TRG-01"]),
 ("lost-apnap", "packages/engine/src/triggers.test.ts", "CR603.3b/704.3/800.4 simultaneous departures preserve the living APNAP suffix and captured cohorts", "Constructed simultaneous loss removes A/C and their cohorts; D/B choose and resolve in living APNAP order. No control-effect history is exercised.", "constructed-loss-real-checkpoints", ["SRC-TRG-01", "ETB21", "ETB22"]),
 ("source-owner-left", "packages/engine/src/triggers.test.ts", "CR603.3a/800.4a the source owner's departure does not remove another player's captured ability", "A-owned source entered under B; actual loss checkpoint removes A's objects but B's captured ability survives and gains life. This does not end a control-giving effect on an opponent-owned object.", "constructed-control-real-checkpoints", ["ETB08", "SRC-CMD-02"]),
 ("commander-graveyard", "packages/engine/src/effects.test.ts", "murder visits its destination and finishes resolving before the commander owner accepts the SBA move", "Commander enters graveyard; spell fully resolves; owner then chooses command zone. Exact generation, lineage and final priority are asserted.", "constructed-board-real-transitions", ["CMD-03", "SRC-CMD-01"]),
 ("commander-exile", "packages/engine/src/effects.test.ts", "reward visits its destination and finishes resolving before the commander owner declines the SBA move", "Commander enters exile; spell fully resolves; owner declines the later SBA move and exile persists.", "constructed-board-real-transitions", ["CMD-04", "SRC-CMD-01"]),
 ("mulligan-privacy", "packages/engine/src/audit-scenarios.test.ts", "SET-04 4 seats see mulligan declarations and history while hands and bottom choices stay private", "Setup declarations are public and hands do not redraw before the round is collected; new hands and bottom identities remain private. This is CR103.5 setup, not a spell's simultaneous secret-card selection.", "ordinary-setup-real-transitions", ["SET-04", "SRC-HID-01", "SRC-HID-02"]),
 ("storage-private", "packages/storage/src/storage.test.ts", "serialized submissions deduplicate concurrent retries and reject stale/foreign actor without RNG advancement", "Actual native SQLite coordinator rejects stale/foreign input without changing state; object projections omit every library and other hands. It does not assert a hidden-library rearrangement proposal.", "native-sqlite-coordinator", ["SRC-ZON-01"]),
 ("storage-trigger", "packages/storage/src/triggers-storage.test.ts", "ordinary casts: source removal, exact retry, reload and import preserve the captured controller and incarnation", "Synthetic zero-cost trigger commander/removal are cast through normal setup and Coordinator commands; pending ability survives source removal/reload/import, exact retry is idempotent, later resolution/replay agree.", "synthetic-cards-native-sqlite-coordinator", ["ETB04", "ETB26", "ETB27"]),
 ("storage-order", "packages/storage/src/triggers-storage.test.ts", "constructed multi-trigger ordering: isolated initialization adapter exercises actual SQLite, transitions and replay", "Child fixture explicitly reports ordinaryCommandReachable=false and sourceBackedCards=false while exercising actual SQLite/commands/replay for two-trigger ordering.", "privileged-constructed-native-sqlite-coordinator", ["ETB11", "ETB26"]),
]

# status is the relationship of a related executed assertion to this exact draft clause.
# None of these labels certifies G2 or a whole card/rule/family.
def C(status, tests, rationale):
    return {"status": status, "testIds": tests, "rationale": rationale}
def N(reason):
    return C("unexecuted", [], reason)
ASSESSMENTS = {
 "SRC-SET-01": [C("bounded", ["setup"], "A normal synthetic composition passes through setup. Role derivation and the full source-backed admission fixture are not this test's assertion."), N("No executed assertion specifically proves the distinction between composition admission and semantic certification; current release evidence states development-subset.")],
 "SRC-SET-02": [N("The reviewed capture has no exact three-variant test for99cards, duplicate nonbasic English names and off-color composition."), N("No exact immutable accepted-deck contrast for those three rejections is joined.")],
 "SRC-CAST-01": [N("Additional sacrifice costs and continuous cost reducers are not implemented; ordinary locked mana cost does not execute this interaction.")],
 "SRC-CAST-02": [C("analogous", ["payment"], "Real engine rejection is asserted for insufficient2U, not a two-colored requirement supplied only one."), N("This fixture does not contrast unsupported cost semantics with ordinary payment illegality.")],
 "SRC-TGT-01": [C("bounded", ["target-benefit", "target-graveyard"], "The two tests assert nonresolution and owner-graveyard placement across related separate fixtures; there is no single dispatched draft transcript."), C("exact-assertion", ["target-benefit"], "The lower Sorin's Thirst caster receives no untargeted life gain after its sole target becomes illegal.")],
 "SRC-TGT-02": [N("Spell programs currently have one target slot; two independently revalidated targets are not implemented."), N("No typed per-target partial-resolution/info-dependency model or executable two-target contrast is joined.")],
 "SRC-REP-01": [N("No versioned pending-event replacement pipeline executes competing doubling instances."), N("No per-event applied-instance history prevents repeat replacement application.")],
 "SRC-REP-02": [N("No affected-player/object-controller-owned replacement choice exists."), N("No replacement competition fixture separates rule-defined chooser ownership from selector specificity.")],
 "SRC-TRG-01": [C("bounded", ["apnap"], "Only ordinary-event APNAP is implemented; the draft explicitly includes a trigger caused by another ability triggering."), C("bounded", ["sba-entry", "lost-apnap"], "Actual SBAs and ordinary queue placement precede priority; new meta-trigger waves are absent.")],
 "SRC-TRG-02": [N("No intervening-if predicate is evaluated at trigger capture and again at resolution."), N("No false-at-event contrast exists for the same source-bound conditional trigger.")],
 "SRC-LAY-01": [N("No same-layer continuous-effect dependency evaluator."), N("Selector equivalence tests do not establish layer ordering semantics.")],
 "SRC-LAY-02": [N("No layer dependency loop/timestamp algorithm."), N("Finite dependency closure for registry pruning is a different operation, not this rules procedure.")],
 "SRC-COM-01": [C("analogous", ["trample"], "The executed fixture is5power with2/3 allocation; the draft is6power with2/4."), C("analogous", ["trample"], "The executed rejection is1/4 from5power; exact1/5 from6power remains unexecuted.")],
 "SRC-COM-02": [C("exact-assertion", ["blocked"], "Actual blocker removal through a resolved spell preserves blocked status and prevents nontrampling player damage. Native/browser storage for this exact scenario is not joined.")],
 "SRC-OBJ-01": [C("exact-assertion", ["target-generation"], "A returned generation receives no old-target spell damage. Exile/reentry is an explicit unit precondition, not an implemented blink spell.")],
 "SRC-OBJ-02": [N("No copy-value layer or typed copy operation distinguishes copiable values from counters and temporary effects."), N("No executable ordinary-copy contrast is joined.")],
 "SRC-ZON-01": [C("bounded", ["setup", "storage-private"], "Library objects are absent from views. A candidate/error/trace noninterference proof is broader than these assertions."), N("No exact unauthorized-library-rearrangement command and inspection-preserves-order contrast is joined.")],
 "SRC-ZON-02": [N("No quality-restricted hidden-library search with legal fail-to-find choice."), N("No unrestricted exact/up-to-available count search or saved search continuation.")],
 "SRC-CMD-01": [C("exact-assertion", ["commander-graveyard", "commander-exile"], "Graveyard/exile entry occurs before the owner-controlled SBA choice."), N("Owner hand/library destination replacement timing is not implemented.")],
 "SRC-CMD-02": [C("bounded", ["source-owner-left"], "Owned-source removal is executed; the required control-effect termination/exile ordering is not."), N("Engine explicitly reports UnsupportedMechanic for departure with foreign controlled objects because control provenance is absent.")],
 "SRC-HID-01": [C("analogous", ["mulligan-privacy"], "Private setup hands/bottom choices are tested, not each player's secret choice during a resolving effect."), C("analogous", ["mulligan-privacy"], "The analogous setup projection keeps identities private; no simultaneous effect-choice continuation exists.")],
 "SRC-HID-02": [C("analogous", ["mulligan-privacy", "apnap"], "Public setup declarations and ordinary trigger ordering expose earlier choices. Neither is this general simultaneous effect."), C("analogous", ["mulligan-privacy"], "Setup redraw waits for all declarations. General effect actions are not collected and committed as a simultaneous batch.")],
 "SRC-LOOP-01": [N("No unavoidable mandatory-loop proof and rules-draw adjudication."), N("Operational limits are labelled incomplete by the host, but this captured suite does not prove the required mandatory-loop contrast.")],
 "SRC-LOOP-02": [N("No fragmented-loop state/choice history or required different-choice procedure."), N("Optional loops are not executable; a generic timeout refusal cannot satisfy this scenario.")],
}
FAMILIES = [
 ("setup-admission", "Setup and admission", "Ordinary setup/chooser/mulligan and basic composition run; construction exceptions and many role-specific forms remain outside the slice."),
 ("casting-payment", "Casting and payment", "Ordinary fixed mana, target-before-payment and cancellation work; sacrifice/alternative/constrained costs and reducers remain missing."),
 ("targets-selections", "Targets and selections", "Single target invalidation works; multiple target slots, cross-choice constraints and resolution-time selections remain missing."),
 ("replacement-prevention", "Replacement and prevention", "Pending rewritable events, chooser ownership and applied-instance tracking are absent."),
 ("triggers-history", "Triggers and source history", "Mandatory constant self-entry capture/APNAP/source lifetime run; second APNAP category, intervening-if, delayed/linked triggers and optional resolution choices remain missing."),
 ("continuous-characteristics", "Continuous characteristics", "No durable continuous-effect instances, dependency/layer evaluator or control-effect history."),
 ("combat-damage", "Combat and damage", "Ordinary combat/trample/strike states execute; dynamic characteristics and broader requirements remain unimplemented and exact draft coverage is incomplete."),
 ("identity-copies", "Object identity and copies", "Zone generations and captured source contexts run; copy/merged/face-down/multiface semantics remain absent."),
 ("zones-chance", "Zones and chance", "Deterministic shuffle/draw and setup continuations run; search/reveal/order choices remain absent."),
 ("commander-elimination", "Commander and elimination", "Tax/history, graveyard/exile SBA choices and ordinary departure run; hand/library replacement and control-history departure remain absent."),
 ("hidden-simultaneous", "Hidden or simultaneous choices", "Setup privacy runs; effect-owned secret/simultaneous choice batches and control of another player's decision remain absent."),
 ("exceptional-workflows", "Exceptional workflows", "Limits remain explicit incomplete results; optional/mandatory loop adjudication and turn/game-changing workflows are absent."),
]
NEXT = [
 {"priority": 0, "id": "manifest-execution-join", "kind": "evidence-infrastructure", "closes": ["SRC-SET-01", "SRC-SET-02", "SRC-CAST-02", "SRC-COM-01", "SRC-COM-02", "SRC-ZON-01"], "proposal": "Register explicit versioned scenario adapters with source/definition pins, privileged setup assumptions, command scripts and reviewed assertions; run each adapter through all three resolvers and native storage, with browser parity for selected saved choices. Reuse existing supported semantics to execute exact contrasts; do not infer adapters from labels or alter full-game initialization.", "status": "proposed-not-run"},
 {"priority": 1, "id": "pending-event-replacement", "kind": "semantic-infrastructure", "closes": ["SRC-REP-01", "SRC-REP-02", "SRC-CMD-01"], "proposal": "Introduce a serializable pending event with version, affected entity/controller, candidate replacement instances and applied-instance history. Resolve chooser-owned replacement branches before committing the event. Execute two independent doublers2→4→8 without reapplying either, the opponent-controlled-object chooser contrast, and owner-selected commander hand/library replacement versus graveyard/exile SBA timing. Save/replay each pending event choice and compare all resolvers.", "sourceRules": ["614.5", "616.1", "903.9a", "903.9b"], "sourceBindings": "Full-body card bindings must be separately selected and reviewed; none invented by this proposal.", "status": "proposed-not-run"},
 {"priority": 2, "id": "resolution-choice-and-search", "kind": "semantic-infrastructure", "closes": ["SRC-ZON-02", "SRC-HID-01", "SRC-HID-02"], "proposal": "Extend ordered resolution with a durable instruction cursor and owned choice frames. Implement quality-search fail-to-find versus unrestricted count, then collect each player's private/public card choice before one simultaneous commit. Verify privacy at every observer boundary and continue without granting priority inside resolution. Optional self-entry acceptance can reuse this continuation but does not itself close the twelve-family floor.", "sourceRules": ["117.2e", "101.4", "101.4a", "101.4b", "701.23b", "701.23d"], "status": "proposed-not-run"},
 {"priority": 3, "id": "multiple-target-slots", "kind": "semantic-infrastructure", "closes": ["SRC-TGT-02"], "proposal": "Model target slots and per-effect target references, then execute one-of-two legal versus both-illegal resolution with durable target choices and source-generation revalidation. Keep untargeted instructions and information dependencies explicit.", "sourceRules": ["601.2c", "608.2b"], "status": "proposed-not-run"},
 {"priority": 4, "id": "continuous-effect-provenance", "kind": "semantic-infrastructure", "closes": ["SRC-LAY-01", "SRC-LAY-02", "SRC-CMD-02", "SRC-OBJ-02", "SRC-CAST-01"], "proposal": "Add timestamped source-bound continuous-effect instances, layer/dependency evaluation and control provenance before using final displayed characteristics as semantics. Execute a true dependency/timestamp contrast and dependency loop, then source departure restoring control, copy values excluding counters, and reducer removal after total-cost lock. These are multiple bounded increments, not one guessed generic effect interpreter.", "sourceRules": ["613.8a", "613.8b", "800.4a", "707.2", "601.2f"], "status": "proposed-not-run"},
 {"priority": 5, "id": "conditional-and-meta-triggers", "kind": "semantic-infrastructure", "closes": ["SRC-TRG-01", "SRC-TRG-02"], "proposal": "Add explicit event/capture and resolution predicates plus trigger-on-trigger occurrence capture. Execute false-at-event versus true-then-false intervening-if, and a mixed ordinary/meta cohort requiring both APNAP passes. Reuse current source snapshots and immutable trigger IDs.", "sourceRules": ["603.3b", "603.4"], "status": "proposed-not-run"},
 {"priority": 6, "id": "rules-loop-procedure", "kind": "semantic-infrastructure", "closes": ["SRC-LOOP-01", "SRC-LOOP-02"], "proposal": "Only after repeatable effects/choices exist, distinguish a proved unavoidable mandatory loop from a fragmented optional-choice loop. Persist loop-relevant states and entitled choices; computational exhaustion must stay incomplete.", "sourceRules": ["104.4b", "732.3"], "status": "proposed-not-run"},
]

def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
def digest(data):
    if isinstance(data, str): data = data.encode()
    return hashlib.sha256(data).hexdigest()
def resolved_input(path):
    candidate = Path(path)
    key = str(candidate.relative_to(ROOT)) if candidate.is_absolute() else str(candidate)
    item = HISTORICAL_INPUTS.get(key)
    if item:
        captured = ROOT / item["path"]
        require(digest(captured.read_bytes()) == item["sha256"], "Historical input bytes changed: " + key)
        return captured
    return ROOT / path

def read(path):
    return json.loads(resolved_input(path).read_text())
def require(condition, message):
    if not condition: raise ValueError(message)
def ref(path):
    captured = resolved_input(path)
    result = {"path": str(captured.relative_to(ROOT)), "sha256": digest(captured.read_bytes())}
    if str(path) in HISTORICAL_INPUTS: result["originalPath"] = str(path)
    return result

def audit(run):
    folder = ROOT / run
    before, after = read(folder / "sources-before.json"), read(folder / "sources-after.json")
    assignment, result = read(folder / "assignment.json"), read(folder / "result.json")
    require(before == after and result["filesChanged"] == [], "Runtime/test/fixture snapshot drift")
    require(digest(canonical(before)) == assignment["sourceSnapshotHash"] == result["beforeHash"] == result["afterHash"], "Snapshot digest mismatch")
    require(result["status"] == "passed" and result["exitCode"] == 0, "Chosen execution did not pass")
    for path, item in before.items(): require(digest(item["text"]) == item["sha256"], "Captured byte hash mismatch: " + path)
    junit_path = folder / "junit.xml"
    require(digest(junit_path.read_bytes()) == result["junitSha256"], "JUnit hash mismatch")
    cases = list(ET.parse(junit_path).iter("testcase"))
    require(not any(t.find("failure") is not None or t.find("error") is not None or t.find("skipped") is not None for t in cases), "Nonpassing selected test case")
    draft_path = ".commander/high-risk-scenarios.json"
    drafts = read(draft_path)
    rule_bytes = (ROOT / ".commander/sources/archives" / (RULES + ".txt")).read_bytes()
    require(digest(rule_bytes) == RULES, "Pinned rules bytes changed")
    references = 0
    for draft in drafts["scenarios"]:
        original = {k: draft[k] for k in ["id", "group", "rules", "assumptions", "action", "expected"]}
        require(digest(canonical({"draft": original, "sourceReferences": draft["sourceReferences"]})) == draft["version"], "Draft version mismatch: " + draft["id"])
        for source in draft["sourceReferences"]:
            require(source["documentHash"] == RULES and digest(rule_bytes[source["byteStart"]:source["byteEnd"]]) == source["textHash"], "Rule span mismatch: " + source["rule"])
            references += 1
    require(len(drafts["scenarios"]) == 24 and set(ASSESSMENTS) == {s["id"] for s in drafts["scenarios"]}, "Original24 scenario denominator changed")
    evidence = []
    for identifier, path, name, summary, route, expectation_ids in TESTS:
        matches = [t for t in cases if t.get("file") == path and t.get("name") == name]
        require(len(matches) == 1, "Missing or ambiguous actual test tuple: " + identifier)
        test = matches[0]
        require(path in before, "Executed test source was not captured")
        evidence.append({"id": identifier, "path": path, "name": name, "suite": test.get("classname"), "line": int(test.get("line")), "testFileSha256": before[path]["sha256"], "capturedSource": str((folder / "sources-before.json").relative_to(ROOT)), "junit": str(junit_path.relative_to(ROOT)), "junitSha256": result["junitSha256"], "execution": "passed", "assertionCount": int(test.get("assertions", "0")), "reviewedAssertionScope": summary, "executionRoute": route, "relatedExpectationIds": expectation_ids, "mappingReview": {"reviewer": "skills_audit agent", "status": "source-and-assertion-scope-reviewed", "independentOfOriginal24ScenarioAuthor": True, "independentOfEveryTestAuthor": False, "note": "Some tests were authored by this reviewer. This is an evidence-scope join, not a fabricated second implementation review."}})
    test_ids = {t["id"] for t in evidence}
    rows = []
    for draft in drafts["scenarios"]:
        clauses = ASSESSMENTS[draft["id"]]
        require(len(clauses) == len(draft["expected"]), "Expectation count mismatch: " + draft["id"])
        mapped = []
        for index, (text, assessment) in enumerate(zip(draft["expected"], clauses), 1):
            require(set(assessment["testIds"]) <= test_ids, "Unknown linked test")
            mapped.append({"id": f'{draft["id"]}#{index}', "expected": text, **assessment})
        rows.append({"id": draft["id"], "group": draft["group"], "originalDraft": draft, "expectations": mapped, "draftManifestExecuted": False, "g2Qualified": False, "qualificationGaps": ["No original draft adapter/run ID was dispatched.", "No joined exact scenario transcript across production registry, choices, all three resolvers and persistence.", "Whole-scenario independent acceptance remains open."], "independentExpectationReview": {"reviewer": "skills_audit agent", "author": draft["author"], "status": "bounded-rule-reference-and-scope-reviewed", "ruleSpanHashesValidated": True}})
    families = []
    for key, label, gap in FAMILIES:
        members = [s for s in rows if s["group"] == key]
        require(len(members) == 2, "Missing two-scenario family: " + key)
        families.append({"id": key, "label": label, "draftIds": [s["id"] for s in members], "requiredInitialScenarios": 2, "qualifiedScenarios": 0, "satisfied": False, "draftsWithRelatedExecutedAssertions": sum(any(c["testIds"] for c in s["expectations"]) for s in members), "gap": gap})
    history = []
    for path in ["docs/commander/executed-scenario-map.json", "docs/commander/executed-scenario-map-v0.6.json"]:
        old = read(path)
        checks = []
        for item in old["tests"]:
            prior = item["test"]
            current = before.get(prior["path"])
            checks.append({"id": item["id"], "path": prior["path"], "sameTestFileBytes": current is not None and current["sha256"] == prior["sha256"], "evidenceTransferred": False})
        history.append({**ref(path), "priorEngine": old.get("engineVersion", old["execution"].get("engineVersion")), "priorReport": old["execution"].get("reportPath"), "testFileChecks": checks, "policy": "Prior execution and review remain historical. No old review is promoted merely because a test name recurs."})
    supplements = []
    for path in ["docs/commander/source-etb-scenarios.json", "docs/commander/source-etb-sequence-scenarios.json"]:
        data = read(path)
        supplements.append({**ref(path), "scenarioCount": len(data["scenarios"]), "originalAuthoredExecutionClaims": {k: v for k, v in data.items() if k.startswith("executed")}, "scenarios": [{"id": row["id"], "authoredStatus": row["status"], "linkedReviewedTestIds": [t["id"] for t in evidence if row["id"] in t["relatedExpectationIds"]], "wholeScenarioCertified": False} for row in data["scenarios"]], "note": "Only curated assertion links are joined. Unlinked rows are unassessed by this original24 audit; in-progress isolated0.8 results are not production0.7 evidence."})
    statuses = collections.Counter(c["status"] for s in rows for c in s["expectations"])
    return {"schema": "commander-g2-scenario-audit/1", "engineVersion": "commander-engine/0.7.0", "purpose": "Read-only source-expectation→executed-test→review audit; not an obligation certification operation.", "inputs": {"historicalInputManifest": ref(HISTORICAL_MANIFEST), "spec": ref("docs/_temp/COMPLETE_SPEC.md"), "drafts": ref(draft_path), "rulesHash": RULES, "validatedRuleSpans": references, "script": ref("docs/commander/audit-g2-scenarios.py")}, "execution": {"assignment": ref((folder / "assignment.json").relative_to(ROOT)), "result": ref((folder / "result.json").relative_to(ROOT)), "junit": ref(junit_path.relative_to(ROOT)), "snapshotHash": result["beforeHash"], "sourceFilesChanged": [], "tests": len(cases), "assertions": sum(int(t.get("assertions", "0")) for t in cases), "failures": 0, "testCasesUsedByThisMap": len(evidence), "actualDraftExecutions": 0}, "summary": {"originalDrafts": 24, "requiredRiskFamilies": 12, "qualifiedG2Scenarios": 0, "satisfiedRiskFamilies": 0, "g2Satisfied": False, "clauseRelationships": dict(statuses), "certifiedObligations": 0, "certifiedCards": 0, "newFullGames": 0}, "families": families, "scenarios": rows, "tests": evidence, "historicalMaps": history, "supplementalExpectations": supplements, "runnerAudit": {"implementation": ref("apps/engine-cli/src/scenarios.ts"), "dispatchesAuthoredScenarioManifests": False, "retainsActualJUnitAndExitStatus": True, "capturesTestBytes": False, "verifiesBeforeAfterSourceEquality": False, "frozenBuildExecutesTests": False, "g2ClaimInRunner": False, "finding": "archiveBuild excludes test files; runScenarios spawns Bun against the live checkout rather than the archived executable. The fresh audit capture above closes its own evidence join only; it does not retroactively repair prior CLI runs."}, "nextCoherentWork": NEXT}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", default=DEFAULT_RUN)
    parser.add_argument("--output", default="docs/commander/g2-scenario-audit-0.7.json")
    parser.add_argument("--check", action="store_true", help="Verify the retained report instead of rewriting it")
    args = parser.parse_args()
    report = audit(args.evidence)
    output = ROOT / args.output
    if args.check:
        require(json.loads(output.read_text()) == report, "Retained audit differs; inspect source/evidence drift before regenerating")
    else:
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": str(output), "summary": report["summary"], "execution": {k: report["execution"][k] for k in ["tests", "assertions", "testCasesUsedByThisMap", "actualDraftExecutions"]}}, indent=2))

if __name__ == "__main__":
    main()
