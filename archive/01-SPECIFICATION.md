# 01 — Prototype specification

## 1. Product objective

Pi Capsule reduces the amount of routine, adaptively chosen tool work that requires an Astra inference. Astra states an outcome, fixes important decisions, and authorizes a bounded task. Luna can perform several dependent reads and command attempts without returning after every command. A deterministic controller owns recording, budgets, process supervision, and predefined verification. The next Astra inference receives a decision packet rather than a full shell transcript.

The main v0.1 user story is:

> “My patch is ready. Establish a working, project-correct Python/tool environment under NixOS using the existing locked project configuration; run the named checks that are allowed at this stage. Handle permitted launcher/environment friction locally. Return if a semantic code change, dependency change, new permission, or acceptance decision is needed.”

This story is intentionally broader than “run a command,” but narrower than “fix everything until tests pass.” The environment may become operational while the source still fails a type check. That is useful completion of environment work, accompanied by a failed or pending source-check gate.

## 2. Evidence basis and terminology

The earlier study indexed 205 Astra transcript files and ran three Luna scouts and seven no-tools reporting probes. It did not establish quality equivalence, savings, or production reliability [H-STUDY]. New inspection for this specification identified the uv/NixOS episodes documented in 06. Existing histories and proposed behavior must remain separately labeled.

**Task:** the supervisor-owned objective and total authorization/budget lineage, possibly spanning multiple episodes.

**Capsule:** an immutable, versioned execution contract and its selected context. It specifies the intended outcome, permitted local choices, acceptance unit, evidence required on return, and conditions that end the episode.

**Episode:** one worker session using one capsule version. It may contain dependent tool calls and authorized retries. A new capsule version requires a new episode.

**Acceptance unit:** the thing a result describes: interpreter launch, package environment, one import check, tool launch, source check, isolated regression, complete run, or scientific study.

**Environment handle:** an immutable recipe and verification record for recreating the relevant execution boundary. It is not merely a dictionary of environment variables.

**Checkpoint:** task continuation state. **JIT procedure:** scoped reusable know-how. **Gate report:** evidence needed for the supervisor's next decision. These are separate records.

## 3. In scope

### 3.1 Three capsule kinds

| Kind | Allowed purpose | Typical return |
|---|---|---|
| `investigate` | Adaptive read/search over permitted files and existing evidence; no arbitrary execution by default | Source-backed answers, coverage, contrary evidence, missing decisions |
| `environment_recovery` | Diagnose and repair permitted local runtime/launcher problems; create isolated task environment/cache; preserve fixed source and locks | Verified environment handle, actual changes, source origin, remaining tool/source failures |
| `authorized_check` | Execute named checks or an exact approved command/recipe; collect scoped results | Check results and decisive receipts, without unauthorized repair |

Environment recovery is first-class, not an incidental exception to read-only scouting. Its retry policy can authorize reasonable diagnostic adaptation. A strict scientific precheck can instead forbid all retries. Neither policy overrides the other.

### 3.2 Execution modes

`scripted` mode executes an already approved command batch without Luna. `adaptive` mode uses Luna to choose the next permissible diagnostic/action. Astra chooses the mode explicitly. The implementation MUST NOT invoke Luna merely to wait for a process, check a fixed Boolean, count files, or compute hashes.

### 3.3 Usable outputs

The plugin produces a validated gate report, a scoped checkpoint, original evidence references, an optional verified environment handle, an optional JIT candidate, and controller-observed usage. It MUST return a useful failure report even if the worker crashes or never submits a valid final report.

## 4. Non-goals

No autonomous scientific design, semantic application-code repair, dependency upgrading, host NixOS configuration changes, automatic model router, recursive agents, long-lived background services, vector database, global skill editing, or research-quality proof of Astra equivalence. No automatic rewriting of the supervisor's whole conversation. No general shell security theorem or guaranteed Nix-daemon resource accounting.

The prototype MUST NOT silently commit, push, publish, change issue state, send external messages, run native/scientific analyses, or access private datasets simply because historical commands did so. Such actions are outside v0.1 worker capabilities.

## 5. Roles and authority

Astra owns the user goal, important rationale, non-goals, semantic source patches, new permissions, and acceptance of interpretive results. Luna owns local adaptive execution within the current contract, not contract changes. The controller owns mechanics and the authoritative execution record.

An Astra-authored capsule is not unrestricted new authority. Its requested capabilities MUST be intersected with the operator's configured policy and the task's existing authorization. Granting a capability beyond that ceiling requires an explicit user/configuration decision, not an agent-generated assertion.

The effective authority record MUST identify the source of authorization and any scoped supersession. For example, permission to re-enter an unchanged flake after store cleanup supersedes an old no-setup rule only for that re-entry; it does not authorize upgrades or scientific execution [H-NIX-RESTORE]. Conflicting or incomplete authority produces `needs_decision`, not a guessed resolution.

## 6. Functional requirements

| ID | Requirement | Motivating case/test |
|---|---|---|
| R01 | Every execution is bound to task, episode, capsule digest, and named acceptance unit. | Solver/isolated-run confusion; T01–T03 |
| R02 | Worker input is fresh and explicit; no inherited full supervisor transcript or automatic unrelated skills. | Context economics; T04 |
| R03 | Capsule includes purpose, fixed decisions with rationale, open local choices, permissions, retry policy, and report fields. | Launcher versus repair; T05 |
| R04 | Worker tools are controller-mediated; built-in unrestricted Pi tools are not exposed. | Artifact integrity; T06 |
| R05 | Capture actual argv/script, cwd, selected environment, source/environment identity, exit/signal, and full retained stdout/stderr. | uv/loader/import cases; T07 |
| R06 | Environment recovery can continue through approved failure classes without an Astra turn. | Bash-friction user story; T08 |
| R07 | Stop on prohibited changes, exhausted shared budget, contradictory fixed assumptions, missing required authority, or a stop-on-failure rule. | S020 launcher; T09 |
| R08 | Separate process exit from unit state, verification result, and acceptance decision. | All real cases; T10 |
| R09 | Generate evidence IDs and raw-line locators mechanically; worker prose never defines source identity. | Scout bad locator; T11 |
| R10 | Final report validation checks required fields and evidence links; controller fills measured facts. | Probe 03 versus 07; T12 |
| R11 | Reports preserve unknowns, truncation, historical versus current results, and decisive contrary evidence. | Onboarding/checkpoint; T13 |
| R12 | Environment handles reproduce the wrapper boundary in a new process; source origin must be verified there. | S020 wrong import; T14 |
| R13 | Nix-store paths are observed realization data, not permanently reusable entrypoints. | Store cleanup; T15 |
| R14 | Preserve original lockfiles, project source, accepted receipts, and unrelated dirty work. Detect/report any discrepancy. | S006/S020; T16 |
| R15 | Cancellation ends owned execution, records partial evidence, and never reports acceptance. | Checkpoint/crash; T17 |
| R16 | Retries, report repair, and resumed episodes consume the same task budget unless explicitly extended. | Repeated prechecks; T18 |
| R17 | JIT entries carry scope, verified evidence, validity predicates, and no authority-granting semantics. | Stale loader lesson; T19 |
| R18 | No premium-model invocation for periodic progress or fixed terminal checks. | Polling baseline; T20 |
| R19 | Save exact input context, model identity, usage quality, and verification overhead for evaluation. | Savings hypothesis; T21 |
| R20 | Clearly identify host-execution limits, incomplete resource accounting, and unverified semantics. | Nix daemon and sandbox limits; T22 |

## 7. Task-boundary decision procedure

Before delegating, Astra MUST answer: what specific fact/result will this episode establish, and what decision will that enable? Then specify the smallest evidence contract sufficient for that decision.

Delegate when the objective and important constraints remain stable during local adaptation, the permitted actions are explicit enough to recognize a boundary, and the return can be reviewed without repeating the entire work. Keep the task with Astra when the next useful action is itself architectural/scientific judgment, or when missing context cannot be economically transferred or retrieved.

For environment work, the unit is normally **“make these named commands execute against this source and locked dependency environment”**, not “make their checks pass.” An environment episode ends at the first genuine source diagnostic outside permitted repair classes. An approved read-only diagnostic follow-up may classify that diagnostic without fixing the application.

Do not cut after every `rg`, `sed`, or failed command. Do not combine distinct authority stages because they happened in the same historical issue. No future outcome or later repair may appear in an earlier capsule.

## 8. Environment recovery policy

A standard environment capsule SHOULD allow inspection of project configuration, shell entry through an approved pinned recipe, task-local environment/cache creation, exact locked package synchronization, runtime identity probes, expected package imports, command launch/version checks, and named tests. Each permission must actually be present; “environment work” alone grants none of them.

It SHOULD prohibit lock updates, arbitrary interpreter-version changes, modifications to application source/tests, replacing checker versions, weakening checker options, host `nix-ld` activation, Nix garbage collection, global package installs, binary patching, deleting existing environments, and retrying strict prechecks.

Whether a direct-loader route, an existing FHS wrapper, or a scratch FHS proposal is permissible is explicitly configured. Creating a new environment design is a proposal until its package/runtime changes are approved. See 04 for executable boundaries.

## 9. Report and acceptance behavior

Worker completion is not acceptance. A report has:

1. A short outcome/decision summary and requested next decision.
2. A per-unit state and verification table.
3. Mechanically attached decisive evidence and identities.
4. Actual changes, deviations, coverage, unknowns, and unresolved obligations.
5. Environment/checkpoint/JIT references when relevant.

The controller MAY mark a pre-authorized deterministic criterion `pass` after evaluating its evidence. It MUST NOT mark the whole task accepted unless the capsule defines an exhaustive deterministic acceptance policy and all required criteria pass. Interpretive acceptance belongs to Astra. Failed, unknown, and not-run are distinct.

A false `certified` field, missing check receipt, source mismatch, or incomplete generation receipt cannot be repaired by stronger wording. A worker's narrative must not overwrite controller evidence.

## 10. Operator experience

Expose one main tool, `delegate_episode`, to the supervisor. It blocks until the bounded episode reaches a terminal return, while the UI displays compact progress. A `read_evidence` tool allows selective drill-down. `decide_episode` records acceptance, rejection, or a permitted capsule revision. Slash commands expose status, cancellation, inspection, and JIT promotion for the human operator.

Do not periodically return “still running” to the supervisor model. Do not background jobs after the tool returns. Work longer than the configured foreground budget must checkpoint or stop; a later explicit invocation may resume from evidence after revalidation.

The UI MUST distinguish “environment operational, type check failed” from “all checks passed.” It MUST show which verification applies to which snapshot and whether host-side effects are only audited rather than sandbox-enforced.

## 11. Prototype defaults

These are initial engineering defaults, adjustable per task and never substituted for stricter user constraints:

| Setting | Default |
|---|---|
| Active workers | One per task; one mutating episode per project |
| Worker model | Explicit configured Luna provider/model; no silent fallback to Astra |
| Initial-context soft target | 12,000 estimated tokens, including policy and evidence |
| Episode context ceiling | 48,000 estimated tokens; preserve room for final report |
| Worker inference ceiling | 16 attempted requests; provider retries count |
| Tool action ceiling | 32 execution/read actions; deterministic internal polling does not count as model turns |
| Episode elapsed limit | 15 minutes, including model/tool/controller activity |
| Per-command limit | 120 seconds unless the capsule explicitly permits a larger bound |
| Reporting reserve | Final 2 model requests and 60 seconds reserved from task budget |
| Visible tool preview | 12 KiB per result; retained evidence has a separate quota |
| Narrative report limit | 8,000 characters; required receipts must never silently disappear to meet it |
| Retained evidence quota | 64 MiB per task by default; stop/report if decisive evidence cannot be retained |
| Report repair | At most one no-execution repair request; otherwise controller-generated failure report |

Budget thresholds are guardrails, not scientifically validated optimums. Billable token categories must follow the actual provider adapter; unknown cost is `null`, not zero. If a hard dollar ceiling is requested but cannot be conservatively bounded before a request, do not claim enforcement—require a usable pricing policy or use explicit request/token caps.

## 12. Success criteria for the prototype

A completed vertical slice MUST execute real dependent environment commands, not simply summarize a supplied successful transcript. It must recover or correctly stop on the historical failure classes; return source-bound evidence; reuse a verified handle from a new shell; preserve frozen files; and terminate cleanly on cancellation.

A scientifically failed check can be a correct delegated outcome. A lower-cost but falsely accepted result is a failure of the prototype. Economic and quality claims require the paired evaluation in 07 and include all capsule, worker, review, retry, and JIT costs.
