import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { digestRecord, newId, sha256 } from "../contracts/identity.js";
import type { Capsule, ExecutionReceipt } from "../contracts/types.js";
import { EvidenceStore } from "../evidence/store.js";
import { execute, type CommandSpec } from "../execution/spawn.js";
import type { Recipe } from "../recipes/registry.js";
import { gateReport, validateDraft, type Draft } from "../verification/report.js";

type Action = { digest: string; receipt?: ExecutionReceipt; promise?: Promise<ExecutionReceipt> };

/** Sole authority for spawning. An intent without a receipt after restart is
 * deliberately reported as reconciliation_required, never replayed. */
export class Controller {
  readonly store: EvidenceStore;
  readonly episodeId = newId("episode");
  private actions = new Map<string, Action>();
  private receipts: ExecutionReceipt[] = [];
  private attempts = 0;
  private started = Date.now();
  private stopped = false;

  constructor(readonly capsule: Capsule, stateRoot: string) {
    if (process.env.CAPSULE_TRUSTED_LOCAL !== "1") throw new Error("trusted-local execution disabled: operator opt-in is required");
    if ((capsule.request.workspace as any).requiresHardIsolation) throw new Error("unsupported: trusted-local backend cannot provide hard isolation");
    this.store = new EvidenceStore(join(stateRoot, capsule.taskId), Number(capsule.remainingBudgetAtAdmission.evidenceBytes));
  }
  async init() {
    await mkdir(this.store.root, { recursive: true, mode: 0o700 }); await this.store.init();
    try { for (const line of (await readFile(join(this.store.root, "events/events.jsonl"), "utf8")).trim().split("\n").filter(Boolean)) { const e = JSON.parse(line); if (e.type === "execution_receipt") { this.actions.set(e.receipt.requestId, { digest: e.digest, receipt: e.receipt }); this.receipts.push(e.receipt); } else if (e.type === "action_intent" && !this.actions.has(e.requestId)) this.actions.set(e.requestId, { digest: e.digest }); } } catch (e:any) { if (e?.code !== "ENOENT") throw new Error("state_corrupt: journal is not valid JSON"); }
    await this.store.appendEvent({ type: "episode_authorized", episodeId: this.episodeId, capsuleDigest: this.capsule.digest, at: new Date().toISOString() });
  }
  async action(requestId: string, recipe: Recipe, spec: CommandSpec, meta: { unitId: string; failureClass?: string; retryOf?: string | null; handleId?: string }, abort?: AbortSignal) {
    if (this.stopped) throw new Error("lifecycle_stop: execution disabled after report/terminal state");
    if (digestRecord(this.capsule as any) !== this.capsule.digest) throw new Error("integrity_error: capsule digest mismatch");
    if (this.capsule.recipeDigests[recipe.id] !== recipe.digest) throw new Error("integrity_error: recipe digest is not pinned");
    if (!this.capsule.effectiveCapabilities.recipes.includes(recipe.id)) throw new Error("permission_missing: recipe not authorized");
    for (const capability of recipe.requiredCapabilityNames) if (!(this.capsule.effectiveCapabilities as any)[capability]) throw new Error(`permission_missing: ${capability}`);
    const digest = sha256(JSON.stringify({ recipe: recipe.digest, spec, meta })); const old = this.actions.get(requestId);
    if (old) { if (old.digest !== digest) throw new Error("invalid_contract: duplicate action ID changed content"); if (old.receipt) return old.receipt; if (old.promise) return old.promise; throw new Error("reconciliation_required: prior action had uncertain effects"); }
    const budget = this.capsule.remainingBudgetAtAdmission; if (this.receipts.length >= Number(budget.maxToolActions)) throw new Error("budget_exhausted: tool actions");
    const elapsed = Date.now() - this.started; if (elapsed >= Number(budget.wallMs) - Number(budget.reportReserveMs)) throw new Error("budget_exhausted: task deadline");
    if (meta.retryOf != null) { if (this.capsule.effectiveRetry.mode === "none") throw new Error("permission_missing: strict no-retry policy"); const prior = [...this.actions.values()].find(a => a.receipt?.id === meta.retryOf); if (!prior?.receipt) throw new Error("invalid_contract: retry target is not a prior execution"); if (!meta.failureClass || this.capsule.effectiveRetry.stopFailureClasses.includes(meta.failureClass) || !this.capsule.effectiveRetry.allowedFailureClasses.includes(meta.failureClass)) throw new Error("permission_missing: failure class not retryable"); if (++this.attempts > this.capsule.effectiveRetry.maxRecoveryAttempts) throw new Error("budget_exhausted: recovery attempts"); }
    else if (this.receipts.some(r => r.exitCode !== 0 || r.cancelled || r.timedOut) && this.capsule.effectiveRetry.mode === "none") throw new Error("lifecycle_stop: strict no-retry policy");
    const timeoutMs = Math.min(spec.timeoutMs, Number(budget.perCommandMs), recipe.maximumMs, Math.max(1, Number(budget.wallMs) - elapsed - Number(budget.reportReserveMs)));
    this.actions.set(requestId, { digest });
    await this.store.appendEvent({ type: "action_intent", requestId, digest, recipeId: recipe.id, at: new Date().toISOString() });
    // The durable intent is the admission barrier: no child exists before it.
    const promise = execute({ ...spec, timeoutMs }, { taskId: this.capsule.taskId, episodeId: this.episodeId, requestId, capsuleDigest: this.capsule.digest, unitId: meta.unitId, recipeId: recipe.id, recipeDigest: recipe.digest, handleId: meta.handleId }, this.store, abort);
    this.actions.get(requestId)!.promise = promise;
    const receipt = await promise;
    this.actions.get(requestId)!.receipt = receipt; this.receipts.push(receipt); await this.store.appendEvent({ type: "execution_receipt", digest, receipt }); return receipt;
  }
  report(draft: Draft | null, fields: Record<string, unknown> = {}) { this.stopped = true; if (draft && !validateDraft(this.capsule, this.episodeId, draft).valid) draft = null; return gateReport(this.capsule, this.episodeId, draft, this.receipts, fields); }
}
