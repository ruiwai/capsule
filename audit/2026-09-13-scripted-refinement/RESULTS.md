# Scripted boundary refinement — 2026-09-13

This follow-up commits the scripted milestone implementation and refines its
asynchronous boundary. Earlier dated audit results remain historical evidence;
their statements about an uncommitted workspace describe that earlier run.

## Changes

* Snapshot action parameters before publishing deferred execution. Mutating the
  caller's object can no longer change the operation associated with a pending
  identity. Use a shared readonly request type and typed pending receipts.
* Validate malformed evidence envelopes without applying `in` to primitives or
  null, and reject unknown public operations before opening controller state.
* Close a newly opened SQLite connection if initialization fails, and expand
  transaction control flow for readability.
* Add both boundary regressions to normal discovery and the acceptance command.

## Executed evidence

| Check | Result | Log |
|---|---|---|
| New regressions before refinement | FAIL, both reproduced | `pre-fix.log` |
| TypeScript no-emit check | PASS | `typecheck.log` |
| Build | PASS | `build.log` |
| Full repository suite | PASS, 30 tests across five files | `tests.log` |
| A01–A15 plus refinement regressions | PASS, 17 tests | `acceptance.log` |

The mutation regression checks the actual receipt/unit, absence of checker
effects, and sequential duplicate reuse. The acceptance suite still executes
real separate processes, public callbacks, actual checkers, evidence retrieval,
reporting and decisions. New synthetic A01 artifacts are in
`acceptance-results/A01-artifacts/`; no reports or receipts were seeded.

The commit includes the previously untracked TypeScript build configuration
unchanged so the checked build is reproducible. Pre-existing flake changes,
original audits, and unrelated untracked documentation/workspace files are left
outside the commit. No adaptive, live environment or model tests were run;
those paths remain unavailable as documented in `docs/SCRIPTED-PATH.md`.
