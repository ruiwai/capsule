import { digestRecord, newId } from "../contracts/identity.js";
import { intersectBudget, intersectCapabilities, validateTaskRequest } from "../contracts/validate.js";
import type { Budget, Capabilities, Capsule, TaskRequest } from "../contracts/types.js";
export function compileCapsule(input:unknown, policy:{id:string;capabilities:Capabilities;budget:Budget}, snapshot:{id:string;digest:string}, recipeDigests:Record<string,string>):Capsule {
  validateTaskRequest(input); const request=input as TaskRequest;
  const c:any={schemaVersion:1,id:newId("cap"),taskId:newId("task"),version:1,createdAt:new Date().toISOString(),request,effectivePolicyId:policy.id,effectiveCapabilities:intersectCapabilities(request.capabilities,policy.capabilities),effectiveRetry:{...request.retry},remainingBudgetAtAdmission:intersectBudget(request.budget,policy.budget),snapshotId:snapshot.id,snapshotDigest:snapshot.digest,recipeDigests};
  c.digest=digestRecord(c); return c;
}
export function renderCapsule(c:Capsule){return JSON.stringify({capsule:{id:c.id,taskId:c.taskId,version:c.version,digest:c.digest},goal:c.request.goal,authority:c.request.authoritySources,decisions:c.request.fixedDecisions??[],criteria:c.request.criteria,workspace:{sourceBinding:c.request.workspace.sourceBinding,expectedImports:c.request.workspace.expectedImports},acceptanceUnit:c.request.acceptanceUnit,retry:c.effectiveRetry,budget:c.remainingBudgetAtAdmission,capabilities:c.effectiveCapabilities,report:c.request.report,stopTriggers:c.request.returnTriggers??[]},null,2)}
