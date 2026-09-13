# Existing Pi integration

**Implemented 14 September 2026:** the workspace has an in-process foreground
`PiSdkBackend` using the pinned `@earendil-works/pi-coding-agent` 0.85.1 package.
The updated [interface](INTERFACES.md) and parent watchdog are implemented.
Automated tests use controlled backends; no new live-provider claim is made.

## Existing integration and reuse

[backend.ts](../src/capsule/backend.ts) creates a fresh SDK session and a
worker-local inline extension. [service.ts](../src/capsule/service.ts) retains
actual events and project-local JIT. The
[parent extension](../src/extension/index.ts) registers `delegate_capsule` and
returns model-visible content. Keep this small structure where it fits.

The original design references remain useful:

| Reference | Reuse rather than reinvent |
| --- | --- |
| [Pi's shipped subagent example][subagent] | Child dispatch, ordinary tools, progress, and cancellation. |
| [Pi's structured-output example][structured] | A final tool result that ends the worker loop. |
| [nicobailon/pi-subagents][subagents] | Alternative public foreground delegation and artifact design. |
| [mjakl/pi-subagent][mjakl] | Alternative child-session and completion design. |

The latter packages are design references, not selected dependencies. Do not
switch backend merely to follow an obsolete preferred-package recommendation.
If the existing in-process adapter cannot provide effective bounded termination,
adapt a small existing terminable child runner, preserving licenses and Pi's
model/tool machinery. Do not build multiple backends or use an async-only route
that makes Flagship poll for this foreground return. Pin and test any actual change.

## Hook and boundary map

| Existing surface / boundary | Refined responsibility |
| --- | --- |
| Parent `delegate_capsule` | Accept capsule, output example, and optional timeout; start parent supervision before awaited setup. |
| Worker `before_agent_start` | Add selected JIT, unchanged output-example guidance, and yield instructions without duplicating the capsule. |
| Worker `yield` | Capture completed/blocked handoff. `result` is arbitrary JSON; only the fixed envelope is checked. |
| Worker terminating result | End Flash only; do not forward its termination flag to Flagship. |
| Backend completion / settlement | Finalize normal yield once; not a reason to wait past the independent deadline. |
| Parent tool `content` | Completed answer plus paths, or mandatory inline failure notes. No full yield/backend forwarding. |
| Transcript and JIT storage | Retain searchable files and project lessons separately from Flagship's input. |
| Runtime abort / shutdown | Stop worker activity and clean up through bounded backend mechanisms. |
| Fresh session / optional `context` hook | Retain current observations; exclude old episode material from future input. |

The installed [extension documentation](../node_modules/@earendil-works/pi-coding-agent/docs/extensions.md),
[SDK guide](../node_modules/@earendil-works/pi-coding-agent/docs/sdk.md), and
[structured-output example](../node_modules/@earendil-works/pi-coding-agent/examples/extensions/structured-output.ts)
are the local API references. Verify integration against the installed types
when changing code, rather than assuming public latest documentation is pinned.

Hooks must run inside Flash, not just Flagship. The project settings default Flagship
to `openai-codex/gpt-6-astra`; the adapter defaults Flash to
`openai-codex/gpt-5.6-luna`, with `CAPSULE_FLASH_MODEL` as an explicit override.
Keep the configured model selection explicit,
exclude the parent's delegation tool from the worker, and keep provider
credentials in normal Pi configuration. Preserve existing runtime permissions.
No task text or learned lesson is a security sandbox.

## Normal yield versus timeout

Pi's existing terminating-tool pattern has batch-wide conditions. Require a sole
final yield and reject mixed work/yield before publishing. Normal completion
must account for automatic continuation rather than treating any low-level end
as final. Read the actual structured tool handoff, not guessed last-message JSON.

The service supervises one fixed deadline from parent entry through setup,
worker settlement, retention, and JIT publication. The backend races setup,
prompt, and idleness against cancellation and bounds SDK abort by the cleanup
allowance. Partial retention and cleanup are separately bounded.

Expiry must choose timeout immediately and bound abort, termination, disposal,
and partial retention to the cleanup allowance. Never depend on a cooperative
yield or terminal event after expiry. Protect result/JIT publication from late
callbacks. A hung operation inside the parent's event loop cannot be forcibly
stopped by a timer on that same loop; choose a suitable execution boundary if
needed, without calling it an OS sandbox or promising hard scheduling bounds.

## Input and return economy

Use one output example string in worker context; do not dynamically build a
result schema or validate the answer against the example. Reuse basic fixed tool
schemas only. The parent's result must be constructed from approved fields, not
by spreading the worker response.

On completion save supplementary notes to a file and return its path. On every
blocked/timeout/error return put the explanation inline, even if file storage
fails. Keep `raw_history` path-only, and keep JIT updates internal. `content` is
the normal delivery route; do not also send another user/custom message. User
interruption still cleans up but never forces a new Flagship turn or adds a public
cancellation status.

## Source scope

The original proposal defines the product lifecycle; current code establishes
what exists; the recent user refinements define what changes next. Upstream
links below are retained references, not freshly verified compatibility claims.
Prior docs reported a live two-episode run under the old contract. This pass did
not rerun it, and it does not prove the revised output or timeout behavior.

[subagent]: https://github.com/earendil-works/pi/tree/main/packages/coding-agent/examples/extensions/subagent
[structured]: https://github.com/earendil-works/pi/blob/main/packages/coding-agent/examples/extensions/structured-output.ts
[subagents]: https://github.com/nicobailon/pi-subagents
[mjakl]: https://github.com/mjakl/pi-subagent
