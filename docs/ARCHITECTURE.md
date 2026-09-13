# Architecture: supervision through context

This is the intended design, grounded in the
[original proposal](sources/ORIGINAL-PROPOSAL.txt), not a description of the
currently enabled scripted runtime.

## The division of work

**Astra** reads the user request and relevant context, makes key decisions, and
supplies Luna with self-contained instructions. Architectural choices, important
rationale, high-quality semantic patches, and review remain Astra's focus. Astra
does not need to predict every diagnostic command before delegating.

**Luna** follows the capsule, investigates through the available tools, and
adapts its local actions to their results. It can perform reads, command tuning,
tests, and local edits when the current task and runtime permissions allow them.
It yields when the requested result is ready or further progress needs Astra's
judgment. A newly observed failure can change the next diagnostic without
changing the task's fixed decisions.

**The plugin** uses an existing subagent backend to run the delegated interaction.
Pi hooks assemble context and support the yield boundary; the plugin retains
history/JIT content and prepares the next Luna context. It does not replace Luna's
judgment about which permitted action to try with a predetermined list of operations.

## Reuse the subagent design and Pi hooks

Study Pi's shipped subagent example and existing subagent extensions before
adding orchestration code. Prefer a compatible backend's documented foreground
delegation API; do not reimplement its model loop, session transport, or ordinary
tools. The proposed first slice is one Luna delegation at a time, with a fresh
child context seeded by selected JIT content and the new capsule.

Pi's `before_agent_start` and `context` hooks provide injection and model-input
projection. Structured output provides the yield packet; settled completion
provides the point to publish JIT state. Session persistence and lifecycle hooks
support the bookkeeping. These are extension responsibilities, not a new command
controller. See [Pi integration](PI-INTEGRATION.md) for concrete references,
child-hook loading, and the difference between `agent_end` and `agent_settled`.

## Two model-facing interfaces

Astra uses `delegate_capsule({ capsule })`; Luna uses
`yield({ reason, report, JITed_history })`. The existing backend and Pi tools
remain behind these interfaces. Do not add another model-facing polling,
acceptance, or memory-management tool to complete the first loop.

The parent delegation stays pending while Luna works. After a valid yield and
backend terminal completion, the plugin returns the handoff in the original
tool result's model-visible content. That is the automatic injection into
Astra's context; do not also send it as a new user/custom message. Only the
worker's yield terminates its loop; the parent result lets Astra continue.
See [the concrete contract](INTERFACES.md) for fields, failure outcomes, and
project-local JIT replacement rules.

## One complete cycle

```text
Astra: delegate_capsule({ capsule })
                 |
                 v
Luna working context
  system instructions
  relevant JITed project / tool knowledge
  newly appended Astra capsule
                 |
                 v
Luna <-> normal Pi tools and observations
  inspect -> act -> observe -> adapt
                 |
                 v
Luna: yield({ reason, report, JITed_history })
  handoff as delegation result --> Astra reviews and decides
  raw episode -------------------> history storage
  useful JIT content ------------> next Luna context
                                         |
                           next Astra capsule is appended
```

The proposal's Nix example illustrates this cycle: an investigation accumulates
errors and failed trials; the return contains a report and distilled know-how;
the next context keeps JITed cargo, project, and Nix knowledge rather than the
whole investigation. It is an example of context management, not a mandate to
build a specialized environment-recovery engine first.

## A capsule is temporary direction

A capsule carries the objective, decisions, constraints, useful task context,
and the point at which Luna should yield. Keep it stable during the delegated
episode; Astra can replace it at the next handoff. This is a conversational
contract, not a requirement for cryptographic capsule identities, operator grant
tables, or a new command language.

Prompt guidance is not hard security enforcement. The model still uses the
runtime's real tool permissions. Neither a capsule nor a learned JIT entry can
create permission the user or runtime did not grant. Tool output is evidence to
interpret, not a new instruction source that overrides the capsule.

Verification remains concrete: preserve what tools actually returned, distinguish
what ran from what passed, and let Astra check the report against the request.
A concise return must not conceal a failing test, an incomplete check, or an
unapproved change. A separate generalized verifier service is not a prerequisite
for that discipline.

## Rebuilt context, not necessarily a new process

The logical Luna role continues across handoffs while its working context changes.
A fresh process is not the defining abstraction. Start by reusing a backend's
fresh-context child sessions, carrying only selected JIT content across them.
If persistent child sessions are later useful, Pi's `context` hook can project
the active episode without deleting archived history. Do not build both variants
for the first demonstration. The hook contracts have been inspected; the full
backend integration and actual outgoing model input still need testing.

The observable requirement is the same in either case: after yield, the old
capsule and noisy episode messages do not enter the next Luna model request;
selected JIT content and the next capsule do. A new session that copies the
entire old transcript has not reclaimed anything. An unchanged session with an
extra "ignore the above" message has not reclaimed anything either.

Do not reset or compact Astra's own conversation as a side effect of this
worker-context lifecycle. Rebuilding context also does not mean replaying tools
or undoing their effects.

## Keep orchestration thin

Use an existing subagent design for delegation and Pi for model interaction and
ordinary tool execution. Add only the handoff, context hooks, yield handling, and
history/JIT bookkeeping needed for the loop.
Basic stop limits, cancellation, and honest partial returns belong in that glue;
distributed ownership, automatic routing, recursive delegation, and a general
memory platform do not need to precede it.

The existing controller may remain as a separate scripted implementation. Its
operation registry and durable state machine are not the definition of a capsule
and should not dictate how the new context-first path represents an investigation.
See the [implementation plan](IMPLEMENTATION.md) for the transition boundary.
