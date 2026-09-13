# 03 — Domain contracts and tool protocol

## 1. Implementation rules

Implement runtime-validated JSON records, not TypeScript-only assertions. The declarations below specify the wire/domain shape, not a Pi SDK import surface. Translate them into the runtime schema system supported by the pinned Pi version. Reject unknown authority/permission fields. Unknown observation values must be represented explicitly, not invented to satisfy a required field.

Use schema version `1`. IDs are controller-generated opaque local identifiers. Digests are lowercase SHA-256 of exact bytes, except records that explicitly use canonical JSON serialization. Use one canonical JSON implementation with stable object-key ordering, preserved array order, finite numbers, UTF-8, and documented number serialization. Hash immutable records excluding their own `digest` field. Do not hand-concatenate strings to hash a capsule.

Every measured value includes its unit and origin. Zero means measured zero; `null` means unavailable. Evidence-derived statements and proposed next actions have different types. A hash identifies data, not authorization.

## 2. Task request

```typescript
type Id = string;
type Sha256 = string;
type IsoTime = string;
type JsonValue = null | boolean | number | string | JsonValue[] |
  { [key: string]: JsonValue };

type CapsuleKind = 'investigate' | 'environment_recovery' | 'authorized_check';
type ExecutionMode = 'scripted' | 'adaptive';
type WorkerTool = 'context_read' | 'context_search' | 'exec_action' |
  'exec_script' | 'scratch_write' | 'propose_recipe' | 'episode_return';

type Decision = {
  id: Id;
  statement: string;
  rationale: string;
  invalidatedBy: string[];
};

type AuthoritySource = {
  id: Id;
  issuer: 'operator' | 'user' | 'supervisor_within_grant';
  reference: string;
  scope: string;
  supersedes: Id[]; // explicit scoped changes, never inferred from recency alone
};

type RetryPolicy = {
  mode: 'none' | 'bounded_adaptive';
  maxRecoveryAttempts: number;
  allowedFailureClasses: string[];
  stopFailureClasses: string[];
  requireNewEvidenceOrChangedAction: boolean;
};

type BudgetRequest = {
  wallMs: number;
  commandMsTotal: number;
  perCommandMs: number;
  maxModelRequests: number;
  maxToolActions: number;
  maxOutputTokensPerRequest: number;
  reportReserveRequests: number;
  reportReserveMs: number;
  evidenceBytes: number;
  estimatedInputTokenCeiling: number;
  maxEstimatedCost: { amount: number; currency: string } | null;
};

type WorkspacePolicy = {
  projectRoot: string;
  executionRoot: string;
  sourceRoots: string[];
  readableRoots: string[];
  scratchRoot: string;
  protectedPaths: string[];
  excludedLargeDataRoots: string[];
  sourceBinding: 'workspace' | 'retained_snapshot';
  expectedImports: { module: string; expectedOriginRoot: string }[];
  executionTrust: 'trusted-local';
  requiresHardIsolation: boolean;
};

type CapabilityRequest = {
  tools: WorkerTool[];
  recipes: Id[];
  allowTaskEnvironmentCreate: boolean;
  allowLockedSync: boolean;
  allowPackageDownloads: boolean;
  allowNixRealization: boolean;
  allowDirectLoader: boolean;
  allowFhsEntry: boolean;
  allowScratchRecipeProposal: boolean;
  allowSourceEdits: false; // deliberately not a v0.1 worker capability
  allowLockUpdates: false;
  allowHostConfigurationChanges: false;
  allowExternalPublication: false;
};

type Criterion = {
  id: Id;
  unitId: Id;
  description: string;
  kind: 'exit_code' | 'structured_fields' | 'hash_match' |
        'import_origin' | 'tool_launch' | 'supervisor_review';
  verifierId: Id | null; // registered, versioned controller verifier
  arguments: { [key: string]: JsonValue };
  required: boolean;
  requiresFreshExecution: boolean;
};

type ReportContract = {
  profile: 'investigation' | 'environment' | 'check';
  requiredFieldIds: string[];
  requiredCriterionIds: Id[];
  narrativeMaxChars: number;
  requireContraryEvidence: boolean;
  requireCoverage: boolean;
};

type TaskRequest = {
  schemaVersion: 1;
  clientRequestId: Id;
  taskId: Id | null; // null creates a task, existing ID continues its lineage
  parentEpisodeId: Id | null;
  kind: CapsuleKind;
  mode: ExecutionMode;
  goal: string;
  acceptanceUnit: { id: Id; description: string };
  fixedDecisions: Decision[];
  openLocalChoices: string[];
  nonGoals: string[];
  authoritySources: AuthoritySource[];
  workspace: WorkspacePolicy;
  capabilities: CapabilityRequest;
  retry: RetryPolicy;
  budget: BudgetRequest;
  evidenceRefs: EvidenceRef[];
  criteria: Criterion[];
  report: ReportContract;
  returnTriggers: string[];
};
```

The controller intersects capabilities and budgets with the operator's policy. `requiresHardIsolation=true` is rejected in the v0.1 trusted-host backend. All paths must be resolved and validated; shell code may not be supplied through a path, recipe ID, module name, or criterion argument. `allowPackageDownloads` and `allowNixRealization` are separate because Nix realization may use a shared daemon; their side effects are not fully controlled by uv's flags.

A task may explicitly allow only a single no-retry command. Missing a recommended capability does not justify expanding the contract. The sample in `examples/environment-task.json` is illustrative and has non-runnable placeholder roots and references.

## 3. Compiled capsule

```typescript
type Capsule = {
  schemaVersion: 1;
  id: Id;
  taskId: Id;
  version: number;
  parentCapsuleId: Id | null;
  createdAt: IsoTime;
  request: TaskRequest;
  effectivePolicyId: Id;
  effectiveCapabilities: CapabilityRequest;
  effectiveRetry: RetryPolicy;
  remainingBudgetAtAdmission: BudgetRequest;
  snapshotId: Id;
  snapshotDigest: Sha256;
  recipeDigests: { [recipeId: string]: Sha256 };
  selectedKnowledgeIds: Id[];
  unresolvedObligationIds: Id[];
  contextManifestId: Id;
  digest: Sha256;
};
```

The compiled capsule is the immutable authority/context boundary of an episode. Raw transcript references do not become current user instructions. A new authorization or semantic plan change creates a new version. Reporting does not mutate it.

The model-visible initial input contains a concise rendering of this record and selected evidence, while the full JSON remains controller-owned. The exact rendering is saved and hashed for evaluation. Field omission for readability must not remove safety/authority-critical constraints.

## 4. Evidence references

```typescript
type EvidenceRef =
  | {
      kind: 'transcript';
      sourceId: Id;
      relativePath: string;
      fileSha256: Sha256;
      rawLineStart: number;
      rawLineEnd: number;
      eventId: Id | null;
      callId: Id | null;
      observationTime: IsoTime | null;
      historical: true;
    }
  | {
      kind: 'execution_stream';
      executionId: Id;
      stream: 'stdout' | 'stderr';
      blobSha256: Sha256;
      byteStart: number;
      byteEndExclusive: number;
      historical: false;
    }
  | {
      kind: 'artifact';
      artifactId: Id;
      blobSha256: Sha256;
      byteStart: number;
      byteEndExclusive: number;
      historical: boolean;
    };

type ParsedObservation = {
  id: Id;
  parserId: Id;
  parserVersion: string;
  source: EvidenceRef;
  fields: { [fieldId: string]: JsonValue };
  completeness: 'complete_for_declared_fields' | 'partial' | 'unparseable';
  missingFields: string[];
};
```

Raw lines are **1-based original JSONL lines**, not projection Markdown line numbers. Validate `1 <= start <= end <= sourceLineCount`, digest identity, event/call ID consistency, and time cutoff. Projection lines may be stored separately for UI navigation but must never populate `rawLineStart`.

A parsed receipt's numeric data is copied without losing precision through formatting. Preserve the raw lexeme when exact numerical fidelity matters. Do not transform two conditions “sigma 1 and sigma 4” into a fraction. Unit-bearing quantities should have separate `value`/`unit` fields or retain the original label.

The historical evidence store records whether an item is original tool output, a historical actor's claim, a later review, or a proposed command. A command present in a transcript is not proof it executed; an assistant commentary is not automatically the endpoint.

## 5. Action request and execution receipt

```typescript
type ActionRequest = {
  protocolVersion: 1;
  requestId: Id;
  taskId: Id;
  episodeId: Id;
  capsuleDigest: Sha256;
  intent: string;
  acceptanceUnitId: Id;
  action:
    | { kind: 'recipe'; recipeId: Id; parameters: { [key: string]: JsonValue } }
    | { kind: 'script'; scriptArtifactId: Id; interpreterRecipeId: Id };
  timeoutMs: number;
  retryOfExecutionId: Id | null;
  failureClassBeingAddressed: string | null;
  newEvidenceRefs: EvidenceRef[];
};

type ExecutionReceipt = {
  schemaVersion: 1;
  id: Id;
  taskId: Id;
  episodeId: Id;
  requestId: Id;
  capsuleDigest: Sha256;
  acceptanceUnitId: Id;
  recipeId: Id;
  recipeDigest: Sha256;
  argv: string[];
  scriptArtifactId: Id | null;
  cwd: string;
  publicEnvironment: { [name: string]: string };
  redactedEnvironmentNames: string[];
  environmentHandleId: Id | null;
  snapshotBeforeId: Id;
  snapshotAfterId: Id | null;
  startedAt: IsoTime;
  endedAt: IsoTime | null;
  durationMs: number | null;
  processIdentity: { pid: number; startIdentity: string; groupId: number | null } | null;
  spawnError: string | null;
  exitCode: number | null;
  signal: string | null;
  timedOut: boolean;
  cancelled: boolean;
  descendantsReaped: boolean | null;
  externalEffectsAccounting: 'complete_for_declared_scope' | 'incomplete' | 'unknown';
  stdout: { sha256: Sha256; storedBytes: number; observedBytes: number; complete: boolean };
  stderr: { sha256: Sha256; storedBytes: number; observedBytes: number; complete: boolean };
  parsedObservationIds: Id[];
  measuredUsage: {
    sampledPeakRssBytes: number | null;
    measuredWrittenBytes: number | null;
    measurementScope: string;
  };
};
```

A failed `spawn` has no invented exit code. Timeout/cancellation and the process's eventual signal are both retained. A shell reader with exit zero does not replace a failed unit contained inside its stdout. The controller records separate parsed observations for those inner results.

The `publicEnvironment` is an allowlist, not `env` dumped wholesale. Never store API keys, cookies, authentication headers, tokens, or environment-variable values with secret-bearing names. Redaction must occur before worker/model preview as well as before durable logs.

## 6. Environment handle

```typescript
type EnvironmentHandle = {
  schemaVersion: 1;
  id: Id;
  taskId: Id;
  capsuleDigest: Sha256;
  generation: number;
  createdAt: IsoTime;
  recipeId: Id;
  recipeDigest: Sha256;
  wrapperKind: 'host' | 'nix_develop' | 'fhs' | 'explicit_loader';
  sourceBinding: 'workspace' | 'retained_snapshot';
  projectRoot: string;
  sourceSnapshotId: Id;
  requiredConfigDigests: { [relativePath: string]: Sha256 };
  materializationRoot: string;
  entryParameters: { [key: string]: JsonValue };
  expectedPython: { implementation: string; versionConstraint: string };
  observedPython: { executable: string; realpath: string; version: string };
  observedImports: { module: string; origin: string; distributionVersion: string | null }[];
  observedTools: { name: string; version: string; executable: string; launcher: string }[];
  observedStorePaths: string[];
  dependencyManifestArtifactId: Id;
  buildDependencyIdentityComplete: boolean;
  freshProcessVerificationExecutionIds: Id[];
  validForCriterionIds: Id[];
  invalidationConditions: string[];
  status: 'candidate' | 'verified' | 'stale' | 'rejected';
};
```

A verified handle certifies only its named criteria and snapshot/environment generation. `validForCriterionIds` must not include all source checks just because Python imports. A partial environment can be returned as candidate with the remaining failures. “Verified tool launch” and “verified clean source check” are distinct criteria.

A supervisor uses the handle by ID through the controller. It MUST NOT execute a model-written command string. Any changed flake/uv lock, source-binding policy, interpreter requirement, missing realization path, or failed fresh-process check invalidates the applicable claim. Actual `/nix/store` paths can be recorded as observations but the entry recipe must be capable of rediscovering them from the pinned project configuration.

## 7. Scoped results and reports

```typescript
type UnitResult = {
  unitId: Id;
  executionState: 'unknown' | 'not_run' | 'running' | 'interrupted' | 'failed' | 'completed';
  verification: 'not_evaluated' | 'pass' | 'fail' | 'unknown';
  acceptance: 'pending' | 'accepted' | 'rejected' | 'not_applicable';
  criterionIds: Id[];
  evidenceRefs: EvidenceRef[];
  explanation: string;
};

type ReportDraft = {
  schemaVersion: 1;
  taskId: Id;
  episodeId: Id;
  capsuleDigest: Sha256;
  requestedDisposition: 'complete' | 'needs_decision' | 'blocked' | 'budget_exhausted';
  summary: string;
  unitResults: UnitResult[];
  claims: { statement: string; evidenceRefs: EvidenceRef[] }[];
  hypotheses: { statement: string; supportingRefs: EvidenceRef[]; limitations: string[] }[];
  contraryEvidence: { description: string; evidenceRefs: EvidenceRef[] }[];
  coverage: { examined: string[]; notExamined: string[]; truncations: EvidenceRef[] };
  unknowns: string[];
  deviations: string[];
  proposedNextAction: string | null;
  requestedDecision: string | null;
  environmentHandleCandidateId: Id | null;
  checkpoint: {
    completed: string[];
    pending: string[];
    failedHypotheses: string[];
    liveProcessIds: Id[];
    continuationNeeds: string[];
  };
  jitCandidates: { trigger: string; lesson: string; evidenceRefs: EvidenceRef[]; scope: string }[];
};

type GateReport = {
  schemaVersion: 1;
  id: Id;
  taskId: Id;
  episodeId: Id;
  capsuleDigest: Sha256;
  draftArtifactId: Id | null;
  summary: string;
  unitResults: UnitResult[];
  authoritativeExecutionIds: Id[];
  requiredFieldValues: { [fieldId: string]: JsonValue };
  missingRequiredFieldIds: string[];
  decisiveEvidenceRefs: EvidenceRef[];
  changesArtifactId: Id;
  snapshotStatus: 'unchanged' | 'approved_changes_only' | 'conflict' | 'unknown';
  validationStatus: 'valid' | 'incomplete' | 'invalid';
  permittedNextAction: string;
  requestedDecision: string | null;
  environmentHandleIds: Id[];
  checkpointArtifactId: Id;
  usageArtifactId: Id;
  limitationCodes: string[];
  digest: Sha256;
};
```

The controller builds `GateReport`; Luna proposes `ReportDraft`. Measured fields in a draft are not trusted merely because they match the schema. Join them to receipt IDs and registered parsed fields; a disagreement is exposed and the controller value wins. Interpretive claims remain explicitly subject to review.

For unknown required facts, require a typed null plus explanation and missing-field indication. A report can be valid as a blocked report without passing acceptance. It cannot be valid as a completed environment when a required runtime identity is unknown.

## 8. Report profiles

**Investigation:** required current authority, historical/current distinction, question-to-evidence answers, source coverage, truncation and exclusions, unresolved next decision. No source completeness claim based solely on `rg` finding nothing.

**Environment:** required original symptom, authorized recovery classes, actual entry recipe, interpreter identity, uv version, lock digests, materialization/cache locations, import origins, tool launch states, actual check outcomes, failed attempts, changed files, fresh-process verification, remaining boundary, and replayable handle or reason none exists.

**Check:** required actual command/recipe, source/environment identity, scoped criterion result, process exit versus parsed unit result, skips/coverage, diagnostics, and no-retry/repair status. A numerical-check variant also requires operator identity, candidate/reference/geometry, residual/RHS values and units, certification, and completed/required counts when those fields are in the task contract. An absent tolerance stays unknown.

The controller mechanically appends identity and receipt tables even when the worker summary is short. Narrative limits must not truncate required facts. Large receipts remain in bounded evidence attachments, with decisive fields rendered inline.

## 9. Supervisor tools

| Tool | Input | Output / semantics |
|---|---|---|
| `delegate_episode` | `TaskRequest` | One `GateReport` plus compact text. Blocks until terminal return. Same `clientRequestId`/payload returns prior result rather than duplicate execution. |
| `read_evidence` | Task ID, validated evidence reference, bounded range/byte limit | Original bytes or parsed view with exact source identity and explicit truncation. No arbitrary filesystem path expansion. |
| `decide_episode` | Task ID, report ID/digest, named unit IDs, decision, rationale, evidence refs; optional revised request | Records supervisor decision. Does not grant permissions beyond configured ceiling. Revised request is compiled as a new capsule, not run implicitly. |

Human commands: `/capsule status [task]`, `/capsule cancel [task]`, `/capsule inspect [report]`, `/capsule knowledge approve [candidate]`, and `/capsule knowledge stale [entry]`. Commands must not use a model simply to inspect local state.

## 10. Worker tools

| Tool | Core arguments | Behavior |
|---|---|---|
| `context_read` | Approved file/evidence ID, offset, limit | Bounded read with machine-generated source reference |
| `context_search` | Approved scope IDs, literal/regex query, result limit | Search results with matched ranges and scope/coverage; regex resource limit |
| `exec_action` | Recipe ID, typed parameters, intent, unit ID, timeout, retry linkage | Controller executes the registered recipe and returns an execution ID and preview |
| `scratch_write` | Relative scratch path, UTF-8 content, intent | Writes only within task scratch; returns immutable content artifact ID; no app-source editing |
| `exec_script` | Scratch script artifact ID, registered interpreter recipe, intent/unit, timeout | Explicitly permitted trusted-local diagnostic script; captured argv and script digest |
| `propose_recipe` | Recipe description, needed capabilities, evidence | Creates an inert proposal; does not register or execute it |
| `episode_return` | `ReportDraft` | Freezes worker execution and begins report validation |

An investigation capsule normally has only context tools and return. Tool names absent from its effective capability list must not be exposed. A provider-generated unexpected tool name produces a failed tool result and audit event; it must not trigger fallback to built-in bash.

## 11. IPC and idempotency

IPC messages use `{protocolVersion, messageId, taskId, episodeId, capsuleDigest, type, payload}`. Allowed types are `worker_ready`, `action_request`, `action_result`, `report_submit`, `report_validation`, `usage`, `cancel`, `worker_exit`, and `error`. Validate message size, identity, order, and payload before handling it.

Persist an action's request ID and content digest before execution. Repeated identical IDs return the existing receipt or `reconciliation_required` if the effect is uncertain. Same ID with different content is rejected. A transient provider retry must never replay a completed command invisibly.

## 12. Review outcomes

Acceptance records include reviewer role, report digest, accepted unit IDs, snapshot/environment generation, rationale, evidence references, and timestamp. Accepted units cannot be broadened implicitly: accepting a loader fix is not accepting a type-check failure, an implementation, or a native run.

`request_revision` may request missing evidence or a new capsule. `reject` preserves the failed result. `accept_with_limitations` must enumerate excluded criteria and may not satisfy an acceptance policy that requires them. There is no special “close enough” Boolean.


## 13. Operator configuration and recipe registration

The operator configuration is trusted local input, not model-proposed authority. It is loaded before the supervisor tools are registered. An implementation may expose a setup command that writes it after explicit human confirmation. Missing trusted-local opt-in blocks execution rather than defaulting to a permissive host shell.

```typescript
type OperatorConfig = {
  schemaVersion: 1;
  enabled: boolean;
  trustMode: 'trusted-local';
  trustedLocalAcknowledged: boolean;
  worker: {
    provider: string;
    model: string;
    thinking: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
    allowModelFallback: false;
  };
  stateRoot: string;
  allowedProjectRoots: string[];
  trustedProviderExtensionPaths: string[];
  recipeRegistryPath: string;
  authorityRegistryPath: string;
  policyCeiling: CapabilityRequest;
  budgetCeiling: BudgetRequest;
  pricingPolicyPath: string | null;
};

type EnvironmentLayer = {
  id: Id;
  kind: 'host' | 'nix_develop' | 'fhs' | 'explicit_loader';
  entryRecipeId: Id;
  // Resolved through the registered parameter schema, never shell interpolation.
  parameters: { [key: string]: JsonValue };
  innerEnvironment: { [name: string]: string };
};

type RegisteredRecipe = {
  schemaVersion: 1;
  id: Id;
  version: number;
  digest: Sha256;
  description: string;
  parameterSchemaId: Id;
  requiredCapabilityNames: (keyof CapabilityRequest)[];
  // An implementation identifier, not a model-supplied JS expression or shell template.
  builderId: Id;
  allowedCwdPolicyId: Id;
  environmentLayers: EnvironmentLayer[]; // outermost to innermost
  envAllowlist: string[];
  secretReferenceNames: string[]; // operator-managed; values excluded from receipts
  maximumMs: number;
  effectClass: 'inspect' | 'environment_materialize' | 'check' | 'scratch_script';
  parserIds: Id[];
  approvalReferenceIds: Id[];
};
```

A handle's `recipeId` resolves to this immutable record. `wrapperKind` summarizes its externally visible entry boundary; the **full layer chain** remains authoritative. A Nix development shell may resolve/launch an FHS wrapper which launches uv/Python; those are composed layers, not interchangeable strings. Apply a layer's `innerEnvironment` only after entering that layer, with final source binding inside the last relevant wrapper. This is necessary for S020's shell-hook import-path behavior.

WP0 provides a small trusted registry: `project.inspect`, `nix.enter`, `python.identity`, `python.imports`, `uv.sync_locked`, `tool.launch`, `check.run`, `environment.verify_fresh`, and `scratch.bash`. Their parameter schemas bind project/environment handles and named check IDs; `check.run` is not an arbitrary unchecked command field. Enable FHS/direct-loader variants only for operator-registered entry recipes. Equivalent names may be changed during implementation if all examples, contracts, and tests change together.

Generic diagnostic scripts use only `scratch.bash` plus explicit script capability. They are inspected by policy and logged, **not claimed semantically safe by a shell parser**. The trusted-local ceiling still applies. A proposed recipe is inert until the configured approval path registers it. The worker cannot write the registry or invoke a builder by inventing its ID.

The authority registry resolves references to actual current grants and their scopes. The fact that a `TaskRequest` contains an `AuthoritySource` does not authenticate that grant. Supervisor-created constraints may narrow a grant, but model-written issuer fields cannot widen one. A historical transcript authority reference must be marked historical and is not an executable grant.

## 14. Mandatory report field registry

Implement these IDs as versioned report-field definitions with allowed sources and null semantics. Do not let the model redefine a field's meaning by returning a different key. The environment example uses the following minimum set:

| Field ID | Value / origin |
|---|---|
| `env.original_symptom` | Evidence-backed original error or explicit initial setup requirement |
| `env.recovery_authority` | Effective capsule ID, retry mode, allowed recovery classes; controller supplied |
| `env.entry_recipe` | Registered recipe ID/digest and complete layer chain |
| `env.python_identity` | Observed executable, realpath, implementation, version; execution evidence |
| `env.uv_identity` | Observed uv executable/version or explicit not-required status |
| `env.lock_identities` | Before/after flake/uv/configuration hashes and comparison scope |
| `env.materialization` | Task environment/cache roots, reuse or create decision, observed writes |
| `env.import_origins` | Requested modules and observed origins versus expected source roots |
| `env.tool_launches` | One scoped launch state per required native tool; evidence linked |
| `env.check_results` | One scoped result per named source check, including not-run/fail/unknown |
| `env.attempts` | Controller-ordered execution IDs, failure classes and retry linkage |
| `env.protected_changes` | Workspace comparison artifact and any incomplete coverage |
| `env.fresh_process` | Fresh verification execution IDs and criterion results, or why absent |
| `env.handle` | Candidate/verified handle ID and validity scope, or explicit null |
| `env.next_boundary` | Remaining permission/semantic decision and evidence, not a grant |

Common additional IDs are `scope.acceptance_unit`, `scope.current_authority`, `scope.coverage`, `scope.unknowns`, and `scope.contrary_evidence`. Numerical check profiles can register `check.operator`, `check.candidate_identity`, `check.solver_records`, `check.threshold`, and `check.coverage_counts`. Retain raw numeric lexemes or strings for precision-sensitive values alongside parsed numbers.

Absence of a known measurement is null with its explanation. A field that does not apply has `{status: "not_applicable", reason: "..."}`, not an invented success. Required-field completeness and acceptance are separate: a truthful blocked report can be complete, while a fully populated report can correctly describe failing checks.

## 15. Portable examples

`examples/operator-config.json` is **disabled** and has `trustedLocalAcknowledged=false`. It deliberately cannot execute until the operator supplies paths, grants and recipes and opts in. `examples/environment-task.json` matches `TaskRequest` but refers to placeholder roots and setup-grant identities. Loading the examples is a schema smoke test, not user authorization and not a runnable recovery on the user's project.
