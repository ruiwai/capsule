# 10 — Sources, provenance, and decision register

## 1. Source classes

**Historical user material:** the original proposal and transcript study supplied in this conversation, plus read-only inspection of selected raw-history projections in the connected workspace. Their terminology and limitations are preserved. No historical approval is current permission to execute the project.

**New design:** normative requirements, contracts, architecture, defaults, prompts, and tests in this package. These are proposed engineering decisions, not facts proved by the earlier dry run.

**External verification:** current primary documentation consulted on 13 September 2026 to constrain Pi/uv/Nix integration. These sources describe mechanisms, not the user's historical outcome. Implementers must pin the installed versions rather than depend on moving `main` or `unstable` documentation.

## 2. Historical references

| ID | Material | Use / limit |
|---|---|---|
| H-PROPOSAL | Original `Pasted text.txt` supplied in conversation | Astra/Luna role split, bash friction, JIT hot/cold procedure concept; illustrative Nix example was not execution evidence |
| H-STUDY | `evidence/prior-study.md` | Prior 205-file inventory, three scouts, seven no-tools probes, audit, and limits |
| H-UV-LOADER | S006 in 06, primarily L344–L529 | Actual locked uv setup, imports/tests, generic checker launcher failures, later scoped correction, type-check failure |
| H-NIX-RESTORE | S020 in 06, primarily L191/L263/L420–L436 | Cleanup/re-entry authorization and actual wrong-source then corrected-source import evidence |
| H-NO-RETRY | S020:L35/L55/L58/L63 | Strict precheck policy and launcher failure; later permission must not leak backward |
| H-NUMERICAL | S044:L1719/L1726/L2089 | Solver status versus certification; separate isolated correction gate |
| H-DISCOVERY | S001:L13–L44 | Dependent reads, historical checks, truncation, interim commentary |
| H-CHECKPOINT | S040:L2852–L2866 | Provisional count, planned interruption, and missing finalization evidence |

The corpus/source identities are given in 06. Raw records are in the user's workspace; this portable package contains selected observations and documentation, not the 1.75 GB archive. Some source projections contain truncation, and opaque/encrypted payloads were not used to fill gaps. Historical actor claims remain labeled as claims.

## 3. Primary technical references

URLs are provided as implementation references, not commands to execute.

| ID | Source | Relevant mechanism |
|---|---|---|
| PI-EXT | `https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md` | Custom tools, progress/UI and persistent entries, context projection, command-only session-control caution, nested usage |
| PI-SDK | `https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md` | `createAgentSession`, custom tool selection, resource loading, sessions/events |
| UV-PYTHON | `https://docs.astral.sh/uv/concepts/python-versions/` | Interpreter requests/discovery and automatic download behavior |
| UV-SYNC | `https://docs.astral.sh/uv/concepts/projects/sync/` | Locked/frozen/no-sync distinctions and automatic project synchronization |
| UV-CONFIG | `https://docs.astral.sh/uv/concepts/projects/config/` | Project-environment path, VIRTUAL_ENV distinction, build isolation |
| NIX-DEVELOP | `https://nix.dev/manual/nix/2.34/command-ref/new-cli/nix3-develop.html` | Development-shell invocation and command execution |
| NIX-FHS | `https://nixos.org/manual/nixpkgs/unstable/#sec-fhs-environments` | FHS wrapper, runtime namespace lifetime, `runScript`, and lack of security-relevant host separation |
| NIX-LD | `https://github.com/nix-community/nix-ld` | Generic dynamic-binary compatibility mechanism; distinct from global permission to enable it |

The workspace's installed Pi executable reported version **0.85.1** during this specification session. Its Nix wrapper path identified `pi-coding-agent-0.85.1`. No SDK compilation or plugin compatibility test was performed while writing these documents. The historical uv 0.9.30, Python 3.13.12, and checker versions belong to their source receipts, not assumed current public versions.

## 4. Architecture decision register

| ADR | Decision | Reason / tradeoff |
|---|---|---|
| ADR-01 | Explicit delegation, no automatic router | Test the actual task boundary and economics before learning a routing policy |
| ADR-02 | Official Pi SDK worker adapter | Reuse runtime/session/provider machinery while controlling tools and evidence; avoid mandatory third-party integration surface |
| ADR-03 | Controller owns commands, receipts, and deterministic gates | Worker summaries cannot manufacture execution or acceptance facts |
| ADR-04 | Environment recovery is a capsule kind | uv/NixOS work involves adaptive choices and permissioned retries, not only read-only research |
| ADR-05 | Fresh worker per episode, unchanged supervisor | Bounded context without risky session replacement or arbitrary transcript surgery |
| ADR-06 | Foreground lifecycle, no daemon | Concrete cancellation/ownership and no premium-model status polling; long work uses explicit checkpoint/resume |
| ADR-07 | Trusted-local execution explicitly opted in | Keep v0.1 feasible for the user's local workflow while refusing to misrepresent FHS/worktrees as security sandboxes |
| ADR-08 | Recipe-backed environment handles | New processes need a reproducible wrapper, not just copied variables or stale store paths |
| ADR-09 | Verify module source origin | Actual S020 re-entry succeeded against the wrong source until inner binding was corrected |
| ADR-10 | Separate tool launch, check result, and acceptance | Actual S006 launcher repair exposed a real type-check failure; solver/checkpoint cases reinforce the distinction |
| ADR-11 | Small scoped JIT deltas, explicit promotion | Reuse procedures without rewriting authority or generalizing ephemeral paths |
| ADR-12 | No autonomous semantic source repair | Preserve the part of Astra's authorship/taste the user values; broaden only after matched quality evaluation |
| ADR-13 | FHS fixture explicitly prospective | The records motivate FHS handling but do not establish a full historical `buildFHSEnv + uv` success sequence |
| ADR-14 | Nullable usage and incomplete resource accounting | A client cannot honestly infer all Nix-daemon effects or all provider billing from missing data |

## 5. Claims intentionally not made

No guaranteed Astra/Luna quality equivalence, no measured savings percentage for the prototype, no successful live FHS recovery performed during documentation, no universal NixOS environment fix, no assumption that every NixOS host lacks nix-ld, no complete scientific result from source checks, and no claim that existing source/test hashes authenticate an unobserved historical environment.

The document package is implementation-ready because its scope, interfaces, expected transitions, fixtures, and release gates are specified. Actual correctness, compatibility, security properties beyond trusted-local behavior, and economic value remain test obligations—not prose guarantees.
