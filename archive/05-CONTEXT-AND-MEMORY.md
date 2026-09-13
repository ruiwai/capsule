# 05 — Context contracts, reconstruction, and JIT procedures

## 1. Intent preservation

The capsule is an executable decision record, not an attempt to transfer the supervisor's entire thought process. Preserve the user outcome, fixed decisions, the rationale behind important constraints, local choices that remain open, and observations that would invalidate a fixed assumption.

For example, “do not update dependencies” should explain that checks must remain comparable with the pinned reviewed environment. “Do not change PYTHONPATH” and “bind imports to the current workspace” are different policies; the capsule must choose one deliberately. “Make the tools run” must not be paraphrased into “make every check pass.”

Important negative requirements belong in the hot context: no source edits, no lock updates, no scientific execution, no automatic retry under this stage's rule, preserve original failure receipts, and do not report file presence as completion. Do not bury them in a cold reference that Luna might never retrieve.

## 2. Capsule construction

The supervisor supplies the decisions and intended return. The compiler supplies IDs, hashes, budgets, machine-verifiable references, tool manifests, and repeated boilerplate. Do not spend Astra output tokens manually copying digests or reformatting execution receipts already available to the controller.

Construction order:

1. Identify the acceptance unit and the decision enabled by the return.
2. Resolve current authority and configured capability ceiling.
3. Identify fixed source/config/environment identities and permitted local changes.
4. Select the smallest relevant original evidence and indexed retrieval references.
5. Attach a kind-specific report profile and named criteria.
6. Attach narrowly matching verified JIT entries.
7. Save the exact rendered worker input and resource manifest; check the token target.

A missing required authority source, source-binding choice, or acceptance unit is a compilation error. Missing diagnostic evidence can instead be an explicit investigation objective. This distinction prevents speculative preflight from blocking ordinary discovery.

## 3. Worker context layout

```text
Stable worker role and tool-use rules
Effective authority and fixed decisions/rationale
Current task capsule and acceptance/report contract
Selected verified procedures (small hot index)
Relevant original evidence excerpts and retrieval references
Latest task checkpoint and unresolved obligations, if continuing
New episode observations and recent tool results
```

Do not include full parent history, unrelated skills, previous users' tasks, or secrets. The resource manifest names every loaded project instruction, skill, provider extension, prompt template, tool schema, and evidence fragment. An instruction found inside a log or source file is task data unless deliberately adopted by a trusted authority.

The initial context soft target is a diagnostic, not permission to omit critical constraints. If the full necessary capsule exceeds it, expand with an explicit size record, split the task, or keep the work with Astra. Never silently drop adverse evidence to achieve an impressive compression ratio.

## 4. Tool-output projection

The controller stores original command streams and gives Luna bounded previews with execution ID, actual exit/signal, relevant structured fields, truncation status, and a retrieval reference. A long traceback may require both its beginning and final exception. A missing startup receipt must not be hidden by showing only the last successful shell line.

Projection must preserve tool-call/result pairing and event order. A failed search with a missing glob is not an exhaustive negative finding. A shell reader's exit and the nested experiment status are separate fields. The controller does not guess scientific semantics from generic exit codes.

Worker-context compression must not delete the only copy of a constraint or unresolved hypothesis. Recent failures relevant to the current diagnostic branch stay visible until the branch is resolved or a checkpoint explicitly records them.

## 5. Safe reconstruction boundaries

v0.1 creates a new worker session at each new episode. Within a coherent episode, prefer append-only observations and bounded previews. Do not rewrite the early prompt after every tool call.

When context approaches its ceiling, reserve room to report and checkpoint. Luna returns `context_limit` as a blocked/needs-decision reason, and the controller persists unresolved state. Astra may authorize another episode with the same task budget remainder. A future deterministic continuation policy could avoid that supervisor gate, but it is not required in v0.1 and must not be implied to exist.

The checkpoint includes completed work, pending criteria, current environment handle/materialization, failed hypotheses, remaining local options, original evidence references, and limitations. It must not describe a half-finished command as safe to rerun. Live process state is either reconciled and terminated or explicitly unknown; no reusable shell state is assumed.

## 6. JIT data model

```text
id, schemaVersion, projectId, status
trigger: failure signature / task kind / relevant tool family
scope: project, recipe, platform, source-binding mode
preconditions: config/lock digests and required runtime predicates
procedure: short ordered instructions with permitted alternatives
verification: named fresh-process or artifact checks
provenance: exact evidence IDs and accepted report IDs
invalidatesOn: missing realization, changed lock, changed tool/version/layout,
               changed source policy, failed verification, contradictory evidence
supersedes: earlier knowledge IDs, if any
promotion: who approved, when, and for what scope
```

Statuses: `candidate`, `verified`, `stale`, `rejected`. A candidate may be returned at an episode boundary but is not automatically loaded for another task. Project-scoped promotion requires explicit supervisor/operator approval referencing verified evidence. Global promotion and automatic `SKILL.md` rewriting are outside v0.1.

The controller may index exact error signatures, tool names, recipe IDs, and config digests with ordinary local search. A vector database is unnecessary for this prototype. Retrieval ordering should prefer exact recipe/platform/source-binding matches, then narrower project matches. Limit automatic hot retrieval to three short entries; additional detail requires a triggered read.

## 7. Valid and invalid lessons from the real cases

**Valid:** “For this project's locked checker set, the installed Ruff and bundled Node executables used a generic Linux interpreter path. The reviewed direct-loader recipe launched these exact versions. Resolve the loader/library closure again and verify versions and import origin before reuse.”

**Invalid:** “Whenever Ruff exits 127, upgrade it,” “always use these literal store paths,” or “basedpyright failed, so ignore typing.”

**Valid:** “The Nix shell initialization altered source binding in this project; the current-workspace policy required applying PYTHONPATH inside the final wrapper and asserting the package's origin.”

**Invalid:** “Always override PYTHONPATH,” because a different task may intentionally check the retained snapshot or test packaging without an override.

**Valid:** “Record generation finalization independently of provisional observation counts.”

**Invalid:** “Exit 130 means generation passed.”

A JIT lesson can suggest an action; the current capsule still decides whether it is allowed. Permission is never learned from a successful past command.

## 8. Invalidation and environment decay

A knowledge entry referring to vanished Nix paths becomes stale, not necessarily false. Its procedure may still be useful, but its realization-specific proof no longer establishes current availability. Re-resolve through the unchanged approved recipe, verify the required identity, and create a new handle generation. Do not replace the historical path in its original receipt.

A changed lock or interpreter requirement requires revalidation. A changed source snapshot invalidates source-check results, while some environment launch facts may remain reusable under a newly verified handle. Dependency-aware invalidation must be conservative and explicit; v0.1 may invalidate more broadly rather than invent a sophisticated dependency graph.

Conflicting knowledge is not silently merged. Keep both entries with scope/evidence and ask for the applicable decision or mark them unavailable. Whole-store model rewriting is prohibited; use small additions, narrower scopes, and explicit supersession.

## 9. Fidelity checks and limitations

The controller can verify required fields, reference validity, exact copied measurements, current snapshot identities, and explicit permission boundaries in its own tools. It cannot prove that a worker found every relevant file or that a concise interpretation preserves every implication of the original task.

For consequential decisions, attach original diagnostics/diffs/receipts and let Astra inspect beyond the worker's selected excerpt. A verified reference is provenance, not completeness. The source-study scout errors—wrong raw locator, interim commentary treated as endpoint, omitted qualification, and hindsight repair—are mandatory regression tests, not reasons to trust a more elaborate prompt alone [H-STUDY].

## 10. Economics of context management

Measure requests, rendered input size, output, cache reads/writes when reported, and replay/review overhead. Do not call every shell command a model turn. Do not assume rewriting the prompt improves caching. The first prototype uses stable episode prefixes and fresh, bounded episodes; cache-aware dynamic reconstruction is deferred until actual measurements justify it.

Compare delegation without JIT, delegation with scoped JIT, and a deterministic batching/observation-masking baseline. Include the cost of capsule preparation, final review, report repair, fresh-process verification, and knowledge promotion. A smaller worker prompt is not the same as a cheaper accepted task.
