import { access, mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { randomUUID } from "node:crypto";
import type { TranscriptRecord } from "./worker.js";

type SavedJit = { topic: string; content: string; raw_history: string; updatedAt: string };
type JitFile = { version: 1; entries: SavedJit[] };

/** Project-local persistence; lifecycle and deadlines belong to CapsuleService. */
export class CapsuleStorage {
  readonly stateRoot: string;

  constructor(project: string, stateRoot?: string) {
    const projectRoot = resolve(project);
    this.stateRoot = resolve(stateRoot ?? join(projectRoot, ".pi", "capsule"));
    const stateRelative = relative(projectRoot, this.stateRoot);
    if (stateRelative === ".." || stateRelative.startsWith(`..${sep}`) || isAbsolute(stateRelative)) {
      throw Error("configuration_required: Capsule state must be scoped inside the current project");
    }
  }

  async loadJit(): Promise<SavedJit[]> {
    try {
      const value = JSON.parse(await readFile(join(this.stateRoot, "jit.json"), "utf8")) as JitFile;
      return value.version === 1 && Array.isArray(value.entries) ? value.entries : [];
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
      await writeFile(temporary, JSON.stringify({ version: 1, entries } satisfies JitFile, null, 2), { mode: 0o600, signal });
      signal.throwIfAborted();
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}
