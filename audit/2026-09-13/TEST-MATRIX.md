# T01–T36 corrective verification

| Requirements | Evidence | Result |
|---|---|---|
| T01–T04 | `npm run build`, `tests/contracts.test.ts` | pass (contract and digest primitives) |
| T05–T08 | `tests/runtime.test.ts`, controller admission/action checks | pass for trusted-local admission, recipe pins and retry boundaries |
| T09–T12 | controller event journal and duplicate-action coverage | pass for completed duplicates; uncertain crash effects are explicitly reconciliation-required |
| T13–T16 | bounded timeout/capture implementation and runtime cancellation test | pass for owned child group; deep descendant cleanup remains platform-limited |
| T17–T20 | evidence store digest/quota implementation | pass for retrieval integrity and cumulative quota; terminal incomplete receipts are retained |
| T21–T24 | `src/verification/report.ts`, capsule rendering | pass for worker non-acceptance and receipt-backed unknown results |
| T25–T28 | `src/environment/handles.ts`, `src/execution/environment.ts` | pass for stale config, missing observations, and symlink escapes |
| T29–T32 | `src/extension/index.ts`, `src/worker/pi-adapter.ts` | build-verified; live provider callback requires operator configuration and configured provider |
| T33–T36 | historical live transcript under `demo-results/` | historical evidence preserved; adaptive fixture rerun is not claimed by this local check |

The two original test files still contain ten tests; they are supplementary to
the audit reproductions and this matrix, not the acceptance threshold.
