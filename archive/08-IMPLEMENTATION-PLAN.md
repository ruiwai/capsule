# 08 — Implementation work packages

## 1. Implementation constraints

Build the documented prototype, not a general orchestration platform. Use one controller, one Pi SDK worker runner, versioned JSON contracts, local immutable evidence, and an explicit recipe registry. Keep public dependencies minimal. Prefer existing Pi APIs and OS primitives over new services.

Do not integrate automated source-code editing in the worker. Do not broaden the trust boundary to untrusted repositories. Do not add automatic cloud storage, telemetry export, a daemon, embeddings, or a cross-project memory system. All artifacts remain local unless the operator separately exports them.

## 2. Suggested project structure

```text
src/
  extension/index.ts
  extension/tools.ts
  extension/commands.ts
  extension/render.ts
  controller/controller.ts
  controller/state.ts
  controller/leases.ts
  controller/ipc.ts
  contracts/schemas.ts
  contracts/validate.ts
  contracts/identity.ts
  context/compile.ts
  context/render.ts
  worker/main.ts
  worker/pi-adapter.ts
  worker/resource-loader.ts
  worker/tools.ts
  execution/spawn.ts
  execution/cancel.ts
  execution/environment.ts
  recipes/registry.ts
  recipes/compile.ts
  evidence/store.ts
  evidence/index.ts
  evidence/transcript.ts
  verification/registry.ts
  verification/report.ts
  environment/handles.ts
  environment/fingerprint.ts
  knowledge/store.ts
  knowledge/retrieve.ts
  telemetry/usage.ts
  telemetry/budget.ts
  replay/executor.ts
tests/{unit,integration,fixtures}/
docs/
```

Names are suggestions; module ownership and interfaces in 02/03 are normative. Keep runtime schemas and tests close to their domain logic. Avoid one large extension callback containing persistence, subprocess management, and scientific interpretation.

## 3. WP0 — compatibility and contract foundation

Confirm the installed Pi executable and SDK exports/types, provider/model availability, custom-tool closure, session subscription/abort behavior, and resource-loader behavior. Record exact versions and package identities. Do not assume online `main` matches the user's installation.

Implement domain schemas, canonical IDs/digests, request validation, policy intersection, report profiles, and the state machine. Define registered recipe/verifier interfaces without spawning anything. Add T01–T05, T10–T13, T28, T35.

**Done:** invalid authority, bad raw locators, stale digests, malformed reports, and absent acceptance units are rejected deterministically. A compiled capsule can be rendered and inspected without invoking a model.

## 4. WP1 — deterministic controller and evidence path

Implement the single-writer event journal, task budget ledger, artifact store, workspace manifests, mutation lease, argv/script compiler, foreground process supervision, output quotas, cancellation, and idempotent reconciliation. Add a scripted execution mode and deterministic/fake executor for tests.

Register a minimal fixture recipe and verifier. Produce a validated gate report from a real local command, then from a failing command and a cancelled process tree. Prove reader success does not overwrite an inner failed receipt. Add T07, T16–T18, T20–T23, T26–T27, T33, T36.

**Done:** the controller can produce a truthful receipt-backed return without any worker report, preserve partial evidence on failure, and refuse duplicate side effects. Trust limitations are visible in configuration and UI.

## 5. WP2 — actual Luna delegation

Implement the Pi supervisor extension and separate SDK worker runner. Add the closed resource manifest, controller-forwarded tools, fresh session creation, compact progress UI, report submission, one bounded report-repair attempt, selective evidence retrieval, and supervisor decision records.

Run an actual `investigate` episode over fixture files, including a truncated source and a contradiction. Run a small adaptive environment episode over a safe local fixture. Record exact rendered context, active tools, provider/model identity, all requests, and available usage. Add T06, T08–T09, T19–T21, T34.

**Done:** Luna performs dependent real tool actions and returns one useful gate packet. Astra does not poll. A fake accepted result from the worker cannot bypass required evidence. No automatic full parent transcript is inherited.

## 6. WP3 — NixOS/uv/FHS vertical slice

Implement recipe-backed `nix_develop`, registered FHS entry, and separately permissioned explicit-loader routes. Implement source-binding placement after shell initialization, task-local uv environment/cache binding, lock preservation checks, runtime/import/tool probes, handle generation/invalidation, and fresh-process reuse.

Reproduce the behavior classes in ENV-01 and ENV-02 on disposable fixtures. The system must distinguish successful uv sync, Python imports, tool launch, source correctness, and fresh-process handle validity. Demonstrate the strict no-retry variant as a separate capsule.

The FHS fixture must use an actual wrapper. Do not claim success from a host shell with copied variables. Nix-store deletion on the user's host is prohibited; simulate expiry safely. Add T14–T15, T24–T25, T29–T32.

**Done:** deliver the required live demo transcript from 07, a usable environment handle, decisive receipts, unchanged protected files, an intentionally failing source-check report, and a new-process replay. This is the main prototype milestone.

## 7. WP4 — checkpoint, scoped JIT, and evaluation

Implement checkpoint creation and new-episode reconstruction. Carry remaining task budget and unresolved obligations. Add project-scoped candidate/verified/stale knowledge records, explicit promotion, exact-scope retrieval, and invalidation. Do not edit global skills.

Run the historical reporting regressions and the live matched comparison described in 07. Publish actual costs/usage completeness, accepted results, extra review effort, and failures. Investigate whether deterministic batching already removes most overhead for each task class.

**Done:** a verified lesson helps a later matching task without overriding new authority; a changed recipe/lock or missing store realization invalidates relevant evidence; evaluation results are saved with their limits.

## 8. Implementation decision log

During implementation, record decisions only where the environment forces a concrete choice: exact Pi adapter version, available provider integration, trusted execution backend setup, recipe invocation interface, platform-specific process cancellation support, and source-origin verifier behavior.

Do not ask the user to redesign settled product scope. Where installed APIs differ, adapt inside the Pi adapter while keeping these contracts intact, and record the difference. If the SDK cannot provide the required tool closure or request accounting, report that actual incompatibility instead of silently dropping the guarantee.

## 9. Delivery checklist

The implementation handoff back to the user must contain:

* Source and exact dependency lock; install/run instructions for the tested Pi version; explicit trusted-local opt-in.
* Unit/integration test results and a real NixOS/uv/FHS demo with original receipts and the source-import-origin check.
* One complete success, one legitimate source-check failure, one no-retry stop, one cancellation, one stale handle, and one incomplete-report case.
* Exact model/request/usage records and any measured comparison; no invented savings or quality-equivalence claim.
* Known limits: host shell security, external editor races, Nix-daemon effects, resource/usage completeness, and unsupported platform or package-layout cases.

## 10. Deferred work

Automatic routing, parallel mutating workers, sophisticated cache optimization, fully isolated command backends, remote task services, learned compression, cross-project JIT, package-level dependency graphs, autonomous semantic patching, and third-party delegation adapters are deferred. They must not delay or expand the uv/FHS vertical slice.

A later OS-sandbox backend may be valuable, but its claims need independent tests. An FHS wrapper is not a shortcut to that security feature. A later learned router may be valuable, but the first system must show that explicitly chosen delegation actually saves cost while preserving accepted results.
