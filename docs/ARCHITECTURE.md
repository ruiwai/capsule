# Production architecture: small returns, reusable lessons

The [original proposal](sources/ORIGINAL-PROPOSAL.txt) supplies the supervised
context lifecycle. The [current interface](INTERFACES.md) refines the return
format and timeout. The production source is deliberately split into two
directories: `src/capsule/` contains SDK-independent contracts, prompts, storage,
and service; `src/extension/` contains the Pi entrypoint, runtime adapter, parent-context integration,
renderers, and footer. There is no CLI, scripted path, or compatibility layer.

Within `src/capsule/`, `worker.ts` defines the SDK-independent backend and
telemetry contracts shared by the lifecycle service, Pi adapter, and footer.
`service.ts` owns supervision and result projection; `storage.ts` owns
transcript, notes, and JIT persistence under the configured state root. Only `extension/pi-backend.ts` adapts
the worker to Pi. Temporary transcript/JIT files are cleaned up on failure.
Dependencies point from the extension to the core, never the reverse. The core
depends on the `CapsuleBackend` interface, not its Pi implementation.
Architecture tests enforce core/adapter boundaries, absence of dependency cycles,
and entrypoint reachability;
TypeScript rejects unused locals/parameters and unreachable statements.

## Responsibilities

**The parent agent** owns task direction, important decisions, semantic judgment, and review.
It uses the model selected by the user in Pi; the plugin never selects or switches
that model. Only Flash has a plugin-defined model default and override.
It supplies a self-contained capsule plus a self-explanatory output example.
It need not predict every command or describe a formal result type.

**Flash** uses its ordinary configured tools, branches on observations, and yields
when the requested assessment is complete or progress is blocked. It aims to
follow the output example, rather than a compiled result schema. A genuine
negative result is different from an inability to establish the answer.

**The plugin** reuses the existing Pi SDK/subagent execution, assembles context,
returns the handoff once, saves history and JIT, and enforces a deadline. It does
not take over Flash's local investigation or become a generalized controller.

## One cycle, separate destinations

```text
Parent agent: delegate_capsule({ capsule, output_example, timeout_s? })
                 |
        parent watchdog starts
                 v
Flash: base instructions + selected JIT + capsule + output example
                 |
         ordinary tools <-> observations
                 |
                 v
yield({ reason, result?, notes?, JITed_history })
                 |
       normal terminal completion
                 |
     +-----------+-------------------+--------------------+
     |                               |                    |
Parent agent tool result              retained files        project JIT
 completed: result + paths     successful notes      useful lessons
 failed: inline notes + path   raw transcript        + provenance
                                                          |
                                         next capsule + output example

Watchdog expiry -> stop work, bounded cleanup, timeout with inline notes
```

Do not send the full yield packet back to the parent agent. Explicitly project the parent
result: compact answer on completion; mandatory inline cause/partial outcome/
next action on blocked, timeout, or error. Supplemental successful notes and the
transcript are reachable by absolute paths. JIT is not automatically returned.

The original pending tool result is the only automatic delivery route. No
polling, receive tool, second injected message, or copied child termination flag
is needed. The worker stops; the parent agent remains able to continue.

## Context lifecycle, not process identity

Continue using fresh child contexts seeded with selected project JIT. Remove
old task direction, output examples, and noisy observations from the next
model input while retaining the archive. A new session that copies all old
messages has not reclaimed context; neither has an "ignore previous" message.

Leave the parent agent's own conversation intact. Rebuilding context does not undo edits,
replay tools, or establish OS isolation. Runtime tool permissions still apply;
JIT and task instructions cannot grant additional authority.

The in-process adapter uses Pi's SDK and keeps supervision in the parent. It does
not reimplement Pi's inference or tool machinery.

## Thin but bounded

Normal completion requires retained history and a valid fixed yield envelope.
It does not require that an answer exactly match the example. Archive/JIT
failures must be honest; previous retained knowledge must remain intact.

Timeout is independent of worker cooperation. A fixed parent deadline covers
setup, work, terminal completion, and normal return preparation. A separate
cleanup window bounds abort, disposal, and partial retention. No late callback
may inject another result or publish JIT after timeout. Do not start overlapping
work if termination of the prior worker is unconfirmed.

See [Pi integration](PI-INTEGRATION.md) for hook boundaries and
[implementation status](IMPLEMENTATION.md) for verification limits.
