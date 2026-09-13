# Transcript-grounded Astra / Luna delegation study

Date: 13 September 2026

## Workspace and retained artifacts

The study was performed in the connected workspace:

`/home/hilaolu/.codex/multica-sessions/default/delegation-study-2026-09-13`

This downloadable document is a consolidated summary. The complete scout prompts, unmodified reports, browsing projections, replay inputs/outputs, Pi sessions, source inventory, and audit remain in that workspace folder.

| Workspace file | Contents |
|---|---|
| `README.md` | Entry point, reading order, limitations, final verification |
| `00-corpus-index.md`, `inventory.json` | All source IDs, original paths, hashes, sizes, model metadata, and search aids |
| `01-method.md` | Selection, provenance, replay cutoffs, and evidence limitations |
| `02-selected-history.md` | Four real episodes with decisive excerpts and original JSONL locators |
| `03-scout-audit.md` | Corrections to the actual Luna scout reports |
| `04-dry-run-results.md` | Results and limitations of seven actual no-tools Luna probes |
| `05-grounded-design.md` | Concrete boundaries and report requirements derived from the cases |
| `prompts/`, `scouts/`, `runs/` | Three scout briefs, original reports, and Pi execution/session logs |
| `dry-run/` | Exact probe inputs and outputs, status records, and available event logs |
| `verification.json`, `source-hashes-after.txt` | Final original-corpus hash comparison and output verification |

## What was actually done

The corpus contains 205 JSONL files totaling 1,749,535,903 bytes. All were streamed for indexing and SHA-256 hashing, not semantically reviewed in full. Eighteen targeted readable browsing projections were prepared. Every indexed source file's recorded turn-context model metadata identifies `gpt-6-astra`; the two owner directories are not an Astra-versus-Luna comparison.

Three real scouts were launched using `pi -p` with `openai-codex/gpt-5.6-luna`, medium thinking, read/bash/write tools, separate sessions, and automatic discovery of extensions, skills, prompt templates, and context files disabled. Their assignments covered execution friction, discovery/report boundaries, and skeptical intent/quality counterexamples. All three reports were read and decisive findings checked against original JSONL records. The reports are retained unchanged; the parent audit supersedes specific errors.

Seven fresh Luna probes were then run with no tools and separate saved sessions. They received proposed capsules and actual historical observations, with later historical resolutions withheld from the initial packets. All seven CLI invocations completed with exit zero. CLI completion is not evidence that every answer was correct.

No delegation plugin was implemented. Historical scientific commands were not replayed. All 205 original transcript hashes were checked again after the study, and every hash matched the initial inventory.

## Main conclusion

The histories support a useful delegation unit: **one authorized transition between evidence states**. They do not support treating all shell work, all failures, or all test-related work as interchangeable low-stakes tasks.

A capsule must identify the intended outcome, current permission, acceptance unit, fixed identities/criteria, relevant prior evidence, remaining budget, and the next stop/report condition. Its report should carry a compact decision summary plus the decisive original receipt—not merely a persuasive paraphrase.

This study demonstrates bounded evidence interpretation and reporting on supplied observations. It does not demonstrate Astra-quality independent execution, patch quality, robust long-term JIT memory, or lower total cost per equally accepted task.

## Four grounded cases

### H1 — Onboarding: historical tests are not fresh verification

Source ID: **S001**, original JSONL lines 13–44.

Original file:
`64cacffe-951f-4a22-b3cc-5114c34b7954/01a080e8-5b19-7808-9ddf-64deba38a694/2026/09/08/rollout-2026-09-08T20-09-53-01a080ec-bd71-7d43-869c-5be043585ed9.jsonl`

SHA-256: `7493f4b40df0984d7f1dd0d8908ad317647d05ea8af40d0007886bab30b721c7`.

The agent bundled issue/thread/document reads, encountered truncation, and performed narrower follow-up reads. The returned README at **S001:L38** explicitly states that the onboarding is documentation/review only; historical execution mandates and test counts belong to their recorded checkpoints rather than a new goal or fresh checks. The next matching study remains a proposal, and its developer is unassigned.

An old report records 106 tests plus lint/format passing, but static typing, CTF, and native validation were not run. These are historical claims, not new tests performed during onboarding. The history also distinguishes identity from exact localization and acknowledges incomplete conversation recovery.

A proposed discovery capsule can gather this evidence and return ownership, current scope, unresolved scientific questions, and coverage limits. It must not authorize an experiment or report historical tests as newly run.

**Actual Luna probe:** preserved the historical-versus-fresh distinction, incomplete history, truncation, and read-only scope. A notation defect remained: source/packet shorthand for sigma 1 and sigma 4 was rendered as `sigma=1/4`. Explicit numeric labels are needed; the correct meaning is two noise levels, 1 and 4, not one-quarter.

### H2 — Launcher failure: the obvious fix is not automatically authorized

Source ID: **S020**, prior rule at L35, action/result at L55/L58, response at L63.

Original file:
`64cacffe-951f-4a22-b3cc-5114c34b7954/01a084e8-2f6e-7164-b889-bbcf96e8e3f8/2026/09/09/rollout-2026-09-09T14-46-30-01a084eb-05d2-7260-b5f5-ab64477fa475.jsonl`

SHA-256: `bb79b2e69c7621835145cfa7c69677083fc256ace71c88022b6938d888a90148`.

Before the action, the returned plan says:

> A limit/failure preserves partial evidence and stops without retry, setup, candidate substitution or a fresh budget.

The retained interpreter is `results/readiness_clm4_retry_v1/venv/bin/python`, but the actual preservation-check launcher at **S020:L55** used `python3 -B -`. At **L58**, the shell returned exit 127 and `python3: command not found`. The actual historical Astra response at **L63** stopped and routed the failure for PI disposition, rather than automatically changing the interpreter and retrying.

The correct report is: launcher failure; approved environment not tested; preservation/resource/destination checks did not produce results; retry not authorized under the current rule. The selected blocked episode does not imply that the whole issue never progressed—later continuation material exists in the same source.

**Actual Luna probes:** both the full capsule and a deliberately thin control stopped safely. The thin control recognized that retry authority was missing. Therefore this run does not establish that the richer capsule outperformed the thin handoff.

### H3 — Solver convergence is not independent certification

Source ID: **S044**, failure at L1719/L1726, later isolated comparison at L2089.

Original file:
`64cacffe-951f-4a22-b3cc-5114c34b7954/01a0900d-df12-7b42-ad4f-dc523ff567ae/2026/09/12/rollout-2026-09-12T07-14-18-01a092c0-1ba5-7473-a980-ca5d31bdf3f5.jsonl`

SHA-256: `1c4fd734fb6a84806ecf41dc5fb3523f01583e0fbf54cd60e82ee0ca84afa1b1`.

At **S044:L1719**, candidate 4353, reference 4, geometry 789 has a solver status of zero but failed independent certification. Its operator identity is:

`9cb01faf7ac7a3161adfe517ce06fae6c5f46b0c08fa76c829ad52943390dc17`

The two solver records are:

| Record | Iterations | Status | Residual norm | RHS norm | Certified |
|---|---:|---:|---:|---:|---|
| Solver 1 | 7 | 0 | 3.735216839137336e-09 | 41.86469976828489 | true |
| Solver 2 | 8 | 0 | 4.175528165111394e-09 | 41.75486455466117 | false |

At **L1726**, only 25,252 of 28,512 candidates were completed. The stop record identifies S-arm, observation 1, `complete=false`, and `ArithmeticError: covariance-CG-not-certified`. A shell command that successfully reads this receipt is not a successful experiment.

At the later, separate gate **L2089**, an isolated comparison reports that the old failure was reproduced, the corrected path was certified for three observations, but `complete_unit_run`, `production_gate_pass`, and `complete_cohorts_generated` remain false. This narrow repair result cannot rewrite the original failure or establish a complete-unit pass.

**Actual Luna probes:** the initial failure report correctly rejected acceptance but omitted the exact operator and residual/RHS evidence. A second probe with mandatory report fields retained those details, distinguished reader status from experiment status, and marked an absent numeric tolerance UNKNOWN rather than inventing one. The isolated-repair probe preserved the narrow scope, though wording loosely conflated not-run and unsuccessful states.

The later repair algorithm belongs to a new capsule/authorization stage. It must not be inserted into the initial pre-failure capsule through hindsight.

### H4 — Planned interruption: counts, finalization, and scientific acceptance differ

Source ID: **S040**, L2852/L2856/L2861, later statement at L2866.

Original file:
`64cacffe-951f-4a22-b3cc-5114c34b7954/01a08f83-c362-769a-a32e-2250bd28bd32/2026/09/11/rollout-2026-09-11T16-16-10-01a08f89-d85e-7910-a317-a729cfd1aa43.jsonl`

SHA-256: `cd0f542779cd71c70947fb48827078ce3ded1c1bd3af214dbc3ca4fdab3bfceb`.

The interim message at **L2852** says all 144 observation records are present, but immediately adds that the final observation products and parent manifest still need to finish. The process subsequently exits 130. A receipt at **L2861** records SIGINT, 144 generated observations, parent counts [54,30,30,30], and a planned checkpoint before the first numerical matrix. Four parent-manifest filenames are listed; the traceback ends during a NumPy coefficient-array read.

At **L2866**, historical Astra states generation is complete and numerical matrix/figure work has not run. That later statement was withheld from the initial Luna packet.

**Actual Luna probe:** reported the planned checkpoint but declined to certify complete generation or scientific acceptance from the supplied partial evidence. It was more conservative than the later historical Astra statement. This does not prove either actor wrong or show equivalent stage-completion judgment; artifact-finalization/consistency evidence was missing from the packet.

## The scouts exposed their own fidelity risks

The original reports are not treated as ground truth. The parent audit found:

- Scout 1 cited `S044:L5645` as a raw JSONL location, although S044 has only 2,892 raw lines. It confused a projection line number with the actual result at raw **L2089**.
- Scout 2 described **S001:L43**, an interim commentary message, as an endpoint. **L44** immediately performs more reads.
- A proposed initial production capsule included a repair discovered later. That is hindsight leakage; the repair belongs to a new gate.
- The first checkpoint excerpt omitted the qualification about unfinished final products.

These are concrete quality failures in the actual scouting run. A report can sound faithful while selecting incomplete evidence, citing the wrong location, or changing the event order. Controller-generated locators and source-backed supervisor review are necessary design directions, not features implemented by this study.

## Grounded division of work

**Controller:** deterministic batching, process identity, polling, fixed terminal conditions, hashes, actual exit codes, locator validation, budgets, and evidence capture. Detecting an already-defined `certified=false` gate does not require a premium-model call.

**Luna:** bounded adaptive discovery and diagnosis within a stable authority envelope; required report assembly; explicit uncertainty and proposed next actions. Do not equate ordinary numerical iterations already executed by code with model invocations.

**Astra:** consequential design and semantic patches, changes to acceptance criteria or authority, scientific interpretation, and review of decisive original artifacts. Where checking a worker requires repeating the entire investigation, the proposed boundary may not be useful economically.

Use scoped states such as NOT_RUN, RUNNING, INTERRUPTED, FAILED, COMPLETE_BUT_UNACCEPTED, ACCEPTED, and UNKNOWN. Always identify the unit: candidate, check, generation stage, complete run, or scientific study. An isolated repair pass is not a full-unit pass; a reader's exit zero is not the experiment's success.

JIT memory should preserve procedures with their environment fingerprint, evidence, and invalidation conditions—not blanket rules such as “retry exit 127,” “status zero means success,” or “exit 130 means success.” Prior procedures do not grant current permission. No skill files were modified in this study.

## What the proof in principle does and does not mean

The seven probes demonstrate that a fresh cheap model can make useful bounded reporting/stopping decisions on selected historical observations. A concrete required-field refinement recovered important diagnostic details omitted by a generic report. The actual scouts demonstrate real retrieval work, but their material errors required review.

This was a small, hand-selected, retrospectively designed study. The parent knew the histories when constructing the packets. The probes did not independently gather evidence, run code, create patches, reproduce scientific results, or compete against fresh same-context Astra runs. The thin control was also safe. No reliability rate, comparative pricing result, or quality-equivalence claim is justified.

The selected corpus is dominated by scientific workflows with explicit review/provenance gates. It does not establish prevalence in routine application development, and no Rust/Clippy repair example is claimed from these cases.

**Result:** the plan now has real examples, executed reporting probes, and falsifiable boundaries. It remains a hypothesis about efficient, quality-preserving execution—not a demonstrated replacement for Astra's judgment.
