# Pi Capsule

An evidence-bound, **trusted-local scripted execution → verification → review**
prototype. This is not WP0–WP3 completion. Adaptive Luna, live uv/FHS recovery,
model accounting, JIT memory and verified environment-handle replay remain
unavailable.

The extension and CLI share one durable service. Requests resolve current
operator grants, reserve a persistent identity, compile an immutable capsule,
execute internally registered typed operations, retain evidence, persist a
deterministically verified report, and allow a scoped supervisor decision.

## Check it

Node 22 with `node:sqlite` and the locked npm dependencies are required.

```sh
npm run build
npm test                 # every repository test, including separate processes
npm run test:acceptance  # executable A01–A15 assertions
```

## Run it

See [the scripted path guide](docs/SCRIPTED-PATH.md) for exact operator setup,
request, evidence and decision commands. The runnable example is explicitly a
disposable synthetic checker, not a Luna/NixOS trial.

Supported operations are approved `project.inspect` file reads and named,
operator-registered `check.*` builders with strict parameter schemas. Public
requests cannot supply arbitrary executable targets, shell arguments, loaders,
environments or cwd overrides. SQLite transactions own admission, action
reservations, lifecycle, quota coordination, reports and decisions.

**This is not an OS sandbox.** Only the trusted operator may register executable
code or change grants. Hard-isolation requests reject. Keep configuration and
state private. Uncertain external execution requires reconciliation, never
automatic replay; no exactly-once guarantee is claimed.

## Evidence and scope

The [dated implementation handoff](audit/2026-09-13-scripted-path/HANDOFF.md)
maps A01–A15 to executed tests and retained artifacts. Original audits and their
results remain unchanged. [Architecture](docs/02-ARCHITECTURE.md),
[contracts](docs/03-CONTRACTS.md) and [evaluation](docs/07-TEST-AND-EVALUATION.md)
describe broader normative product goals, not completed features.

Historical environment fixtures and legacy domain helpers remain for evidence
and testing. The old public caller-owned recipe/command controller was removed.
The `demo` and `luna-smoke` CLI modes explicitly reject rather than bypassing the
new boundary. `npm run compat` reports the currently enabled backend.
