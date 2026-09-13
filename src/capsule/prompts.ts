import type { DelegateCapsuleArgs } from "./contracts.js";

/** Parent policy belongs in the system prompt; invocation details belong to the tool. */
export const PARENT_CAPSULE_PROMPT = `# Capsule delegation
Use Flash for specific, bounded tool work with explicit inputs and a checkable outcome. Keep substantive reasoning with the parent: architecture decisions, bug troubleshooting, data interpretation, large refactors, scientific literature integration, hypothesis generation, evidence evaluation, trade-offs, complex failure-mode identification, and roadmaps/plans.
Delegate evidence collection or an already-decided fix, not the judgment itself. If scope or acceptance is unclear, resolve it before delegating. Review returned evidence; completed means the assignment finished, not that its checks passed.
Batch independent tool calls in a single response when supported, rather than spending one turn per call. Wait when a call needs an earlier result, and avoid conflicting reads/writes or shared-state changes. Keep delegate_capsule calls sequential within a workspace; only one delegation may own it at a time.`;

/** Executable-schema examples, also used by the tool introduction and regression tests. */
export const DELEGATION_EXAMPLES: Array<{ task: string; args: DelegateCapsuleArgs }> = [
  { task: "Target code search (read-only)", args: {
    capsule: "In this workspace, search src/auth/ and tests/auth/ for refreshToken definitions and direct callers. Do not edit. Report file:line, symbol, and one-line excerpt for each match; report no matches explicitly. Stop at these directories; do not diagnose auth bugs.",
    output_example: "src/auth/session.ts:42 | refreshToken | export async function refreshToken(...). Searched: src/auth/, tests/auth/. Missing paths: none.",
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
    capsule: "Read package.json and tests/auth.test.ts. Run npm test -- tests/auth.test.ts once from the workspace root using installed dependencies. No source/test edits, installs, snapshot updates, or retries. Save stdout/stderr to artifacts/auth-test.log. Report command, exit code, test counts, and failing test names. A test failure is a completed negative result; missing tooling is a blocker.",
    output_example: '{"command":"npm test -- tests/auth.test.ts","exit":1,"passed":4,"failed":1,"failures":["rejects expired token"],"log":"artifacts/auth-test.log"}',
    timeout_s: 120,
  } },
  { task: "Git command (read-only)", args: {
    capsule: "From the workspace root run git status --short, git diff -- src/capsule/backend.ts tests/capsule.test.ts, and git diff --cached -- src/capsule/backend.ts tests/capsule.test.ts. Report status paths and diff hunk headers for those two files, including whether they are staged or unstaged. No checkout, reset, commit, fetch, or other mutation; no artifact files needed.",
    output_example: "Unstaged: src/capsule/backend.ts (@@ -35,7 +35,7 @@). Staged: none. tests/capsule.test.ts: unchanged.",
  } },
  { task: "Target literature search (retrieve, do not evaluate)", args: {
    capsule: "Find at most 5 papers from 2020–2024 with 'speculative decoding' in the title using arXiv search and paper abstract pages. Network retrieval is allowed; no local inputs. Save title, authors, year, DOI/arXiv ID, URL, and a verbatim method sentence to artifacts/speculative-decoding.md. Include the query and sources searched; mark unavailable fields. Do not rank evidence, integrate findings, or propose hypotheses. If retrieval tools/network are unavailable, report blocked; do not invent citations.",
    output_example: "Found: 3 title matches. Bibliography: artifacts/speculative-decoding.md. Query: ti:\"speculative decoding\", 2020–2024. Sources: arXiv. Missing fields: DOI for 2 papers.",
    timeout_s: 180,
  } },
];

export const DELEGATE_CAPSULE_DESCRIPTION = `Run one foreground Flash worker in the current workspace; return a compact handoff and retained history/notes paths when available. Task scope is guidance, not a sandbox. Adapt these example calls to actual paths and requirements (illustrative outputs are not observations):
${DELEGATION_EXAMPLES.map(({ task, args }) => `${task}:\n${JSON.stringify(args)}`).join("\n\n")}`;

export const WORKER_CAPSULE_PROMPT = `# Capsule worker
Execute only the capsule's bounded assignment with available tools. Respect its file scope, allowed changes, requirements, and stop conditions. If completion needs new authority or substantive judgment, return blocked with observations and the decision needed; do not expand scope or guess a fix.
Report observed results, commands/exit codes, changed files, and requested artifact paths. Distinguish failed checks from checks not run. The plugin supplies retained handoff paths; never put transcript contents or transcript/session paths in notes or JITed_history. Keep only reusable, verified project lessons in JITed_history.`;
