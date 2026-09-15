import { mkdtemp, readFile, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { observeProjectContext, type ContextObservation } from "../src/capsule/jit.js";
import { CapsuleService } from "../src/capsule/service.js";
import { CapsuleStorage, type SavedJit } from "../src/capsule/storage.js";
import type { CapsuleBackend } from "../src/capsule/worker.js";
type BackendInput = Parameters<CapsuleBackend["run"]>[0];

function context(fingerprint = "a".repeat(64)): ContextObservation {
  return { fingerprint, projectIdentity: "/project", platform: process.platform,
    guardedFiles: ["package.json"], observedAt: "2026-09-14T00:00:00.000Z" };
}
function entry(topic: string, content: string, age: number, ctx = context()): SavedJit {
  return { topic, content, raw_history: `/history/${topic}`, updatedAt: new Date(age).toISOString(), context: ctx };
}

describe("guarded freshness", () => {
  it("observes changed, added, and deleted guards while ignoring unguarded source edits", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-guards-"));
    const first = await observeProjectContext(project); expect(first).toBeDefined();
    await writeFile(join(project, "source.ts"), "one");
    expect((await observeProjectContext(project))?.fingerprint).toBe(first?.fingerprint);
    await writeFile(join(project, "package-lock.json"), "lock-one");
    const added = await observeProjectContext(project); expect(added?.fingerprint).not.toBe(first?.fingerprint);
    await writeFile(join(project, "package-lock.json"), "lock-two");
    expect((await observeProjectContext(project))?.fingerprint).not.toBe(added?.fingerprint);
    await unlink(join(project, "package-lock.json"));
    expect((await observeProjectContext(project))?.fingerprint).toBe(first?.fingerprint);
  });

  it("treats an oversized guarded read as unknown", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-unknown-"));
    await writeFile(join(project, "package.json"), "x".repeat(1_000_001));
    expect(await observeProjectContext(project)).toBeUndefined();
  });

  it("offers every fresh lesson regardless of capsule text and excludes stale or legacy lessons", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-service-"));
    await writeFile(join(project, "package-lock.json"), "one");
    const observed = (await observeProjectContext(project))!;
    const storage = new CapsuleStorage(project);
    await storage.publish([
      entry("npm-current", "npm procedure verify lock", 2, observed),
      entry("plot-current", "render chart axis", 3, observed),
      { ...entry("npm-legacy", "npm legacy procedure", 1), context: undefined },
    ], new AbortController().signal);
    const seen: BackendInput[] = [];
    const backend: CapsuleBackend = { async run(input) { seen.push(input); return { kind: "settled", hooksRan: true, records: [],
      yield: { reason: "completed", result: true, JITed_history: [] } }; } };
    const service = new CapsuleService(backend, { projectRoot: project });
    await service.delegate({ capsule: "execute npm procedure", output_example: "legacy npm output must not retrieve" });
    expect(seen[0]!.jit.map(x => x.topic)).toEqual(["npm-current", "plot-current"]);
    await service.delegate({ capsule: "deploy unrelated service", output_example: "npm procedure" });
    expect(seen[1]!.jit.map(x => x.topic)).toEqual(["npm-current", "plot-current"]);
    await writeFile(join(project, "package-lock.json"), "two");
    await service.delegate({ capsule: "execute npm procedure", output_example: "x" });
    expect(seen[2]!.jit).toEqual([]);
  });

  it("does not publish a new lesson when guarded context changes during the episode", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-mid-"));
    const lock = join(project, "package-lock.json"); await writeFile(lock, "before");
    const storage = new CapsuleStorage(project);
    const prior = entry("prior", "npm prior procedure", 1, (await observeProjectContext(project))!);
    await storage.publish([prior], new AbortController().signal);
    const backend: CapsuleBackend = { async run() { await writeFile(lock, "after"); return { kind: "settled", hooksRan: true, records: [],
      yield: { reason: "blocked", notes: "Pending decision stays in this episode.", JITed_history: [{ topic: "new", content: "npm new procedure" }] } }; } };
    const result = await new CapsuleService(backend, { projectRoot: project }).delegate({ capsule: "npm task", output_example: "x" });
    expect(result).toMatchObject({ status: "blocked", notes: "Pending decision stays in this episode." });
    expect(await storage.loadJit()).toEqual([prior]);
    expect(await readFile((result as any).raw_history, "utf8")).toBe("\n");
  });

  it("keeps blocked episode state out of the next self-contained request while carrying a relevant procedure", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-single-pass-"));
    const seen: BackendInput[] = [];
    const backend: CapsuleBackend = { async run(input) {
      seen.push(input);
      return seen.length === 1
        ? { kind: "settled", hooksRan: true, records: [{ type: "message", marker: "OLD_TRANSCRIPT" }], yield: {
          reason: "blocked", notes: "PENDING_STEP_4 needs a parent decision.",
          JITed_history: [{ topic: "npm-procedure", content: "Use when: npm suite. Do: focused command. Verify: exit. Recheck when: lock changes." }],
        } }
        : { kind: "settled", hooksRan: true, records: [], yield: { reason: "completed", result: true, JITed_history: [] } };
    } };
    const service = new CapsuleService(backend, { projectRoot: project });
    const blocked = await service.delegate({ capsule: "inspect npm suite", output_example: "OLD_EXAMPLE" });
    expect(blocked).toMatchObject({ status: "blocked", notes: "PENDING_STEP_4 needs a parent decision." });
    await service.delegate({ capsule: "independently run npm suite", output_example: "NEW_EXAMPLE" });
    expect(seen[1]!.jit.map(x => x.topic)).toEqual(["npm-procedure"]);
    expect(JSON.stringify(seen[1])).not.toMatch(/PENDING_STEP_4|OLD_TRANSCRIPT|OLD_EXAMPLE|inspect npm suite/);
  });
});
