import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import type { TranscriptRecord } from "./worker.js";
import { GUARDED_PROJECT_FILES, type ContextObservation } from "./jit.js";

export type SavedJit = { topic: string; content: string; raw_history: string; updatedAt: string; context?: ContextObservation };
type JitFileV2 = { version: 2; entries: Array<Omit<SavedJit, "context"> & { context: ContextObservation | null }> };

function invalid(detail: string): Error { return Error(`invalid_jit_store: ${detail}`); }
function validContext(value: unknown): value is ContextObservation {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const x = value as Record<string, unknown>;
  return typeof x.fingerprint === "string" && /^[a-f0-9]{64}$/.test(x.fingerprint)
    && typeof x.projectIdentity === "string" && isAbsolute(x.projectIdentity)
    && typeof x.platform === "string" && x.platform.length > 0
    && Array.isArray(x.guardedFiles) && x.guardedFiles.length === GUARDED_PROJECT_FILES.length
    && x.guardedFiles.every((name, index) => name === GUARDED_PROJECT_FILES[index])
    && typeof x.observedAt === "string" && !Number.isNaN(Date.parse(x.observedAt));
}
function parseEntry(value: unknown, version: 1 | 2): SavedJit {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("malformed entry");
  const x = value as Record<string, unknown>;
  if (typeof x.topic !== "string" || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(x.topic)
    || typeof x.content !== "string" || !/\S/.test(x.content) || x.content.length > 4_000
    || typeof x.raw_history !== "string" || !isAbsolute(x.raw_history)
    || typeof x.updatedAt !== "string" || Number.isNaN(Date.parse(x.updatedAt))) throw invalid("malformed entry fields");
  if (version === 2 && x.context !== null && !validContext(x.context)) throw invalid("malformed context metadata");
  return { topic: x.topic, content: x.content, raw_history: x.raw_history, updatedAt: x.updatedAt,
    ...(version === 2 && x.context !== null ? { context: x.context as ContextObservation } : {}) };
}

/** Persistent transcripts and JIT; lifecycle and deadlines belong to CapsuleService. */
export class CapsuleStorage {
  readonly stateRoot: string;

  constructor(project: string, stateRoot?: string) {
    const projectRoot = resolve(project);
    const configuredStateRoot = stateRoot || undefined;
    if (configuredStateRoot && !isAbsolute(configuredStateRoot)) {
      throw Error("configuration_required: Capsule state path must be absolute");
    }
    this.stateRoot = resolve(configuredStateRoot ?? join(projectRoot, ".pi", "capsule"));
  }

  async loadJit(): Promise<SavedJit[]> {
    try {
      const value: unknown = JSON.parse(await readFile(join(this.stateRoot, "jit.json"), "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) throw invalid("root must be an object");
      const file = value as Record<string, unknown>;
      if (file.version !== 1 && file.version !== 2) throw invalid(`unsupported version ${String(file.version)}`);
      if (!Array.isArray(file.entries)) throw invalid("entries must be an array");
      const entries = file.entries.map(entry => parseEntry(entry, file.version as 1 | 2));
      if (new Set(entries.map(entry => entry.topic)).size !== entries.length) throw invalid("duplicate topics");
      return entries;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }

  async retain(records: TranscriptRecord[]): Promise<string> {
    const dir = join(this.stateRoot, "episodes");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}.jsonl`);
    const temporary = `${target}.tmp`;
    const body = records.map(record => JSON.stringify(record)).join("\n") + "\n";
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(body, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
    await access(target, constants.R_OK);
    return target;
  }

  async retainNotes(notes: string): Promise<string> {
    const dir = join(this.stateRoot, "episodes");
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const target = join(dir, `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomUUID()}-notes.md`);
    await writeFile(target, notes, { encoding: "utf8", mode: 0o600, flag: "wx" });
    await access(target, constants.R_OK);
    return target;
  }

  async publish(entries: SavedJit[], signal: AbortSignal): Promise<void> {
    await mkdir(this.stateRoot, { recursive: true, mode: 0o700 });
    const target = join(this.stateRoot, "jit.json"), temporary = `${target}.${randomUUID()}.tmp`;
    try {
      const file: JitFileV2 = { version: 2, entries: entries.map(entry => ({ ...entry, context: entry.context ?? null })) };
      await writeFile(temporary, JSON.stringify(file, null, 2), { mode: 0o600, signal });
      signal.throwIfAborted();
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
