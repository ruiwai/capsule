# 04 — NixOS / uv / Python / FHS environment recovery

## 1. The concrete prototype feature

The implementation MUST support a worker episode that performs dependent shell diagnosis and authorized environment repair, not only a no-tools report simulation. The desired artifact is an **environment handle that another process can actually use** against the intended source tree.

The episode establishes a declared combination of these units:

| Unit | Evidence needed |
|---|---|
| `shell-entry` | Approved wrapper entered and child status captured |
| `python-runtime` | Actual executable/realpath, version, implementation, platform |
| `locked-environment` | Selected uv version, lock identity, sync result, installed dependency record |
| `package-imports` | Requested modules import; versions and origins recorded |
| `workspace-binding` | Project module origin is the requested source root, not an old editable snapshot |
| `tool-launches` | Exact installed Ruff/Node/type-checker binaries execute through their required launch route |
| `source-checks` | Named checks actually ran, with pass/fail/skips/diagnostics |
| `fresh-process-reuse` | A new command recreates the boundary and verifies the required identities/origins |

Passing an earlier row does not establish later rows. A source-check failure may prove that the environment now works well enough to expose a real source problem. It must not be “fixed” by changing the checker, passing different flags, or pointing it at an old snapshot.

## 2. Real case A: uv succeeds, generic Linux checker binaries do not

The observed sequence in **S006** is:

1. An explicit uv 0.9.30 executable synchronized the preserved project using `uv sync --verbose --locked --group dev --python <explicit CPython 3.13.12>` into a separate environment. `UV_PROJECT_ENVIRONMENT` and `UV_CACHE_DIR` pointed to task-local directories. The sync receipt reports exit zero [S006:L344–L356].
2. Dependency checks and scientific imports succeeded. The transcript reports 41 installed packages compatible, eight focused tests, and 106 full-suite tests on the preserved source [S006:L374–L392].
3. Ruff returned exit 127 with the NixOS generic-executable loader message. The attempted `file` diagnostic was itself unavailable [S006:L400].
4. basedpyright's Python entrypoint launched the bundled `nodejs_wheel/bin/node`, which had the same loader problem. Inspection showed `/lib64/ld-linux-x86-64.so.2` resolved to NixOS's stub loader [S006:L410–L418].
5. The agent stopped at the required-check failure gate and proposed a narrow launcher correction. A later authorization explicitly approved that route without changing binaries, packages, source, assertions, or earlier passing tests [S006:L405, L481].
6. After the authorized loader route, Ruff/Node/basedpyright launched; lint and formatting passed. The configured type checker then exited one with a substantial diagnostic output [S006:L503, L525–L529]. **Tool launch was repaired; source typing was not thereby passed.**

The lesson is not “always set LD_LIBRARY_PATH.” In this history, library-path settings already existed during successful Python imports and failed generic-binary launch. The binary's interpreter/loader route was a separate failure. The exact successful route used the installed Node binary with basedpyright's `index.js`, not an assumed `venv/bin/node` or an arbitrary analyzer file.

## 3. Real case B: store cleanup, re-entry, and wrong source origin

The user later reported Nix-store cleanup, said the FHS environment might have disappeared, authorized necessary `nix develop` re-entry, and asked not to hardcode volatile store paths [S020:L191, L263]. The inspected project route was described as `mkShell`. **The user's term “FHS” does not prove this particular successful command used `buildFHSEnv`.** The implementation must inspect the actual registered wrapper rather than conflate these routes.

The recorded `nix develop . --no-update-lock-file -c ...` command successfully imported Python and dependencies, but `fiber_mvp.__file__` pointed to:

```text
results/readiness_clm3_v1/source/src/fiber_mvp/__init__.py
```

The desired current-workspace origin was:

```text
/home/hilaolu/fiber-mvp/src/fiber_mvp/__init__.py
```

A second command placed `PYTHONPATH=/home/hilaolu/fiber-mvp/src` **inside** the `nix develop ... -c env ...` invocation and asserted the exact package origin. It exited zero, and the historical agent explained that shell entry had reset the import path [S020:L424–L436].

Therefore the capsule must state which source is intended. For an archived regression, the retained snapshot could be correct; for current implementation checks it was wrong. `import fiber_mvp` alone is not sufficient verification.

## 4. Entry prerequisites and bootstrap

The controller and command recorder must run using the already available Pi/Node runtime. **Do not require the broken Python environment to launch its own repair monitor.** A missing interpreter must not prevent command recording, timeout handling, and failure reporting.

Admission requires a project root, actual source binding, protected config/source files, allowed installation/write roots, a current authority source, and a named environment-entry recipe. Missing a recipe can be handled by read-only discovery or an inert recipe proposal; it does not authorize arbitrary `nixpkgs` revisions.

Only collect preflight facts that affect the next action: current recipe/config digests, existence of required entry tools, remaining task budget, free space where writes will occur, whether the target environment belongs to this task, and any historical stop rule. Do not spend many model turns re-auditing unrelated files or running speculative environment matrices.

The working copy, retained snapshot, uv environment, uv cache, Nix realization/cache, and evidence directory are different roots. Record them separately. Do not assume an existing `.venv` can be overwritten. A new environment path must be fresh or already owned by the same task/handle with matching identity.

## 5. Recipe registry

A recipe is controller-approved data describing the wrapper and argument contract. Minimum fields:

```text
id / version / digest
wrapper kind: host | nix_develop | fhs | explicit_loader
project and config identities
executable/entrypoint resolver
argument forwarding contract
allowed typed parameters and write roots
environment variables set, unset, or intentionally inherited
source-binding placement
network/realization requirements
verification recipe IDs
supported platform/architecture
```

The model can propose a new recipe but cannot register it as executable authority. Changing a Nix expression, selected package set, interpreter minor version, dependency lock, or global loader configuration is a new design/authorization decision.

### 5.1 Existing locked `nix develop` route

Use the exact approved installable and existing `flake.lock`; reject required lock changes. Bind absolute task paths as argv data. The general wrapper shape is:

```bash
# Illustrative invocation shape; the controller supplies validated values.
nix develop "$APPROVED_INSTALLABLE" --no-update-lock-file \
  -c bash --noprofile --norc -c 'exec "$@"' capsule-entry \
  "$TARGET_EXECUTABLE" "$ARG1" "$ARG2"
```

The actual recipe can use a controller-owned script rather than `bash -c`. The selected shell must exist inside that route. A project shell hook may alter variables; source binding and task cache overrides must be applied after the relevant shell initialization. Record the actual child executable. `nix develop` prepares the selected development environment [NIX-DEVELOP]; it does not prove a generic Linux binary's interpreter path works.

### 5.2 Existing FHS wrapper route

An FHS recipe identifies the actual wrapper executable or locked package output and its argument behavior. For a wrapper whose `runScript` is Bash, one possible shape is:

```bash
# Only valid for a registered wrapper that forwards these arguments to Bash.
nix run "$APPROVED_FHS_INSTALLABLE" --no-update-lock-file -- \
  -c 'exec "$@"' capsule-fhs "$TARGET_EXECUTABLE" "$ARG1" "$ARG2"
```

Do not infer this interface from the name “FHS.” A project may expose an app, a package wrapper, or a shell entry that enters FHS through a hook. Admission must use the actual contract and verify argument/status propagation.

FHS provides a filesystem/process environment; its mounts and `/lib` layout are not an environment-variable dictionary. Each command using the handle must re-enter the wrapper. Capturing `env` inside FHS and later running outside it is invalid. FHS environments are compatibility machinery and provide no security-relevant host separation [NIX-FHS].

If the project has no approved FHS wrapper, Luna may prepare a scratch proposal explaining why it is needed and which pinned packages are involved. It must not silently add or replace the project flake, upgrade nixpkgs, or modify `/etc/nixos`. A fixture used for acceptance testing can supply a reviewed FHS package from the outset.

### 5.3 Explicit dynamic-loader route

This is a separate permission, motivated by the actual S006 repair. It can preserve an installed generic binary while selecting an approved compatible loader/library set. Do not patch the binary or install a newer checker just to make launch work.

```bash
# Recipe-resolved values, not paths copied from a previous transcript.
"$RESOLVED_LOADER" --library-path "$RESOLVED_LIBRARY_PATH" \
  "$VENV/bin/ruff" check src tests --no-cache
```

For the observed basedpyright layout, the route used the bundled Node executable and its package entrypoint:

```bash
"$RESOLVED_LOADER" --library-path "$RESOLVED_LIBRARY_PATH" \
  "$BUNDLED_NODE" "$BASEDPYRIGHT_INDEX_JS" --pythonpath "$VENV/bin/python"
```

The implementation must inspect the installed layout and preserve its argument/exit behavior; do not universally hardcode Python 3.13 directories or assume this layout for every release. Resolve loader and library paths from the selected pinned project environment/recipe, record them as observed identities, and verify tool versions through the same route. Missing/incompatible loader evidence is a blocker.

A direct loader for one process does not automatically fix every subprocess that executes a generic binary. A recurring subprocess interpreter problem may justify an approved FHS or existing nix-ld route instead. New host nix-ld activation is outside v0.1; it is not a background “environment tweak” [NIX-LD].

## 6. Python and uv selection

uv can choose/discover interpreters and may download one when needed; an explicit interpreter path and download policy prevent accidental selection changes [UV-PYTHON]. Discover the intended Python **inside** the approved Nix/FHS wrapper, then verify its identity and the project's `.python-version`/`requires-python` requirements.

Record `sys.executable`, resolved executable, `sys.version`, implementation, platform, and relevant ABI metadata. A version string alone does not identify the source package or loader. Do not replace an unavailable Python 3.13 with a convenient Python 3.12 and call the original contract satisfied.

For a locked uv project, the synchronization recipe should explicitly bind the task environment and cache:

```bash
# Illustrative content of a controller-approved script already inside the wrapper.
set -euo pipefail
uv_bin=$(command -v uv)
python_bin=$(command -v python3)
export UV_PROJECT_ENVIRONMENT="$TASK_ENVIRONMENT"
export UV_CACHE_DIR="$TASK_UV_CACHE"
export PYTHONDONTWRITEBYTECODE=1
"$uv_bin" sync --locked --group dev --python "$python_bin" --no-python-downloads
```

`dev` is a project-specific selected group, not a universal choice. The controller must validate groups and optional extras against the task. Reusing an existing approved environment can skip synchronization when its criteria are already verified and still valid.

`--locked` checks lock freshness and errors rather than updating it; `--frozen` skips that freshness check and is not an equivalent fallback. `uv run` normally locks/syncs automatically, so verification must either invoke the already selected environment executable directly or use an explicitly approved no-sync route [UV-SYNC]. Do not accidentally re-sync the environment during supposedly read-only verification.

`UV_PROJECT_ENVIRONMENT` controls the project environment; ordinary `VIRTUAL_ENV` does not by itself select it for uv project operations [UV-CONFIG]. Record both when relevant and avoid changing a pre-existing user's environment. Isolate uv cache/materialization writes; do not point the task at system Python's prefix.

Build-backend dependencies can be separately resolved in isolated build environments. The historical uv output records such backend selections. A successful `--locked` sync is not automatically proof of a bit-for-bit closed build toolchain. Capture backend versions/logs when required, or record that build-time reproducibility remains unverified. Do not silently disable build isolation as a universal fix.

## 7. Adaptive diagnostic loop

At each step Luna proposes the next permitted action with a brief reason and new evidence. The controller checks the current contract and budget, executes, and returns the observation. Continue locally only while both permission and useful progress remain.

| Observation | Local action when authorized | Stop/escalate boundary |
|---|---|---|
| Shell cannot find `python3` | Inspect approved entry recipe/interpreter identity; enter the allowed environment | Strict no-retry rule, absent recipe, incompatible interpreter version |
| Interpreter path vanished after store cleanup | Re-enter/re-realize unchanged locked recipe; resolve paths again | Lock/config change required; realization/network/resource permission absent |
| `uv sync --locked` succeeds | Verify installed runtime, package imports/origins, tools and named checks | Never return “all checks passed” solely from sync |
| `uv sync --locked` says lock outdated | Preserve error, report metadata/lock mismatch | Do not retry with `--frozen`, update the lock, or remove constraints |
| NixOS generic executable/stub-loader failure | Inspect target/entrypoint; use pre-approved FHS or explicit-loader recipe | New runtime/package set, binary patch, host configuration needed |
| Import fails with a missing shared library | Capture actual diagnostic and relevant binary/library identity; inspect approved library closure | Do not conclude it is the same failure as missing ELF interpreter; no arbitrary global library export |
| `file`/`readelf` diagnostic unavailable | Use another already authorized minimal observation, or report diagnostic coverage limit | Do not launch a package-install side quest without permission |
| Python/imports work but project module origin is wrong | Apply approved source binding inside final wrapper; assert exact origin in new process | Intended source root unclear; patching package metadata/source needed |
| Checker launches and emits genuine diagnostics | Preserve complete output and classify launch success separately | Source repair, checker option changes, or acceptance waiver needed |
| Command times out without a complete receipt | Record interruption/partial evidence and reconcile owned process | Do not assume it never ran or give it a fresh budget |
| Repeated same failure without new evidence | Stop as no progress within the capsule | No identical retry loop or context reset to renew attempts |

Expected recovery classes are declared in the capsule. An environment capsule can permit multiple local adjustments; a preservation precheck can forbid any. The controller must select the policy from current authority, not from a generic “be autonomous” instruction.

## 8. Source binding and verification

There are two supported source-binding intentions: `workspace` and `retained_snapshot`. The expected package origin is part of the contract. A probe must run inside the actual wrapper and print/return the module origin, not merely rely on the shell's cwd.

For the real regular Python package, the relevant check is conceptually:

```python
import fiber_mvp
from pathlib import Path
assert Path(fiber_mvp.__file__).resolve() == EXPECTED_INIT_FILE.resolve()
```

The implementation provides a registered diagnostic script with typed module/root parameters, not arbitrary model-interpolated Python. Namespace packages, compiled modules, and zip imports need explicit origin policies; report unsupported cases rather than accepting them by string-prefix guess.

Setting `PYTHONPATH` is acceptable only when the source-binding policy explicitly permits it. Otherwise it might hide a packaging defect. Apply it inside the last environment wrapper, record the value, and rerun the origin check from a fresh process. Do not globally modify `.bashrc`, `.profile`, or the parent Pi process environment.

## 9. Fresh-process acceptance

A candidate handle is verified only after a new process, launched from the canonical execution root, reproduces the declared criteria through that handle. The check MUST NOT depend on shell state left by the worker.

Required minimum for the environment profile:

* Configuration/lock/source binding identities still match.
* Python executable and required version are correct.
* Required imports succeed with the expected origins and versions.
* Required native tool entrypoints launch through the recorded wrapper.
* Check results remain individually labeled; failed source checks are not converted to passes.
* Protected project files and accepted evidence have not changed unexpectedly.

The fresh-process action must already be authorized and budgeted. It can be a cheap identity/import/tool-launch smoke rather than repeating every expensive source test. Snapshot-bound earlier checks may be reused only when their inputs, environment-sensitive dependencies, and relevant source identity remain valid.

## 10. Returned environment report

A useful report from the S006-style repair should look like this **as an expected schema, not a newly executed result**:

```text
Environment unit: operational through approved loader recipe, pending supervisor review.
Source binding: retained readiness snapshot, not current workspace.
Locked setup/imports: verified by cited historical or current receipts, labeled accordingly.
Ruff launch: passed. Ruff lint/format: recorded separately.
basedpyright launch: passed. Source type check: failed; full diagnostics retained.
Protected source/locks: unchanged according to named identity checks.
Next decision: source typing disposition or a new diagnostic capsule; no source repair performed.
Handle: recipe identity, exact tools, current realization data, fresh-process evidence.
```

A S020-style report must identify the first wrong-origin observation, the authorized inner source-binding adjustment, and the later origin assertion. It must not silently discard the earlier success-with-wrong-source result.

## 11. JIT learning from environment friction

A promotable lesson is:

> Under this locked project recipe and platform, direct generic checker launch may hit the stub loader even when Python imports work. Inspect the installed entrypoint and use the approved loader/FHS route. Verify versions and source origin in the actual wrapper; resolve runtime paths from the current pinned realization.

It is not:

> Always export these three `/nix/store` paths, retry exit 127, or call the environment ready after uv succeeds.

The handle stores observed paths for attribution; the JIT entry stores the resolution procedure and its invalidation conditions. Store cleanup, lock changes, missing binaries, changed source binding, or failed smoke checks invalidate reuse. A prior lesson grants no permission to re-enter an environment when a new task prohibits setup.

## 12. FHS coverage and limits

This specification requires a genuine FHS **integration fixture** because the user explicitly needs that workflow. The selected history contains uv/loader failures and an FHS-related cleanup request, but it does not establish a complete observed `buildFHSEnv + uv` recovery sequence. The FHS fixture and proposed recipe are an engineering extension grounded in those failure classes and current Nix documentation, not invented historical success.

The integration fixture must prove wrapper re-entry, isolated uv environment creation, locked dependencies, Python/tool launch, correct source origin, and a new-process replay. It must deliberately demonstrate that copying environment variables out of the FHS process is not accepted as an equivalent handle. See T24 and WP3.
