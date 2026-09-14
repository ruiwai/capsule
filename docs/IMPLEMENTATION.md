# Implementation status

**Implemented: 14 September 2026, with pre-existing working-tree changes
preserved.** Capsule is the production Pi SDK adapter.

## Current behavior

| Area | Implemented behavior |
| --- | --- |
| Fixed contracts | `delegate_capsule({capsule, output_example, timeout_s?})`; completed/blocked `yield` with arbitrary JSON result and bounded JIT fields. Old report/reply/yielded, needs_decision, and public cancelled envelopes are rejected. |
| Parent projection | Completion passes `result` unchanged and returns retained transcript plus optional notes paths. Blocked/runtime failures use mandatory inline notes and never fabricate a result. |
| Context | Flash receives selected project JIT, the current capsule, and unchanged example guidance. The parent receives no JIT, successful note text, transcript content, or worker termination flag. |
| Storage | Searchable UTF-8 transcripts and supplementary notes are retained under the project-scoped state root. Topic updates use atomic project-local replacement with transcript provenance. |
| Watchdog | One per-call deadline starts before JIT loading/backend setup and remains active through normal persistence. Precedence is `timeout_s` > `CAPSULE_FLASH_TIMEOUT_MS` > 300,000 ms; `high`/`xhigh` reasoning then applies a 2x/3x runtime multiplier, respectively, capped at Node's timer limit. The multiplier is not added to model instructions or UI call summaries. Cleanup has a separate 5,000 ms allowance. |
| Termination | Expiry selects timeout once, aborts the owned Pi session, bounds abort/idleness/retention waits, fences late handoff/JIT processing, and retains workspace ownership when cleanup is unconfirmed. User interruption follows the internal abort path rather than returning a public cancellation status. |

The backend uses Pi's actual `session.abort()` boundary. It does not claim an OS
sandbox: an unresponsive JavaScript event loop cannot run a userspace timer, and
SDK startup that ignores cancellation can only be marked unconfirmed. In that
case the service deliberately prevents a subsequent delegation from overlapping
the unresolved owner. A late-created SDK session is immediately asked to abort
and disposed.

## Automated coverage

`tests/capsule.test.ts` covers JSON-like and prose examples, answer pass-through,
negative completion, blocked/error envelopes, readable path-only artifacts,
targeted transcript search, internal two-episode JIT reclamation, storage failure,
normal terminating yield registration, duplicate yield rejection, parent/child
tool separation, cooperative cancellation, hanging retention, a late handoff,
single timeout delivery, no late JIT, and overlap prevention.

The fault backends are deterministic/cooperative test doubles. Hook tests execute
the real inline extension boundary, but no authenticated live-model call or
deliberately hung real provider/tool process was run in this implementation pass.
Accordingly, these tests establish service supervision and SDK API wiring, not a
hard process-isolation guarantee.

## Development setup and verification

The repository pins Pi 0.85.1 and requires Node >=22.19.0. Project settings load the extension only. The Pi user-selected model remains the
parent agent and orchestrator; the plugin never selects or switches it. Flash defaults
to `openai-codex/gpt-5.6-luna`; optional `CAPSULE_FLASH_MODEL=provider/model-id`
overrides it independently. `CAPSULE_FLASH_TOOLS`, `CAPSULE_FLASH_TIMEOUT_MS`, and absolute
project-contained `CAPSULE_STATE_DIR` retain their documented behavior.
The extension-owned `capsuleFlashThinkingLevel` setting controls only Flash
reasoning (`off`, `minimal`, `low`, `medium`, `high`, or `xhigh`). Global settings
are the fallback when the project setting is absent; project settings win, and
`CAPSULE_FLASH_THINKING_LEVEL` overrides both. Invalid values fail before setup.
Authentication comes from normal Pi config.

Run:

```sh
npm run check
```

See [interfaces](INTERFACES.md), [Pi integration](PI-INTEGRATION.md), and the
[context lifecycle](CONTEXT-LIFECYCLE.md) for the active contract and boundaries.
The original proposal is design context, not current live verification.

The build clears stale output and emits only `src/` to `dist/`. Type-checking
also covers tests without emitting them. Architecture tests enforce the single
Capsule entrypoint and the dependency direction from extension to Capsule.
