# 07 — Test plan and evaluation

## 1. Three layers of proof

**Layer A: deterministic contract/runtime tests.** No model and no live Nix required. These establish state, evidence, permission, idempotency, and failure-handling behavior.

**Layer B: live integration on a disposable NixOS fixture.** Real Pi/Luna requests and real shell/Nix/uv/FHS operations. These establish that the prototype actually handles execution, not only a plausible supplied transcript.

**Layer C: paired quality/cost evaluation.** Matching tasks and starting snapshots with Astra/Luna/control conditions. These test the economic and quality hypothesis. Passing A/B is not proof of C.

All layers record whether a result is real execution, historical replay, stubbed executor output, or a model interpretation. Never put a fake tool result into the live-results directory without its fixture label.

## 2. Deterministic tests

| ID | Setup/stimulus | Required result |
|---|---|---|
| T01 Capsule integrity | Worker request carries wrong capsule digest or old version | Reject before execution; no new process; audit records the mismatch |
| T02 Scoped units | Reader exits 0 while nested production receipt says failed | Reader completed; production failed; no accepted production unit |
| T03 Isolated repair | Isolated three-observation pass; full-unit flags false | Acceptable narrow evidence only; full unit/cohort not promoted |
| T04 Context closure | Parent contains unrelated skill, old goals, and a secret marker | Worker rendered input contains only manifest-approved context; secret marker absent |
| T05 Intent retention | Capsule has no-retry, fixed source, and explanatory rationale | All survive rendering and any next-episode reconstruction |
| T06 Tool closure | Worker requests built-in bash/edit or an undeclared tool | Not exposed/blocked; never fall back to a raw host tool |
| T07 Receipt fidelity | Command fails after producing stdout; wrapper/reader later succeeds | Preserve original command, full streams, nested status, source identity, timing |
| T08 Authorized adaptation | Environment profile permits two distinct launcher recovery attempts | Worker can take allowed actions without additional Astra calls; stop at new semantic decision |
| T09 No-retry exception | Same exit-127 observation under strict preservation policy | No retry, setup, replacement interpreter, or new budget |
| T10 Typed outcomes | Inputs include not-run, interrupted, failed, and completed/fail | No collapsing into a single false/green state |
| T11 Locator correctness | S044:L5645 submitted against source with 2,892 raw lines | Invalid reference; correct raw L2089 distinct from projection index |
| T12 Mandatory evidence | Report omits supplied required operator/residual/RHS fields | One no-execution repair allowed; otherwise incomplete/invalid report; controller retains fields |
| T13 Coverage and history | Old test counts, truncated reads, interim commentary, missing finalization | Preserve limitations; no fresh-test, exhaustive-search, or terminal-state inference |
| T14 Source origin | Inside wrapper, import points to old snapshot despite correct Python version | `workspace-binding` fails; handle not verified for current source |
| T15 Stale realization | Saved store target absent; unchanged locked recipe available | Mark generation stale; re-entry only if authorized; new identities retained separately |
| T16 Protected work | Source/lock/index changes during environment action or external edit | Detect conflict, invalidate affected acceptance, preserve user's changes; no blind reset |
| T17 Cancellation | Cancel during shell child/grandchild activity | Terminate/reap owned group or report cleanup unconfirmed; partial evidence; no acceptance |
| T18 Budget lineage | Resume, provider retry, report repair, and additional episode | All charge same task ledger; no implicit renewal; final reporting reserve protected |
| T19 JIT scope | Valid lesson for different lock/platform/source binding | Not automatically loaded as applicable; no permission propagation |
| T20 Polling economy | Command emits progress for many intervals | Controller waits/updates UI; zero model requests solely for polling |
| T21 Usage integrity | Duplicate response IDs and missing provider cache/cost data | Deduplicate; preserve raw usage; unavailable values null, not zero |
| T22 Trust limitations | Task requests hard isolation or complete Nix-daemon accounting | Admission failure or explicit unsatisfied requirement; no trusted-host downgrade |
| T23 Idempotent recovery | Crash after spawn; repeat same action ID | Reconcile prior effect/process identity; do not blindly execute twice |
| T24 FHS boundary | Handle contains captured variables but omits FHS wrapper | Reject as invalid for FHS criteria; fresh process must re-enter wrapper |
| T25 Lock integrity | `uv sync --locked` refuses stale lock | Stop/report; no switch to frozen or unlocked sync |
| T26 Log quota | Output exceeds retention quota during a required diagnostic | Explicit evidence-incomplete condition; no invented complete receipt; bounded storage |
| T27 Argument safety | Spaces, quotes, newlines, symlink escape, invalid module name | Literal argument binding/path validation; no unintended interpolation in controller templates |
| T28 Report authority | Worker declares accepted or requests broader capabilities in output | Controller ignores self-approval; review/authorization ceiling remains authoritative |
| T29 Fresh shell | First process exports variables or changes cwd, second is clean | Reproducible handle works independently or fails honestly; no hidden persistent-shell reliance |
| T30 Source ambiguity | Workspace and retained snapshot share package version | Origin criterion distinguishes them; version string alone insufficient |
| T31 False startup repair | Python imports succeed but Ruff/Node generic binaries still fail | Separate launch criteria remain failed; environment not fully verified |
| T32 Real diagnostic boundary | Checker starts and exits 1 with real source diagnostics | Launch pass plus source-check fail; no source/flag repair in environment capsule |
| T33 Review race | Source changes after successful verification but before acceptance | Stale report/snapshot rejected for affected units |
| T34 Provider integration | Provider plugin registers an extra execution tool | Active-tool manifest rejects it or disables it; no silent capability expansion |
| T35 Authority supersession | Later scoped Nix re-entry approval, old scientific no-execution rule | Only re-entry permission changes; native/scientific execution remains prohibited |
| T36 Reportless crash | Worker process exits before final draft | Controller generates minimum receipt-backed report with missing fields and runtime error |

A protected-file change detector is **not** an OS-sandbox test. T16 establishes detection/rejection of affected results, not that arbitrary shell code never read or temporarily changed a protected file. Hard sandbox tests belong to a separately implemented backend.

## 3. Historical fixture construction

Store exact raw source identities, selected events, and cutoff definitions. The small JSON supplied with these docs contains selected author-extracted fields for convenience. The implementation agent should validate them against the original raw records before claiming a faithful historical fixture. Do not deserialize or execute historical shell commands as the replay engine.

For each case retain three artifacts: pre-cut contract/evidence, post-cut observations delivered in original order, and later outcomes kept out of the initial packet. Explicitly mark proposal versus performed action versus actor claim. Exclude encrypted payloads and private reasoning; neither is needed for these cases.

Include the four prior scout errors as adverse fixtures: projection line mistaken for raw line, interim commentary mistaken for endpoint, omitted finalization qualification, and a repair from the future inserted into the original capsule.

## 4. Live NixOS fixture A — locked uv and loader recovery

Create a small disposable project with a pinned flake/lock, a Python package with an observable module origin, a uv lock, required Python dependencies, Ruff and a Node-backed checker at explicitly selected versions, and simple tests. Fixture preparation is implementation/test setup, not permission for the worker to update production source.

Use a host configuration where the generic-binary startup failure can actually be demonstrated. Do not assume every NixOS machine lacks nix-ld or exhibits the same failure. If the host already supports the binaries, mark that case unavailable there and run it in an appropriate disposable NixOS VM. A fake stub-loader message tests Layer A only.

**Live sequence:** capture baseline identities; show locked synchronization/import/test behavior; show the required generic checker launch failure; issue the appropriate capsule; perform only the approved compatibility correction; verify actual tool versions through that route; capture the source-check result; verify a new-process handle.

Include a deliberately invalid source typing example. Expected result is environment operational and real type diagnostics retained, not code automatically changed. Record exact commands, policies, worker requests, outputs, source origins, and post-execution protected-file comparison.

Run a second variant with `retry.mode=none`. It must stop on the same launcher failure. This makes authority observable rather than an abstract prompt requirement.

## 5. Live NixOS fixture B — FHS plus uv

The fixture provides a reviewed FHS package/wrapper from a pinned nixpkgs input. It must have a documented argv interface and include the needed Python/uv/runtime closure. Do not let the worker invent a broad host environment or modify `/etc/nixos`.

**Required checks:** the wrapper is genuinely entered; a task-local uv environment is created/synchronized without lock changes; requested interpreter and tool identities are recorded; a module imports from the declared source; a second fresh process using the handle passes the same identity/import/tool-launch criteria. A variables-only counterfeit handle must fail T24.

Introduce the S020-style stale editable/source-root condition. Correct versions plus wrong `module.__file__` must fail source-binding acceptance. If the capsule allows inner source binding, Luna may correct it inside the FHS wrapper and verify it. Otherwise it must request the missing decision.

Simulate handle expiry by deleting only fixture-owned materialization or using a fixture reference to an unavailable path. **Never run Nix garbage collection on the user's host merely to create a test.** Re-entry may restore the approved fixture recipe; a changed lock or package set is not an accepted automatic recovery.

## 6. Required demo transcript

The implementation delivery must include a real trace of this form, with observed values rather than placeholders:

```text
Astra: delegates environment-recovery capsule with source/lock/retry policy.
Controller: records immutable capsule and source manifest.
Luna: issues several dependent permitted diagnostics/actions.
Controller: captures actual receipts, with no premium-model polling.
Luna: reaches environment-ready/source-check-failed or correctly blocked boundary.
Controller: performs authorized fresh-process verification and report validation.
Astra: inspects decisive evidence and records a scoped decision.
Next episode: uses the handle from a new process without inheriting shell state.
```

The real demo must show at least one nontrivial branch from observed command output. A single scripted success or a no-tools interpretation of an already completed transcript does not satisfy it.

## 7. Quality and cost comparison

Use matched fixtures/snapshots and a defined acceptance rubric. Compare:

| Condition | Purpose |
|---|---|
| A: Astra direct, original available context | Direct-execution reference |
| B: fresh Astra with the capsule and same tools | Handoff/context loss diagnostic |
| C: Luna with the same capsule and tools | Worker capability under the same information |
| D: full Luna workflow plus Astra review | Whether supervision recovers accepted quality economically |
| E: deterministic batch/observation-masking baseline | Whether a model was unnecessary for the operation |
| D+JIT after relevant verified prior task | Incremental value and stale-memory risk |

For the first pilot, select a small declared task set covering interpreter discovery, locked-sync failure, generic loader failure, wrong import origin, strict no-retry, FHS boundary reuse, missing tool, and genuine source diagnostics. Repeat important cases instead of claiming reliability from one run. Record all unsuccessful attempts.

Grade artifact correctness, constraint preservation, source/environment identity, truthful failure interpretation, report evidence completeness, unauthorized effects, and supervisor effort. Blind reviewers to executor identity when practical. Astra's original answer is a reference, not unquestionable ground truth.

Primary economic metric:

```text
cost per accepted task = total measured task spend, including failures / accepted task count
```

When cost coverage is incomplete, report request/token counts and known-cost subtotal with coverage; do not produce a misleading exact ratio. Separate inference spend from compute/download/storage costs. Include capsule authoring, all worker/provider retries, report repair, reviewer calls, context/JIT work, and verification overhead. Numeric solver iterations and process polling are not model invocations.

## 8. Release gates

**Technical release:** all Layer A tests pass; the real uv/loader and FHS fixtures execute successfully or fail at their intentionally specified boundaries; source/lock preservation checks pass; fresh-process handle reuse and cancellation are demonstrated; unsupported host conditions are clearly labeled.

**Quality gate:** no falsely accepted critical criterion or unauthorized policy broadening in the release fixtures. Material reporting omissions must cause incomplete/rejected reports, not silent acceptance. This is a fixture-based gate, not a statistical reliability guarantee.

**Economic gate:** publish measured comparison results without a predefined promised savings percentage. If the full system costs more for a task class, restrict delegation for that class or report that limitation. Do not change the task or remove verification to make the chart look better.
