# Controller stabilization pass

Date: 2026-09-13.  Baseline commit: `86d1e49565698222dfe82ecfcbe429667171ff50`.
The working tree was already uncommitted (the audit/recheck material and prototype
fixtures were preserved); this pass adds the files shown by `git status` and does
not rewrite the original audit or probe results.
Observed `git status --short` identity: `b6ade238035e94d5190d2e1dc15306e035799dca7fd951b71bedd20a93650cf9`.

## Executed result

Command: `npm run test:acceptance` — **PASS**, exit status 0 (13 assertions in
three files). `npm run build` — **PASS**, exit status 0.

| Finding family | Regression | Evidence | Result |
|---|---|---|---|
| R23 aborted process | `controller stabilization regressions > does not spawn after an already-aborted signal` | Vitest output | PASS |
| N16/N18 evidence quota and digest | `rebuilds quota accounting...` | Vitest output | PASS |
| N15 incomplete capture | `reports truncation as incomplete...` | Vitest output | PASS |
| N01–N05 public admission | existing contract tests; callback integration | no new callback run in this environment | NOT_RUN |
| N06–N13 multi-process ownership | separate-process lifecycle | no separate-process driver added | NOT_RUN |
| N14/N19 reports and handles | existing runtime coverage | no new live Nix/FHS process | DEFERRED |

The positive controls exercised by the pre-existing suite include an authorized
scripted recipe, evidence receipt, report fallback, and handle validation. The
new tests exercise the negative controls above. Adaptive requests now fail before
the controller can spawn; they are intentionally **not** a Luna completion claim.

The durable action-intent barrier is now before spawn, malformed journals are
rejected, evidence quota is reconstructed on restart, and public evidence input
is identifier/range checked. Process descendant cleanup remains **uncertain**:
the receipt no longer claims `descendantsReaped=true` merely because the direct
child exited; bounded escalation is retained, but no OS-level reaper proof is
claimed here.

Remaining WP0–WP3 gaps: authenticated operator-grant registry and complete
task/episode ownership locking, durable aggregate budgets and deadlines,
controller-owned verifier registry and persisted report/decision records,
verified-handle execution binding, and the integrated adaptive Luna/NixOS trial.
These are not marked PASS by this stabilization pass.
