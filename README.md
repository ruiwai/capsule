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
`openai-codex/gpt-5.6-luna`; choose a worker model available to your Pi account:

```sh
export CAPSULE_FLASH_MODEL='provider/model-id'
```

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

Flash inherits the parent's effective system instructions and active tools,
except delegation. File-backed extensions identified by Pi's tool/command
metadata are reloaded; hook-only and inline extension hooks cannot be cloned.
`CAPSULE_FLASH_TOOLS` overrides the inherited tool list.

Capsule state defaults to `~/.pi/agent/capsule-sessions`, with retained JSONL
transcripts in its `episodes/` directory and raw Pi sessions in
`worker-sessions/`, regardless of the directory from which Pi is launched.
`CAPSULE_STATE_DIR` can override the root with another absolute path readable by
the parent agent.

## Development

```sh
npm run check  # build, typecheck, and tests
```

See the [documentation index](docs/README.md) for architecture and lifecycle,
[interfaces](docs/INTERFACES.md) for tool contracts,
[Pi integration](docs/PI-INTEGRATION.md) for runtime details, and
[implementation status](docs/IMPLEMENTATION.md) for coverage and limitations.
