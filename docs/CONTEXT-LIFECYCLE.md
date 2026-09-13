# Capsule, example, yield, reclaim, JIT

This is the implemented refined lifecycle. The
[original proposal](sources/ORIGINAL-PROPOSAL.txt) supplies the JIT method and
context-stack example; [INTERFACES.md](INTERFACES.md) supplies the latest payloads.

## 1. Select reusable knowledge

Start Luna with base instructions and relevant project/tool lessons, including
provenance paths. Do not load every saved lesson or raw log. Keep the common
executable path, minimum guard, and decisive verification visible; retrieve
uncommon branches and history only when actual evidence calls for them.

## 2. Append current direction and answer guidance

Astra calls `delegate_capsule({ capsule, output_example, timeout_s? })`.
Preserve both text fields. The capsule carries the current goal, decisions,
constraints, local discretion, and yield gate. The example illustrates only the
answer format; it need not parse as JSON and does not dictate the answer's value.

The child context is:

```text
base instructions and ordinary configured tools
selected JIT lessons with transcript-path provenance
current Astra capsule
current output example
current episode's tool calls and observations
```

Supply capsule and example once, not once per tool result. Do not append Astra's
entire conversation or make old answer examples permanent JIT. A parent-owned
watchdog is already running before awaited setup begins.

## 3. Investigate adaptively

Luna chooses the next useful permitted action from actual results. Batch
independent work; serialize real dependencies. Current tool observations remain
in this episode's model input. No Astra inference is needed merely to wait on a
command, retry an allowed invocation, or read dependent output.

The output example does not weaken verification. If a requested assessment
finishes with a negative result, return that result. If it cannot be established,
yield blocked with an explanation rather than guessing or hiding the limitation
in a successful attachment.

## 4. Yield; route each part to the right place

Luna's sole final tool call is `yield`. It carries `reason`, arbitrary JSON
`result` on completion, optional supplementary `notes`, and `JITed_history`.
A blocked yield instead requires explanatory notes and no invented result.

| Part | Destination |
| --- | --- |
| Completed `result` | Astra's original delegation tool result, unchanged. |
| Completed supplementary `notes` | Retained UTF-8 file; only `notes_path` enters Astra's context. |
| Blocked explanation | Mandatory inline `notes` in Astra's return. |
| Runtime timeout/error explanation | Mandatory inline plugin-generated `notes`, even when storage fails. |
| Raw episode | Retained transcript; only its actual absolute path is returned. |
| JIT updates | Project-local knowledge for later Luna input, not the parent return. |

The plugin checks the fixed handoff envelope, not the result's shape against the
example. Do not add an output-schema validator or a format-repair loop. Current
Pi/backend tools still handle invalid fixed arguments within the original limit.

Save actual history, wait for normal terminal completion, and explicitly build
one parent result. Do not spread the worker packet or duplicate it with a new
message. The worker's termination flag must not stop Astra's continuation.

## 5. Retain useful JIT and reclaim the episode

JIT entries are `{topic, content}`. Each update replaces that project's retained
text for its topic; omitted topics stay unchanged and `[]` makes no changes.
The plugin attaches a genuine saved transcript path. A useful verified lesson
may come from a valid blocked handoff without turning the task into a success.
Never publish JIT from a timeout, interrupted run, runtime error, malformed
handoff, or late yield. Preserve earlier knowledge on storage failure.

A lesson is the minimal reusable procedure, not the whole transcript. Keep
applicability, safety guard, and verification. Do not turn expired task permission
into a standing grant, copy stale absolute environment paths as universal advice,
or rewrite global skills without authorization. Astra can inspect knowledge
on demand or ask Luna to correct a topic in a later capsule.

The next delegation receives:

```text
base instructions
selected retained JIT, including the useful new lesson
new capsule
new output example
new episode messages only
```

The old capsule, old output example, successful notes, repeated errors, and raw
transcript do not enter by default. Reclamation removes them from model input,
not from the saved archive. It never resets Astra's conversation, undoes work,
or leaves orphaned tool calls/results in a reconstructed message list.

## 6. Timeout is not a cooperative yield

Use a fixed deadline through normal return readiness, default 300 seconds plus
5 seconds for cleanup. A per-call `timeout_s` overrides the working deadline.
Setup, retries, progress, yield receipt, and settlement must not escape/reset it.

If Luna never yields, abort the backend and bound cleanup/retention without
waiting indefinitely for worker idleness. Return `timeout` with inline notes,
not a guessed result. Include available partial-history paths only when real.
Reject late result/JIT publication. If termination is unconfirmed, explain it
and stop subsequent same-workspace delegation from overlapping that work.
Internal user interruption still performs cleanup without forcing an Astra turn.

See [interfaces](INTERFACES.md) for field rules and
[implementation prompt](IMPLEMENTATION-PROMPT.md) for timeout tests.

## Observable checks

Inspect actual outgoing model input and parent tool content, not just a displayed
summary. Episode two must have the new example and useful lesson, but no old
capsule/log markers. Successful notes, raw-only output, and JIT-only text must
remain absent from Astra's automatic return, while their files stay retrievable.
Every non-completed return must explain itself inline. A never-yielding worker
must release the parent within the working and cleanup budgets under the supported
runtime conditions, without silently leaving overlapping work running.
