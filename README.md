# Pi Capsule

**The Pi-selected parent agent makes the key decisions. Flash handles the tool loop. Useful know-how survives.**

Pi Capsule is a context-engineering extension for supervised delegation in Pi.
The Pi-selected parent agent supplies temporary direction and an example of the answer it needs. Flash
investigates adaptively, yields, and leaves useful project-local JIT knowledge
for the next delegation. Detailed history stays retrievable, not compulsory
context on every turn. The [original proposal](docs/sources/ORIGINAL-PROPOSAL.txt)
provides the context-injection, yield, and JIT lifecycle.

**Status, 14 September 2026:** `src/capsule/` implements the refined
example-guided contract, asymmetric parent return, retained artifacts, internal
JIT, and parent-owned watchdog described below. See
[implementation status](docs/IMPLEMENTATION.md).

## Two tools, a small answer

In Pi's TUI, `delegate_capsule` uses a compact custom renderer: the call shows a bounded Markdown capsule preview, Flash model, and optional timeout; results show the meaningful answer or inline failure notes. Expand a result to see retained notes/history paths (never their contents). The model-facing JSON content contract is unchanged.

Parent agent call:

```json
{
  "capsule": "Run npm test and report whether it completed and passed. Do not change source or tests. Yield blocked if the result cannot be established.",
  "output_example": "{\"ok\":true}",
  "timeout_s": 120
}
```

Flash calls `yield({ reason, result?, notes?, JITed_history })`. The output example
is text guidance, not a schema or literal answer. Trust Flash's answer; do not
compile a type checker or add a formatting-repair loop.

| Outcome | What the parent agent receives automatically |
| --- | --- |
| `completed` | The compact result, optional supplementary-notes file path, and retained transcript path. |
| `blocked`, `timeout`, `error` | Mandatory inline explanatory `notes`, plus a transcript path when available. |

A completed `{"ok":false}` is a negative answer, not a failed delegation.
Needing the parent agent's judgment is `blocked`. Runtime interruption remains internal.
The parent result is delivered once through the original tool call, without
polling or another injected message. Only Flash's yield terminates the worker.

`raw_history` is an absolute readable transcript **path**, never its contents.
The parent agent reads successful notes or searches the transcript only when needed.
JIT updates remain in project-local storage for later Flash context; they are
not automatically forwarded to the parent agent.

## Bounded work and reclaimed context

Use a parent-owned deadline: default 300 seconds, optional per-call override,
and a separate 5-second cleanup allowance. It must cover startup through normal
result preparation, not just the model prompt. Expiry stops work without waiting
forever for Flash, abort, settlement, or storage. Unconfirmed cleanup keeps the
workspace delegation lock held to prevent overlap.

After a valid, timely yield, retain actual history and useful JIT, then build the
next worker context from selected lessons and the new capsule/output example.
Do not carry forward the old capsule, noisy transcript, or old answer example.
Do not reset the parent agent's conversation. Prompt guidance is not an OS sandbox.

## Development and documentation

Start with [interfaces](docs/INTERFACES.md), then the
[refinement prompt](docs/IMPLEMENTATION-PROMPT.md). The
[documentation index](docs/README.md) links architecture, lifecycle, and Pi hooks.
Reuse the existing Pi SDK/subagent design rather than adding another controller.

Project settings load the extension only. The Pi user-selected model remains the
parent agent and orchestrator; this plugin never selects or switches it. Flash is
configured independently and defaults to `openai-codex/gpt-5.6-luna`;
`CAPSULE_FLASH_MODEL` overrides that worker default.
Both use normal Pi authentication. In the repository's Node/npm development
environment:

```sh
npm run build
export CAPSULE_FLASH_TOOLS='read,bash,edit,write'
pi
```

Trust the project when Pi asks so `.pi/settings.json` can take effect. To select
a different Flash, export `CAPSULE_FLASH_MODEL='provider/model-id'`. When set,
`CAPSULE_STATE_DIR` must be absolute, readable by the parent agent, and inside the project;
preserve this existing containment restriction. Run `npm test` for repository
tests; `npm run test:acceptance` still targets the legacy scripted suites and is
not proof of live provider behavior.

## History

Former docs remain in [archive/](archive/README.md), including the
[previous README](archive/PREVIOUS-PROJECT-README.md) and
[scripted-path guide](archive/SCRIPTED-PATH.md). They are historical, not the new
interface requirements. Source and automated tests implement the current
interface; archives, original proposal, audit evidence, and the separate scripted
path remain preserved.
