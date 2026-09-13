# Pi Capsule — context-first documentation

**Current implementation: 14 September 2026.** The workspace contains the
context-first Capsule implementation with the refined fixed envelopes, retained
artifacts, internal JIT, and bounded parent-owned watchdog.

| Read | Purpose |
| --- | --- |
| [Interfaces](INTERFACES.md) | Example-guided output, asymmetric notes, path-only history, and explicit timeout. |
| [Implementation prompt](IMPLEMENTATION-PROMPT.md) | Self-contained instructions to refine the existing implementation. |
| [Implementation status](IMPLEMENTATION.md) | Implemented behavior, automated checks, and remaining live-test limits. |
| [Architecture](ARCHITECTURE.md) | Flagship, Flash, the thin plugin, and the different destinations for outputs. |
| [Context lifecycle](CONTEXT-LIFECYCLE.md) | Injection, adaptive work, yield, JIT publication, and next-episode input. |
| [Pi integration](PI-INTEGRATION.md) | Existing backend, local Pi references, hooks, and timeout limits. |
| [Original proposal](sources/ORIGINAL-PROPOSAL.txt) | User-supplied proposal and JIT method, preserved unchanged. |

## Authority and scope

The original proposal supplies the division of work and context lifecycle.
Subsequent user refinements supply two tool names, an output example rather than
a formal answer schema, file-backed successful notes, mandatory inline failure
notes, and an enforced timeout. The defaults and fixed envelopes in
[INTERFACES.md](INTERFACES.md) formalize that direction; they are not quotations
from the original proposal.

Flagship gives temporary direction and reviews the answer. Flash chooses useful
permitted actions from observations. The plugin uses ordinary Pi/subagent
execution and owns context selection, handoff delivery, storage, and watchdogs.
It does not need a new command registry, authorization ledger, output type
checker, or general memory service.

Keep completion small: result and file paths. Make failure intelligible: inline
notes explaining the blocker, partial outcome, and next action. Keep transcript
and successful supplementary notes cold until requested. Keep JIT hot only when
relevant to the next Flash episode. Neither JIT nor an output example is authority
to weaken checks, guess results, or retain expired task permissions.

## Preserved history

The former docs are in [archive/](../archive/README.md), and prior execution
records remain in [audit/](../audit/). Archived paths may describe the old layout.
Those specifications are historical, not requirements for this refinement.
The original proposal and prior execution evidence remain unchanged. Current
automated and live-test coverage is recorded in [implementation status](IMPLEMENTATION.md).
