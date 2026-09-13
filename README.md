# Pi Capsule prototype

WP0–WP3 implementation of the evidence-bound delegation design in `docs/`. It provides strict runtime contract validation, immutable capsule digests, policy intersection, a receipt/evidence controller, bounded retries and cancellation, a closed Pi SDK worker adapter, registered Nix/FHS/explicit-loader recipes, environment handles, and source-origin verification.

## Requirements and trust

- NixOS/Linux for the live FHS demo; Nix with flakes enabled (the commands also pass the feature flags).
- Node.js >= 22.19 and the exact npm lock.
- Pi SDK package `@earendil-works/pi-coding-agent@0.85.1`, matching the observed installed `pi 0.85.1` fork.
- **Trusted local execution only.** This is not a filesystem/network sandbox. FHS is compatibility machinery. Nix-daemon effects/resource use are incompletely accounted.

```sh
npm ci --legacy-peer-deps
npm run check
npm run compat
CAPSULE_TRUSTED_LOCAL=1 npm run demo
npm run luna-smoke
```

The extension requires an operator JSON configuration before admission. Set
`CAPSULE_OPERATOR_CONFIG` to a file containing `{"stateRoot":"...","policy":
{...}}` (the policy must provide `capabilities` and `budget`); set
`CAPSULE_TRUSTED_LOCAL=1` only after reviewing that policy. The extension's
three public tools then use the same controller and persisted state as the
CLI. This remains trusted-local execution, not a hardened sandbox.

The live command writes a uniquely named directory under `demo-results/` containing `live-transcript.json`, immutable stream blobs, journals, and `environment-handle.json`. It performs real `nix run` entry into `buildFHSEnv`, a locked task-local uv sync, stale and corrected import-origin probes, Ruff/basedpyright launches, an intentionally failing basedpyright source check, a NixOS generic-ELF failure followed by a separately authorized explicit-loader run, and fresh-process handle verification. It then runs the same loader failure under a separate `retry.mode=none` capsule and records that the controller refused the retry.

The deliberate source error is not repaired. A failed source check is reported as `launch: pass`, `sourceCheck: fail`, pending supervisor acceptance. Protected fixture source and lock hashes must remain unchanged. The environment demo does not waste a model on deterministic checks. `npm run luna-smoke` separately starts a fresh actual Pi SDK worker using the configured provider/model, requires two dependent bounded reads, and records model/events/usage without inheriting project resources. It fails rather than falling back if the configured provider is unavailable.

## Pi extension

Load `src/extension/index.ts` through Pi's extension mechanism after configuring a state root, authority registry, recipes, and explicit trusted-local opt-in. The extension surface is intentionally only `delegate_episode`, `read_evidence`, and `decide_episode`; the worker adapter uses `noTools: "all"`, an exact custom-tool allowlist, an in-memory fresh session, and a resource loader with no extensions, skills, prompts, themes, or context files.

No automatic routing, global skill rewriting, dependency/lock updates, host configuration changes, or autonomous semantic source repair is implemented.
