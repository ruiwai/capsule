import { readFileSync, realpathSync, statSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { Durable } from "./durable.js";
import { identity, request, scope, object, text, names, type ScriptedRequest, type Scope, capabilityNames } from "./scripted-contract.js";
import { digestRecord, newId, canonicalJson, sha256 } from "../contracts/identity.js";
import { EvidenceStore } from "../evidence/store.js";
import { execute, type CommandSpec } from "../execution/spawn.js";
import type { ExecutionReceipt } from "../contracts/types.js";

type Check = { id: string; builder: "node-check"; script: string; sha256: string; parameters: Record<string, string[]>; requiredCapabilities: string[] };
type Operator = { stateRoot: string; principal: string; trustedLocal: true; ceiling: Scope; grants: Record<string, { principal: string; enabled: boolean; review: boolean; scope: Scope }>; checks: Check[] };
type Action = { intent: string; allowance: number; receipt?: ExecutionReceipt; failures?: string[] };
export type ExecuteRequest = Readonly<{
  taskId: string;
  episodeId: string;
  capsuleDigest: string;
  unitId: string;
  attempt: number;
}>;
type Task = { id: string; episodeId: string; requestDigest: string; principal: string; request: ScriptedRequest; capsule: any; rendering: string; deadline: number; phase: "authorized" | "running" | "stopped" | "reporting" | "reported" | "closed"; tools: number; commandMs: number; recovery: number; actions: Record<string, Action>; report?: any; decision?: any };
const pending = new Map<string, Promise<ExecutionReceipt>>();
// Included in each command reservation, not borrowed from reporting. Covers
// TERM/KILL escalation and bounded stream drain in the trusted-local executor.
const cleanupReserveMs = 900;

function config(path: string): Operator {
  const c = JSON.parse(readFileSync(path, "utf8"));
  object(c, ["stateRoot", "principal", "trustedLocal", "ceiling", "grants", "checks"]);
  text(c.stateRoot); text(c.principal); scope(c.ceiling);
  if (c.trustedLocal !== true || process.env.CAPSULE_TRUSTED_LOCAL !== "1") throw Error("trusted-local operator opt-in required");
  if (!c.grants || Array.isArray(c.grants) || typeof c.grants !== "object") throw Error("invalid operator grants");
  for (const g of Object.values(c.grants) as any[]) { object(g, ["principal", "enabled", "review", "scope"]); text(g.principal); scope(g.scope); if (typeof g.enabled !== "boolean" || typeof g.review !== "boolean") throw Error("invalid grant boolean"); }
  if (!Array.isArray(c.checks)) throw Error("invalid checks");
  c.checks.forEach((check: any) => {
    object(check, ["id", "builder", "script", "sha256", "parameters", "requiredCapabilities"]);
    [check.id, check.script, check.sha256].forEach(text);
    if (!check.id.startsWith("check.") || check.builder !== "node-check" || !/^[a-f0-9]{64}$/.test(check.sha256)) throw Error("unsupported check builder");
    names(check.requiredCapabilities);
    if (check.requiredCapabilities.some((k: string) => !capabilityNames.includes(k as any))) throw Error("unknown capability");
    if (!check.parameters || typeof check.parameters !== "object" || Array.isArray(check.parameters)) throw Error("invalid parameter schema");
    Object.values(check.parameters).forEach(names);
  });
  names(c.checks.map((x: Check) => x.id));
  return c as Operator;
}

function file(root: string, path: string) {
  const base = realpathSync(root), target = realpathSync(resolve(base, path));
  if (!target.startsWith(base + sep) || !statSync(target).isFile()) throw Error("permission_denied: file containment");
  return target;
}
function snapshot(r: ScriptedRequest) {
  return Object.fromEntries(r.protectedPaths.map(p => { const target = file(r.scope.projectRoot, p), s = statSync(target); return [p, { target, dev: s.dev, ino: s.ino, mode: s.mode, digest: sha256(readFileSync(target)) }]; }));
}
function unchanged(t: Task) { try { return identity(snapshot(t.request)) === identity(t.capsule.protectedFiles); } catch { return false; } }

/** Public domain boundary. No caller-supplied recipe, executable, environment,
 * argv, verifier, or cwd is accepted. Operator config is trusted setup only. */
export class ScriptedService {
  private readonly state: Durable;
  readonly root: string;
  constructor(private readonly configPath: string) {
    const c = config(configPath);
    mkdirSync(resolve(c.stateRoot), { recursive: true, mode: 0o700 });
    this.root = realpathSync(c.stateRoot);
    if (!existsSync(join(this.root, "controller.sqlite")) && readdirSync(this.root).length) throw Error("state_corrupt: nonempty legacy state requires explicit migration; not replayed");
    this.state = new Durable(join(this.root, "controller.sqlite"));
    this.state.db.exec("CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, client TEXT UNIQUE NOT NULL, request_digest TEXT NOT NULL, body TEXT NOT NULL, digest TEXT NOT NULL); CREATE TABLE IF NOT EXISTS obligations (binding TEXT PRIMARY KEY, task TEXT NOT NULL);");
  }
  close() { this.state.close(); }
  private current(r: ScriptedRequest, reviewer = false) {
    const c = config(this.configPath), g = c.grants[r.grant];
    if (realpathSync(c.stateRoot) !== this.root || !g || !g.enabled || g.principal !== c.principal || (reviewer && !g.review)) throw Error("permission_denied: current grant");
    for (const s of [g.scope, c.ceiling]) {
      if (realpathSync(s.projectRoot) !== realpathSync(r.scope.projectRoot)) throw Error("permission_denied: project");
      for (const key of ["readPaths", "writePaths", "tools", "operations", "effects"] as const) if (r.scope[key].some(v => !s[key].includes(v))) throw Error(`permission_denied: ${key}`);
      for (const k of capabilityNames) if (r.scope.capabilities[k] && !s.capabilities[k]) throw Error(`permission_denied: ${k}`);
    }
    const budget = { ...r.scope.budget };
    for (const k of Object.keys(budget) as (keyof typeof budget)[]) budget[k] = k === "reportReserveMs" ? Math.max(budget[k], g.scope.budget[k], c.ceiling.budget[k]) : Math.min(budget[k], g.scope.budget[k], c.ceiling.budget[k]);
    if (budget.wallMs <= budget.reportReserveMs) throw Error("budget_exhausted: reporting reserve");
    return { c, budget, recovery: Math.min(r.stop.recovery, r.scope.recovery, g.scope.recovery, c.ceiling.recovery) };
  }
  private operation(r: ScriptedRequest, unitId: string) {
    const { c } = this.current(r), u = r.units.find(x => x.id === unitId);
    if (!u || !r.scope.operations.includes(u.operation) || !r.scope.tools.includes("exec_action")) throw Error("permission_denied: operation");
    if (u.operation === "project.inspect") {
      object(u.params, ["path"]); text(u.params.path);
      if (!r.scope.effects.includes("read") || !r.scope.readPaths.includes(u.params.path)) throw Error("permission_denied: read path");
      const path = file(r.scope.projectRoot, u.params.path);
      return { digest: identity({ builder: "inspect-v1", executable: sha256(readFileSync(process.execPath)) }), spec: { argv: [process.execPath, "-e", "process.stdout.write(require('node:fs').readFileSync(process.argv[1]))", path], cwd: realpathSync(r.scope.projectRoot), timeoutMs: r.scope.budget.perCommandMs } as CommandSpec };
    }
    const check = c.checks.find(x => x.id === u.operation);
    if (!check || !r.scope.effects.includes("check")) throw Error("unsupported: operation unavailable");
    for (const k of check.requiredCapabilities) {
      if (!r.scope.capabilities[k as keyof Scope["capabilities"]]) throw Error(`permission_denied: ${k}`);
      // Environment routes do not have verified integration in this milestone.
      throw Error(`unsupported: ${k} execution`);
    }
    object(u.params, Object.keys(check.parameters));
    const args = Object.keys(check.parameters).sort().map(k => { const value = u.params[k]; if (typeof value !== "string" || !check.parameters[k].includes(value)) throw Error("invalid_contract: check parameter"); return value; });
    const script = realpathSync(check.script);
    if (sha256(readFileSync(script)) !== check.sha256) throw Error("integrity_error: registered check content");
    return { digest: identity({ check, script, executable: sha256(readFileSync(process.execPath)) }), spec: { argv: [process.execPath, script, ...args], cwd: realpathSync(r.scope.projectRoot), timeoutMs: r.scope.budget.perCommandMs } as CommandSpec };
  }
  private load(id: string, authorize = true): Task {
    const row = this.state.db.prepare("SELECT * FROM tasks WHERE id=?").get(id) as any;
    if (!row) throw Error("permission_denied: unknown task");
    const t = JSON.parse(row.body) as Task;
    if (identity(t) !== row.digest || t.id !== id || t.requestDigest !== row.request_digest || identity(t.request) !== t.requestDigest || t.request.clientRequestId !== row.client || digestRecord(t.capsule) !== t.capsule.digest || t.rendering !== canonicalJson(t.capsule) || identity(t.capsule.request) !== t.requestDigest || t.capsule.taskId !== t.id || t.capsule.episodeId !== t.episodeId) throw Error("state_corrupt: identity conflict");
    request(t.request);
    if (!Number.isSafeInteger(t.deadline) || !["authorized", "running", "stopped", "reporting", "reported", "closed"].includes(t.phase) || [t.tools, t.commandMs, t.recovery].some(n => !Number.isSafeInteger(n) || n < 0)) throw Error("state_corrupt: lifecycle");
    if (!t.actions || typeof t.actions !== "object" || Array.isArray(t.actions) || t.tools !== Object.keys(t.actions).length || t.commandMs !== Object.values(t.actions).reduce((n, a) => n + a.allowance, 0)) throw Error("state_corrupt: reservations");
    for (const [key, a] of Object.entries(t.actions)) {
      const [unitId, attempt] = key.split(":");
      if (!t.request.units.some(u => u.id === unitId) || !Number.isSafeInteger(Number(attempt)) || Number(attempt) < 0 || !Number.isSafeInteger(a.allowance) || a.allowance <= cleanupReserveMs || typeof a.intent !== "string") throw Error("state_corrupt: action");
      if (a.receipt && (a.receipt.taskId !== t.id || a.receipt.episodeId !== t.episodeId || a.receipt.capsuleDigest !== t.capsule.digest || a.receipt.requestId !== key || a.receipt.acceptanceUnitId !== unitId)) throw Error("state_corrupt: receipt binding");
    }
    if (t.report && (digestRecord(t.report) !== t.report.digest || t.report.taskId !== t.id || t.report.episodeId !== t.episodeId || t.report.capsuleDigest !== t.capsule.digest)) throw Error("state_corrupt: report binding");
    if (authorize) {
      const { c } = this.current(t.request);
      if (t.principal !== c.principal) throw Error("permission_denied: task principal");
    }
    return t;
  }
  private save(t: Task) {
    this.state.db.prepare("UPDATE tasks SET body=?, digest=? WHERE id=?").run(canonicalJson(t), identity(t), t.id);
  }
  submit(input: unknown) {
    request(input); const r = structuredClone(input), d = identity(r);
    const authority = this.current(r);
    const operations = Object.fromEntries(r.units.map(u => [u.id, this.operation(r, u.id).digest]));
    if (r.protectedPaths.some(p => !r.scope.readPaths.includes(p))) throw Error("permission_denied: protected scope");
    return this.state.transaction(() => {
      const old = this.state.db.prepare("SELECT id, request_digest FROM tasks WHERE client=?").get(r.clientRequestId) as any;
      if (old) { if (old.request_digest !== d) throw Error("invalid_contract: changed clientRequestId"); return this.view(this.load(old.id)); }
      // A client ID is not a retry authority. Unresolved scope obligations bind
      // subsequent requests until an explicit supervisor lifecycle is implemented.
      const binding = identity({ principal: authority.c.principal, project: realpathSync(r.scope.projectRoot) });
      if (this.state.db.prepare("SELECT task FROM obligations WHERE binding=?").get(binding)) throw Error("lifecycle_stop: existing project obligation; resume original task");
      const id = newId("task"), episodeId = newId("episode"), protectedFiles = snapshot(r);
      const unsigned = { version: 1, id: newId("capsule"), taskId: id, episodeId, request: r, budget: authority.budget, recovery: authority.recovery, operations, protectedFiles };
      const capsule = { ...unsigned, digest: digestRecord(unsigned) };
      const t: Task = { id, episodeId, requestDigest: d, principal: authority.c.principal, request: r, capsule, rendering: canonicalJson(capsule), deadline: Date.now() + authority.budget.wallMs, phase: "authorized", tools: 0, commandMs: 0, recovery: 0, actions: {} };
      this.state.db.prepare("INSERT INTO tasks VALUES (?,?,?,?,?)").run(id, r.clientRequestId, d, canonicalJson(t), identity(t));
      this.state.db.prepare("INSERT INTO obligations VALUES (?,?)").run(binding, id);
      return this.view(t);
    });
  }
  private view(t: Task) { return { taskId: t.id, episodeId: t.episodeId, capsuleDigest: t.capsule.digest, phase: t.phase, report: t.report ?? null }; }
  private bound(t: Task, episodeId: string, capsuleDigest: string) {
    if (t.episodeId !== episodeId || t.capsule.digest !== capsuleDigest) throw Error("integrity_error: episode/capsule");
  }
  execute(input: ExecuteRequest, abort?: AbortSignal): Promise<ExecutionReceipt> {
    object(input, ["taskId", "episodeId", "capsuleDigest", "unitId", "attempt"]);
    [input.taskId, input.episodeId, input.capsuleDigest, input.unitId].forEach(text);
    if (!Number.isSafeInteger(input.attempt) || input.attempt < 0) return Promise.reject(Error("invalid_contract: attempt"));
    try { const t = this.load(input.taskId); this.bound(t, input.episodeId, input.capsuleDigest); }
    catch (e) { return Promise.reject(e); }
    // The pending identity and deferred execution must use the same snapshot.
    // Never retain a caller-owned object across the microtask boundary.
    const authorizedInput: ExecuteRequest = Object.freeze({ ...input });
    const key = `${this.root}:${authorizedInput.taskId}:${identity(authorizedInput)}`;
    const old = pending.get(key); if (old) return old;
    // Publish before any asynchronous persistence or setup can yield.
    const result = Promise.resolve().then(() => this.run(authorizedInput, abort));
    pending.set(key, result);
    void result.finally(() => pending.delete(key)).catch(() => {});
    return result;
  }
  private async run(i: ExecuteRequest, abort?: AbortSignal) {
    const key = `${i.unitId}:${i.attempt}`;
    const reserved = this.state.transaction(() => {
      const t = this.load(i.taskId); this.bound(t, i.episodeId, i.capsuleDigest);
      const old = t.actions[key];
      if (old?.receipt) return { t, receipt: old.receipt, allowance: 0 };
      if (old) throw Error("reconciliation_required: durable intent has uncertain external effects; not replayed");
      if (!["authorized", "running"].includes(t.phase)) throw Error("lifecycle_stop");
      if (Object.values(t.actions).some(a => !a.receipt)) throw Error("in_progress: task has an owner");
      const latestAttempts = new Map<string, { attempt: number; action: Action }>();
      for (const [id, action] of Object.entries(t.actions)) {
        const [unit, attemptText] = id.split(":"), attempt = Number(attemptText);
        if (!latestAttempts.has(unit) || latestAttempts.get(unit)!.attempt < attempt) latestAttempts.set(unit, { attempt, action });
      }
      const failures = [...latestAttempts.values()].filter(a => a.action.failures?.length);
      const current = this.current(t.request);
      if (failures.length) {
        const prior = t.actions[`${i.unitId}:${i.attempt - 1}`];
        if (!prior?.failures?.length || t.recovery >= Math.min(t.capsule.recovery, current.recovery)) throw Error("lifecycle_stop: recovery exhausted");
        t.recovery++;
      } else if (i.attempt !== 0) throw Error("invalid_contract: retry without failure");
      const b = t.capsule.budget;
      if (t.tools >= Math.min(b.maxToolActions, current.budget.maxToolActions)) throw Error("budget_exhausted: actions");
      const allowance = Math.floor(Math.min(b.perCommandMs, current.budget.perCommandMs, Math.min(b.commandMsTotal, current.budget.commandMsTotal) - t.commandMs, t.deadline - Date.now() - Math.max(b.reportReserveMs, current.budget.reportReserveMs)));
      if (allowance <= cleanupReserveMs) throw Error("budget_exhausted: deadline/command allowance");
      this.operation(t.request, i.unitId);
      if (abort?.aborted) throw Error("cancelled_before_spawn");
      t.tools++; t.commandMs += allowance; t.phase = "running";
      t.actions[key] = { intent: newId("intent"), allowance };
      this.save(t); return { t, allowance, receipt: undefined };
    });
    if (reserved.receipt) return reserved.receipt;
    const t = reserved.t, store = new EvidenceStore(join(this.root, t.id), t.capsule.budget.evidenceBytes);
    await store.init();
    // This awaited intent is also an injection point for storage-failure tests.
    await store.appendEvent({ type: "action_intent", taskId: t.id, key, intent: t.actions[key].intent });
    const current = this.current(t.request), operation = this.operation(t.request, i.unitId);
    if (this.load(t.id).phase !== "running") throw Error("lifecycle_stop: after persistence");
    if (operation.digest !== t.capsule.operations[i.unitId]) throw Error("integrity_error: immutable operation changed");
    const timeoutMs = Math.min(reserved.allowance, t.deadline - Date.now() - Math.max(t.capsule.budget.reportReserveMs, current.budget.reportReserveMs)) - cleanupReserveMs;
    if (timeoutMs <= 0) throw Error("budget_exhausted: after persistence");
    const receipt = await execute({ ...operation.spec, timeoutMs }, { taskId: t.id, episodeId: t.episodeId, requestId: key, capsuleDigest: t.capsule.digest, unitId: i.unitId, recipeId: t.request.units.find(u => u.id === i.unitId)!.operation, recipeDigest: operation.digest }, store, abort);
    const failures: string[] = [];
    if (receipt.exitCode !== 0 || receipt.cancelled || receipt.timedOut || receipt.spawnError) failures.push("command");
    if (!receipt.stdout.complete || !receipt.stderr.complete) failures.push("incomplete");
    if (!unchanged(t)) failures.push("protected");
    if (receipt.recipeId !== "project.inspect") {
      let result: any; try { result = JSON.parse((await store.get(receipt.stdout.sha256)).toString()); } catch {}
      if (result?.certified !== true || result?.complete !== true) failures.push("structured");
    }
    this.state.transaction(() => {
      // Revocation stops new work/access, but cannot erase a completed process
      // observation. This internal commit does not grant worker authority.
      const latest = this.load(t.id, false);
      latest.actions[key].receipt = receipt; latest.actions[key].failures = failures;
      // Reserve full command capacity conservatively; restart never refunds it.
      if (latest.phase === "running" && (failures.some(f => latest.request.stop.on.includes(f)) || (failures.length && latest.recovery >= latest.capsule.recovery))) latest.phase = "stopped";
      this.save(latest);
    });
    return receipt;
  }
  async finalize(taskId: string, episodeId: string, capsuleDigest: string, draft: unknown = null) {
    let t = this.state.transaction(() => {
      const t = this.load(taskId); this.bound(t, episodeId, capsuleDigest);
      if (t.report) return t;
      t.phase = "reporting"; this.save(t); return t;
    });
    if (t.report) return t.report;
    // Join live local owners after publishing the durable reporting stop. An
    // owner in another process is never assumed finished: absent receipts below
    // produce unknown/incomplete evidence, which cannot be accepted.
    await Promise.allSettled([...pending].filter(([key]) => key.startsWith(`${this.root}:${taskId}:`)).map(([, promise]) => promise));
    t = this.load(taskId);
    if (t.report) return t.report;
    const protectedPass = unchanged(t);
    const evidence: any[] = [], units: any[] = [], criteria: any[] = [];
    const store = new EvidenceStore(join(this.root, t.id), t.capsule.budget.evidenceBytes);
    for (const u of t.request.units) {
      const action = Object.entries(t.actions).filter(([k]) => k.startsWith(u.id + ":")).sort(([a], [b]) => Number(a.split(":").at(-1)) - Number(b.split(":").at(-1))).at(-1)?.[1];
      const r = action?.receipt;
      let complete = !!r, structured = false;
      if (r) for (const stream of [r.stdout, r.stderr]) {
        try { const bytes = await store.get(stream.sha256); if (!stream.complete || bytes.length !== stream.storedBytes) complete = false; evidence.push({ executionId: r.id, ...stream }); } catch { complete = false; }
      }
      if (r && complete) try { const value = JSON.parse((await store.get(r.stdout.sha256)).toString()); structured = value.certified === true && value.complete === true; } catch {}
      const completion = !!r && r.exitCode === 0 && !r.spawnError && !r.cancelled && !r.timedOut;
      const checks: Record<string, boolean> = { protected: protectedPass, completion, evidence: complete, structured };
      const cs = t.request.criteria.filter(c => c.unitId === u.id).map(c => ({ ...c, verification: checks[c.kind] ? "pass" : r ? "fail" : "unknown" }));
      criteria.push(...cs);
      units.push({ unitId: u.id, description: u.description, executionState: !r ? action ? "unknown" : "not_run" : r.cancelled || r.timedOut ? "interrupted" : completion ? "completed" : "failed", verification: cs.every(c => c.verification === "pass") ? "pass" : "fail", acceptance: "pending", executionId: r?.id ?? null });
    }
    const draftValid = !!draft && typeof draft === "object" && !Array.isArray(draft) && Object.keys(draft).length === 1 && typeof (draft as any).summary === "string" && (draft as any).summary.length <= 8000;
    const unsigned = { id: newId("report"), taskId, episodeId, capsuleDigest, draftStatus: draftValid ? "valid" : draft === null ? "absent" : "invalid", summary: draftValid ? (draft as any).summary : "Controller fallback: authoritative receipts and verifiers only.", evidenceComplete: evidence.length === t.request.units.length * 2 && evidence.every(e => e.complete), protected: protectedPass, evidence, criteria, units, environmentHandle: null };
    const report = { ...unsigned, digest: digestRecord(unsigned) };
    return this.state.transaction(() => { const latest = this.load(taskId); if (latest.report) return latest.report; latest.report = report; latest.phase = "reported"; this.save(latest); return report; });
  }
  async evidence(taskId: string, executionId: string, stream: "stdout" | "stderr", start = 0, end?: number) {
    const t = this.load(taskId);
    if (!t.request.scope.tools.includes("read_evidence") || !["stdout", "stderr"].includes(stream)) throw Error("permission_denied: evidence");
    const receipt = Object.values(t.actions).find(a => a.receipt?.id === executionId)?.receipt;
    if (!receipt) throw Error("permission_denied: artifact not indexed to task");
    const artifact = receipt[stream];
    if (artifact.storedBytes === 0 && artifact.observedBytes > 0) throw Error("evidence_unavailable: unretained");
    const store = new EvidenceStore(join(this.root, t.id), t.capsule.budget.evidenceBytes);
    return { artifact, text: (await store.get(artifact.sha256, start, end)).toString() };
  }
  decide(input: { taskId: string; episodeId: string; reportId: string; reportDigest: string; decisionId: string; acceptedUnits: string[]; decision: "accept" | "reject"; rationale: string }) {
    object(input, ["taskId", "episodeId", "reportId", "reportDigest", "decisionId", "acceptedUnits", "decision", "rationale"]);
    [input.taskId, input.episodeId, input.reportId, input.reportDigest, input.decisionId, input.rationale].forEach(text); names(input.acceptedUnits);
    if (!["accept", "reject"].includes(input.decision)) throw Error("unsupported decision");
    return this.state.transaction(() => {
      const t = this.load(input.taskId); this.current(t.request, true);
      const r = t.report;
      if (!r || r.id !== input.reportId || r.episodeId !== input.episodeId || r.digest !== input.reportDigest || digestRecord(r) !== r.digest) throw Error("integrity_error: report binding");
      if (!unchanged(t)) throw Error("stale: protected files changed");
      for (const u of t.request.units) if (this.operation(t.request, u.id).digest !== t.capsule.operations[u.id]) throw Error("stale: operation identity");
      if (t.decision) { if (identity(t.decision) !== identity(input)) throw Error("conflicting decision"); return t.decision; }
      if (t.phase !== "reported") throw Error("lifecycle_stop: not reviewable");
      if (input.decision === "accept" && (!input.acceptedUnits.length || !r.evidenceComplete || !r.protected || input.acceptedUnits.some(id => !r.units.some((u: any) => u.unitId === id && u.verification === "pass" && u.executionState === "completed")))) throw Error("unverified: named units");
      if (input.decision === "reject" && input.acceptedUnits.length) throw Error("invalid_contract: rejected units cannot be accepted");
      // Reauthenticate retained artifacts, not only the report checksum.
      const taskRoot = join(this.root, t.id);
      if (realpathSync(taskRoot) !== taskRoot) throw Error("permission_denied: task containment");
      for (const e of r.evidence) { const path = file(taskRoot, `evidence/${e.sha256}`); if (sha256(readFileSync(path)) !== e.sha256) throw Error("evidence_integrity"); }
      t.decision = structuredClone(input); t.phase = "closed"; this.save(t); return input;
    });
  }
  async runRequest(input: unknown, abort?: AbortSignal) {
    const admitted = this.submit(input), t = this.load(admitted.taskId);
    if (t.report) return { ...admitted, report: t.report };
    for (const u of t.request.units) {
      try { await this.execute({ taskId: t.id, episodeId: t.episodeId, capsuleDigest: t.capsule.digest, unitId: u.id, attempt: 0 }, abort); }
      catch (e) { if (String(e).includes("reconciliation_required") || String(e).includes("in_progress")) throw e; break; }
    }
    const report = await this.finalize(t.id, t.episodeId, t.capsule.digest);
    return { ...this.view(this.load(t.id)), report };
  }
}
