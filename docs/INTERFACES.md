# Two tools, example-guided output, bounded execution

**Implemented contract: 14 September 2026.** See
[implementation status](IMPLEMENTATION.md).

```text
Parent agent: delegate_capsule({ capsule, output_example, timeout_s? })
Flash:  yield({ reason, result?, notes?, JITed_history })

Completed -> compact result + optional notes file path + transcript path
Failed    -> mandatory inline notes + transcript path when available
JIT       -> project-local knowledge for later Flash episodes, not the parent agent's return
```

The Pi user-selected model is the parent agent and orchestrator. This plugin never
selects or switches that parent model; Flash is configured independently. These
are the only two additional model-facing tools. Ordinary Pi tools remain
available under the configured runtime permissions. The parent call returns
once through normal tool-result context; no polling or duplicate message.

## The parent agent's input

```json
{
  "capsule": "Run npm test. Return whether the suite completed and passed. Do not modify source or tests. If the assessment cannot be completed, yield blocked instead of inventing an answer.",
  "output_example": "{\"ok\":true}",
  "timeout_s": 120
}
```

`capsule` is self-contained plain text or Markdown. It carries the objective,
relevant facts and decisions, constraints, local discretion, and yield gate.
It is not a pre-enumerated command list or a permission ledger.

`output_example` is a required nonblank **string of prompt guidance**. Preserve
it verbatim. It may contain example JSON, a sentence, or a self-explanatory
format. Do not require it to parse as JSON. The values illustrate the answer's
format, not conclusions to copy. The capsule defines what the answer means.

There is no caller-provided output schema, inferred generic type, result-shape
checker, coercion, silent field removal, or formatting-repair loop. Trust Flash
to follow the example and let the parent agent review its answer. A different JSON shape
or a text result is not a runtime error merely because the example differed.

`timeout_s` is optional, positive, finite seconds. The default is
**300 seconds**, configurable at the plugin level. An explicit per-call value
wins over the configured default. Add a separate **5-second cleanup allowance**.
Validate timer representability rather than allowing overflow or an unlimited
wait. These defaults are enforced by the current runtime.

The plugin supplies Flash's configured model, project, tools, selected JIT,
transcript locations, and parent/child binding. Do not let either model invent
callback addresses or archive paths.

## Flash's yield

```json
{
  "reason": "completed",
  "result": {"ok": false},
  "notes": "The requested suite completed with a failing assertion. No source or test files were changed. Detailed output is in the retained transcript.",
  "JITed_history": []
}
```

| Field | Fixed handoff rule |
| --- | --- |
| `reason` | Required: `completed` or `blocked`. Needing the parent agent's judgment is a blocker. |
| `result` | Any JSON value, including text. Required on a completed handoff; omit on a blocked handoff. Its internal shape is not checked against the example. |
| `notes` | Optional supplementary prose on completion; required, nonblank explanation on a blocked handoff. |
| `JITed_history` | Required array of project-local `{topic, content}` updates. `[]` means no update. Not forwarded to the parent agent. |

Only validate this small fixed envelope, JSON transportability, and the existing
JIT storage fields. Requiring a result key or blocker explanation is not a type
checker for the answer. An example mismatch must not trigger automatic repair.
Invalid tool envelopes can use normal tool-argument handling within the original
deadline; do not start a new repair workflow or reset the clock.

`completed` means the requested assessment finished, not that its answer was
positive. An established failing test can produce `result: {"ok": false}`.
An unavailable test result is `blocked`, not an invented false answer. A detail
that invalidates the answer must change the answer or status, not be buried in
an optional notes file.

A blocked yield is, for example:

```json
{
  "reason": "blocked",
  "notes": "The test command could not start because the required local service is unavailable. No test result was established. The parent agent must decide whether starting that service is within scope.",
  "JITed_history": []
}
```

## What automatically enters the parent agent's context

The paths below are illustrative, not claims that these files exist.

Completed delegation:

```json
{
  "status": "completed",
  "result": {"ok": false},
  "notes_path": "/absolute/state/episode-17/notes.md",
  "raw_history": "/absolute/state/episode-17/transcript.jsonl"
}
```

A completed result has `status`, `result`, and a retained `raw_history` path.
Save supplementary notes to a UTF-8 file and include `notes_path` only when
notes exist and were saved. Do not inline completion notes, JIT, a transcript
preview, or the backend's messages array. Omit absent optional fields rather
than requiring null placeholders.

Every non-completed return has mandatory expanded inline `notes`:

```json
{
  "status": "blocked",
  "notes": "The test command could not start because the required local service is unavailable. No test result was established. The parent agent must decide whether starting that service is within scope.",
  "raw_history": "/absolute/state/episode-18/transcript.jsonl"
}
```

```json
{
  "status": "timeout",
  "notes": "The 120-second deadline expired while the test command was running. No complete test result was established. Termination was requested, but cleanup could not be confirmed within the allowance; another delegation must not overlap unresolved work."
}
```

```json
{
  "status": "error",
  "notes": "Transcript retention failed. The delegation cannot be published as completed, no new JIT was installed, and no readable transcript path is available."
}
```

The only non-completed statuses are `blocked`, `timeout`, and `error`. They have
no `result` or `notes_path`. `notes` explains the cause, known partial outcome,
and needed action or decision directly, without requiring the parent agent to read a file.
It is actionable prose, not the entire transcript. Use Flash's explanation for
`blocked`; the plugin generates timeout/error notes from known observations
without waiting for Flash. Notes remain mandatory even when file storage fails.
An available partial transcript can be returned as `raw_history`; otherwise
omit that field. Never invent a path.

User interruption still aborts and cleans up runtime work, but is not a public
`cancelled` answer and must not force another inference by the parent agent. `needs_decision`
is merged into `blocked`. The former `yielded` / `reply` / mandatory `report`
return is superseded, not an alternate current contract.

Construct the parent envelope explicitly and serialize it into the original
tool result's `content`. Do not spread the child yield/backend result. Do not
also inject a user/custom message. Optional `details` must not become a hidden
route that forwards raw history or JIT to the parent model.

## Files and JIT remain just-in-time

`raw_history` is exclusively an absolute path to the actual retained, searchable
UTF-8 transcript. It is never file contents, encoded bytes, a URI, or an opaque
session ID. Paths must remain readable by the parent agent's ordinary tools after child
cleanup. Preserve the existing requirement that configured state stays inside
the project. Prefer existing backend/session artifacts; retain a local accessible
copy when necessary. Do not return deleted worker-temporary paths.

The parent agent may explicitly search the path, for example:

```sh
rg -n -F -C 2 -- "failure text" "/absolute/state/episode-17/transcript.jsonl"
```

The plugin does not run that search, open notes, or load a transcript by default.
No extra history-search tool is required. Preserve actual observations without
inventing missing events or adding credentials to the archive. A completed
return requires successful retention; storage failure becomes `error` with
inline notes. Preserve existing JIT when publication fails.

JIT uses project-local topic replacement: a new `{topic, content}` replaces that
topic's text, omitted topics stay unchanged, and `[]` does not erase knowledge.
Retain applicability, the useful procedure, essential guard, and verification.
The plugin attaches transcript-path provenance. JIT is worker-authored knowledge,
not certification or standing permission; do not edit global skills by default.
Publish only from a valid, timely, settled yield with retained provenance. A
blocked yield may contain a genuine verified lesson; its task remains blocked.
Timeout, runtime error, interrupted, malformed, or late yields publish no JIT.
The parent agent can inspect/correct knowledge deliberately; it is not automatically shown.

## Watchdog and terminal handling

Start one parent-owned monotonic deadline at tool entry, after basic argument
checks and before any awaited configuration, JIT load, worker setup, or dispatch.
It covers model calls, tools, retries, waiting for yield, settlement, and normal
result preparation. Progress and format corrections never reset it. Keep it
active until the normal parent result and required persistence are ready.

On expiry, choose timeout once, stop new work, request backend abort, and bound
cleanup/partial-history finalization to the separate 5-second allowance. Never
await abort(), waitForIdle(), a terminal event, disposal, or storage indefinitely.
A never-yielding worker must not keep the parent call open. Ignore late results
and fence late JIT publication; delayed callbacks must not overwrite terminal
state or release ownership of a newer episode.

Use actual backend termination of the worker and owned commands, not only a
Promise.race that leaves Flash running. If the current in-process adapter cannot
terminate uncooperative work, minimally adapt an existing terminable Pi child
runner; do not create a generalized controller or kill the parent. If cleanup
cannot be confirmed, say so inline and block overlap in the affected workspace.
The target bound is timeout_s plus cleanup allowance under a responsive parent
runtime; userspace timers are not a hard OS scheduling or sandbox guarantee.

Normal yield remains the sole final worker tool call. Reject mixed yield/work
batches and duplicate terminal publication. Wait for normal backend completion
without forwarding the worker's termination flag to the parent agent. The watchdog is an
independent exit, not another wait for settlement. Keep internal user-abort
cleanup and remove timers/listeners on every exit.

## Fixed-envelope references

The three existing [input](schemas/delegate_capsule.schema.json),
[yield](schemas/yield.schema.json), and
[parent-result](schemas/delegate_capsule-result.schema.json) schema files now
describe only the fixed transport envelopes. `result` is unconstrained JSON.
These are documentation/implementation references, not schemas requested from
the parent agent and not evidence that the runtime has been migrated.

Retain the existing capsule ceiling (32,000 characters) and JIT ceilings
(8 entries, 64-character topic matching `^[a-z0-9][a-z0-9_-]*$`, 4,000-character
lesson). Check duplicate topics in the handler. A nonblank output example need
not parse; failure notes must remain explanatory rather than being replaced
by a path. No generic Result<T> machinery is required.

The [original proposal](sources/ORIGINAL-PROPOSAL.txt) supplies the delegation,
yield, and JIT lifecycle. The latest user refinements supply example-guided
answers, asymmetric notes, simplified statuses, and an enforced timeout.
[Pi integration](PI-INTEGRATION.md) distinguishes available hooks from behavior
that still needs implementation and testing.
