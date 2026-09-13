# 02 — Architecture and runtime design

## 1. Chosen topology

```text
User / operator
      |
      v
Pi supervisor session (Astra)
      | delegate_episode(request)
      v
Supervisor extension + local controller
  |-- contract compiler / policy intersection
  |-- workspace snapshot + mutation lease
  |-- budget and episode state machine
  |-- command executor + recipe registry
  |-- evidence store + report validator
  |-- environment-handle registry
  |-- scoped JIT store
  |-- UI progress + usage ledger
      |
      | private IPC: immutable capsule, tool requests, observations
      v
Worker runner process
  |-- existing Pi SDK / fresh session (Luna)
  |-- explicit resource loader and exact custom-tool set
  |-- tool implementations forward requests to controller
  |-- no built-in bash/edit/write or automatic child agents
      |
      +---- model provider (normal Pi authentication)

Controller executor ----> foreground command process group
                           approved Nix/FHS wrapper -> uv/Python/tools

Controller ----> validated compact report + decisive receipts ----> Astra
```

One worker process is used to separate lifecycle and incidental runtime state, **not to establish an OS security boundary**. The controller is the only writer of authoritative task records. The worker runner can request actions but cannot publish a trusted execution receipt or approve itself.

The parent supervisor session is not replaced, forked, or compacted by the plugin. Every delegated episode gets a fresh worker context. Raw worker history remains in its own session file and evidence archive.

## 2. Pi integration strategy

The connected host reported Pi **0.85.1** on 13 September 2026. This is an observed installed version, not proof that the examples below were compiled against it. WP0 MUST pin the actual Pi SDK/package dependency and record a compatibility manifest with executable path, version, package identity, and available API/type capabilities.

The current official documentation supports custom tools, session creation through `createAgentSession`, selected built-ins/custom tools, resource-loader customization, session subscriptions, and persistent extension entries [PI-SDK, PI-EXT]. Use these existing mechanisms; do not reimplement inference, authentication, tool parsing, or the Pi session format.

The supervisor extension registers `delegate_episode`, `read_evidence`, and `decide_episode`. It uses tool progress callbacks or TUI state for routine progress. Durable UI-only state can use extension entries; the model-visible final tool content contains only the report packet. Nested usage must be exposed through the installed Pi usage mechanism when available, but the controller ledger remains the audit source. Never double count both nested tool usage and the same worker requests in evaluation totals.

The worker runner creates a new SDK session with a **closed resource manifest**. Its enabled custom tools are listed in 03. Disable default built-ins and unrelated extension/skill/context-file discovery. Exact options must be implemented against the pinned installed types; an adapter-level test must inspect the effective active tools and rendered system/context input. Do not assume a small prompt automatically prevents resource loading.

DefaultResourceLoader discovers additional resources by default [PI-SDK]. Prefer a small explicit loader or pinned overrides that return only the approved policy, capsule, and selected JIT resources. Ordinary project instructions must be reviewed and deliberately included rather than accidentally inherited. If the user's configured provider is implemented by a Pi extension, load only that trusted provider integration, record it in the manifest, and assert that it does not enable unrelated tools. Fail as `provider_unavailable` rather than silently switching model/provider.

Custom worker tools forward via private IPC to the controller and await their receipts. The controller emits evidence before it releases observations to the worker. Session event subscriptions capture request/response usage and lifecycle. Model credentials remain in the normal trusted Pi runtime; never serialize them into the capsule, environment handle, command log, or shell environment.

Do not call supervisor session replacement/reload APIs from a tool or event callback. Pi documents command-only session controls because other contexts can deadlock [PI-EXT]. This prototype has no reason to replace the supervisor session.

## 3. Modules and boundaries

| Module | Owns | Must not own |
|---|---|---|
| `extension/` | Pi tools, commands, UI presentation, supervisor review entrypoints | Domain acceptance logic embedded in renderer code |
| `controller/` | Serialized task mutations, episode transitions, IPC routing, leases, cancellation | Model inference implementation |
| `contracts/` | Runtime schemas, semantic validation, canonical serialization, protocol version | Loading arbitrary YAML as executable policy |
| `context/` | Capsule construction, selected evidence projection, worker resource manifest | Lossy rewriting of immutable authority |
| `worker/` | Pi SDK session, request lifecycle, forwarding custom tools | Direct host shell or authoritative ledger writes |
| `execution/` | Spawn, argv/script binding, cwd/env rules, output capture, process identity | Deciding scientific validity |
| `recipes/` | Named/versioned entry wrappers and verification commands | Mutating host configuration automatically |
| `evidence/` | Content-addressed blobs, event index, range validation, retention | Treating filenames or worker prose as proof |
| `verification/` | Declared deterministic criteria and scope checks | Inventing tests or changing thresholds |
| `environment/` | Handle construction, fingerprints, source binding, re-entry checks | Treating saved variables as an FHS mount namespace |
| `knowledge/` | JIT candidates, scope matching, explicit promotion, invalidation | Granting permissions or editing global skills |
| `telemetry/` | Actual request/tool usage and measurement completeness | Hard-coded public model prices |
| `replay/` | Historical fixtures and deterministic fake executors for tests | Claiming a replay executed the original environment |

Dependency direction: UI -> controller -> domain modules -> OS/Pi adapters. Domain modules must be testable without a model or a real Nix installation. Pi-specific request types stay inside the adapter.

## 4. Data flow for one episode

**Admission.** Resolve the task request against operator policy. Validate required acceptance/report fields. Resolve source references, permissions, recipe identities, and budgets. Capture the workspace manifest and acquire the project mutation lease when needed. Compile and hash the capsule. Persist `episode_authorized` before starting the worker.

**Execution.** The runner submits a request containing task, episode, capsule digest, request ID, and action payload. The controller rejects stale/wrong identities, revoked permissions, duplicate action IDs with different content, exhausted budgets, or a terminated episode. It validates recipe parameters, persists an action-intent record, spawns the command, streams bytes to evidence storage, waits without model polling, and commits an execution receipt. Only then does it return a bounded observation to Luna.

**Return.** Luna submits a draft through `episode_return`. This changes the phase to reporting and disables new execution. The controller joins in original receipts, checks mandatory fields/references/criteria, captures the final workspace manifest, and verifies applicable environment criteria. It may perform only the pre-authorized verification commands named in the capsule—not arbitrary extra science.

**Review.** The resulting gate packet goes to Astra as the original tool result. Astra can fetch evidence, accept the named unit, reject it, or propose a revised capsule within its permission ceiling. New permissions above that ceiling need the operator. A revised capsule starts a fresh episode and inherits remaining task budget and unresolved obligations.

**Close.** All owned command processes must be reaped or explicitly reported as unconfirmed cleanup. Save terminal state, report hash, usage, source/environment identities, and checkpoint. No service is intentionally left running after the foreground tool returns.

## 5. Two state machines, not one success flag

### 5.1 Episode lifecycle

```text
DRAFT -> AUTHORIZED -> RUNNING -> REPORTING -> AWAITING_REVIEW
                           \-> INTERRUPTED
                           \-> BUDGET_EXHAUSTED
                           \-> FAILED
AWAITING_REVIEW -> CLOSED
AWAITING_REVIEW -> new capsule version / new episode (not mutation of old episode)
```

`FAILED` means the episode runtime or contract failed. A valid report describing a failing test can reach `AWAITING_REVIEW` normally. `CLOSED` means bookkeeping is finished; it does not imply scientific acceptance.

Worker report repair is a bounded substep of REPORTING. No execution tools are enabled there. If the worker does not produce a valid report, the controller emits a minimum report with known receipts, missing fields, and `worker_report_invalid`.

### 5.2 Evidence unit state

Each acceptance unit separately records execution state (`unknown`, `not_run`, `running`, `interrupted`, `failed`, `completed`) and verification (`not_evaluated`, `pass`, `fail`, `unknown`), with acceptance (`pending`, `accepted`, `rejected`, `not_applicable`).

Examples:

* Receipt reader: completed/pass; described production unit: failed/fail/pending.
* Python imports: completed/pass; Ruff launch: failed/fail; Ruff source lint: not_run/not_evaluated.
* Explicit-loader Node launch: completed/pass; basedpyright source check: completed/fail.
* Planned generation stop: interrupted; artifact finalization: unknown; scientific study: not_run.

Transitions require new evidence; no status is overwritten to hide a historical attempt. Store successive attempts and a current view. An old failure remains true even when a later, separately identified attempt succeeds.

## 6. Persistence layout

Repository configuration contains no secrets:

```text
<project>/.pi/capsule/config.json
<project>/.pi/capsule/recipes/*.json
```

Runtime state defaults outside the repository to avoid polluting dirty-tree comparisons:

```text
<stateRoot>/<projectId>/
  policy.json
  knowledge/{candidates,verified,stale}/<entryId>.json
  tasks/<taskId>/
    task.json
    budget-ledger.jsonl
    events.jsonl
    manifests/{initial,final,...}.json
    capsules/<version>.json
    episodes/<episodeId>/
      worker-context.json
      resource-manifest.json
      worker-session.jsonl
      commands/<executionId>.json
      reports/{draft,validated,review}.json
      checkpoint.json
    environments/<handleId>.json
    evidence/<sha256>
    evidence-index.jsonl
```

Use a project ID derived from canonical root identity plus a controller-generated salt/ID; do not assume two worktrees with the same commit are one mutable project. Default file mode is 0600 and directory mode 0700 where supported.

Use a single-writer task queue and exclusive lease file. Append journal entries in order; atomic temp-write + rename for materialized views. Flush the action-intent record before spawning effects. A crash after spawn is **not** evidence that the action never ran. Recovery must reconcile process identity and receipts, not blindly replay the last request. A truncated final journal line is preserved and excluded from the validated index until recovery records the interruption.

Evidence blobs are immutable. Store their SHA-256, byte count, stream identity, encoding, and truncation/redaction status. Their digest establishes the stored bytes, not the truth of a claim contained in those bytes. Garbage collection must preserve anything referenced by active tasks or verified JIT entries; archive or invalidate references before deletion. Never delete the user's original transcripts or project results as runtime cleanup.

## 7. Workspace identity and concurrency

A Git commit alone is insufficient. Capture staged/index identity, tracked working-tree file content, relevant untracked files, symlink targets, and approved source/configuration roots. The request names protected paths and expected source roots. Large data roots can be excluded from hashing with an explicit no-read/no-write restriction and a documented verification limitation.

Do not stash, reset, clean, commit, or change index state automatically. Prefer a user-approved disposable project copy or existing isolated worktree. A copied project must include the authorized dirty/untracked content and referenced subprojects; otherwise its behavior may differ. Reuse of a retained snapshot must be explicit, not an accidental consequence of an editable installation.

The controller serializes its own mutating episodes. It cannot prevent unrelated editors, Git processes, or users from changing the project. Revalidate identities before verification/acceptance. If an external change occurs, return `snapshot_conflict`; do not apply rollback that may destroy the user's new work. Read-only evidence can still be preserved under its original identity.

## 8. Command execution and process ownership

Prefer structured argv to shell string concatenation. A script is a separate immutable artifact with a digest and an interpreter; it is never interpolated into a command from unescaped model-supplied text. `exec_script` is allowed only by explicit capsule capability, in a trusted local environment.

Use a new process group/session for each owned command, store PID plus process-start identity, and pass a minimal declared environment. Cwd is canonicalized against approved roots. The executable and recipe identities are captured separately from the script. Nix/FHS wrappers must propagate child status and preserve stderr; `tee` or a later successful command must not mask an earlier failure.

Wait for command completion in ordinary controller code. Stream progress to the UI, not to new Astra requests. On cancellation/deadline, send the configured graceful signal, wait a bounded grace interval, terminate the owned group if needed, and reap. Persist signal, timing, partial outputs, and whether descendants were confirmed absent. Do not kill unrelated system services.

A shared Nix daemon may perform work outside the spawned process tree. Neither killing the Nix client nor reading a local RSS sample proves all daemon activity stopped. Record `external_effects_accounting=incomplete` where appropriate. Strict global resource caps require a separate execution environment or broker and are not promised by this prototype.

## 9. Enforcement model

| Rule | v0.1 enforcement |
|---|---|
| Worker cannot call a tool outside the active set | Controller/SDK admission; required test T34 |
| Worker cannot expand capsule permission or budget | Controller authority and immutable digests |
| Worker cannot fabricate controller execution IDs/receipts | Reference validation; measurements joined by controller |
| Direct `scratch_write` outside approved scratch root | Prevented by path validation, including symlink checks |
| No arbitrary application edits via a permitted host shell | Policy plus post-execution detection, **not security prevention** |
| No host-secret reads or network effects from arbitrary commands | Not guaranteed by trusted-host mode |
| Nix daemon global memory/store/network limits | Not hard-enforced by a client process limit |
| FHS process isolation from host | Not claimed; FHS is compatibility, not security [NIX-FHS] |

First use MUST require explicit `trusted-local` execution opt-in. A configuration demanding hard filesystem/network isolation MUST fail admission if no separately implemented sandbox backend satisfies it. Never silently downgrade that request. Future OS isolation can implement the executor interface without changing capsule/report contracts, but is not an invisible dependency of v0.1.

## 10. Environment handles as capabilities, not executable prose

An environment handle references a registered immutable recipe, capsule/authority lineage, expected source binding, mutable materialization location, and observed runtime identities. A worker cannot write a string and have the supervisor `eval` it. Commands using a handle are compiled by the controller from the recipe and typed parameters.

Every fresh invocation recreates the relevant wrapper. In particular, an FHS namespace cannot be recreated by replaying environment variables [NIX-FHS]. The source binding is applied **inside** the last wrapper that could change it. The fresh-process checker confirms interpreter, package origins, required binary launch, and source origin. Recipe changes create new handles; successful command receipts reference the specific handle generation.

## 11. Error handling and recovery

Define stable error codes: `invalid_contract`, `permission_missing`, `recipe_unavailable`, `provider_unavailable`, `budget_exhausted`, `source_mismatch`, `environment_stale`, `snapshot_conflict`, `execution_failed`, `execution_interrupted`, `verification_failed`, `evidence_incomplete`, `report_invalid`, and `cleanup_unconfirmed`.

Every error includes the affected unit, attempted action, actual evidence, remaining known budget, and permitted next action. Never substitute a guessed successful report after a worker timeout. If model output is unavailable, the controller still knows the commands it ran.

Recovery never reuses a bare PID as proof of ownership; check process-start identity. It never retries a possibly completed side effect without reconciliation. Resume creates a new episode with fresh context, not an implicit continuation of unknown shell state.

## 12. Important architecture decisions

**SDK rather than a mandatory subagent package.** The prototype needs deterministic tool interception and environment handles. Pi already supplies the agent runtime. A small adapter around that runtime is sufficient; third-party delegation packages are optional later backends, not part of the v0.1 acceptance surface.

**Foreground rather than a daemon.** This avoids lifecycle ambiguity and model polling, and makes cancellation testable. Long tasks must use explicit checkpoint/resume rather than quietly surviving a tool return.

**Files and append-only journal rather than a database service.** One writer and local artifacts are sufficient for the first prototype. The format must be versioned and recoverable; a future database must preserve evidence identities.

**Fresh episodes rather than arbitrary context surgery.** The supervisor stays intact. Worker context is reconstructed only at safe return boundaries, using a new session and the same remaining task budget.


## 13. Protocol limits, reservations, and host lifecycle

Use Node's private parent/child IPC channel for the initial Linux implementation (for example, a forked worker runner). The channel is lifecycle plumbing, not authentication against a hostile same-user host process. Validate JSON-shaped payloads and reject prototype-bearing/non-JSON values before domain processing. Default individual IPC payload limit is 1 MiB; larger evidence is sent by controller-owned artifact reference. Bound queued messages and active actions: one outstanding mutating action per episode, no worker-created process fan-out.

Reserve capacity before each model request or command. The wall deadline, cumulative command budget, action/request ceilings, and reporting reserve are all checked together. Use monotonic time for deadlines and UTC for receipts. The default command-termination grace is five seconds, counted inside the task envelope; reserve it before dispatch. If insufficient time remains for both the proposed operation and reporting/cleanup, do not start it. A report-only repair has no shell permissions. Provider-internal retry counts that the SDK does not expose must be explicitly marked unobservable; never claim those ceilings are exact when the adapter cannot see attempts.

Runner crash, IPC disconnect, supervisor tool cancellation, and Pi shutdown all request cancellation of owned command groups and durable minimal reporting. On the next startup, reconcile open task journals before allowing reuse of their materializations. A job that escaped a process group or a shared daemon with unknown work is a cleanup/accounting limitation, not a reason to falsely report clean termination.

Protect the raw-observation path from prompt injection: repository files, command output, and archived conversations are evidence, not executable policy. Redact known secret patterns across stream chunk boundaries before model previews and retained public logs. Save redaction/truncation metadata and hash the actually stored bytes; do not assert their digest authenticates an unretained original stream. Exact replay fixtures that contain secrets require an explicitly approved private evidence policy, never default publication.
