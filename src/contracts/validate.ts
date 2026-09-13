import type { Budget, Capabilities, TaskRequest } from "./types.js";

const required = ["schemaVersion","clientRequestId","kind","mode","goal","acceptanceUnit","authoritySources","capabilities","retry","budget","workspace","report","criteria"];
const capabilityKeys = new Set(["tools","recipes","allowTaskEnvironmentCreate","allowLockedSync","allowPackageDownloads","allowNixRealization","allowDirectLoader","allowFhsEntry","allowScratchRecipeProposal","allowSourceEdits","allowLockUpdates","allowHostConfigurationChanges","allowExternalPublication"]);
export function validateTaskRequest(input: unknown): asserts input is TaskRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("invalid_contract: request must be an object");
  const r = input as Record<string, any>;
  for (const k of required) if (!(k in r)) throw new Error(`invalid_contract: missing ${k}`);
  if (r.schemaVersion !== 1) throw new Error("invalid_contract: schemaVersion must be 1");
  if (!["investigate", "environment_recovery", "authorized_check"].includes(r.kind)) throw new Error("invalid_contract: invalid kind");
  if (!["scripted", "adaptive"].includes(r.mode)) throw new Error("invalid_contract: invalid mode");
  if (typeof r.clientRequestId !== "string" || !r.clientRequestId) throw new Error("invalid_contract: clientRequestId required");
  if (typeof r.goal !== "string" || !r.goal) throw new Error("invalid_contract: goal required");
  if (!r.acceptanceUnit?.id || !r.acceptanceUnit?.description) throw new Error("invalid_contract: absent acceptance unit");
  if (!Array.isArray(r.authoritySources) || !r.authoritySources.length) throw new Error("invalid_contract: current authority required");
  for (const source of r.authoritySources) {
    if (!source || typeof source.id !== "string" || typeof source.reference !== "string" || typeof source.scope !== "string" || !["operator","user","supervisor_within_grant"].includes(source.issuer) || !Array.isArray(source.supersedes)) throw new Error("invalid_contract: invalid authority source");
  }
  for (const k of Object.keys(r.capabilities ?? {})) if (!capabilityKeys.has(k)) throw new Error(`invalid_contract: unknown capability ${k}`);
  for (const k of capabilityKeys) if (!(k in r.capabilities)) throw new Error(`invalid_contract: missing capability ${k}`);
  for (const forbidden of ["allowSourceEdits","allowLockUpdates","allowHostConfigurationChanges","allowExternalPublication"]) if (r.capabilities[forbidden] !== false) throw new Error(`invalid_contract: ${forbidden} cannot be granted`);
  if (!Array.isArray(r.capabilities.tools) || !Array.isArray(r.capabilities.recipes) || Object.values(r.capabilities).some((v:any) => typeof v !== "boolean" && !Array.isArray(v))) throw new Error("invalid_contract: capabilities must be boolean");
  const budgets=["wallMs","commandMsTotal","perCommandMs","maxModelRequests","maxToolActions","evidenceBytes","reportReserveMs","reportReserveRequests"];
  for (const k of budgets) if (!Number.isFinite(r.budget[k]) || r.budget[k] < 0) throw new Error(`invalid_contract: invalid budget ${k}`);
  if (r.budget.perCommandMs > r.budget.commandMsTotal || r.budget.reportReserveMs > r.budget.wallMs) throw new Error("invalid_contract: inconsistent budgets");
  if (!r.retry || !["none","bounded_adaptive"].includes(r.retry.mode) || !Number.isInteger(r.retry.maxRecoveryAttempts) || r.retry.maxRecoveryAttempts < 0 || !Array.isArray(r.retry.allowedFailureClasses) || !Array.isArray(r.retry.stopFailureClasses) || typeof r.retry.requireNewEvidenceOrChangedAction !== "boolean") throw new Error("invalid_contract: malformed retry policy");
  if (r.retry.mode === "none" && r.retry.maxRecoveryAttempts !== 0) throw new Error("invalid_contract: no-retry must have zero recovery attempts");
  if (!Array.isArray(r.criteria) || r.criteria.some((c:any) => !c || typeof c.id !== "string" || typeof c.unitId !== "string" || typeof c.required !== "boolean")) throw new Error("invalid_contract: malformed criterion");
  if (!r.criteria.some((c:any)=>c.unitId===r.acceptanceUnit.id)) throw new Error("invalid_contract: acceptance criterion required");
  if (!r.report || !Array.isArray(r.report.requiredFieldIds) || !Array.isArray(r.report.requiredCriterionIds) || !Number.isInteger(r.report.narrativeMaxChars) || r.report.narrativeMaxChars < 0) throw new Error("invalid_contract: malformed report contract");
}

export function intersectCapabilities(requested: Capabilities, ceiling: Capabilities): Capabilities {
  const flags = ["allowTaskEnvironmentCreate","allowLockedSync","allowPackageDownloads","allowNixRealization","allowDirectLoader","allowFhsEntry","allowScratchRecipeProposal"] as const;
  const out:any = { tools: requested.tools.filter(x=>ceiling.tools.includes(x)), recipes: requested.recipes.filter(x=>ceiling.recipes.includes(x)), allowSourceEdits:false, allowLockUpdates:false, allowHostConfigurationChanges:false, allowExternalPublication:false };
  for (const f of flags) out[f] = requested[f] && ceiling[f];
  return out;
}
export function intersectBudget(requested: Budget, ceiling: Budget): Budget {
  const result = {...requested};
  for (const k of ["wallMs","commandMsTotal","perCommandMs","maxModelRequests","maxToolActions","evidenceBytes","reportReserveMs","reportReserveRequests"] as const) result[k] = Math.min(requested[k], ceiling[k]);
  return result;
}

export function validateTranscriptLocator(ref:{rawLineStart:number;rawLineEnd:number}, sourceLineCount:number) {
  if (!Number.isInteger(ref.rawLineStart) || !Number.isInteger(ref.rawLineEnd) || ref.rawLineStart < 1 || ref.rawLineStart > ref.rawLineEnd || ref.rawLineEnd > sourceLineCount) throw new Error("invalid_contract: bad raw locator");
}
