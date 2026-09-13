import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { CapsuleBackend, TranscriptRecord } from "./backend.js";
import { validateDelegate, validateYield, type DelegateCapsuleArgs, type DelegateCapsuleResult } from "./contracts.js";

type SavedJit = { topic: string; content: string; raw_history: string; updatedAt: string };
type JitFile = { version: 1; entries: SavedJit[] };
export type CapsuleServiceOptions = { projectRoot: string; stateRoot?: string; timeoutMs?: number };

export class CapsuleService {
  private active = false;
  readonly stateRoot: string;
  constructor(private readonly backend: CapsuleBackend, private readonly options: CapsuleServiceOptions) {
    const projectRoot = resolve(options.projectRoot);
    this.stateRoot = resolve(options.stateRoot ?? join(projectRoot, ".pi", "capsule"));
    const stateRelative = relative(projectRoot, this.stateRoot);
    if (stateRelative === ".." || stateRelative.startsWith(`..${sep}`) || isAbsolute(stateRelative)) {
      throw Error("configuration_required: Capsule state must be scoped inside the current project");
    }
  }
  private async loadJit(): Promise<SavedJit[]> {
    try { const value = JSON.parse(await readFile(join(this.stateRoot, "jit.json"), "utf8")) as JitFile; return value.version === 1 && Array.isArray(value.entries) ? value.entries : []; }
    catch (e: any) { if (e.code === "ENOENT") return []; throw e; }
  }
  private async retain(records: TranscriptRecord[]): Promise<string> {
    const dir = join(this.stateRoot, "episodes");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.jsonl`);
    const temporary = `${target}.tmp`;
    const body = records.map(record => JSON.stringify(record)).join("\n") + "\n";
    const handle = await open(temporary, "wx", 0o600);
    try { await handle.writeFile(body, "utf8"); await handle.sync(); } finally { await handle.close(); }
    await rename(temporary, target);
    await access(target, constants.R_OK);
    if (!isAbsolute(target)) throw Error("transcript retention produced a non-absolute path");
    return target;
  }
  private async publish(entries: SavedJit[]) {
    await mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    const target = join(this.stateRoot, "jit.json"), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, entries } satisfies JitFile, null, 2), { mode: 0o600 });
    try { await rename(temporary, target); } catch (e) { await rm(temporary, { force: true }); throw e; }
  }
  async delegate(args: unknown, signal?: AbortSignal): Promise<DelegateCapsuleResult> {
    validateDelegate(args);
    if (this.active) return { status: "error", report: "Only one Capsule delegation may be active at a time.", raw_history: null };
    this.active = true;
    let transcript: string | null = null;
    try {
      const old = await this.loadJit();
      const selected = [...old].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
      const outcome = await this.backend.run({ capsule: (args as DelegateCapsuleArgs).capsule, jit: selected, signal, timeoutMs: this.options.timeoutMs ?? 10 * 60_000 });
      try { transcript = await this.retain(outcome.records); }
      catch (error) { return { status: "error", report: `Transcript retention failed; JIT updates were not published: ${String(error)}`, raw_history: null }; }
      if (outcome.kind !== "settled" || !outcome.yield) return { status: outcome.kind === "settled" ? "error" : outcome.kind, report: outcome.report ?? "Worker ended without a publishable handoff.", raw_history: transcript };
      try { validateYield(outcome.yield); }
      catch (error) { return { status: "error", report: `Worker returned a malformed yield; JIT updates were not published: ${String(error)}`, raw_history: transcript }; }
      const replacements = new Map(old.map(x => [x.topic, x]));
      for (const entry of outcome.yield.JITed_history) replacements.set(entry.topic, { ...entry, raw_history: transcript, updatedAt: new Date().toISOString() });
      try { await this.publish([...replacements.values()]); }
      catch (error) { return { status: "error", report: `JIT publication failed after transcript retention: ${String(error)}`, raw_history: transcript }; }
      return { status: "yielded", reply: outcome.yield, raw_history: transcript };
    } catch (error) {
      return { status: signal?.aborted ? "cancelled" : "error", report: `Delegation failed: ${String(error)}`, raw_history: transcript };
    } finally { this.active = false; }
  }
}
