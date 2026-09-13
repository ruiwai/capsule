import { spawn } from "node:child_process";
import { performance } from "node:perf_hooks";
import type { ExecutionReceipt } from "../contracts/types.js";
import { newId, sha256 } from "../contracts/identity.js";
import { EvidenceStore } from "../evidence/store.js";

export type CommandSpec = { argv: string[]; cwd: string; env?: Record<string, string>; timeoutMs: number; externalEffectsAccounting?: ExecutionReceipt["externalEffectsAccounting"] };
export async function execute(spec: CommandSpec, ids: { taskId: string; episodeId: string; requestId: string; capsuleDigest: string; unitId: string; recipeId: string; recipeDigest: string; handleId?: string }, store: EvidenceStore, abort?: AbortSignal): Promise<ExecutionReceipt> {
  if (!spec.argv.length) throw new Error("empty argv");
  if (abort?.aborted) throw new Error("cancelled_before_spawn");
  const start = new Date(); const mono = performance.now(); let out = Buffer.alloc(0), err = Buffer.alloc(0); let observedOut = 0, observedErr = 0; let timedOut = false, cancelled = false, spawnError: string | null = null;
  const child = spawn(spec.argv[0], spec.argv.slice(1), { cwd: spec.cwd, env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", ...spec.env }, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
  const pid = child.pid ?? null; const cap = store.quotaBytes;
  child.stdout?.on("data", b => { const x = Buffer.from(b); observedOut += x.length; out = Buffer.concat([out, x]).subarray(0, cap); });
  child.stderr?.on("data", b => { const x = Buffer.from(b); observedErr += x.length; err = Buffer.concat([err, x]).subarray(0, cap); });
  const stop = () => { cancelled = !timedOut; if (child.pid) try { process.kill(process.platform === "win32" ? child.pid : -child.pid, "SIGTERM"); setTimeout(() => { try { process.kill(process.platform === "win32" ? child.pid! : -child.pid!, "SIGKILL"); } catch {} }, 250).unref(); } catch {} };
  abort?.addEventListener("abort", stop, { once: true }); const timer = setTimeout(() => { timedOut = true; stop(); }, spec.timeoutMs);
  let streamsClosed = false;
  const closed = new Promise<void>(resolve => child.once("close", () => { streamsClosed = true; resolve(); }));
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(resolve => { child.once("error", e => { spawnError = String(e); resolve({ code: null, signal: null }); }); child.once("exit", (code, signal) => resolve({ code, signal })); });
  // Parent exit is not pipe EOF. Allow late output, then reconcile the owned
  // group, and finally bound pipe draining even for escaped descendants.
  const wait = async (ms: number) => { let timer: NodeJS.Timeout | undefined; await Promise.race([closed, new Promise<void>(r => { timer = setTimeout(r, ms); })]); if (timer) clearTimeout(timer); };
  await wait(300);
  let forcedCleanup = false;
  if (pid && process.platform !== "win32") {
    try { process.kill(-pid, 0); forcedCleanup = true; } catch {}
    try { process.kill(-pid, "SIGTERM"); } catch {}
    await wait(250);
    try { process.kill(-pid, "SIGKILL"); } catch {}
  }
  await wait(300);
  const captureComplete = streamsClosed && !forcedCleanup;
  if (!streamsClosed) { child.stdout?.destroy(); child.stderr?.destroy(); }
  clearTimeout(timer); abort?.removeEventListener("abort", stop);
  const put = async (b: Buffer, observed: number) => { try { return await store.put(b, observed); } catch { return { sha256: sha256(b), storedBytes: 0, observedBytes: observed, complete: false }; } };
  const stdout = await put(out, observedOut), stderr = await put(err, observedErr); const end = new Date();
  stdout.complete &&= captureComplete; stderr.complete &&= captureComplete;
  return {
    schemaVersion: 1, id: newId("exec"), ...ids,
    acceptanceUnitId: ids.unitId, recipeId: ids.recipeId, recipeDigest: ids.recipeDigest,
    argv: [...spec.argv], cwd: spec.cwd,
    publicEnvironment: Object.fromEntries(Object.entries(spec.env ?? {}).map(([k, v]) => [k, ["LANG", "LC_ALL", "TZ"].includes(k) ? v : "[REDACTED]"])),
    environmentHandleId: ids.handleId ?? null,
    startedAt: start.toISOString(), endedAt: end.toISOString(), durationMs: Math.round(performance.now() - mono),
    processIdentity: pid ? { pid, startIdentity: `spawned:${start.toISOString()}`, groupId: process.platform === "win32" ? null : pid } : null,
    spawnError, exitCode: result.code, signal: result.signal, timedOut, cancelled,
    descendantsReaped: null,
    externalEffectsAccounting: !captureComplete || observedOut > out.length || observedErr > err.length ? "incomplete" : (spec.externalEffectsAccounting ?? "complete_for_declared_scope"),
    stdout, stderr,
  };
}
