# Capsule, yield, reclaim, JIT

The [original proposal](sources/ORIGINAL-PROPOSAL.txt) supplies the context-stack
example and the JIT Workflow Optimization method. The prose capsule template is
illustrative; the [v1 interfaces](INTERFACES.md) now fix the tool payloads used by
this implemented lifecycle.

## 1. Assemble the reusable context

Before a delegation, Luna needs system instructions and only the relevant JITed
knowledge. The proposal's starting stack can be represented as:

```text
system instructions
JITed history of cargo
JITed history of the project
```

Keep the JIT method available, but do not load every saved lesson or raw log.
Select knowledge by the current project and task. Load deeper material when an
actual ambiguity, failure, or uncommon branch calls for it.

## 2. Astra appends a capsule

The capsule adds temporary direction to that working context. It should be
self-contained enough that Luna does not need Astra's entire conversation.
Astra calls `delegate_capsule({ capsule })`, with the capsule as a single
plain-text or Markdown string. One possible template for that string is:

```text
Goal
  The result this delegation should establish.

Decisions and context
  What Astra has already decided, why it matters, and the relevant facts.

Local work
  What Luna may investigate or adjust without another Astra decision.

Constraints
  What must remain unchanged and what requires renewed approval.

Yield when
  The result is ready, the work is blocked, or a decision exceeds this capsule.

Return
  Findings, actions and actual results, verification, unresolved issues,
  and any useful JITed know-how.
```

This is not a command batch. Luna can select a dependent second action after
seeing the first result. Local editing is neither universally prohibited nor
universally authorized: the capsule and existing runtime permissions determine
the intended scope. New consequential decisions return to Astra.

## 3. Luna works inside the episode

Tool calls and observations accumulate after the capsule:

```text
system instructions
relevant JITed knowledge
Astra's current capsule
tool call and result
error log
failed trial
next action chosen from the observed result
...
```

Follow the proposal's JIT discipline during the work: take the smallest useful
safe action, batch independent calls, serialize real dependencies, and branch
from actual output. Waiting for a process or repeating a fixed mechanical check
does not require an Astra inference. Stop at a meaningful result or decision
boundary, not merely after an arbitrary single tool call.

## 4. Yield a report and JITed history

The report is for Astra's current decision. JITed history is for future Luna
execution. Keep the destinations distinct. Luna calls the single worker tool
`yield({ reason, report, JITed_history })` as its sole final tool call.

The report states what was attempted, what actually ran, the result of relevant
checks, what changed, and what remains unresolved. Refer to raw evidence when
detail is needed. Tool launch success is not the same as a passing source check;
an explanation of a failure is not a repair of that failure.

JITed history retains the smallest useful verified lesson, not a chronological
retelling of the episode. The v1 payload uses topic updates, each with one
complete replacement lesson. This is an illustrative payload, not an observed
workspace result:

```json
{
  "reason": "completed",
  "report": "What ran, the observed result, verification, and the next decision needed.",
  "JITed_history": [
    {
      "topic": "project-tests",
      "content": "The verified procedure, conditions where it applies, minimum guard, and decisive verification."
    }
  ]
}
```

Only the report/JITed-history distinction comes from the proposal's return
example; the reason and topic-array shape are the subsequent v1 interface design.
`completed` means the requested gate was reached, not that every check passed.
Use `needs_decision` for a question requiring Astra's judgment and `blocked` when
the gate cannot be reached with the available information or permitted actions.

Each topic update replaces that project's retained text for the topic; omitted
topics are unchanged. `JITed_history: []` means no update, not erase all history.
The plugin supplies real raw-history provenance after saving the episode; Luna
does not include a history path in `yield`. See [INTERFACES.md](INTERFACES.md) for
validation, size defaults, and the plugin-generated return envelope.

The plugin places the handoff in Astra's pending `delegate_capsule` tool result.
This automatically delivers the reply into Astra's context once; there is no
polling step or duplicate user/custom message. Bulk history stays out of the
return. `raw_history` is only an absolute path to an existing readable JSONL
transcript file. Astra can target it with
`rg -n -F -C 2 -- "failure text" "/absolute/episode.jsonl"`; Capsule does not run
that search or inject transcript content automatically.

Astra reviews the result and can correct the proposed lesson. Unverified ideas
remain explicitly uncertain or in the raw history; they are not promoted into
the common executable path as established procedures. On cancellation, failure,
or malformed return, preserve actual observations and identify missing parts
instead of fabricating a successful report.

## 5. Reclaim at the yield boundary

Save the raw episode before dropping it from active context, return the report
to Astra, and rebuild Luna's next model input from selected reusable knowledge.
For the proposal's example, the resulting stack is:

```text
system instructions
JITed history of cargo
JITed history of the project
JITed history of nix develop, with a raw_history reference
```

The old capsule, repeated errors, failed trials, and full tool transcript are
not automatically carried forward. Reclamation means removing them from future
model input, not deleting the user's files, erasing the raw archive, or merely
appending an instruction to ignore old messages. Reconstruct complete valid model
messages rather than leaving orphaned tool calls or results behind.

Unresolved task state must not vanish: Astra receives it in the report and
includes what remains relevant in the next capsule. That is different from
turning every outstanding task instruction into permanent JIT knowledge.

On the next delegation, append the new capsule to this rebuilt stack. Retrieve
the relevant part of the raw history only when needed; do not reload the entire
archive as a hidden default context source.

## What belongs in JIT content

Keep the common path in the first screen: the canonical action, minimum safety
guard, and decisive verification. Keep consecutively used commands and checks
together. Put uncommon fallbacks, long inventories, and terminology in separate
retrievable material rather than growing the hot context indefinitely. Those
are the proposal's hot-index, locality, and 80/20 principles applied to history.

A Nix lesson should preserve the procedure and conditions that were actually
verified, not promise that a saved absolute store path works forever. Failed
attempts can stay in cold history unless their failure signature is itself a
useful trigger. JIT must not guess missing context or weaken a check to shorten
the procedure.

Task authority expires with the task: a useful invocation may survive, but an
episode-specific permission to modify a file does not become a standing grant.
Likewise, saving project-local JIT content is not permission to rewrite a global
skill. A recurring verified lesson can motivate a small skill improvement when
that edit is authorized.

## Observable check

### Pi realization

Use the existing subagent task input for Astra's capsule. A worker-local
`before_agent_start` hook can add selected JIT/reference material and yield
instructions; do not inject a second copy of the capsule if it is already the
task. The `context` hook operates on outgoing messages before each model call,
not on the raw session file. Preserve the current episode's dependent tool calls
and observations while it is running.

At yield, reuse the backend's structured-result facility, or Pi's terminating
structured-output tool pattern, exposed to Luna only as `yield` with the
[specified schema](INTERFACES.md). A tool result or `agent_end` event alone is not
proof that Pi has finished all automatic continuations. Save and publish the
next JIT state only after the backend's terminal completion; a hook-based runner
uses `agent_settled` with idle/pending-work checks. Then start the next child with
selected JIT and a new capsule. This fresh-context path avoids hand-editing an
old message list in the first version.

Reject mixed yield/work batches rather than treating them as a completed
handoff. Set `terminate: true` only on Luna's yield result, never on Astra's
delegation result. Cancellation, timeout, malformed output, or archive failure
must remain visible and must not publish a successful yield or an untraceable
JIT update.

`pi.appendEntry()` persists extension metadata without adding it to model input;
injection remains a separate step. Default compaction can retain recent episode
messages, so it is not automatically equivalent to capsule reclamation. See
[Pi integration](PI-INTEGRATION.md) for source references and the optional
persistent-session variant.

### Acceptance

Inspect the actual next Luna request, not just a summary displayed in the UI.
It should contain the selected lesson and new capsule, omit the previous
capsule and noisy transcript, and retain a working route to the archived detail.
Then demonstrate that Luna reuses the lesson without skipping its guard or
verification. The [implementation slice](IMPLEMENTATION.md) makes this the
central acceptance check.
