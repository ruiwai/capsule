# Reuse subagents; implement the context lifecycle with Pi hooks

**Implemented against `@earendil-works/pi-coding-agent` 0.85.1.**

The [original proposal](sources/ORIGINAL-PROPOSAL.txt) defines what survives a
handoff: a report for Astra, useful JITed history for Luna, and a raw-history
reference. Existing subagent designs supply the delegation machinery. Capsule
should add that context lifecycle, not another execution controller.

The model-facing names and payloads are fixed in
[INTERFACES.md](INTERFACES.md): Astra gets `delegate_capsule({ capsule })` and
Luna gets `yield({ reason, report, JITed_history })`. Backend dispatch/result
interfaces are implementation details, not additional tools the models need.

## Existing designs to reuse

| Reference | Useful part for Capsule |
| --- | --- |
| [Pi's official subagent example][subagent] | A small reference for agent definitions, child dispatch, streamed progress, usage, and cancellation. Included in the installed package. |
| [nicobailon/pi-subagents][subagents] | Reusable foreground child sessions, result/artifact handling, and a documented [structured delegation API][delegation] for other extensions. |
| [mjakl/pi-subagent][mjakl] | A reference for fresh or named persistent child contexts, headless RPC, and settlement-aware completion. |
| [Pi's structured-output example][structured] | A final structured tool result that can end the worker loop without a redundant follow-up model response. |

The implementation selects one backend: an in-process foreground adaptation of
Pi 0.85.1's shipped SDK subagent example (`PiSdkBackend`). It uses
`createAgentSession`, a fresh persisted `SessionManager`, and a worker-local
inline extension. No second backend or subagent dependency was added.

The inspected `pi-subagents` API exposes `pi-subagents/delegation` and request,
progress, response, and cancellation events for a configured foreground agent.
Use fresh context and the explicit structured yield containing `reason`, `report`,
and `JITed_history`; correlate the documented request identity and await its terminal
response. Its separate event-bus RPC `spawn` is async-only, not this foreground
interface. Use public surfaces rather than importing executor internals or
recursively invoking `subagent` from a `tool_call` hook. [Source: delegation API][delegation]

Reuse the structured-result mechanism, but expose it under the one worker tool
name `yield` and the agreed schema. Check that the chosen backend supports this
adaptation; do not expose a second generic structured-output tool or silently
change the contract to fit backend defaults. This compatibility is still to be
tested, not a claim made by the API inspection.

The selected Pi dependency is pinned to 0.85.1 in the package and lock files.
The current `pi-subagents` docs also restrict foreground agents needing direct
MCP or extension-provided models to the background route. Do not silently switch
model or execution mode; choose a supported Luna configuration or the alternate
reference design. [Source: agent/tool loading][agents]

## Loading the implemented backend

```sh
export CAPSULE_LUNA_MODEL='provider/model-id'
export CAPSULE_LUNA_TOOLS='read,bash,edit,write' # optional
pi --extension /absolute/path/to/capsule/src/extension/index.ts
```

The model variable is mandatory and resolved through Pi's model registry; Luna
never silently inherits Astra's model. Provider credentials remain in normal Pi
configuration and are not copied to transcripts. The automated suite exercises
the extension registration and backend/service boundary. A live two-episode
smoke test also passed with `openai-codex/gpt-5.6-sol` as Astra and
`openai-codex/gpt-5.6-luna` as Luna.

## Hook map

These surfaces were checked in the installed
`@earendil-works/pi-coding-agent` **0.85.1** documentation, examples, and type
declarations. The [public extension reference][extensions] describes the same
contracts. This verifies availability, not the complete Capsule behavior.

| Surface | Capsule responsibility |
| --- | --- |
| `pi.registerTool()` | Register parent `delegate_capsule` and worker `yield` in their respective runtimes, not a new command API. |
| Worker `before_agent_start` | Add selected JIT/reference context and yield guidance. The capsule can already be the child task; avoid injecting it twice. |
| Worker `context` | Project messages before each model call without deleting raw history. Preserve current-episode observations; exclude reclaimed episodes when reusing a session. |
| Structured result / `terminate: true` | Capture `reason`, report, and JIT at Luna's `yield`. Terminate only the worker; the parent delegation result must let Astra continue. |
| `agent_settled` / backend terminal response | Publish completed episode state only after automatic continuations have ended. |
| `pi.appendEntry()` and `session_start` | Save and restore small extension-local metadata. These entries are not model context. |
| `session_shutdown` and cancellation signal | Release listeners, stop owned work through the backend, and retain honest partial state. |
| `session_before_compact` | Optional customization for a persistent worker; not a prerequisite for the fresh-context first slice. |

Hooks belong to a specific runtime. Register the capsule worker extension in
Luna's child, not only in Astra's parent. `pi-subagents` provides explicit child
extension configuration; foreground children do not load ambient parent
extensions. An SDK-based adaptation can use `DefaultResourceLoader`'s
`extensionFactories` or `additionalExtensionPaths`. Check the resulting resource
set rather than assuming parent settings carried over. Pi's event bus is not
cross-process transport. [Sources: child loading][agents], [Pi SDK][sdk]

## The small implementation

```text
Astra calls delegate_capsule({ capsule })
    -> existing subagent backend starts Luna with fresh context
    -> worker hook adds selected JIT and yield guidance
    -> Pi runs Luna's ordinary adaptive tool loop
    -> Luna calls yield({ reason, report, JITed_history })
    -> backend returns its terminal result to the parent wrapper
    -> wrapper retains history/JIT and returns one model-visible tool result
    -> next delegation starts from selected JIT + the next capsule
```

The wrapper needs only the current episode input, selected JIT entries, a saved
history locator, and the pending return. Small local files and Pi session entries
are enough. Existing Pi/subagent code owns model requests and ordinary tools;
Capsule owns what context is supplied and what reusable lesson is retained.

Configure Luna explicitly. The official subagent example otherwise inherits the
dispatching model when the agent has no model configured. Do not accidentally
delegate back to Astra at Astra's cost. Keep normal runtime permissions and
project trust; JIT text and capsule wording are not a sandbox. [Source: subagent example][subagent]

If adapting that example, change its `--no-session` behavior: retain a Pi session
or save the actual event history before disposing the child. Reuse a backend's
existing transcript artifacts where available; never manufacture a history path.
Return bounded report text to Astra and keep bulky history out of its model input.

Automatic injection is the normal `delegate_capsule` result: serialize the
[result envelope](INTERFACES.md) into the returned `content`, with `details` for
rendering/state as useful. Do not put the only copy in `details`, and do not
duplicate the result with `sendUserMessage()` or another custom message.
`pi.appendEntry()` alone is not model-visible delivery. On user cancellation,
preserve the partial outcome without forcing Astra to run again.

## Two lifecycle distinctions that matter

**Yield is structured completion, not any end event.** Pi's `agent_end` can be
followed by retry, compaction, or queued follow-up work. A hook-based adaptation
checks `agent_settled`, current idleness, pending work, and a valid saved yield
packet. A reused backend's terminal response is the parent wrapper's completion
boundary. A cancelled or failed run must not publish an unverified lesson as a
successful result. [Source: extension lifecycle][extensions]

Pi's terminating-tool pattern is suitable for the yield packet. Termination
only takes effect when every finalized result in the tool batch is terminating;
require Luna to yield as its sole final tool call and reject a mixed yield/work
batch. Do not rely on the termination hint to enforce this contract. Read the structured tool result,
not just the last assistant text. Do not abort from a normal yield merely to
simulate success. Do not forward `terminate: true` from Luna's result into
Astra's wrapper result. [Sources: tool semantics][extensions], [structured output][structured]

**Reclamation is model-input selection, not ordinary compaction.** The first
version starts the next child with selected JIT and no old transcript. This can
reuse in-process child sessions; it does not require a new process hierarchy.
If persistent sessions are added, use episode boundaries to project an intact
current conversation through `context`; do not filter messages by matching words
or drop tool results independently of their calls.

Default Pi compaction retains a recent tail. Supplying a JIT summary alone does
not prove the old capsule is gone. A persistent variant must account for
compaction summaries and retained messages and test the actual outgoing input.
Keep active-task instructions during mid-episode compaction; discard them only
at the completed yield boundary. Do not call command-only session-switch APIs
from tool/event handlers or switch Astra's session. [Sources: compaction][compaction], [extension contexts][extensions]

## What to prove first

Run two small delegations. The second model input must include a useful verified
lesson and a new capsule, omit a distinctive old-capsule/log marker, and still
allow retrieval of the archived first episode. Verify the child hook actually
ran, the effective model is Luna, current tool observations were preserved, and
Astra received one terminal report. Include cancellation and malformed-yield
cases. This is the [implementation slice](IMPLEMENTATION.md), not a new ledger,
recipe registry, automatic router, or general memory service.

## Source scope

The user proposal supplies the product lifecycle. The links below supply
reference implementations and API facts; choosing which parts to reuse is the
design recommendation above. Upstream pages were read on 13 September 2026.
Locally inspected files, relative to
`node_modules/@earendil-works/pi-coding-agent/`, were `docs/extensions.md`,
`docs/sdk.md`, `examples/extensions/subagent/{README.md,index.ts}`,
`examples/extensions/structured-output.ts`, and
`dist/core/{extensions/types.d.ts,resource-loader.d.ts}`. No provider request,
dependency installation, or runtime integration test was performed.

[subagent]: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent
[subagents]: https://github.com/nicobailon/pi-subagents
[delegation]: https://github.com/nicobailon/pi-subagents/blob/main/docs/extension-api.md
[agents]: https://github.com/nicobailon/pi-subagents/blob/main/docs/agents.md
[mjakl]: https://github.com/mjakl/pi-subagent
[structured]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/structured-output.ts
[extensions]: https://pi.dev/docs/latest/extensions
[sdk]: https://pi.dev/docs/latest/sdk
[compaction]: https://pi.dev/docs/latest/compaction
