# Agent prompt: refine the existing Capsule implementation

Implement these refinements in /home/hilaolu/capsule. This is a code-and-test
task, not another design proposal. A context-first implementation already exists;
refine it in place rather than rebuilding it or adding another controller.

## Read and preserve

Read applicable repository instructions, git status, docs/INTERFACES.md,
docs/IMPLEMENTATION.md, docs/PI-INTEGRATION.md, and docs/CONTEXT-LIFECYCLE.md.
Inspect src/capsule/{contracts,backend,service}.ts, src/extension/index.ts, and
tests/capsule.test.ts. Treat current docs as the refinement target; do not assume
the existing code already matches them. Archived specs are historical.

Preserve unrelated working-tree changes, original proposal, archives, audit
evidence, and existing runtime data. Preserve the current in-project state-root
containment and child-hook checks. Do not reset, clean, stage, or commit. Keep
the legacy scripted path separate; do not weaken it or route this work through
its command registry. Reuse the existing Pi SDK/subagent integration and hooks.

## Exact small interface

Astra's only additional tool:

    delegate_capsule({
      capsule: string,
      output_example: string,
      timeout_s?: number
    })

For example:

    {
      "capsule": "Run npm test. Return whether the suite completed and passed. Do not change source or tests. Yield blocked if no result can be established.",
      "output_example": "{\"ok\":true}",
      "timeout_s": 120
    }

output_example is nonblank text guidance, not a formal schema. It may contain
example JSON or plain text. Preserve it unchanged and tell Luna that example
values illustrate format, not the required answer. Do not parse/compile it,
infer types, validate the answer against it, coerce values, strip answer fields,
or add an output-format repair loop. Trust Luna's result; Astra reviews it.

Luna's only additional handoff tool:

    yield({
      reason: "completed" | "blocked",
      result?: any JSON value,
      notes?: string,
      JITed_history: [{ topic: string, content: string }]
    })

Require result on completed handoffs, but do not constrain its internal shape.
Require nonblank notes and omit result on blocked handoffs. Needing Astra's
judgment is blocked. [] is valid JIT. Validate only the fixed tool envelope and
existing JIT storage rules; do not introduce generic Result<T>/Option<T> machinery.
Keep normal tools available under runtime permissions and prevent recursion.

## Asymmetric parent return

Completed:

    {
      "status": "completed",
      "result": {"ok": false},
      "notes_path": "/absolute/episode/notes.md",
      "raw_history": "/absolute/episode/transcript.jsonl"
    }

result is passed through unchanged. Save optional supplementary notes to a
UTF-8 file; omit notes_path when absent. raw_history is the actual retained
transcript path, required on completion. No inline successful notes or JIT.

Every non-completed branch:

    {
      "status": "blocked" | "timeout" | "error",
      "notes": "Mandatory inline explanation of the cause, known partial outcome, and next action or decision.",
      "raw_history": "/absolute/episode/transcript.jsonl"
    }

Failure notes are required, nonblank, and directly model-visible. Never replace
them with notes_path. Omit result and notes_path on these branches. raw_history
is optional when no readable partial transcript exists; do not use null padding
or invent a path. Blocked uses Luna's notes; timeout/error use plugin-authored
observations without waiting for Luna. Even archive failure must return notes.

A completed {"ok":false} is an established negative answer, not a failed
invocation. A timeout or blocker must not invent false as the answer.
Remove the old report/reply/yielded envelope and public needs_decision/cancelled
statuses. Preserve internal user-abort cleanup without forcing an Astra turn.

Explicitly construct the small parent result in the original delegate_capsule
result's content, not only UI details. Never spread the entire worker/backend
response. Deliver once, without polling, a separate receive tool, or a duplicate
sendUserMessage/custom message. Do not copy the child's termination flag upward.

## Files, JIT, and reclaimed context

Both paths are absolute, plugin-generated, readable by Astra after child cleanup,
and contain paths only, never bytes, encoded content, previews, or opaque IDs.
Reuse real transcript artifacts or retain an accessible copy. Astra can search
history with ordinary tools on demand. Do not automatically open attachments.
Keep success-note, transcript-only, and JIT-only content out of parent context.

Retain project-local JIT topic replacement: topic updates replace that topic,
omitted topics remain unchanged, and [] leaves knowledge intact. Attach real
transcript provenance. Keep lessons, guards, and verification, not expired
permissions. Do not automatically edit global skills. JIT is retained for Luna,
not forwarded to Astra. Publish only from valid, timely, settled yields with
retained provenance; a genuine lesson from a blocked handoff is allowed without
claiming task success. Timeout, error, interruption, or late/malformed yield
publishes no JIT. Preserve prior knowledge on storage failures.

Each new worker context contains selected JIT plus the new capsule and output
example, not the previous capsule/example/transcript. Preserve current-episode
observations and leave Astra's own session untouched. Keep existing child hooks
and one active delegation; do not build a general memory or routing framework.

## Real timeout, including cleanup

Add a parent-owned monotonic watchdog before any awaited setup/dispatch. Use
one fixed deadline through normal result readiness, not only the prompt call.
Default: 300 seconds. A positive finite per-call timeout_s overrides the plugin
default. If retaining CAPSULE_LUNA_TIMEOUT_MS, precedence is per-call seconds >
configured default milliseconds > 300000 ms. Convert once, validate timer range,
and do not cache an earlier call's timeout. Add a separate 5-second cleanup budget.

The inspected code has specific gaps: backend setup precedes its timer; its
timeout resolves only after session.abort().finally(...); it then awaits
waitForIdle(); service retention/JIT writes are outside that timer. Fix these
waits rather than merely renaming the existing timeout.

On expiry choose timeout once, stop new work, request backend abort, and bound
termination/disposal/partial retention to cleanup time. Never await a yield,
abort promise, idle/settled event, or I/O forever. Progress and yield receipt do
not reset/disable the deadline before return readiness. Ignore late results and
prevent late JIT publication, duplicate parent injection, or a stale callback
releasing a newer active owner. Clean up timers/listeners on every exit.

A Promise.race that returns while Luna keeps executing is not sufficient. Use
actual backend worker/owned-command termination. If the in-process adapter cannot
stop uncooperative work, make the smallest adaptation of an existing terminable
Pi child runner; reuse Pi model/tool machinery and licenses, not a new controller.
Keep the parent responsive. Report unconfirmed cleanup inline and block overlap
in that workspace. Do not kill unrelated processes or claim hard OS/sandbox
bounds that userspace timers cannot provide.

## Tests and completion

Update tests and add fault injection for:
- JSON-like and plain-text output examples; deliberately different JSON/text
  answers are passed through without schema inference, coercion, or repair.
- Completed true/false vs blocked with mandatory notes; every timeout/error has
  inline notes even when all storage fails. Old public envelopes are rejected.
- Path-only completion: notes/transcript files survive child exit and targeted
  search works; successful notes and JIT/raw-only markers stay out of parent input.
- Two delegations: new example/capsule plus retained lesson, no previous
  example/capsule/noise; ordinary observations and Astra's context survive.
- Normal early yield; never-yielding worker; hung setup/tool; abort that never
  resolves; stuck idle/settlement; hanging archive/JIT I/O; late yield after expiry.
  Check bounded return, actual stop or honest cleanup limitation, no late JIT,
  no overlap, and exactly one parent delivery.
- Parent/child registration, sole-final yield, mixed yield/work rejection,
  worker-only termination, internal interruption, and preserved old JIT on failure.

Use short test budgets and real hook/adapter boundaries where practical. Do not
claim that a cooperative fake backend proves effective SDK termination. Run
build, Capsule tests, full repository tests, and legacy acceptance in the declared
development environment; distinguish automated evidence from any live model run.
Do not silently change the configured Luna provider or install unrelated tools.

Update active docs, fixed-envelope schema references, examples, and setup notes
to match the actual implementation. The JSON references describe envelopes only,
not caller answer schemas. Finish with changed files, exact commands/results,
remaining limitations, and live behavior not exercised. Do not stage or commit.

Implement the refinements now; do not substitute another planning document.
