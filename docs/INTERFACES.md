# Two-tool contract: delegate_capsule() and yield()

**Implemented v1 contract.**

```text
Astra calls delegate_capsule({ capsule })
    -> Luna works with selected JIT + the current capsule
    -> Luna calls yield({ reason, report, JITed_history })
    -> plugin returns the handoff as the original delegate_capsule tool result
    -> Astra receives the reply in context and continues
```

These are the only two additional model-facing interfaces. They do not replace
ordinary read, shell, or editing tools. No polling, separate acceptance call, or
memory-management tool is required. Reuse an existing subagent backend and Pi
hooks as described in [PI-INTEGRATION.md](PI-INTEGRATION.md).

## 1. Model-facing payloads

```ts
/** Available to Astra. */
interface DelegateCapsuleArgs {
  /** Self-contained Markdown instructions for this delegation. */
  capsule: string;
}

/** Reusable project-local knowledge, not task authority or a transcript. */
interface JitEntry {
  /** Stable topic key, such as "project-tests" or "nix-entry". */
  topic: string;
  /** Complete replacement text for the topic's retained lesson. */
  content: string;
}

/** Available to Luna. Ends the current delegated episode. */
interface YieldArgs {
  reason: "completed" | "needs_decision" | "blocked";
  /** Markdown report for Astra's current decision. */
  report: string;
  /** Topic updates. [] means no update, not delete existing knowledge. */
  JITed_history: JitEntry[];
}
```

All fields shown are required; unknown properties reject. Keep the exact
capitalization of `JITed_history`. The JSON tool name is `yield`; implementation
functions can be named `handleYield` rather than using a language keyword.

### delegate_capsule: plain-text direction in

The capsule is one string, not a command batch or permission ledger. Astra
includes the goal, relevant context and fixed decisions, local discretion,
constraints, and yield conditions as needed. Headings are guidance, not required
schema fields. Preserve its wording; do not silently summarize or truncate it.

The plugin supplies the configured Luna model, project, ordinary tool settings,
stop limits, selected JIT content, and the child-to-parent binding. Neither model
supplies execution/session IDs, callback addresses, or history paths. The parent
call remains pending until the foreground delegation finishes; it does not
return a job ID requiring another Astra call.

### yield: terminal handoff out

| Reason | Meaning |
| --- | --- |
| `completed` | The requested result or reporting gate was reached. |
| `needs_decision` | Continuing requires Astra's judgment; the report states the question or choice. |
| `blocked` | Available information, environment, or permitted actions cannot reach the gate; the report explains the blocker. |

`completed` is not synonymous with passing tests. A task to run tests and report
their actual result can complete with a genuine failing test. Schema validity
does not establish factual correctness.

The report should state what actually ran, the observed result, verification,
changes, and unresolved issues or the next decision. Keep this as Markdown
rather than turning every heading into a mandatory field. JIT content has a
different destination: the next Luna context, not just Astra's current decision.

## 2. JIT updates and provenance

Scope entries to the current project and use `topic` as a logical key, not a
filesystem path. Each entry replaces that topic's complete retained text;
unmentioned topics remain unchanged. An empty array leaves existing JIT intact.
Reject duplicate topics within a single yield. This check belongs in the
handler; ordinary array uniqueness does not establish unique topic keys.

Each lesson should retain applicability, the useful procedure, the minimum
safety guard, and decisive verification. No new reusable lesson is a valid
outcome. Do not fill the array with a transcript, unverified conjecture, or
expired task permissions merely to produce an update.

After saving the actual raw episode, the plugin attaches its history reference
to retained entries. `raw_history` is plugin-owned provenance, not a field Luna
can invent in `yield`. Retention does not certify the lesson: it remains
worker-authored knowledge. Astra sees the update in the handoff and can direct
corrections through the next capsule. Current instructions and runtime
permissions take precedence; a saved lesson grants no additional authority.

## 3. The plugin-generated result returned to Astra

```ts
type DelegateCapsuleResult =
  | {
      status: "yielded";
      reply: YieldArgs;
      /** Absolute path to an existing readable transcript file; never transcript data. */
      raw_history: string;
    }
  | {
      status: "cancelled" | "timeout" | "error";
      /** Plugin-authored account of known observations and missing parts. */
      report: string;
      /** Absolute readable partial-transcript path, or null. */
      raw_history: string | null;
    };
```

Runtime status and Luna's reason are separate. `status: "yielded"` with
`reply.reason: "blocked"` is a valid terminal handoff. A timeout without a valid
yield is not a Luna-authored report. Use an actual absolute transcript file path
when one exists; otherwise use `null` on the failure branch, never a fabricated
path. `raw_history` is never transcript text, serialized messages, encoded
bytes, a URI, or an opaque ID. Runtime checks readability after atomic retention;
schema string validation alone is intentionally insufficient.

Automatic injection is ordinary model-visible tool-result delivery:

```ts
// In Astra's delegate_capsule.execute(), after backend terminal completion.
// `result` is the validated DelegateCapsuleResult, not the child ToolResult.
return {
  content: [{ type: "text", text: JSON.stringify(result) }],
  details: result,
};
```

Put the packet in `content`, not only `details`. Do not also call
`sendUserMessage()` or inject a second custom message containing the same reply.
Return the bounded report and JIT updates together; transcript contents remain
behind the path and are retrieved on demand through Astra's ordinary read/search
tools. Capsule never previews, reads, or injects them automatically.

These statuses are domain outcomes in the returned content; they do not by
themselves set Pi's native tool-error flag. Invalid input should use the normal
validation/tool-error path rather than being treated as a completed delegation.
On user cancellation, preserve the available outcome for normal continuation;
do not force another Astra inference against the cancellation.

## 4. Yield termination and publication

Require `yield` as Luna's sole final tool call. Reject mixed yield/work batches
instead of publishing a handoff while other work is running. The adapter must
check this boundary; a prompt instruction or `terminate` hint alone is not an
enforcement mechanism. Reject duplicate terminal yields for the same episode.

The worker handler validates and records the packet, then returns
`terminate: true`. The parent waits for the backend's terminal completion, or
for settled/idle state in a hook-based adaptation, before final publication.
Do not equate every `agent_end` event with a finished delegation. Read the
structured yield, not merely the last assistant text; missing yield is an error,
not an invitation to fabricate one from prose.

Do not forward the child's termination flag to Astra. Luna stops; Astra should
continue after receiving the original delegation result. Bind and deliver the
reply once within this invocation using the backend's existing request binding;
this does not require a new durable authorization or exactly-once system.

After terminal completion, save the raw episode including the yield, retain the
topic updates with provenance, and prepare the next Luna context. If archiving
or required persistence fails, return an honest error rather than claiming
successful reclamation or installing an untraceable JIT update. Preserve
available observations. Invalid arguments must not publish JIT or trigger
reclamation; allow ordinary correction within the remaining run limits.

The next Luna input is base instructions, selected retained JIT with references,
the next capsule, and new episode messages only. Do not prune Astra's context,
erase raw history, replay tools, or leave orphaned tool-call/result fragments.
Fresh child contexts are the first implementation path; see
[CONTEXT-LIFECYCLE.md](CONTEXT-LIFECYCLE.md) for the full lifecycle.

## 5. Schema files and defaults

| JSON Schema | Purpose |
| --- | --- |
| [delegate_capsule.schema.json](schemas/delegate_capsule.schema.json) | Astra's input parameters. |
| [yield.schema.json](schemas/yield.schema.json) | Luna's input parameters. |
| [delegate_capsule-result.schema.json](schemas/delegate_capsule-result.schema.json) | Plugin-generated return envelope; references the yield schema. |

The JSON files use draft-07. The return envelope is an internal/output schema,
not a third model-facing tool. These are documentation assets, not registered
runtime endpoints. The TypeBox parameter definitions below mirror the two input
schemas; use their plain string enum representation for the provider-facing tool.

| Value | v1 default ceiling |
| --- | --- |
| Capsule | 32,000 characters; nonblank. |
| Report | 12,000 characters; nonblank. |
| JIT updates | 8 entries; `[]` allowed. |
| Topic | 64 characters; `^[a-z0-9][a-z0-9_-]*$`. |
| Lesson content | 4,000 characters per entry; nonblank. |

These are proposed defaults, not targets or limits established by the original
proposal. Reject oversized input; do not silently truncate decisions or
verification. Schema checks establish shape, not truth, applicability, permission,
archive existence, or unique topic keys; the latter checks need ordinary handler
logic or actual evidence as applicable.

```ts
import { Type } from "typebox";
import { StringEnum } from "@earendil-works/pi-ai";

export const DelegateCapsuleParameters = Type.Object(
  {
    capsule: Type.String({
      minLength: 1,
      maxLength: 32_000,
      pattern: "\\S",
      description:
        "Self-contained Markdown instructions for Luna: the objective, " +
        "relevant decisions and context, constraints, local discretion, " +
        "and when to yield.",
    }),
  },
  { additionalProperties: false },
);

const JitEntryParameters = Type.Object(
  {
    topic: Type.String({
      minLength: 1,
      maxLength: 64,
      pattern: "^[a-z0-9][a-z0-9_-]*$",
      description:
        "Project-local knowledge key, not a file path. " +
        "Reuse an existing topic to update its lesson.",
    }),
    content: Type.String({
      minLength: 1,
      maxLength: 4_000,
      pattern: "\\S",
      description:
        "Complete replacement lesson for this topic. Include applicability, " +
        "the useful procedure, essential guard, and verification. " +
        "Exclude task-specific permission grants and raw transcripts.",
    }),
  },
  { additionalProperties: false },
);

export const YieldParameters = Type.Object(
  {
    reason: StringEnum([
      "completed",
      "needs_decision",
      "blocked",
    ] as const),
    report: Type.String({
      minLength: 1,
      maxLength: 12_000,
      pattern: "\\S",
      description:
        "Markdown report for Astra: observed result, verification, " +
        "changes, unresolved issues, and any decision needed. " +
        "Completed delegation does not imply passing checks.",
    }),
    JITed_history: Type.Array(JitEntryParameters, {
      maxItems: 8,
      description:
        "Reusable project-local topic updates. Use [] when no useful " +
        "verified lesson was learned. Omitted topics remain unchanged.",
    }),
  },
  { additionalProperties: false },
);
```

The corresponding tested implementation is `src/capsule/contracts.ts`.

## 6. Example delegation and yield

The following pair is illustrative, not a result observed in this workspace.
Astra supplies the first object to `delegate_capsule`; Luna supplies the second
to `yield` after reaching the stated gate.

```json
{
  "capsule": "## Goal\nMake the project's existing test command execute against the current workspace, then report its actual result.\n\n## Decisions and constraints\nUse the existing development setup and locked dependencies. Do not upgrade dependencies or modify application source or tests.\n\n## Local discretion\nInspect project instructions, diagnose invocation failures, and adjust the command or environment entry within those constraints.\n\n## Yield when\nThe test runner produces a genuine test result, or further progress requires a decision outside these instructions.\n\n## Report\nState what ran, what passed or failed, what changed, and what Astra needs to decide next. Retain any verified invocation lesson worth reusing."
}
```

```json
{
  "reason": "completed",
  "report": "## Result\nThe documented development shell ran the requested tests against the current workspace. The test runner reached a genuine failing test.\n\n## Verification\nInspected the test output and confirmed that this was a test failure rather than a missing executable or environment-entry failure.\n\n## Changes\nNo application source, tests, or dependency files were changed.\n\n## Next decision\nAstra should inspect the failing assertion before authorizing a semantic patch.",
  "JITed_history": [
    {
      "topic": "project-tests",
      "content": "For this project's current flake and lockfile, run `nix develop -c npm test` from the project root. Recheck this procedure when the development setup changes. Verify that the intended tests actually execute and inspect their results: successful environment entry is not a passing test suite."
    }
  ]
}
```

The decisive implementation test is two consecutive delegations: the second
Luna request contains the new capsule and retained lesson but no distinctive
old-capsule/log marker; the first raw episode is still retrievable; Astra
receives one first-delegation result. Also test schema rejection, topic update
semantics, mixed batches, malformed/missing yield, cancellation, timeout, and
archive failure. These are acceptance targets, not tests already passed.

## Basis and API references

The [original proposal](sources/ORIGINAL-PROPOSAL.txt) supplies the report/JIT
distinction and context replacement. The user's subsequent direction supplies
the two tool names and automatic return to Astra. The exact fields, reason enum,
topic-array semantics, error envelope, and size defaults are the follow-up v1
design formalization, not text quoted from the original proposal.

Pi semantics used here were checked against the installed package's
[extension reference](../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md)
and its
[structured-output example](../node_modules/@earendil-works/pi-coding-agent/examples/extensions/structured-output.ts):
`content` is model-visible, `appendEntry` is not; terminating results have
batch-wide conditions; `agent_end` and `agent_settled` differ; `context` projects
messages before a model call. See [PI-INTEGRATION.md](PI-INTEGRATION.md) for the
upstream reference links and backend compatibility caveats. No runtime feature
is enabled by writing these documents or schema files.
