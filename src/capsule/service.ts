import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { CapsuleBackend, TranscriptRecord } from "./backend.js";
import { MAX_TIMER_MS, validateDelegate, validateYield, type DelegateCapsuleArgs, type DelegateCapsuleResult } from "./contracts.js";

type SavedJit = { topic: string; content: string; raw_history: string; updatedAt: string };
type JitFile = { version: 1; entries: SavedJit[] };
export type CapsuleServiceOptions = { projectRoot: string; stateRoot?: string; timeoutMs?: number; cleanupMs?: number };

type InternalResult = { value?: DelegateCapsuleResult; cleanupConfirmed: boolean };
const DEFAULT_TIMEOUT_MS = 300_000;
const DEFAULT_CLEANUP_MS = 5_000;

export class CapsuleService {
  private activeOwner: symbol | undefined;
  readonly stateRoot: string;
  constructor(private readonly backend: CapsuleBackend, private readonly options: CapsuleServiceOptions) {
    const projectRoot = resolve(options.projectRoot);
    this.stateRoot = resolve(options.stateRoot ?? join(projectRoot, ".pi", "capsule"));
    const stateRelative = relative(projectRoot, this.stateRoot);
    if (stateRelative === ".." || stateRelative.startsWith(`..${sep}`) || isAbsolute(stateRelative)) {
      throw Error("configuration_required: Capsule state must be scoped inside the current project");
    }
    const configured = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isSafeInteger(configured) || configured <= 0 || configured > MAX_TIMER_MS)
      throw Error("configuration_required: Capsule timeout must be a representable positive integer");
    if (!Number.isSafeInteger(options.cleanupMs ?? DEFAULT_CLEANUP_MS) || (options.cleanupMs ?? DEFAULT_CLEANUP_MS) <= 0)
      throw Error("configuration_required: Capsule cleanup allowance must be a positive integer");
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
  private async retainNotes(notes: string): Promise<string> {
    const dir = join(this.stateRoot, "episodes");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-notes.md`);
    await writeFile(target, notes, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await access(target, constants.R_OK);
    if (!isAbsolute(target)) throw Error("notes retention produced a non-absolute path");
    return target;
  }
  private async publish(entries: SavedJit[], signal: AbortSignal) {
    await mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    const target = join(this.stateRoot, "jit.json"), temporary = `${target}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify({ version: 1, entries } satisfies JitFile, null, 2), { mode: 0o600, signal });
    if (signal.aborted) { await rm(temporary, { force: true }); throw Object.assign(Error("JIT publication interrupted"), { name: "AbortError" }); }
    try { await rename(temporary, target); } catch (e) { await rm(temporary, { force: true }); throw e; }
  }
  private async execute(args: DelegateCapsuleArgs, signal: AbortSignal, state: { transcript?: string }): Promise<InternalResult> {
    let cleanupConfirmed = true;
    try {
      const old = await this.loadJit();
      if (signal.aborted) return { cleanupConfirmed };
      const selected = [...old].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
      const outcome = await this.backend.run({ capsule: args.capsule, outputExample: args.output_example, jit: selected,
        signal, cleanupMs: this.options.cleanupMs ?? DEFAULT_CLEANUP_MS });
      cleanupConfirmed = outcome.cleanupConfirmed !== false;
      // Retain observations during bounded cleanup too, but never publish a late handoff/JIT.
      try { state.transcript = await this.retain(outcome.records); }
      catch (error) {
        return { cleanupConfirmed, value: { status: "error", notes: `Transcript retention failed. No result or new JIT was published, and Astra must resolve storage before retrying: ${String(error)}` } };
      }
      if (signal.aborted) return { cleanupConfirmed };
      if (outcome.kind !== "settled" || !outcome.yield) {
        return { cleanupConfirmed, value: { status: "error",
          notes: `${outcome.notes ?? "The worker ended without a publishable handoff."} No complete result was established; inspect the retained history, correct the runtime cause, and retry or revise the capsule.`,
          raw_history: state.transcript } };
      }
      try { validateYield(outcome.yield); }
      catch (error) { return { cleanupConfirmed, value: { status: "error", notes: `Worker returned a malformed handoff. No result or JIT was published; Luna must retry with the fixed yield envelope: ${String(error)}`, raw_history: state.transcript } }; }

      let notesPath: string | undefined;
      if (outcome.yield.reason === "completed" && outcome.yield.notes) {
        try { notesPath = await this.retainNotes(outcome.yield.notes); }
        catch (error) { return { cleanupConfirmed, value: { status: "error", notes: `Supplementary-note retention failed. Completion and new JIT were withheld; fix storage and retry: ${String(error)}`, raw_history: state.transcript } }; }
      }
      if (signal.aborted) return { cleanupConfirmed };
      if (outcome.yield.JITed_history.length) {
        const replacements = new Map(old.map(x => [x.topic, x]));
        for (const entry of outcome.yield.JITed_history)
          replacements.set(entry.topic, { ...entry, raw_history: state.transcript, updatedAt: new Date().toISOString() });
        try { await this.publish([...replacements.values()], signal); }
        catch (error) { return { cleanupConfirmed, value: { status: "error", notes: `JIT publication failed after transcript retention. Prior knowledge remains authoritative; fix storage before retrying: ${String(error)}`, raw_history: state.transcript } }; }
      }
      if (signal.aborted) return { cleanupConfirmed };
      if (outcome.yield.reason === "blocked") return { cleanupConfirmed,
        value: { status: "blocked", notes: outcome.yield.notes, raw_history: state.transcript } };
      const value: DelegateCapsuleResult = { status: "completed", result: outcome.yield.result, raw_history: state.transcript };
      if (notesPath) value.notes_path = notesPath;
      return { cleanupConfirmed, value };
    } catch (error) {
      if (signal.aborted) return { cleanupConfirmed };
      const value: DelegateCapsuleResult = { status: "error", notes: `Delegation failed before a result was established. Inspect available history, correct the runtime cause, and retry: ${String(error)}` };
      if (state.transcript) value.raw_history = state.transcript;
      return { cleanupConfirmed, value };
    }
  }

  async delegate(args: unknown, externalSignal?: AbortSignal): Promise<DelegateCapsuleResult> {
    validateDelegate(args);
    if (this.activeOwner) return { status: "error", notes: "A prior Capsule delegation still owns this workspace. Its cleanup is not confirmed; wait for termination or restart the runtime before delegating again." };
    const typed = args as DelegateCapsuleArgs;
    const timeoutMs = typed.timeout_s === undefined ? (this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS) : typed.timeout_s * 1000;
    const cleanupMs = this.options.cleanupMs ?? DEFAULT_CLEANUP_MS;
    const owner = Symbol("capsule-owner");
    this.activeOwner = owner;
    const controller = new AbortController();
    const state: { transcript?: string } = {};
    let interrupted = externalSignal?.aborted ?? false;
    let resolveExternal!: (kind: "interrupted") => void;
    const external = new Promise<"interrupted">(resolve => { resolveExternal = resolve; });
    const onExternalAbort = () => { interrupted = true; controller.abort(); resolveExternal("interrupted"); };
    externalSignal?.addEventListener("abort", onExternalAbort, { once: true });
    if (interrupted) onExternalAbort();
    let workingTimer: NodeJS.Timeout | undefined;
    let cleanupTimer: NodeJS.Timeout | undefined;
    const deadline = new Promise<"timeout">(resolve => { workingTimer = setTimeout(() => { controller.abort(); resolve("timeout"); }, timeoutMs); });
    const work = this.execute(typed, controller.signal, state);
    const release = () => { if (this.activeOwner === owner) this.activeOwner = undefined; };
    try {
      const winner = await Promise.race([work.then(value => ({ kind: "work" as const, value })), deadline.then(kind => ({ kind })), external.then(kind => ({ kind }))]);
      if (winner.kind === "work") {
        if (winner.value.cleanupConfirmed) release();
        if (interrupted) throw Object.assign(Error("Capsule delegation interrupted by user"), { name: "AbortError" });
        return winner.value.value ?? { status: "error", notes: "The worker stopped without a result. No answer was established; inspect runtime health and retry." };
      }
      controller.abort();
      let settled: InternalResult | undefined;
      await Promise.race([work.then(value => { settled = value; }), new Promise<void>(resolve => { cleanupTimer = setTimeout(resolve, cleanupMs); })]);
      const confirmed = settled?.cleanupConfirmed === true;
      if (settled && confirmed) release();
      else void work.then(value => { if (value.cleanupConfirmed) release(); }, () => {});
      if (winner.kind === "interrupted") throw Object.assign(Error("Capsule delegation interrupted by user"), { name: "AbortError" });
      const seconds = timeoutMs / 1000;
      const value: DelegateCapsuleResult = { status: "timeout", notes: `The ${seconds}-second deadline expired before a complete result was ready. No task answer or new JIT was published. ${confirmed ? "Owned worker cleanup completed; Astra may inspect the partial history and retry or revise the capsule." : `Termination or storage cleanup was not confirmed within the ${cleanupMs / 1000}-second allowance; do not overlap another delegation in this workspace, and restart or verify the runtime before retrying.`}` };
      if (state.transcript) value.raw_history = state.transcript;
      return value;
    } finally {
      if (workingTimer) clearTimeout(workingTimer);
      if (cleanupTimer) clearTimeout(cleanupTimer);
      externalSignal?.removeEventListener("abort", onExternalAbort);
    }
  }
}
