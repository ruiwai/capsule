# Implementation status

The smallest context-first Capsule loop is implemented in `src/capsule/` and
registered by `src/extension/index.ts`. The legacy scripted service remains
available through its existing adapter and was not weakened.

## Runtime map

| File | Responsibility |
| --- | --- |
| `src/capsule/contracts.ts` | Exact TypeBox contracts and duplicate-topic validation. |
| `src/capsule/backend.ts` | Foreground fresh Pi 0.85.1 child, explicit model/tools, child hooks, worker-only `yield`, settlement/mixed-call checks, and actual event capture. |
| `src/capsule/service.ts` | One active delegation, JSONL retention, atomic project JIT replacement, compact parent result. |
| `src/extension/index.ts` | Astra-only `delegate_capsule` and normal model-visible delivery. |

Worker sessions are fresh per episode. Selected JIT and provenance paths are
added by the child's `before_agent_start` hook; the capsule is supplied once as
Pi's task prompt. Actual message/tool events are retained under
`.pi/capsule/episodes/`. `raw_history` is only the absolute readable JSONL path;
contents are never automatically previewed, injected, or loaded next episode.
Archive failure prevents both successful handoff and JIT publication. Partial
events are retained for runtime failures when possible.

## Setup and example

```sh
npm ci
npm run build
export CAPSULE_LUNA_MODEL='provider/model-id'
export CAPSULE_LUNA_TOOLS='read,bash,edit,write'
pi --extension "$(pwd)/src/extension/index.ts"
```

Pi provider authentication must already be configured. `CAPSULE_STATE_DIR`
(absolute, Astra-readable, and inside the project) and `CAPSULE_LUNA_TIMEOUT_MS` are optional. A first
Astra call is:

```json
{"capsule":"Inspect the locked test setup, run the focused check, adapt from its output, and yield the actual result plus a guarded reusable lesson."}
```

Luna's sole final call can be:

```json
{"reason":"completed","report":"The check ran and reached a genuine failing assertion; no dependencies changed.","JITed_history":[{"topic":"project-tests","content":"Applies while the lockfile is unchanged. Run the focused test from the project root; do not update dependencies. Verify the intended assertion executed and inspect its result."}]}
```

A second `delegate_capsule` gets its new capsule plus this lesson, but not the
first capsule or transcript. Astra can explicitly search the returned path with
`rg -n -F -C 2 -- "failure" "/absolute/episode.jsonl"`.

## Test scope

```sh
npm run build
npx vitest run tests/capsule.test.ts --reporter=verbose
npm test
npm run test:acceptance
```

The Capsule suite uses a deterministic recording backend at the backend/service
boundary and the real extension registration function. It tests contracts,
adaptive event order, path-only retention and targeted search, two episodes,
mixed/missing/malformed yields, cancellation, timeout, and archive failure. Pi
SDK integration compiles against pinned 0.85.1. A live two-episode smoke test
passed with `openai-codex/gpt-5.6-sol` as Astra and
`openai-codex/gpt-5.6-luna` as Luna: both yielded, the second reused retained
JIT, the first transcript remained readable, and the second transcript excluded
the first capsule and raw-only marker.
