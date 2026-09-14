import type { DelegateCapsuleArgs } from "./contracts.js";

/** Parent policy belongs in the system prompt; invocation details belong to the tool. */
export const PARENT_CAPSULE_PROMPT = `# Saving input tokens
All tool calls are blocking and execute sequentially. Pack multiple dependent tool calls with no intermediate decision or branch into one response—for example, apply_patch followed by bash_exec to test it. When an intermediate result requires a decision or branch, send the bounded sequence to delegate_capsule instead.

Use delegate_capsule for a specific, bounded execution or evidence task that needs no parent judgment.

Delegate: targeted code/literature search; project-local environment install; requirement checks/smokes; an already-decided edit such as a specified Cargo fix; scoped log exploration; an existing test/workflow; safe Git commands; needle-in-a-haystack aggregation; coarse text extraction.

Do not delegate: architecture decisions; bug troubleshooting; data interpretation; large refactors; literature integration; hypothesis generation; evidence evaluation; trade-offs; complex failure-mode identification; roadmaps or plans.

Review the evidence: completed can be negative and does not mean checks passed. Do not overlap delegate_capsule calls or conflicting workspace/shared-state operations.`;

/** Validated reference examples; only the first is included in the tool description. */
export const DELEGATION_EXAMPLES: Array<{ task: string; args: DelegateCapsuleArgs }> = [
  { task: "Target code search (read-only)", args: {
    capsule: "Search only src/auth/ and tests/auth/ for refreshToken definitions/callers. Do not edit. Report file:line, symbol, one-line excerpt, searched/missing paths, and zero matches. Stop after inventory; no diagnosis.",
    output_example: "src/auth/session.ts:42 | refreshToken | export async function refreshToken(...). Matches: 1; missing: none.",
  } },
  { task: "Environment install (locked, project-local)", args: {
    capsule: "Read pyproject.toml and uv.lock in the workspace root. Run uv sync --frozen into .venv, then uv run --frozen python -c 'import capsule_fixture'. Network package downloads and .venv writes are allowed; no global installs or manifest/lock edits. Save command output to artifacts/env-install.log. Report versions, exit codes, and import outcome. If uv is absent or the lock is incompatible, stop and report the blocker.",
    output_example: '{"python":"3.12.8","sync_exit":0,"import_exit":0,"log":"artifacts/env-install.log","changed":[".venv/"]}',
    timeout_s: 300,
  } },
  { task: "Requirement check and smoke (no fixes)", args: {
    capsule: "Read docs/requirements.md, package.json, and package-lock.json. Check only the documented Node version and /health response requirements. Run node --version and the existing npm run smoke once; do not install dependencies or edit project files except the requested log. Save output to artifacts/requirements-smoke.log. Report each requirement with observed evidence and pass/fail/not_checked; missing prerequisites are blockers. Do not infer compliance beyond these checks.",
    output_example: "| Requirement | Observation | Verdict |\n| Node >=22 | node --version: v22.19.0 | pass |\n| /health returns 200 | smoke could not connect | not_checked |\nCommand exit: 1. Log: artifacts/requirements-smoke.log.",
    timeout_s: 120,
  } },
  { task: "Fix a specified Cargo error (not troubleshooting)", args: {
    capsule: "Read artifacts/cargo-check.log, Cargo.toml, and src/config.rs. The parent has identified E0308 at Config.name: replace name: input with name: input.to_owned() in that initializer only. No other source or dependency changes; build artifacts and the requested log are allowed. Run cargo check --locked, saving output to artifacts/cargo-check-after.log. Report the diff and exit code; if the location differs or another fix is needed, stop and return diagnostics without guessing.",
    output_example: '{"changed":["src/config.rs"],"diff":"name: input → name: input.to_owned()","check_exit":0,"log":"artifacts/cargo-check-after.log"}',
    timeout_s: 180,
  } },
  { task: "Explore a specified log (extract, do not diagnose)", args: {
    capsule: "Read logs/api-2026-09-13.log only. Extract ERROR entries from 14:00–14:10 UTC and up to two adjacent lines per entry. Count exact error codes and save redacted excerpts with source line numbers to artifacts/api-errors.txt. Do not modify the source log, expose credentials, or infer root cause. Report counts, time range, and excerpt path; an empty range is a valid result.",
    output_example: '{"range_utc":"14:00–14:10","counts":{"E_TIMEOUT":3},"excerpts":"artifacts/api-errors.txt","source":"logs/api-2026-09-13.log"}',
  } },
  { task: "Run an existing test/workflow", args: {
    capsule: "Read package.json and tests/auth.test.ts. Run npm test -- tests/auth.test.ts once from the workspace root using installed dependencies. Do not edit, install, update snapshots, or retry: this run must remain comparable with the reviewed tree. You may adjust harmless output capture; a required dependency or source change is a blocker. Save stdout/stderr to artifacts/auth-test.log. Report command, exit code, test counts, and failing test names. A test failure is a completed negative result; missing tooling is a blocker.",
    output_example: '{"command":"npm test -- tests/auth.test.ts","exit":1,"passed":4,"failed":1,"failures":["rejects expired token"],"log":"artifacts/auth-test.log"}',
    timeout_s: 120,
  } },
  { task: "Git command (read-only)", args: {
    capsule: "From the workspace root run git status --short, git diff -- src/extension/pi-backend.ts tests/capsule.test.ts, and git diff --cached -- src/extension/pi-backend.ts tests/capsule.test.ts. Report status paths and diff hunk headers for those two files, including whether they are staged or unstaged. No checkout, reset, commit, fetch, or other mutation; no artifact files needed.",
    output_example: "Unstaged: src/extension/pi-backend.ts (@@ -35,7 +35,7 @@). Staged: none. tests/capsule.test.ts: unchanged.",
  } },
  { task: "Target literature search (retrieve, do not evaluate)", args: {
    capsule: "Find at most 5 papers from 2020–2024 with 'speculative decoding' in the title using arXiv search and paper abstract pages. Network retrieval is allowed; no local inputs. Save title, authors, year, DOI/arXiv ID, URL, and a verbatim method sentence to artifacts/speculative-decoding.md. Include the query and sources searched; mark unavailable fields. Do not rank evidence, integrate findings, or propose hypotheses. If retrieval tools/network are unavailable, report blocked; do not invent citations.",
    output_example: "Found: 3 title matches. Bibliography: artifacts/speculative-decoding.md. Query: ti:\"speculative decoding\", 2020–2024. Sources: arXiv. Missing fields: DOI for 2 papers.",
    timeout_s: 180,
  } },
  { task: "Targeted needle-in-a-haystack aggregation", args: {
    capsule: "Search only packages/*/package.json and services/*/package.json for exact dependencies on lodash. Exclude node_modules and generated manifests; do not edit. Save one CSV row per match (manifest, dependency section, declared range) to artifacts/lodash-dependencies.csv, sorted by manifest. Report files searched, missing globs, match count, and artifact path; zero matches is valid. Stop after aggregation and do not assess upgrade risk.",
    output_example: '{"searched":84,"missing_globs":[],"matches":6,"artifact":"artifacts/lodash-dependencies.csv"}',
  } },
  { task: "Coarse text processing and extraction", args: {
    capsule: "Read docs/rfcs/*.md only. Extract each H1/H2 heading and every line containing the exact words MUST or MUST NOT; preserve source text and file:line, deduplicate exact repeated requirement lines, and write artifacts/rfc-requirements.tsv. Do not summarize, interpret, or edit source files. Report files read, heading and requirement counts, skipped unreadable files, and artifact path; stop if the input glob matches no files.",
    output_example: "Files read: 12; headings: 47; requirements: 19; skipped: none; artifact: artifacts/rfc-requirements.tsv.",
  } },
];

export const DELEGATE_CAPSULE_DESCRIPTION = `Run one foreground Flash worker. Returns its result/blocker and retained paths. Not a sandbox.
Example—adapt paths; values are illustrative:
${JSON.stringify(DELEGATION_EXAMPLES[0]!.args)}`;

export const WORKER_CAPSULE_PROMPT = `# Capsule worker
Execute the current capsule and its rationale, subject to system/runtime rules. Its fixed constraints override advisory JIT: remembered workarounds are not permission to install, edit, retry, resume old work, or change the acceptance boundary. If evidence contradicts a fixed assumption, report blocked with observations and what is needed; do not invent a new objective. Preserve established negative answers rather than changing checks to get green.
Report observed results, commands/exit codes, changed files, and requested artifact paths. Distinguish failed checks from checks not run.
Return your report through the yield tool, not a plain-text final answer; without yield the parent receives no valid handoff.
Before yielding, distill only verified procedures useful to a future independently specified task into JITed_history; JIT is prior knowledge, not current permission or task state. Briefly write “Use when:”, “Do:”, “Verify:”, and “Recheck when:” guidance where useful. Use [] if none. Keep pending work, current answers/progress, one-off authority, secrets, logs, and transcript/session paths in terminal notes/history instead. A blocked yield ends this single-pass delegation; it is not paused or resumed. The harness supplies provenance and retained paths.`;
