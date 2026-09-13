# Corrective-pass resolution record

The original audit directory and its saved outputs are preserved. This record
maps each reproduced finding to the durable coverage added by the corrective
pass. The deterministic audit drivers remain historical evidence; they are not
silently rewritten.

| Finding | Reproduction / regression | Change | Verification / limitation |
|---|---|---|---|
| F01 | R01 public tool callbacks | operator-configured extension admits and runs registry recipes | `npm run build`; Pi SDK live path requires configured operator policy |
| F02 | R04–R06 | trusted-local admission, hard-isolation rejection, pinned recipe and capsule digest checks | controller action boundary; trusted local is not an OS sandbox |
| F03 | R07–R08 | controller-owned stop classes, retry target and strict no-retry checks | retry remains task-local and bounded |
| F04 | R11–R12 | durable intent/receipt reconstruction and duplicate rejection | uncertain intents return `reconciliation_required`; external exactly-once is impossible |
| F05 | R09–R10 | tool, per-command and wall/report-reserve clamping | provider-internal model cost remains unknown |
| F06 | process probes / runtime test | bounded capture and TERM/KILL escalation with terminal receipts | descendant cleanup is only inferable to the platform boundary |
| F07 | R13–R15 | controller derives verification from receipts and preserves rendered semantics | full declared verifier catalogue is not yet implemented |
| F08 | R16–R18, R21 | cumulative quota, digest-on-read, incomplete evidence and redaction | metadata outside the controller remains the host's responsibility |
| F09 | R19 | observed handle requirements, stale checks and execution-ID validation | persisted replay still needs a real fixture trial |
| F10 | R20, R22 | symlink-aware handle validation and protected-file evidence fields | mutation leases/review revalidation are not yet complete |
| F11 | R02, R15 | criteria may use scoped units and capsule rendering retains decisions/criteria | acceptance-unit compatibility is retained |
| F12 | Luna smoke / worker adapter | closed resource/tool manifest retained; no implicit provider fallback | configured provider assertion is blocked by SDK session configuration in this prototype |

Remaining limitations are intentional and reported rather than claimed as
completed WP2 security guarantees.
