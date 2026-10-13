# Pi Capsule

Pi Capsule is a Pi extension for supervised delegation. Your selected Pi model
keeps control of planning and decisions; a separate worker, called Flash, handles
bounded tool work. Results stay compact, while transcripts and useful project
knowledge are retained for later use.

## Install

Requires **Node.js 22.19.0 or newer**, npm, and Pi provider authentication.
This package is private; install it from a local checkout rather than npm.

From the repository root:

```sh
npm ci
npm run build
npx pi
```

The dependencies include Pi. Trust the repository when prompted so its
`.pi/settings.json` can load the extension. Use Pi's `/login` command or your
usual provider credentials to authenticate both the parent and worker models.

Capsule uses Pi extension hooks; it does not patch Pi's installed code.
If upgrading from the old postinstall patch, run `npm ci` to restore clean
local dependencies, then restart Pi.

### Sequential short-circuiting

Capsule observes failed tool-result messages and blocks subsequent tool calls
in the same model turn using extension hooks, in both parent and worker sessions.
Blocked calls receive error results with their original tool-call IDs. Their
tool bodies do not execute, but argument preparation and other hooks may run;
invalid or missing tools may still receive Pi's own errors. The failure latch
resets at the next turn. Earlier filesystem effects are not rolled back.

Capsule serializes tool-call batches in unpatched Pi 0.85.1 by prepending an
internal `capsule_sequential_barrier` no-op through `message_end`. Its
`executionMode: "sequential"` makes Pi schedule the entire batch sequentially,
including tools from other extensions; `bash_exec` and `apply_patch` need no
changes. The barrier is activated on session/agent start. Text-only replies
and error, aborted, or truncated responses are left untouched.

The `context` hook removes injected barrier calls and their matching results
before every LLM request, including after resume. They remain in session
history but are hidden by the TUI renderer; the internal tool definition remains
available to the model. This relies on Pi's message replacement and scheduling
hooks: other extensions must not remove/disable the barrier or replace these
messages afterward. It does not serialize parallel work inside a tool body.
Explicit tool allowlists must include `capsule_sequential_barrier`; Capsule
includes it automatically in its worker SDK allowlist. If activation is denied,
Capsule blocks tool bodies rather than silently executing in parallel.

Failures include exceptions, invalid arguments, missing tools, blocked calls,
and results marked `isError`. Capsule also marks unsuccessful `bash_exec`
outcomes and non-completed delegations as errors. A `completed` delegation can
contain negative evidence and does **not** automatically stop the batch.
Speculatively batch calls whose arguments and next actions are already known
on the success path to save message rounds. Do not speculate across decisions
or guess values from unread outputs.

To use Capsule in another project, launch Pi from that project's directory:

```sh
/absolute/path/to/pi-capsule/node_modules/.bin/pi \
  -e /absolute/path/to/pi-capsule/dist/extension/index.js
```

Replace `/absolute/path/to/pi-capsule` with your checkout path. For persistent
loading, add that absolute extension path to the `extensions` array in the
target project's `.pi/settings.json`, preserving existing settings.

## Use

Ask the parent agent to delegate a specific, bounded execution or evidence task:
targeted code or literature search, project-local environment setup, requirement
checks and smokes, an already-decided fix, scoped log extraction, an existing
test/workflow, safe Git commands, narrow aggregation, or coarse text extraction.
Keep architecture decisions, troubleshooting, interpretation, large refactors,
literature synthesis, hypothesis/evidence evaluation, trade-offs, complex
failure analysis, and roadmaps or plans with the parent.

The parent calls `delegate_capsule` with a self-contained assignment, an example
of the desired answer, and an optional deadline:

```json
{
  "capsule": "In the workspace root, run npm test using installed dependencies. Do not edit files, install packages, or update snapshots. Report the exit code, test counts, and failing test names. Stop and report a blocker if prerequisites are missing.",
  "output_example": "Exit: 1. Passed: 4. Failed: 1. Failure: rejects expired token.",
  "timeout_s": 120
}
```

- Name inputs, allowed actions, acceptance checks, stop conditions, and any
  artifact destinations. The output example is guidance, not a schema.
- Successful calls return a compact result and paths to retained history and
  optional notes. Blocked, timed-out, or failed calls include an inline explanation.
- History is returned as a path, not injected into the parent context. Useful
  project-local knowledge is saved for later workers, which select and read it
  on demand with `list_lesson_topic` and `fetch_lesson`.
- The default deadline is 300 seconds, with a separate 5-second cleanup allowance.
  Task boundaries are instructions, **not an OS sandbox**.

In Pi's TUI, expand a result to see retained notes and history paths.

## Configure

Capsule never switches the parent model. Flash defaults to
`openai-codex/gpt-5.6-luna`. Set `"capsuleFlashModel": "provider/model-id"`
in project `.pi/settings.json` or global `~/.pi/agent/settings.json` (merge
with existing settings). Project settings override global settings. Choose a
worker model available to your Pi account. The environment overrides both:

```sh
export CAPSULE_FLASH_MODEL='provider/model-id'
```

Use `/flash` to open the same model picker as `/model`, or
`/flash provider/model-id` to select directly. This overrides the environment
and settings defaults for subsequent delegations in the current session without
changing the parent model. The selection resets on session start/resume; cancel leaves it unchanged.
Change models while the agent is idle and Flash cleanup has completed.
Outside the TUI, use the direct form.

Set worker reasoning in project `.pi/settings.json` (merge with existing settings):

```json
{
  "capsuleFlashThinkingLevel": "high"
}
```

Valid values are `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`.
Project settings override global settings; `CAPSULE_FLASH_THINKING_LEVEL`
overrides both. Invalid values fail before the worker starts. `high` doubles and
`xhigh` triples the effective watchdog deadline (including an explicit
`timeout_s`) to allow for slower reasoning, capped at Node's maximum timer. The
nominal deadline remains unchanged in tool instructions and UI call summaries.

Flash uses an independent worker prompt, not the parent's effective system
instructions or goal lifecycle. It discovers applicable `AGENTS.md`, relevant
project docs/contracts, and optional JIT lessons itself. Assignments should carry
intent, scope, undiscoverable decisions/permissions, and acceptance criteria—not
copies of project documentation. Output examples are part of the assignment.

Configure worker isolation in project `.pi/settings.json` or global
`~/.pi/agent/settings.json` (merge with existing settings):

```json
{
  "capsule": {
    "excludedTools": ["create_goal", "get_goal"],
    "excludedExtensions": ["pi-goal-x"],
    "sharedInstructions": "Preserve unrelated work and protect credentials."
  }
}
```

Project fields override global fields within `capsule`; arrays replace, not append.
By default, the `pi-goal-x` package (its extensions, hooks, and inherited tools) is
excluded; no tool-name exclusions or additional shared instructions are needed.
Extension exclusions accept package names (matched against the nearest owning
`package.json`) or exact entrypoint paths (absolute, `~/`, or `./`/`../` relative
to worker cwd). Prefix local filenames with `./` to distinguish them from package
names. Globs are not supported. An explicit `excludedExtensions: []` clears the
default; a custom list replaces it, so include `pi-goal-x` to retain its exclusion.
Restart Pi after changing settings.

Active parent tools are inherited, minus delegation, denied tools, and tools from
excluded extensions. `CAPSULE_FLASH_TOOLS` replaces that selection with an explicit
comma-separated list; tool denials still win. An explicit request for a tool whose
provider is excluded/unavailable fails before a model request. Required worker
tools (`yield`, both JIT tools, and the sequencing barrier) cannot be denied.

File-backed parent extensions identified by Pi's tool/command metadata are still
reloaded unless excluded; hook-only and inline extensions cannot be cloned. A tool
ban does **not** disable its extension hooks: exclude the extension too when needed.
New parent tools/extensions remain inherited unless denied; this is not a sandbox.
Denials are runtime configuration, not extra tool-instruction text.
Worker transcripts include selected tools, extension paths, and tool exclusions
in a `worker_configuration` record for debugging (without extra prompt logging).

Migration: parent prompt customizations, SYSTEM.md/APPEND_SYSTEM.md overrides, and
extension-injected prompt prose are not copied into the worker. Put mandatory
shared constraints in `capsule.sharedInstructions` or applicable `AGENTS.md` files;
include task-specific permissions in the assignment. Tool schemas remain exposed
independently of system-prompt prose.

Capsule state defaults to `~/.pi/agent/capsule-sessions/session-<Pi-session-ID>/`,
with JIT in `jit.json`, retained JSONL transcripts in `episodes/`, and raw Pi
worker sessions in `worker-sessions/`. JIT is shared only within the same Pi
session (including resumes); new and forked sessions start with separate history.
Existing unscoped JIT is not imported. Project-context freshness checks still apply.
`CAPSULE_STATE_DIR` can override the root with another absolute path readable by
the parent agent; the session-specific subdirectory is always appended.

## Development

```sh
npm run check  # build, typecheck, and tests
```

See the [documentation index](docs/README.md) for architecture and lifecycle,
[interfaces](docs/INTERFACES.md) for tool contracts,
[Pi integration](docs/PI-INTEGRATION.md) for runtime details, and
[implementation status](docs/IMPLEMENTATION.md) for coverage and limitations.
