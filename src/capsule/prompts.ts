import type { DelegateCapsuleArgs } from "./contracts.js";

/** Parent policy belongs in the system prompt; invocation details belong to the tool. */
export const PARENT_CAPSULE_PROMPT = `# Saving input tokens
Avoid unnecessary parent input rounds that repeatedly process the full context:
1) Batch independent tool calls in a single response when supported.
2) For bounded tasks whose tool calls depend on earlier results and cannot run in one response, use the delegate_capsule tool.

Caveats:
Delegate evidence collection or already-decided changes; keep diagnosis, interpretation, design, and planning with the parent. Define scope and acceptance criteria first. Review evidence: completed does not mean checks passed.
Wait when a call needs an earlier result; avoid conflicting reads/writes and shared-state changes. Keep delegate_capsule calls sequential within a workspace.`;

/** Validated reference examples; only the first is included in the tool description. */
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

export const DELEGATE_CAPSULE_DESCRIPTION = `Run one foreground Flash worker in the current workspace. Return its result or blocker and retained history/notes paths when available. Scope is guidance, not a sandbox.
Example (adapt paths and requirements; output is illustrative):
${JSON.stringify(DELEGATION_EXAMPLES[0]!.args)}`;

export const WORKER_CAPSULE_PROMPT = `# Capsule worker
Execute the capsule within its file scope, allowed changes, requirements, and stop conditions. If blocked by missing prerequisites, authority, or substantive judgment, report observations and what is needed; do not expand scope or guess a fix.
Report observed results, commands/exit codes, changed files, and requested artifact paths. Distinguish failed checks from checks not run.
Before yielding, distill verified, reusable project lessons from this run into JITed_history for the harness to persist, not the parent-facing result. Use [] if none. Exclude task-specific answers, secrets, raw logs, and transcript/session paths from lessons. Do not put transcript contents or transcript/session paths in notes; the harness supplies provenance and retained handoff paths.`;
