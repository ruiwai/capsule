# Pi Capsule

**Astra makes the key decisions. Luna handles the tool loop. Useful know-how survives.**

Pi Capsule is a context-engineering plugin design for supervised delegation in
Pi. Astra supplies a self-contained capsule of current decisions and instructions.
Luna works through dependent reads, commands, and permitted local adjustments,
then yields to Astra with a report and JITed history. The plugin reclaims the
temporary capsule and execution context, retaining useful knowledge and a
reference to the raw history for the next delegation.

**Status: the smallest context-first loop is implemented.** The parent extension
registers `delegate_capsule`, starts a fresh foreground Pi SDK worker with its
own worker-local `yield` tool, retains JSONL transcripts, and publishes
project-local JIT lessons. The older scripted runner remains separate.

**Implementation direction: reuse an existing Pi subagent design and Pi's
extension hooks.** Keep child-session execution in the subagent backend; add
capsule injection, structured yield, and JIT/context replacement around it.
The [Pi integration notes](docs/PI-INTEGRATION.md) identify concrete upstream
references and the hooks checked against the installed Pi package.

The [v1 interface contract](docs/INTERFACES.md) adds just two model-facing tools:
`delegate_capsule({ capsule })` for Astra and
`yield({ reason, report, JITed_history })` for Luna. Luna's handoff automatically
returns in the original `delegate_capsule` tool result, so Astra receives it in
context without polling or a second injected message. These are the implemented
model-facing interfaces.

## The loop

```text
Astra: decide and append a capsule to Luna's working context
    -> Luna: investigate, act, observe, adapt
    -> Luna yields: report + JITed_history
    -> Astra: review, correct, decide the next task

At the yield boundary, the plugin rebuilds Luna's context:
    system instructions + relevant JIT knowledge with provenance paths
    + the next Astra capsule when delegated
```

The capsule guides Luna through context; it is not a pre-enumerated command
batch or a requirement for a complex execution controller. JIT is not a generic
summary: keep the common executable path, minimum safety guard, and decisive
verification; retrieve detailed history only when needed. Reclamation means the
old capsule and noisy transcript are absent from subsequent model input, not
merely followed by an instruction to ignore them.

The design follows the [original proposal](docs/sources/ORIGINAL-PROPOSAL.txt).
Its purpose is to reduce routine Astra participation without weakening result
quality or verification. Savings remain something to measure, not a guarantee.

## Documentation

Start with the [documentation index](docs/README.md), then the
[architecture](docs/ARCHITECTURE.md) and
[context lifecycle and examples](docs/CONTEXT-LIFECYCLE.md). For implementation,
start with the [two-tool contract and schemas](docs/INTERFACES.md), then
[existing subagent designs and Pi hooks](docs/PI-INTEGRATION.md).

## Setup

Use Node 22.19 or newer. Configure Luna explicitly and load this extension:

```sh
npm ci
npm run build
export CAPSULE_LUNA_MODEL='anthropic/claude-sonnet-4-5'
export CAPSULE_LUNA_TOOLS='read,bash,edit,write'
pi --extension "$(pwd)/src/extension/index.ts"
```

Pi's normal provider authentication must be configured for the selected model.
By default state is private project-local data under `.pi/capsule/`. Set
`CAPSULE_STATE_DIR` to an absolute Astra-readable directory inside the project
when needed. The checks are:

```sh
npm run build
npm test
npm run test:acceptance
```

`npm test` includes the deterministic backend-boundary Capsule lifecycle suite
and the existing scripted tests.
Runtime requirements and the source map are in
[implementation status](docs/IMPLEMENTATION.md). The
[archived scripted-path guide](archive/SCRIPTED-PATH.md) remains the guide to
running that older path. Existing permissions and checks have not been relaxed.
Neither prompt instructions nor trusted-local execution are an OS sandbox.

## History

The former `docs/` was moved to [archive/](archive/README.md). Its controller-heavy
specifications and historical evidence are retained, not current requirements.
The [previous project README](archive/PREVIOUS-PROJECT-README.md) is also preserved.
Source code, tests, and audit records were not rewritten as part of this reset.
