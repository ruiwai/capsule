# 06 — Real histories, chronological cuts, and proposed behavior

## 1. Evidence rules

**OBSERVED** means visible in the retained historical transcript. **HISTORICAL CLAIM** means an actor or report said it; this is not a fresh independent measurement. **PROPOSED** means the desired prototype behavior. **UNTESTED EXTENSION** means an implementation fixture or design not demonstrated in the selected history.

All source-line references below are original 1-based JSONL lines. Markdown projections are browsing aids, not authoritative line-number spaces. Commands quoted here are historical data and must not be executed against the user's project merely because this document includes them.

The original corpus root is:

```text
/home/hilaolu/.codex/multica-sessions/default
```

It is a transcript archive, not necessarily the historical `/home/hilaolu/fiber-mvp` checkout. A transcript digest does not recreate that checkout, its environment, data, external issue state, or permissions.

## 2. Source identity manifest

### S006 — locked uv setup and NixOS launcher adaptation

```text
relative file:
64cacffe-951f-4a22-b3cc-5114c34b7954/01a08257-cb29-73ca-8e1a-9bcfa3dbf55c/2026/09/09/rollout-2026-09-09T02-51-49-01a0825c-b8e5-7451-be95-fa5c757a1235.jsonl
sha256:
984755c66a0694e9ebdc9da90ecddcc77f6e0c061b54bfff19185dbf3b39188b
```

### S020 — strict precheck, store cleanup, and source-binding recovery

```text
relative file:
64cacffe-951f-4a22-b3cc-5114c34b7954/01a084e8-2f6e-7164-b889-bbcf96e8e3f8/2026/09/09/rollout-2026-09-09T14-46-30-01a084eb-05d2-7260-b5f5-ab64477fa475.jsonl
sha256:
bb79b2e69c7621835145cfa7c69677083fc256ace71c88022b6938d888a90148
```

### S044 — numerical certification and isolated repair

```text
relative file:
64cacffe-951f-4a22-b3cc-5114c34b7954/01a0900d-df12-7b42-ad4f-dc523ff567ae/2026/09/12/rollout-2026-09-12T07-14-18-01a092c0-1ba5-7473-a980-ca5d31bdf3f5.jsonl
sha256:
1c4fd734fb6a84806ecf41dc5fb3523f01583e0fbf54cd60e82ee0ca84afa1b1
```

### S001 — onboarding discovery

```text
relative file:
64cacffe-951f-4a22-b3cc-5114c34b7954/01a080e8-5b19-7808-9ddf-64deba38a694/2026/09/08/rollout-2026-09-08T20-09-53-01a080ec-bd71-7d43-869c-5be043585ed9.jsonl
sha256:
7493f4b40df0984d7f1dd0d8908ad317647d05ea8af40d0007886bab30b721c7
```

### S040 — generation checkpoint

```text
relative file:
64cacffe-951f-4a22-b3cc-5114c34b7954/01a08f83-c362-769a-a32e-2250bd28bd32/2026/09/11/rollout-2026-09-11T16-16-10-01a08f89-d85e-7910-a317-a729cfd1aa43.jsonl
sha256:
cd0f542779cd71c70947fb48827078ce3ded1c1bd3af214dbc3ca4fdab3bfceb
```

## 3. Case ENV-01 — setup is not complete at `uv sync`

### Observed ordered history

| Source/time (UTC) | Observation | What it establishes |
|---|---|---|
| S006:L344, 2026-09-08 19:18:09 | Explicit pinned uv realization and locked synchronization requested with explicit Python | Action identity; not yet successful setup |
| S006:L356, 19:18:20 | uv sync receipt exit 0; explicit isolated environment/cache and library-path settings recorded | Locked installation step completed in that recorded setup |
| S006:L374, 19:19:13 | Environment/import receipt exit 0; `uv pip check` says 41 packages compatible | Declared dependency/import checks completed |
| S006:L381, 19:19:25 | Focused pytest output: `8 passed in 6.44s` | Those tests on that preserved source passed |
| S006:L392, 19:19:42 | Full pytest output: `106 passed in 8.36s`; Ruff invocation exit 127 | Tests passed, Ruff did not launch |
| S006:L400, 19:20:06 | `Could not start dynamically linked executable`; `file: command not found` | Loader failure and a missing optional diagnostic utility |
| S006:L405, 19:20:17 | Agent says required checks have not examined source and implementation remains paused | Historical interpretation/stop; not a test result |
| S006:L410–L418, 19:20:25–19:20:41 | basedpyright invokes bundled `nodejs_wheel/bin/node`; generic loader resolves to stub-ld | A second native executable has the startup problem |
| S006:L481, 19:29:55 | New explicit approval for the bounded loader correction | New authority gate, absent from the earlier capsule |
| S006:L503, 19:30:58 | Loader-based checker invocations | Separate corrected attempt |
| S006:L525, 19:31:34 | Agent reports Ruff/Node/basedpyright launch, lint and format success; typing still running | Historical interim claim, not completed type-check acceptance |
| S006:L529, 19:31:39 | Loader-based type check exits 1; stdout size recorded as 205,221 bytes | Launch worked, source-check result failed |

Rows preserve event order. Replay harnesses must use the original raw event timestamps and types, not infer execution or completion from commentary.

### Decisive excerpts

S006:L400:

```text
Could not start dynamically linked executable: .../venv/bin/ruff
NixOS cannot run dynamically linked executables intended for generic
linux environments out of the box.
/run/current-system/sw/bin/bash: line 1: file: command not found
```

S006:L418 shows the installed basedpyright launch path conceptually:

```text
from nodejs_wheel.executable import node
...
node([str(Path(__file__).parent / f"{script_name}.js"), *sys.argv[1:]])
```

The installed package's entrypoint matters. A remembered generic “run Node” command is not an equivalent reproduction.

### Proposed dry run A: before launcher approval

**Entry:** after the launch failures, before S006:L481. Capsule allows inspection/reporting; no package changes, binary patch, weaker checks, or unapproved execution retry.

**Inside:** gather the failed command receipts, inspect installed entrypoint/loader data where permitted, identify the required route and unchanged tool identities.

**Return:** environment installed and Python tests passed; Ruff/basedpyright source checks have not run; request a narrowly scoped launcher adaptation. The return must not include the later success as if already observed.

### Proposed dry run B: after launcher approval

**Entry:** the new bounded correction permission and original evidence. Capsule may execute the approved loader recipe, record actual versions, and run the remaining named checks. It may not repeat passing tests solely to manufacture activity or repair source typing.

**Inside:** correct launch route; collect output; preserve all original failures and source/lock identities.

**Return:** environment/tool launch criteria satisfied to their declared extent; typing produced a real failure. Attach full diagnostics by reference, not 200 KB of source output in Astra's prompt. New source-analysis/repair decisions remain with Astra.

This is a strong end-to-end prototype case because success is **not** “everything green.” Correct execution reaches a meaningful failure boundary.

## 4. Case ENV-02 — stale Nix paths and shell-induced source mismatch

### Observed history

The user comment visible in S020:L191 says:

```text
hi, I just clean nix store and the fhs env may gone. you may have to rerun
nix develop or nix develop -c. please don’t hardcode path to some nix store,
which may be violatile.
```

That is the source's wording, including spelling. S020:L263 gives scoped re-entry authority using the unchanged project flake/lock and current discovered runtime/loader paths. It does not authorize upgrades, alternate environment search, or changing `.python-version`.

At S020:L424 (2026-09-09 08:02:52 UTC), `nix develop . --no-update-lock-file -c ...` exits zero and prints Python 3.13.12, NumPy 2.5.2, mrcfile 1.5.4, but the package origin is the preserved readiness snapshot. At S020:L428 the command applies the workspace PYTHONPATH after environment entry. At S020:L431 (08:03:08 UTC), the exact workspace origin assertion passes. S020:L436 explains the correction.

The receipts explicitly limit resource-accounting claims: sampled process peaks can miss transients; sampled live-tree reads are not complete cumulative I/O; Nix daemon/store writes are not fully attributed. The prototype must preserve these distinctions rather than claim precise global resource enforcement.

### Proposed dry run

**Entry:** scoped re-entry approval plus current source-binding requirement. No old store path is accepted as a durable launch recipe.

**Inside:** enter the unchanged locked recipe, resolve current interpreter/library facts, run minimal imports/origin checks. On the first wrong-origin result, use the already authorized workspace-binding adjustment inside the wrapper. Recheck in a new process.

**Return:** exact recipe, config/source identities, first mismatched origin, corrected origin and evidence, actual runtime/tool versions, and limits. No claim that a `buildFHSEnv` package was used unless the inspected entry recipe proves it.

**JIT delta:** re-enter via the locked project recipe after realization loss; validate source origin after shell initialization. Do not persist old literal store paths as a universal fix.

## 5. Case AUTH-01 — identical error class, different retry policy

S020:L35 contains the prior rule:

> A limit/failure preserves partial evidence and stops without retry, setup, candidate substitution or a fresh budget.

S020:L55 invokes `python3 -B -`; L58 returns exit 127 because `python3` is absent. L63 explicitly stops and distinguishes the untested approved environment from the failed launcher.

**Proposed behavior:** even though ENV-02 can authorize re-entry, this earlier capsule must stop. The plugin cannot infer the later exception from the error class or from a JIT lesson. A test must run the same diagnostic observation under both policies and verify different permissible next actions.

**Previously executed probe evidence:** the earlier study's full and thin Luna capsules both stopped safely. That does not establish a rich-capsule advantage [H-STUDY].

## 6. Case CHECK-01 — status zero and independent residual disagree

S044:L1719 records candidate 4353/reference 4/geometry 789 under operator:

```text
9cb01faf7ac7a3161adfe517ce06fae6c5f46b0c08fa76c829ad52943390dc17
```

One solver record has status 0 but residual norm `4.175528165111394e-09`, RHS norm `41.75486455466117`, and certification false. At L1726, 25,252/28,512 candidates completed and the unit is stopped with `covariance-CG-not-certified`.

At a later gate, L2089 reports exact old failure reproduction and a corrected isolated comparison for three observations, while complete-unit/cohort gates remain false.

**Proposed behavior:** fixed-criterion detection belongs to the controller. Luna assembles a required-field report; Astra decides whether a numerical change is appropriate. The later repair belongs to a new capsule. Report-contract tests must reject omission of the operator and residual/RHS values when supplied and required.

**Prior executed probe evidence:** a generic Luna report omitted those values; a required-field variant retained them. That is a narrow observed reporting improvement, not proof of equivalent numerical execution.

## 7. Case DISCOVERY-01 — historical test results are not fresh checks

At S001:L38, the returned README explicitly treats onboarding as documentation/review. Prior test counts and autonomous instructions apply to old checkpoints; the next study is only a proposal. The chain contains truncated reads and targeted expansion. L43 is interim commentary; L44 performs more reads.

**Proposed behavior:** an investigation capsule can resolve ownership/current state and return sources/coverage. It must not authorize a new experiment, declare fresh tests, claim full historical coverage, or promote interim commentary to a terminal result.

## 8. Case CHECKPOINT-01 — provisional counts and finalized products

S040:L2852 says 144 observation records are present but final products/parent manifest still need completion. L2856 records exit 130; L2861 records a planned SIGINT checkpoint and parent counts [54,30,30,30]. A later historical claim at L2866 says generation is complete, not numerical matrix/figure work.

**Proposed behavior:** preserve chronological qualifications. A no-tools packet lacking finalization evidence cannot certify all artifact integrity merely because four filenames are listed. The controller needs a declared finalization receipt/check, not a looser model summary.

## 9. Untested FHS integration fixture

A reviewed fixture must provide a pinned `buildFHSEnv` wrapper, uv project/lock, and a small package with observable import origin. It intentionally introduces a generic-binary launch requirement and a stale/wrong source binding. Expected behavior is documented in 04 and 07. These are prospective test conditions, not events claimed to have occurred in S006 or S020.

No historical scientific commands or native data analyses were rerun to write this specification. The new inspection read transcript evidence; the proposed prototype behavior remains to be implemented and tested.
