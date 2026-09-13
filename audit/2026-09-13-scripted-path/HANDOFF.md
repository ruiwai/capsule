# Scripted execution-to-review implementation — 2026-09-13

## Delivered boundary

`ScriptedService` owns authenticated local admission/resume, immutable capsule
compilation, typed internal operation resolution, durable action reservations,
execution evidence, deterministic finalization, scoped artifact access and
idempotent review. Both Pi callbacks and CLI use it. The unsafe
`Controller.action(Recipe, CommandSpec)` implementation was removed; legacy
environment/demo and adaptive CLI execution are unavailable.

SQLite WAL/FULL transactions replace in-memory lifecycle counters and
post-effect JSON indexes. The implementation and its conservative limits are
documented in [`docs/SCRIPTED-PATH.md`](../../docs/SCRIPTED-PATH.md), including
exact operator/request/evidence/decision examples and the persistence rationale.

## Executed checks

Run all A01–A15 with **`npm run test:acceptance`**. These are new executable
assertions, not renamed audit scenarios. The positive callback test does not
seed reports, acceptance records or completed receipts. Every fixture is
explicitly synthetic.

The final verification run is recorded in `build-verified.log`,
`tests-verified.log`, and `acceptance-verified.log`; per-case observations are
under `verified-results/`. Initial compile diagnostics and intermediate passing
runs are retained separately rather than concealed. The initial compile failed
on missing TypeScript `this` annotations; these were fixed before final checks.

| Check | Result | Evidence |
|---|---|---|
| TypeScript checking and build | PASS | `typecheck-verified.log`, `build-verified.log` |
| Existing + new tests | PASS | `tests-verified.log`, 28 tests in four files |
| Dedicated integration acceptance suite | PASS | `acceptance-verified.log`, 15 tests |
| Distinct-process ownership and restart | PASS | A05, A06, A08, A11; `verified-results/process-*.json.log` includes distinct PIDs |
| Actual registered public callbacks, positive and negative | PASS | A01–A03, A14 |
| CLI real execution, evidence, report, decision and negative target rejection | PASS | `cli-verified/*.json`, `cli-verified/negative.log`, `cli-verified/check.log`; repeated-effect assertion executed |
| Reproduced old capture/quota bugs against immutable reviewed snapshot | FAIL (expected pre-fix invariants) | `pre-fix.log`; new `prefix-capture.mts` exited 1, both violations reproduced |
| Live Luna/Nix/FHS/dependency installation | NOT_RUN / DEFERRED | Deliberately not invoked |
| Old controller audit drivers against removed API | BLOCKED | No compatibility execution bypass retained; new tests use the replacement public path |

`npm test` originally discovered tests inside immutable audit snapshots as well;
`vitest.config.ts` now restricts discovery to **all** `tests/**/*.test.ts`. It
neither edits snapshots nor excludes new repository regressions.

## A01–A15 mapping

All names below are in `tests/scripted.test.ts`. Each row is PASS for the
executed assertions described by that test, not a claim of a broader product
gate. The full names and timings appear in `acceptance-verified.log`.

| Case | Test name (after case prefix) | Observation artifact | Result |
|---|---|---|---|
| A01 | public execution to evidence, persisted report and named-unit review | `verified-results/A01.json`, `A01-artifacts/` | PASS |
| A02 | public rejects executable parameters, unresolved/disabled authority and prohibited effects | `verified-results/A02.json` | PASS |
| A03 | identical sequential/concurrent public submissions reuse one task and action | `verified-results/A03.json` | PASS |
| A04 | immutable registered builders reject copied digests and denied genuine capabilities | `verified-results/A04.json` | PASS |
| A05 | synchronized separate controller processes own one admitted task/action | `verified-results/A05.json`, process logs | PASS |
| A06 | expired and reported lifecycle persists in newly launched processes | `verified-results/A06.json`, process logs | PASS |
| A07 | tool/time reservations and slow persistence prevent excess spawns | `verified-results/A07.json` | PASS |
| A08 | intent failure has no effect, restart cannot replay, live duplicates join | `verified-results/A08.json`, process log | PASS |
| A09 | strict/semantic/zero-recovery stops resist fresh IDs; allowed recovery succeeds | `verified-results/A09.json` | PASS |
| A10 | preabort, late descendant streams and TERM/KILL are bounded and truthful | `verified-results/A10.json` | PASS |
| A11 | process-safe restarted quota, corrupt reuse/read and truthful truncation | `verified-results/A11.json`, process logs | PASS |
| A12 | reader exit zero cannot certify false/null structured units or fabricated draft evidence | `verified-results/A12.json` | PASS |
| A13 | task-indexed evidence rejects traversal, foreign artifacts, ranges and symlink escape | `verified-results/A13.json` | PASS |
| A14 | current scoped review rejects missing/mismatched/incomplete/stale and conflicting decisions | `verified-results/A14.json` | PASS |
| A15 | exact saved capsule retains complete intent and malformed durable identity fails closed | `verified-results/A15.json` | PASS |

A07 asserts a post-persistence deadline rejection and grant revocation rejection
with **zero effects**, not only an exception string. A11 races distinct 8-byte
payloads under an 8-byte quota in barrier-synchronized processes; exactly one
writes. A restarted distinct writer rejects. Corrupt retrieval and corrupt
deduplication reject, and terminal metadata persists at exhausted payload quota.
A10 includes a child-state observation; a non-child zombie, if observed, is not
falsely called reaped. Public metadata redaction uses a dummy secret only.

## Actual positive artifacts

`verified-results/A01-artifacts/` contains operator/request examples plus:

* `saved-capsule.json`: exact persisted canonical rendering;
* `actual-receipts.json`: exported actual process receipts;
* `actual-report.json`: report produced and persisted by normal finalization;
* `actual-decision.json`: actual named-unit acceptance;
* `state/controller.sqlite`: durable task, report and decision index;
* `state/task_*/evidence/*`: actual retained streams;
* `state/task_*/evidence.sqlite`: durable intent/event metadata.

Those JSON files are **read-only exports after execution**, not report seeds.
Absolute source paths identify the original temporary fixture, not a portable
environment replay guarantee. `verified-results/A09.json` additionally records
a genuinely permitted recovery through a passing report and acceptance.
A14 preserves the external user's changed protected file instead of resetting it.

## Exact state identity and preservation

Reviewed baseline: `6404f4deda0c7e8764b5385114e820f3353c4b61`.
Actual current base HEAD: `25b3171dc04db238acac13b07fbe07b7135bf9bd`
(`docs: expand project README`, a pre-existing documentation commit after the
reviewed baseline). The README was read before updating its now-obsolete public
API/demo instructions for this implementation.
No new commit or staging operation was performed; implementation remains
uncommitted alongside the pre-existing index/worktree and untracked user changes.
`commit.txt`, `git-status.txt`, `implementation.patch`, and
`implementation.sha256` identify the relevant final workspace (including new
source, tests and guide). `identity-summary.txt` hashes the manifest and patch.
`preservation.log` checks earlier normative docs and audit evidence against the
retained reviewed baseline. Existing flake changes, original audit drivers and
results, and unrelated untracked work were not edited.

## Remaining findings and deferred gates

This is **not WP0–WP3 completion**. Adaptive execution remains disabled.
Environment creation/sync/FHS/loader/Nix/download routes independently reject;
candidate/stale handles cannot be promoted by a UUID. Full verified-handle
execution/replay, live environment recovery, model-budget accounting, JIT memory,
and the closed SDK worker's optional-model assertion remain DEFERRED.

The enabled boundary deliberately does not rely on legacy broad request schemas,
context renderers, caller-mutable recipes, or prose-based gate-report helpers.
Those old helper-level audit findings are not claimed repaired as general APIs;
they are no longer public execution/review authority.

Uncertain intents require reconciliation rather than replay. Automatic
reconciliation, successor-task/revision authorization and release of conservative
project obligations are not implemented. Same-state/project fresh requests
remain stopped, even after closure; allowed retries use the original task.
Conservative full time reservations may reject work earlier than actual-time
charging would. SQLite requires the supported local filesystem/runtime. There
is no hostile-host isolation, cross-host ownership or exactly-once external
execution claim. Capture/cleanup uncertainty is retained and blocks normal
acceptance. No provider/model/live Pi UI execution was used to establish these
synthetic callback and controller assertions.
