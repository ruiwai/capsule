import { describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, renameSync, symlinkSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { fixture, action, decision } from "./scripted-fixture.js";
import { ScriptedService } from "../src/controller/scripted.js";
import { EvidenceStore } from "../src/evidence/store.js";
import { execute } from "../src/execution/spawn.js";
import { scriptedExtension as extension } from "../src/extension/index.js";
import { identity } from "../src/controller/scripted-contract.js";

const output = process.env.CAPSULE_RESULTS ?? mkdtempSync(join(tmpdir(), "capsule-acceptance-results-"));
mkdirSync(output, { recursive: true });
const record = (id: string, value: unknown) => writeFileSync(join(output, `${id}.json`), JSON.stringify({ classification: "synthetic executed acceptance", result: "PASS", value }, null, 2));
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const effects = (f: ReturnType<typeof fixture>) => existsSync(join(f.project, "effects")) ? readFileSync(join(f.project, "effects"), "utf8") : "";
const childExec = promisify(execFile);
let serial = 0;
async function child(cfg: any) {
  const path = join(output, `process-${++serial}.json`); writeFileSync(path, JSON.stringify(cfg));
  const { stdout, stderr } = await childExec(process.execPath, ["--import", "tsx", resolve("tests/scripted-process.ts"), path], { env: { ...process.env, CAPSULE_TRUSTED_LOCAL: "1" }, timeout: 12000 });
  writeFileSync(path + ".log", stdout + stderr); return JSON.parse(stdout.trim());
}
async function barrierPair(f: ReturnType<typeof fixture>, base: any, second = base) {
  const gate = join(f.root, "gate"), ready = [join(f.root, "ready-a"), join(f.root, "ready-b")];
  const a = child({ ...base, ready: ready[0], gate }), b = child({ ...second, ready: ready[1], gate });
  const until = Date.now() + 8000;
  while (!ready.every(existsSync)) { if (Date.now() > until) throw Error("test barrier timeout"); await delay(10); }
  writeFileSync(gate, "release"); return Promise.all([a, b]);
}
function callbacks() { const tools = new Map<string, any>(); extension({ registerTool: (t: any) => tools.set(t.name, t) } as any); return tools; }

describe("durable scripted A01–A15 (synthetic fixtures)", () => {
  it("A01 public execution to evidence, persisted report and named-unit review", async () => {
    const f = fixture(), tools = callbacks();
    const run = await tools.get("delegate_episode").execute("call", { request: f.request });
    expect(run.details.status).toBe("completed"); expect(run.details.value.phase).toBe("reported"); const report = run.details.value.report;
    expect(report.units.map((u: any) => u.verification)).toEqual(["pass", "pass"]);
    expect(report.draftStatus).toBe("absent"); expect(report.evidenceComplete).toBe(true);
    const read = await tools.get("read_evidence").execute("read", { taskId: report.taskId, executionId: report.units[1].executionId, stream: "stdout" });
    expect(JSON.parse(read.details.value.text)).toEqual({ certified: true, complete: true });
    const reviewed = await tools.get("decide_episode").execute("review", decision(report));
    expect(reviewed.details.status).toBe("completed"); expect(reviewed.details.value.acceptedUnits).toEqual(["inspection", "check"]);
    expect(effects(f)).toBe("x");
    f.service.close();
    const db = new DatabaseSync(join(f.config.stateRoot, "controller.sqlite"));
    const task = JSON.parse((db.prepare("SELECT body FROM tasks WHERE id=?").get(report.taskId) as any).body); db.close();
    writeFileSync(join(f.root, "saved-capsule.json"), task.rendering);
    writeFileSync(join(f.root, "actual-receipts.json"), JSON.stringify(Object.values(task.actions).map((a: any) => a.receipt), null, 2));
    writeFileSync(join(f.root, "actual-report.json"), JSON.stringify(task.report, null, 2));
    writeFileSync(join(f.root, "actual-decision.json"), JSON.stringify(task.decision, null, 2));
    cpSync(f.root, join(output, "A01-artifacts"), { recursive: true });
    record("A01", { run, read, reviewed, originalRoot: f.root });
  });
  it("A02 public rejects executable parameters, unresolved/disabled authority and prohibited effects", async () => {
    const observations: any[] = [];
    for (const alter of [
      (f: any) => { f.request.units[0].params = { path: "protected.txt", target: process.execPath, args: ["evil"] }; },
      (f: any) => { f.request.grant = "unresolved-user-claim"; },
      (f: any) => { f.request.scope.writePaths = ["protected.txt"]; },
      (f: any) => { f.config.grants["operator-grant"].scope.operations = []; },
      (f: any) => { f.request.scope.capabilities.downloads = []; },
      (f: any) => { f.request.authority = { issuer: "user" }; },
      (f: any) => { f.config.grants["operator-grant"].enabled = false; },
      (f: any) => { f.request.requiresHardIsolation = true; },
      (f: any) => { f.request.scope.capabilities.unknownPermission = true; },
      (f: any) => { f.request.mode = "adaptive"; },
      (f: any) => { f.request.protectedPaths = []; },
    ]) {
      const f = fixture(); alter(f); f.save();
      const result = await callbacks().get("delegate_episode").execute("negative", { request: f.request });
      expect(result.details.status).toBe("rejected"); expect(effects(f)).toBe(""); expect(readFileSync(join(f.project, "protected.txt"), "utf8")).toBe("SYNTHETIC protected source\n");
      observations.push(result); f.service.close();
    }
    record("A02", observations);
  });
  it("A03 identical sequential/concurrent public submissions reuse one task and action", async () => {
    const f = fixture("slow"), tools = callbacks();
    const runs = await Promise.all([0, 1].map(n => tools.get("delegate_episode").execute(String(n), { request: f.request })));
    const again = await tools.get("delegate_episode").execute("again", { request: f.request });
    expect(runs.map(r => r.details.status)).toEqual(["completed", "completed"]);
    expect(runs[0].details.value.taskId).toBe(runs[1].details.value.taskId); expect(again.details.value.report.id).toBe(runs[0].details.value.report.id);
    expect(effects(f)).toBe("x");
    f.request.goal += " changed"; f.save(); const changed = await tools.get("delegate_episode").execute("changed", { request: f.request });
    expect(changed.details.status).toBe("rejected"); expect(effects(f)).toBe("x"); record("A03", { runs, again, changed }); f.service.close();
  });
  it("A04 immutable registered builders reject copied digests and denied genuine capabilities", async () => {
    const f = fixture(), admitted = f.service.submit(f.request);
    expect(() => f.service.execute({ ...action(admitted), recipe: { id: "check.fixture", digest: f.config.checks[0].sha256, requiredCapabilityNames: [] } } as any)).toThrow("exact object");
    expect(effects(f)).toBe("");
    const copied = join(f.root, "checker.cjs"); writeFileSync(copied, "require('fs').writeFileSync('unsafe','x')"); f.config.checks[0].script = copied; f.save();
    await expect(f.service.execute(action(admitted))).rejects.toThrow("content"); expect(effects(f)).toBe(""); expect(existsSync(join(f.project, "unsafe"))).toBe(false); f.service.close();
    const denied = fixture(); denied.config.checks[0].requiredCapabilities = ["directLoader"]; denied.save(); expect(() => denied.service.submit(denied.request)).toThrow("directLoader"); expect(effects(denied)).toBe(""); denied.service.close();
    const good = fixture(); const r = await good.service.runRequest(good.request); expect(r.report.units[1].verification).toBe("pass"); expect(effects(good)).toBe("x"); good.service.close(); record("A04", { alteredEffects: effects(f), deniedEffects: effects(denied), authorized: r });
  });
  it("A05 synchronized separate controller processes own one admitted task/action", async () => {
    const f = fixture("slow");
    const results = await barrierPair(f, { configPath: f.configPath, operation: "run", request: f.request });
    expect(results[0].pid).not.toBe(results[1].pid); expect(effects(f)).toBe("x");
    expect(results.filter(r => r.value?.report).length).toBeGreaterThanOrEqual(1);
    expect(results.every(r => r.value?.report || /reconciliation_required|in_progress/.test(r.error))).toBe(true);
    const db = new DatabaseSync(join(f.config.stateRoot, "controller.sqlite")); expect((db.prepare("SELECT count(*) n FROM tasks").get() as any).n).toBe(1); db.close();
    record("A05", { results, effects: effects(f) }); f.service.close();
  });
  it("A06 expired and reported lifecycle persists in newly launched processes", async () => {
    const f = fixture("pass", r => { r.scope.budget.wallMs = 180; r.scope.budget.reportReserveMs = 40; });
    const admitted = await child({ operation: "submit", configPath: f.configPath, request: f.request }); await delay(210);
    const expired = await child({ configPath: f.configPath, action: action(admitted.value) });
    expect(expired.error).toContain("budget_exhausted"); expect(effects(f)).toBe(""); f.service.close();
    const g = fixture(), run = await child({ operation: "run", configPath: g.configPath, request: g.request });
    const stopped = await child({ configPath: g.configPath, action: action(run.value, "check", 1) });
    expect(stopped.error).toContain("lifecycle_stop"); expect(effects(g)).toBe("x"); record("A06", { admitted, expired, run, stopped }); g.service.close();
  });
  it("A07 tool/time reservations and slow persistence prevent excess spawns", async () => {
    const f = fixture("slow", r => { r.scope.budget.maxToolActions = 1; }); const a = f.service.submit(f.request);
    const results = await Promise.allSettled([f.service.execute(action(a)), f.service.execute(action(a, "inspection"))]);
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1); expect(effects(f)).toBe("x"); f.service.close();
    const g = fixture("pass", r => { r.scope.budget.commandMsTotal = 1200; r.scope.budget.perCommandMs = 1200; }); const b = g.service.submit(g.request);
    const timed = await g.service.execute(action(b)); await expect(g.service.execute(action(b, "inspection"))).rejects.toThrow("budget_exhausted"); expect(effects(g)).toBe("x"); expect(timed.durationMs).toBeLessThanOrEqual(g.request.scope.budget.commandMsTotal); g.service.close();
    const h = fixture("pass", r => { r.scope.budget.wallMs = 1300; r.scope.budget.reportReserveMs = 40; }); const c = h.service.submit(h.request);
    const original = EvidenceStore.prototype.appendEvent;
    const spy = vi.spyOn(EvidenceStore.prototype, "appendEvent").mockImplementation(async function(this: EvidenceStore, e) { await delay(1400); return original.call(this, e); });
    try { await expect(h.service.execute(action(c))).rejects.toThrow("after persistence"); expect(effects(h)).toBe(""); } finally { spy.mockRestore(); h.service.close(); }
    const revoked = fixture(), d = revoked.service.submit(revoked.request);
    const revoke = vi.spyOn(EvidenceStore.prototype, "appendEvent").mockImplementation(async function(this: EvidenceStore, e) { await original.call(this, e); revoked.config.grants["operator-grant"].enabled = false; revoked.save(); });
    try { await expect(revoked.service.execute(action(d))).rejects.toThrow("current grant"); expect(effects(revoked)).toBe(""); } finally { revoke.mockRestore(); revoked.service.close(); }
    record("A07", { concurrent: results, aggregateEffects: effects(g), actualCommandMs: timed.durationMs, reservedCommandMs: g.request.scope.budget.commandMsTotal, delayedEffects: effects(h), revokedEffects: effects(revoked) });
  });
  it("A08 intent failure has no effect, restart cannot replay, live duplicates join", async () => {
    const f = fixture(), a = f.service.submit(f.request);
    const spy = vi.spyOn(EvidenceStore.prototype, "appendEvent").mockRejectedValue(Error("synthetic disk failure"));
    try { await expect(f.service.execute(action(a))).rejects.toThrow("disk failure"); } finally { spy.mockRestore(); }
    expect(effects(f)).toBe("");
    const restarted = await child({ configPath: f.configPath, action: action(a) }); expect(restarted.error).toContain("reconciliation_required"); expect(effects(f)).toBe(""); f.service.close();
    const g = fixture(), b = g.service.submit(g.request); let release!: () => void, entered!: () => void;
    const barrier = new Promise<void>(r => entered = r), gate = new Promise<void>(r => release = r), original = EvidenceStore.prototype.appendEvent;
    const pause = vi.spyOn(EvidenceStore.prototype, "appendEvent").mockImplementation(async function(this: EvidenceStore, e) { entered(); await gate; return original.call(this, e); });
    try { const first = g.service.execute(action(b)); await barrier; const duplicate = g.service.execute(action(b)); expect(duplicate).toBe(first); release(); const [x, y] = await Promise.all([first, duplicate]); expect(x.id).toBe(y.id); expect(effects(g)).toBe("x"); record("A08", { restarted, receipt: x }); } finally { release(); pause.mockRestore(); g.service.close(); }
  });
  it("A09 strict/semantic/zero-recovery stops resist fresh IDs; allowed recovery succeeds", async () => {
    const stops: any[] = [];
    for (const scenario of [{ mode: "command-fail", rules: { on: ["command"], recovery: 0 } }, { mode: "fail", rules: { on: [] as string[], recovery: 0 } }, { mode: "fail", rules: { on: ["structured"], recovery: 2 } }]) {
      const { mode, rules } = scenario;
      const f = fixture(mode, r => { r.stop = rules; r.scope.recovery = rules.recovery; }); const a = f.service.submit(f.request);
      const r = await f.service.execute(action(a)); expect(r.exitCode).toBe(mode === "command-fail" ? 7 : 0);
      await expect(f.service.execute(action(a, "inspection"))).rejects.toThrow("lifecycle_stop"); await expect(f.service.execute(action(a, "check", 1))).rejects.toThrow("lifecycle_stop");
      expect(() => f.service.submit({ ...f.request, clientRequestId: "fresh" })).toThrow("obligation"); expect(effects(f)).toBe("x"); stops.push(r); f.service.close();
    }
    const f = fixture("recover", r => { r.stop = { on: ["protected"], recovery: 1 }; r.scope.recovery = 1; }); const a = f.service.submit(f.request);
    await f.service.execute(action(a)); const recovered = await f.service.execute(action(a, "check", 1)); expect(JSON.parse((await f.service.evidence(a.taskId, recovered.id, "stdout")).text).certified).toBe(true); expect(effects(f)).toBe("xx");
    await expect(f.service.execute(action(a, "check", 2))).rejects.toThrow(); expect(effects(f)).toBe("xx");
    await f.service.execute(action(a, "inspection"));
    const report = await f.service.finalize(a.taskId, a.episodeId, a.capsuleDigest); expect(report.units.every((u: any) => u.verification === "pass")).toBe(true); expect(f.service.decide(decision(report)).decision).toBe("accept");
    record("A09", { stops, recovered, report }); f.service.close();
  });
  it("A10 preabort, late descendant streams and TERM/KILL are bounded and truthful", async () => {
    const f = fixture(), store = new EvidenceStore(join(f.root, "capture"), 4096); await store.init();
    const ids = { taskId: "synthetic", episodeId: "e", requestId: "r", capsuleDigest: "a".repeat(64), unitId: "u", recipeId: "fixture", recipeDigest: "b".repeat(64) };
    const ac = new AbortController(); ac.abort();
    await expect(execute({ argv: [process.execPath, "-e", "require('fs').writeFileSync('effects','bad')"], cwd: f.project, timeoutMs: 1000 }, ids, store, ac.signal)).rejects.toThrow("cancelled_before_spawn"); expect(effects(f)).toBe("");
    const parent = "const c=require('child_process').spawn(process.execPath,['-e',\"setTimeout(()=>console.log('LATE'),100);setTimeout(()=>{},10000)\"],{stdio:['ignore',1,2]});require('fs').writeFileSync('child.pid',String(c.pid));c.unref();process.exit(0)";
    const start = Date.now(); const late = await execute({ argv: [process.execPath, "-e", parent], cwd: f.project, timeoutMs: 1500 }, ids, store);
    expect(Date.now() - start).toBeLessThan(2500); const bytes = (await store.get(late.stdout.sha256)).toString(); expect(!late.stdout.complete || bytes.includes("LATE")).toBe(true);
    await delay(100);
    const childPid = Number(readFileSync(join(f.project, "child.pid"), "utf8"));
    let childState = "absent"; try { childState = readFileSync(`/proc/${childPid}/stat`, "utf8").split(") ")[1][0]; } catch {}
    expect(["absent", "Z"]).toContain(childState); // a non-child zombie is not falsely claimed reaped
    const cancel = new AbortController(); setTimeout(() => cancel.abort(), 150);
    const terminated = await execute({ argv: [process.execPath, "-e", "process.on('SIGTERM',()=>{}); console.log('started');setInterval(()=>{},100)"], cwd: f.project, timeoutMs: 3000, env: { AUTHORIZATION: "SYNTHETIC-DUMMY-SECRET", UNLISTED: "SYNTHETIC-DUMMY-SECRET", LANG: "C" } }, ids, store, cancel.signal);
    expect(terminated.cancelled).toBe(true); expect(terminated.signal).toBe("SIGKILL"); expect(terminated.durationMs).toBeLessThan(2000);
    expect(terminated.publicEnvironment).toEqual({ AUTHORIZATION: "[REDACTED]", UNLISTED: "[REDACTED]", LANG: "C" }); expect(JSON.stringify(terminated)).not.toContain("SYNTHETIC-DUMMY-SECRET");
    record("A10", { late, bytes, childPid, childState, terminated }); f.service.close();
  });
  it("A11 process-safe restarted quota, corrupt reuse/read and truthful truncation", async () => {
    const f = fixture(), root = join(f.root, "quota");
    const results = await barrierPair(f, { quota: { root, limit: 8, bytes: "12345678" } }, { quota: { root, limit: 8, bytes: "abcdefgh" } });
    expect(results.filter(r => r.value?.storedBytes === 8)).toHaveLength(1);
    expect(results.filter(r => r.error?.includes("quota"))).toHaveLength(1);
    const restarted = await child({ quota: { root, limit: 8, bytes: "newbytes" } }); expect(restarted.error).toContain("quota");
    expect(readdirSync(join(root, "evidence")).reduce((n, p) => n + statSync(join(root, "evidence", p)).size, 0)).toBe(8);
    const store = new EvidenceStore(root, 8), digest = results.find(r => r.value)?.value.sha256, originalBytes = results[0].value ? "12345678" : "abcdefgh";
    expect((await store.put(originalBytes)).sha256).toBe(digest);
    writeFileSync(join(root, "evidence", digest), "CORRUPT!");
    await expect(store.get(digest)).rejects.toThrow("digest mismatch"); await expect(store.put(originalBytes)).rejects.toThrow("corrupt");
    const capture = new EvidenceStore(join(f.root, "truncation"), 8); await capture.init();
    const r = await execute({ argv: [process.execPath, "-e", "process.stdout.write('x'.repeat(100))"], cwd: f.project, timeoutMs: 1000 }, { taskId: "t", episodeId: "e", requestId: "r", capsuleDigest: "a".repeat(64), unitId: "u", recipeId: "fixture", recipeDigest: "b".repeat(64) }, capture);
    expect(r.exitCode).toBe(0); expect(r.stdout).toMatchObject({ observedBytes: 100, storedBytes: 8, complete: false }); await capture.appendEvent({ type: "terminal", receipt: r });
    const metadata = new DatabaseSync(join(capture.root, "evidence.sqlite"));
    const terminal = JSON.parse((metadata.prepare("SELECT body FROM events ORDER BY id DESC LIMIT 1").get() as any).body);
    expect(terminal.type).toBe("terminal"); expect(terminal.receipt.exitCode).toBe(0); metadata.close();
    record("A11", { results, restarted, truncation: r }); f.service.close();
  });
  it("A12 reader exit zero cannot certify false/null structured units or fabricated draft evidence", async () => {
    const reports: any[] = [];
    for (const mode of ["fail", "null"]) {
      const f = fixture(mode), a = f.service.submit(f.request); await f.service.execute(action(a, "inspection")); const r = await f.service.execute(action(a)); expect(r.exitCode).toBe(0);
      const report = await f.service.finalize(a.taskId, a.episodeId, a.capsuleDigest, { summary: "Worker claims success", evidence: ["fabricated"], certified: true });
      expect(report.draftStatus).toBe("invalid"); expect(report.criteria.find((c: any) => c.kind === "structured").verification).toBe("fail"); expect(report.units[1].description).toContain("certification");
      expect(() => f.service.decide(decision(report))).toThrow("unverified"); reports.push(report); f.service.close();
    }
    record("A12", reports);
  });
  it("A13 task-indexed evidence rejects traversal, foreign artifacts, ranges and symlink escape", async () => {
    const f = fixture(), run = await f.service.runRequest(f.request), id = run.report.units[1].executionId;
    expect((await f.service.evidence(run.taskId, id, "stdout")).text).toContain("certified");
    for (const args of [["../outside", id, "stdout"], [run.taskId, "foreign", "stdout"], [run.taskId, id, "stdout", -1], [run.taskId, id, "stdout", 0, 999999]]) await expect((f.service.evidence as any)(...args)).rejects.toThrow();
    const dir = join(f.config.stateRoot, run.taskId, "evidence"), foreign = join(f.root, "foreign-evidence"); renameSync(dir, foreign); symlinkSync(foreign, dir);
    await expect(f.service.evidence(run.taskId, id, "stdout")).rejects.toThrow("containment"); record("A13", { task: run.taskId, indexedExecution: id, symlink: foreign }); f.service.close();
  });
  it("A14 current scoped review rejects missing/mismatched/incomplete/stale and conflicting decisions", async () => {
    const f = fixture(), a = f.service.submit(f.request);
    expect(() => f.service.decide(decision({ taskId: a.taskId, episodeId: a.episodeId, id: "missing", digest: "fake" }))).toThrow();
    const report = (await f.service.runRequest(f.request)).report;
    expect(() => f.service.decide({ ...decision(report), reportDigest: "wrong" })).toThrow();
    expect(() => f.service.decide({ ...decision(report), acceptedUnits: ["invented"] })).toThrow();
    f.config.grants["operator-grant"].review = false; f.save(); expect(() => f.service.decide(decision(report))).toThrow("grant"); f.config.grants["operator-grant"].review = true; f.save();
    const accepted = f.service.decide(decision(report)); expect(f.service.decide(decision(report))).toEqual(accepted);
    expect(() => f.service.decide({ ...decision(report), rationale: "changed" })).toThrow("conflicting");
    writeFileSync(join(f.project, "protected.txt"), "external user change"); expect(() => f.service.decide(decision(report))).toThrow("stale"); expect(readFileSync(join(f.project, "protected.txt"), "utf8")).toBe("external user change");
    const g = fixture(), b = g.service.submit(g.request), incomplete = await g.service.finalize(b.taskId, b.episodeId, b.capsuleDigest); expect(() => g.service.decide(decision(incomplete))).toThrow("unverified");
    record("A14", { accepted, incomplete, changedFile: readFileSync(join(f.project, "protected.txt"), "utf8") }); f.service.close(); g.service.close();
  });
  it("A15 exact saved capsule retains complete intent and malformed durable identity fails closed", async () => {
    const f = fixture(), a = f.service.submit(f.request), db = new DatabaseSync(join(f.config.stateRoot, "controller.sqlite"));
    const row = db.prepare("SELECT * FROM tasks WHERE id=?").get(a.taskId) as any, task = JSON.parse(row.body), rendered = JSON.parse(task.rendering);
    expect(rendered.request).toEqual(f.request); expect(rendered.request.decisions[0].rationale).toBe(f.request.decisions[0].rationale); expect(rendered.protectedFiles["protected.txt"].digest).toBeTruthy(); expect(identity(task)).toBe(row.digest);
    db.prepare("UPDATE tasks SET body='{}' WHERE id=?").run(a.taskId); db.close();
    await expect(f.service.execute(action(a))).rejects.toThrow("state_corrupt"); expect(effects(f)).toBe(""); record("A15", { rendering: task.rendering, deadline: task.deadline }); f.service.close();
  });
});
