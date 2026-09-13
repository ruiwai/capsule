# Pi Capsule

> **Status:** v0.1 prototype implementing the WP0–WP3 vertical slice.

Pi Capsule is a TypeScript prototype for **evidence-bound delegation** using
the Pi SDK. It lets a supervisor delegate a small, explicitly authorized
episode while a local controller enforces the task contract, runs registered
recipes, and returns immutable execution evidence for review.

The current vertical slice focuses on recovering Python environments on
NixOS: entering an FHS environment, performing a locked `uv` sync, checking
Python import origins, launching Ruff/basedpyright, and replaying a verified
environment handle in a fresh process.

> [!WARNING]
> Pi Capsule currently supports **trusted local execution only**. It launches
> host processes and is not a filesystem or network sandbox. An FHS wrapper
> provides compatibility, not isolation, and Nix daemon effects are not fully
> accounted for. Only run it against repositories and dependencies you trust.

## What it provides

- Runtime validation for versioned task, capability, budget, retry, and report
  contracts
- Immutable capsule and recipe digests with policy/capability intersection
- A controller that records action intent before execution and prevents
  changed duplicate actions
- Content-addressed stdout/stderr evidence and receipt-backed gate reports
- Foreground process timeout, cancellation, output quotas, and bounded retries
- Registered host, Nix, FHS, and explicit-loader execution recipes
- Replayable environment handles with configuration and source-origin checks
- A closed Pi SDK worker session with no built-in tools or automatically
  discovered extensions, skills, prompts, themes, or context files
- A Pi extension exposing only `delegate_episode`, `read_evidence`, and
  `decide_episode`

The controller deliberately keeps execution, verification, and supervisor
acceptance separate. A command can launch successfully while the source check
it runs legitimately fails; that failure remains evidence rather than being
rewritten as success.

## Requirements

- Node.js **22.19 or newer**
- npm, using the committed `package-lock.json`
- `@earendil-works/pi-coding-agent` **0.85.1** (installed by npm)
- Nix with flakes enabled for the live environment demo
- Linux/NixOS for the FHS and explicit-loader demo paths

The contract and runtime tests do not require a model. The Luna smoke test
does require a working provider/model in the normal Pi configuration.

## Quick start

```sh
npm ci --legacy-peer-deps
npm run check
npm run compat
```

If you use Nix, the development shell supplies Node 22, Python 3.12, and `uv`:

```sh
nix develop --extra-experimental-features "nix-command flakes"
npm ci --legacy-peer-deps
npm run check
```

### Available commands

| Command | Purpose |
|---|---|
| `npm run build` | Compile TypeScript into `dist/` |
| `npm test` | Run the contract, runtime, and stabilization suites |
| `npm run check` | Build and run all tests |
| `npm run compat` | Print Node, Pi package, SDK, and tool-closure compatibility information |
| `npm run demo` | Run the real Nix/FHS/uv environment-recovery fixture |
| `npm run luna-smoke` | Start a fresh Pi SDK worker and verify bounded context reads |

## Run the live demo

Review `src/cli.ts`, `flake.nix`, and the fixture under
`tests/fixtures/fhs-project/` first. Then explicitly enable trusted-local
execution:

```sh
CAPSULE_TRUSTED_LOCAL=1 npm run demo
```

The demo performs real local execution. It:

1. enters the `buildFHSEnv` wrapper and creates a task-local locked `uv`
   environment;
2. detects an intentionally stale import source, then verifies the workspace
   source in a fresh process;
3. launches Ruff and basedpyright;
4. records an intentionally failing basedpyright source diagnostic without
   editing the source;
5. demonstrates a generic ELF loader failure and a separately authorized
   explicit-loader recovery;
6. replays the environment handle in another process;
7. proves that a separate `retry.mode: "none"` capsule blocks recovery; and
8. verifies that protected fixture and lock files remain unchanged.

A successful demonstration prints a summary containing
`source-check=fail (correctly reported)` and exits successfully. Artifacts are
written beneath a timestamped `demo-results/` directory, including:

- `live-transcript.json` — capsule, receipts, report, retry result, and limits
- `environment-handle.json` — the verified replay handle
- `state/` — journals and content-addressed evidence blobs

The deterministic demo does not invoke a model. To exercise the actual closed
Pi worker using your configured provider and model, run:

```sh
npm run luna-smoke
```

This smoke test fails rather than silently switching providers. Its sanitized
events, observations, model identity, and available usage data are saved as
`demo-results/luna-*.json`.

## Pi extension

Before loading the extension, create an operator configuration and explicitly
opt in to trusted-local execution:

```sh
export CAPSULE_TRUSTED_LOCAL=1
export CAPSULE_OPERATOR_CONFIG="$PWD/operator-config.json"
```

The runtime currently consumes this minimal operator configuration shape:

```json
{
  "stateRoot": "/absolute/private/path/to/capsule-state",
  "policy": {
    "id": "local-policy-v1",
    "capabilities": {
      "tools": ["context_read", "context_search", "exec_action", "episode_return"],
      "recipes": ["project.inspect"],
      "allowTaskEnvironmentCreate": false,
      "allowLockedSync": false,
      "allowPackageDownloads": false,
      "allowNixRealization": false,
      "allowDirectLoader": false,
      "allowFhsEntry": false,
      "allowScratchRecipeProposal": false,
      "allowSourceEdits": false,
      "allowLockUpdates": false,
      "allowHostConfigurationChanges": false,
      "allowExternalPublication": false
    },
    "budget": {
      "wallMs": 60000,
      "commandMsTotal": 30000,
      "perCommandMs": 10000,
      "maxModelRequests": 0,
      "maxToolActions": 4,
      "evidenceBytes": 1048576,
      "reportReserveMs": 5000,
      "reportReserveRequests": 0
    }
  }
}
```

Then load the extension for the current Pi session:

```sh
pi --extension ./src/extension/index.ts
```

Pi Capsule registers `delegate_episode`, `read_evidence`, and
`decide_episode`. Loading it does not disable the supervisor's ordinary Pi
tools; the delegated worker is the component that uses a closed tool and
resource manifest.

Keep the state directory private; it contains command receipts and captured
output. `delegate_episode` accepts the path to a JSON task request. In this
prototype the extension supports `mode: "scripted"` requests with a registered
`recipeId` and typed `recipeParams`; adaptive Luna execution is demonstrated by
the separate smoke path but is not yet connected to `delegate_episode`.
`read_evidence` retrieves a digest-bound byte range, and `decide_episode`
records an `accept`, `reject`, or `request_revision` decision against a current
report.

See [`docs/examples/environment-task.json`](docs/examples/environment-task.json)
for the full task-contract vocabulary. It is illustrative, contains placeholder
paths and authority, and must not be executed unchanged.

## Architecture

```text
Pi supervisor
    │  delegate_episode
    ▼
extension ──► contract compiler / policy intersection
                    │
                    ▼
               controller
             ┌──────┼────────┐
             ▼      ▼        ▼
          recipes  executor  evidence store
                    │
                    ▼
             Nix / FHS / tools

closed Pi SDK worker ── controller-mediated tools only
controller ── validated report + receipts ──► supervisor review
```

Key source areas:

| Path | Responsibility |
|---|---|
| `src/contracts/` | Types, semantic validation, canonical identity |
| `src/context/` | Capsule compilation and rendering |
| `src/controller/` | Admission, budgets, retries, lifecycle, receipts |
| `src/execution/` | Process spawning and environment handling |
| `src/evidence/` | Immutable content-addressed output storage |
| `src/recipes/` | Registered recipe metadata and command compilation |
| `src/environment/` | Environment handle creation and invalidation |
| `src/verification/` | Draft validation and gate report construction |
| `src/worker/` | Closed Pi SDK session and resource loader |
| `src/extension/` | Pi-facing public tools |
| `tests/` | Contract, runtime, cancellation, evidence, and regression tests |

## Documentation

The detailed design is under [`docs/`](docs/README.md):

- [Specification](docs/01-SPECIFICATION.md)
- [Architecture](docs/02-ARCHITECTURE.md)
- [Contracts](docs/03-CONTRACTS.md)
- [Environment recovery protocol](docs/04-ENVIRONMENT-RECOVERY.md)
- [Context and memory](docs/05-CONTEXT-AND-MEMORY.md)
- [Real motivating cases](docs/06-REAL-CASES.md)
- [Tests and evaluation](docs/07-TEST-AND-EVALUATION.md)
- [Implementation plan and deferred work](docs/08-IMPLEMENTATION-PLAN.md)

## Current scope and limitations

This is a prototype, not a hardened orchestration platform. In particular:

- trusted-local mode cannot prevent arbitrary reads, network access, or
  transient writes by an authorized host command;
- Nix daemon resource use and side effects are incompletely observable;
- adaptive worker execution is not yet wired into the public extension tool;
- there is no automatic task routing, parallel mutation, autonomous source
  repair, lock-file updating, host configuration, global skill rewriting, or
  external publication;
- provider-internal retries and usage may not be fully observable; and
- supervisor acceptance is always a separate decision—workers do not approve
  their own results.

These boundaries are intentional: the prototype optimizes for truthful,
reviewable evidence rather than turning every execution into a green status.
