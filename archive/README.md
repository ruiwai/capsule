# Pi Capsule — prototype implementation handoff

**Version:** 0.1.0 specification · **Date:** 13 September 2026  
**Status:** ready for implementation; no plugin implementation or live environment recovery is delivered by this documentation.  
**Target:** a Pi extension that keeps Astra responsible for consequential decisions and semantic patches, while Luna performs bounded adaptive discovery and environment/tool execution.

## Start here

Build the smallest useful vertical slice: Astra delegates a NixOS Python-environment recovery episode; Luna investigates and performs authorized local repairs; the controller captures evidence and verifies an environment handle; Astra receives one compact gate report. A subsequent task uses the handle in a **new process** and proves that the intended workspace source is imported. Do not begin with automatic routing, a multi-agent hierarchy, or a general memory service.

The motivating traces are real. In S006, locked uv synchronization and 106 tests succeeded, but Ruff and basedpyright's bundled Node failed at the NixOS loader. After a separately authorized launcher correction, the tools launched and the type checker produced a genuine failing result. In S020, Nix-store cleanup prompted environment re-entry; that re-entry initially imported an old extracted snapshot rather than the current workspace. Explicit source binding inside the environment corrected the import. These are distinct evidence gates, not one Boolean “environment fixed.” See [06-REAL-CASES.md](06-REAL-CASES.md).

## Documents and authority

| Document | Purpose |
|---|---|
| [01-SPECIFICATION.md](01-SPECIFICATION.md) | Scope, behaviors, requirements, defaults, and non-goals |
| [02-ARCHITECTURE.md](02-ARCHITECTURE.md) | Runtime topology, modules, state transitions, persistence, and Pi integration |
| [03-CONTRACTS.md](03-CONTRACTS.md) | Domain records, tool interfaces, report validation, and protocol examples |
| [04-ENVIRONMENT-RECOVERY.md](04-ENVIRONMENT-RECOVERY.md) | Detailed NixOS / uv / FHS operating protocol and replayable environment handles |
| [05-CONTEXT-AND-MEMORY.md](05-CONTEXT-AND-MEMORY.md) | Capsule construction, context reconstruction, scoped JIT procedures, and invalidation |
| [06-REAL-CASES.md](06-REAL-CASES.md) | Historical evidence, exact source identities, chronological cuts, and proposed dry runs |
| [07-TEST-AND-EVALUATION.md](07-TEST-AND-EVALUATION.md) | Deterministic tests, real-environment acceptance, adverse cases, and comparison methodology |
| [08-IMPLEMENTATION-PLAN.md](08-IMPLEMENTATION-PLAN.md) | Ordered implementation work packages, definition of done, and explicit deferrals |
| [09-AGENT-PROMPTS.md](09-AGENT-PROMPTS.md) | Supervisor, worker, report-repair, and reviewer prompt templates |
| [10-SOURCES-AND-DECISIONS.md](10-SOURCES-AND-DECISIONS.md) | Historical and external sources, evidence limits, architectural decisions |
| [examples/operator-config.json](examples/operator-config.json) | Disabled operator configuration with explicit trust/model/budget policy |
| [examples/environment-task.json](examples/environment-task.json) | Illustrative fully specified task request; paths/identities are deliberately placeholders |
| [evidence/observed-events.json](evidence/observed-events.json) | Selected historical observations, not fabricated execution outputs |
| [evidence/source-verification.json](evidence/source-verification.json) | Raw source hashes and selected locator checks performed during drafting |
| [evidence/prior-study.md](evidence/prior-study.md) | Prior study supplied in this conversation |

Normative requirements use **MUST**, **SHOULD**, and **MAY**. The normative documents are 01–05 and 07–09. Historical evidence is descriptive, never current execution authorization. Implementation defaults are design choices, not conclusions proved by the study. The evidence JSON is an author-selected extraction, not a substitute for the original JSONL records.

## Decisions already made

Use TypeScript, one Pi supervisor extension, Pi's existing SDK for a fresh worker session, a local controller, and controller-mediated tools. Keep one active worker per task and serialize workspace mutations. Reuse Pi's inference/session machinery; do not build a model runtime. The primary integration is the official SDK, not a mandatory third-party subagent extension. An alternative adapter can be added later without changing the contracts.

**Execution trust boundary:** v0.1 is for trusted local repositories and dependencies. All worker tool effects pass through the controller, but a host shell is not an OS sandbox. Runtime code can detect protected-file changes after execution; it cannot prove that arbitrary shell scripts never performed unauthorized reads or transient writes. This limitation must be visible during setup. Do not market a path allowlist, FHS environment, or Git worktree as security isolation.

**Definition of success:** a correct, evidence-backed authorized result with lower expensive-model participation—not a “green” summary obtained by skipping checks, weakening requirements, or hiding an unresolved failure.

## First instruction to the implementation agent

Read 01, 02, 03, and 04 before coding. Confirm the installed Pi package and SDK types, then implement WP0 through WP3 in 08. Preserve source identities, failure states, no-retry exceptions, and source-origin checks. Do not implement automatic promotion to global skills, dependency upgrades, host configuration changes, or autonomous semantic source repair in this prototype.
