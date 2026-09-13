# Durable scripted execution and review

This is a narrow trusted-local milestone, **not WP0–WP3 completion**. All examples
below are synthetic fixtures, not historical Luna or NixOS execution.

## One executable acceptance command

```sh
npm run test:acceptance
```

This runs A01–A15 in `tests/scripted.test.ts`, including real separate Node
processes, synchronization barriers, actual extension callbacks, cancellation,
quota contention, and a complete successful execution/report/review path. All
repository tests run with `npm test`; discovery is `tests/**/*.test.ts`, excluding
immutable audit snapshots and generated `dist` copies. `npm run build` checks
TypeScript. Node 22.23.2 was used; `node:sqlite` emits an experimental warning.

## Operator setup and exact working request

The trusted operator—not a task or model—registers executable authority. The
following setup creates an isolated disposable project, exact `operator.json`
and `request.json`, and a named, digest-pinned synthetic checker. It prints paths
and does **not** execute the checker. Do not expose this setup program as a tool.

```sh
node --import tsx tests/setup-scripted-example.ts > /tmp/capsule-example.json
export CAPSULE_TRUSTED_LOCAL=1
export CAPSULE_OPERATOR_CONFIG="$(node -p \
  "JSON.parse(require('fs').readFileSync('/tmp/capsule-example.json')).config")"
REQUEST="$(node -p \
  "JSON.parse(require('fs').readFileSync('/tmp/capsule-example.json')).request")"
cat "$CAPSULE_OPERATOR_CONFIG"
cat "$REQUEST"
node --import tsx src/cli.ts delegate_episode "$REQUEST" > /tmp/capsule-run.json
```

Concrete executed configuration and request examples are also retained under
`audit/2026-09-13-scripted-path/verified-results/A01-artifacts/`. Their absolute
paths identify the original disposable fixture; they are records, not portable
replay handles. Generate fresh examples using the setup command above.

The operator configuration contains `stateRoot`, `principal`, `trustedLocal`,
`ceiling`, `grants`, and `checks`. The principal is the authenticated **local
operator configuration identity**, not an issuer asserted inside the request.
The grant reference is a lookup key, not a bearer token. This is a single trusted
local principal deployment, not a remote multi-user authentication service.
Protect the configuration and state directory from task/model writes.

The request schema is implemented completely in
`src/controller/scripted-contract.ts`. Unknown fields reject; capability values
must be actual booleans. Paths are exact relative file scopes (directories,
globs, arbitrary cwd, shell arguments, loaders and targets are unsupported).
Grants and the ceiling must contain every requested scope item; exceeding
either rejects rather than silently dropping a required operation. Numeric
allowances are intersected; the reporting reserve uses the larger minimum.

Supported operations:

* `project.inspect`, parameters **only** `{"path":"protected.txt"}`. The
  controller resolves an approved regular file inside the project and runs its
  own fixed read-only builder.
* Operator-registered `check.*`, builder `node-check`. Setup pins the checker
  file content and declares ordered, enum-valued positional parameters. The task
  selects only declared values. Every output must contain the declared JSON
  result: `{"certified":true,"complete":true}`. Exit zero alone is insufficient.
  The synthetic checker writes an `effects` marker in its disposable project
  **solely to assert execution count**; it does not certify a real product.

The service pins builder metadata, checker content, and the actual Node
executable content into the capsule. Operator changes after admission do not
rewrite a saved capsule. Grant checks and operation identities are resolved
again immediately before spawn and review. The exact canonical capsule rendering
includes the entire request, decisions and rationale, non-goals, scoped units,
criteria, source binding and protected-file identities, stop/retry rules and
effective budgets. Protected identities include resolved path, inode/device,
mode and content digest. No reset or rollback of project files occurs.

## Evidence and supervisor decision

Generate parameters from the actual returned report, not a fabricated receipt:

```sh
node --input-type=module <<'JS'
import fs from 'node:fs';
const r = JSON.parse(fs.readFileSync('/tmp/capsule-run.json')).report;
fs.writeFileSync('/tmp/capsule-read.json', JSON.stringify({
  taskId: r.taskId, executionId: r.units[1].executionId, stream: 'stdout'
}));
fs.writeFileSync('/tmp/capsule-decide.json', JSON.stringify({
  taskId: r.taskId, episodeId: r.episodeId,
  reportId: r.id, reportDigest: r.digest, decisionId: 'example-review',
  decision: 'accept', acceptedUnits: ['inspection', 'check'],
  rationale: 'Named synthetic units satisfy their declared receipt-backed criteria'
}));
JS
node --import tsx src/cli.ts read_evidence /tmp/capsule-read.json
node --import tsx src/cli.ts decide_episode /tmp/capsule-decide.json
```

The Pi extension exposes the same three operations through `publicCall` and
`ScriptedService`. `delegate_episode` takes `{request: <request object>}`, **not
a file path**; the CLI alone loads an explicitly provided input file. Load with
`pi --extension ./src/extension/index.ts` after setting the operator environment.
The A01 test invokes those actual registered callbacks without a model.

Evidence is indexed by authorized task and actual execution ID plus stream,
never authorized by a digest alone. Byte ranges are integer, nonnegative and
bounded by retained length. Every read authenticates the payload and resolved
containment, including task/evidence symlink escapes. Review authenticates the
stored report and current grant, accepted unit names, required evidence,
deterministic verification, lifecycle, and current protected/operation identity.
Changed content under a decision ID or a conflicting terminal decision rejects.
Normal acceptance does not waive failed or unknown criteria. `request_revision`
and environment-handle acceptance are unavailable.

Draft schema validity, evidence completeness, criterion verification and
supervisor acceptance remain separate. An absent/invalid worker draft produces
a truthful controller fallback; worker prose cannot change verifier results.
Controller verifiers are protected-file comparison, actual receipt completion,
structured true/true result, and coverage/authenticated complete evidence. No
extra verifier process is launched from worker prose.

## Persistence and ownership choice

SQLite with `BEGIN IMMEDIATE`, WAL, `busy_timeout`, and `synchronous=FULL` is the
single process-safe mutation mechanism. Use a private **local filesystem**;
cross-host/NFS ownership is unsupported. Transactions never span an await or a
child process. The unique `tasks.client` index plus canonical request digest
reserves admission before execution. A transaction serializes snapshot/capsule
construction and publication. Task bodies include phase, original absolute
deadline, aggregate reservations, recovery consumption, actions, the indexed
report and decision, with integrity/binding checks on every load.

The action intent and full tool/time reservation commit before spawn. A shared
same-process pending promise is published before asynchronous persistence.
Other processes see a completed receipt, `in_progress`, or an explicit
`reconciliation_required` intent; they cannot independently replay it. A crash
does not reset a deadline, release usage, or clear a stop. An uncertain intent
requires operator reconciliation; **there is no exactly-once claim** and no
automatic replay/reconciliation endpoint in this milestone.

Command capacity is conservatively charged at the entire reserved allowance,
not refunded when a process returns early. This includes 900ms reserved for
bounded TERM/KILL and stream drain. It is deliberately stricter than billing
only successful execution time. Reporting has its own retained wall reserve.
OS scheduling delays cannot be hard-bounded by a trusted-local userspace timer;
receipts retain actual duration. Deadline and current authority are checked
after the awaited intent barrier. Reporting is durable, disables new work,
joins known local owners, and records unknown/incomplete evidence for unresolved
foreign intents rather than inventing completion.

Evidence payloads are fsynced content-addressed files. Writers hold a SQLite
write transaction while validating reuse, counting retained files and committing
a new payload; crashed partial files still count. Quota and event records live
in the task's SQLite database. Terminal metadata does not consume payload quota.
Observed/stored bytes and completeness remain separate. Immediate-parent exit
is not EOF; bounded group cleanup/drain may explicitly mark capture incomplete.
Non-child reaping is **not** claimed (`descendantsReaped: null`).

An unresolved project obligation binds even a fresh client request ID to the
original task. Permitted recovery uses the original unit plus a sequential
attempt and original remaining allowance; no caller-supplied failure class or
omitted retry linkage can authorize recovery. Project obligations are currently
conservative: **new tasks in the same state/project remain unavailable even
after closure**. Explicit successor-task/revision authorization is unfinished;
do not delete state to pretend an uncertain task was reconciled. Legacy JSON
state is rejected rather than silently migrated or replayed.

## Remaining gates

* **DEFERRED/unavailable:** adaptive Luna execution; live uv/FHS recovery;
  verified environment-handle execution/replay; model-budget accounting; JIT
  memory; remote identity providers; task revisions/successor authorization;
  automated uncertain-intent reconciliation.
* **Unavailable independently:** environment creation, locked sync, FHS entry,
  direct loader, Nix realization, downloads. Each has a distinct capability
  check, and even granted flags do not enable an unintegrated route.
* Trusted-local checks are operator-reviewed code, not sandboxed code. They can
  have host effects. Hard isolation and hostile-host filesystem/process races
  are not provided. Detached children escaping the owned process group cannot
  be certified reaped; incomplete capture is not acceptable verification.
* Legacy context/recipe/report/worker helpers are not execution or acceptance
  authority for this path. Their older audit gaps (including optional SDK model
  assertion and broad legacy schemas) remain outside the enabled boundary.
  The old `Controller.action(Recipe, CommandSpec)` API was removed; CLI demos
  and Luna smoke entrypoints reject. `markVerified` explicitly rejects UUID-only
  handle promotion.
