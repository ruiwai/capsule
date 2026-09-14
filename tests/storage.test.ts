import * as fs from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CapsuleStorage } from "../src/capsule/storage.js";

vi.mock("node:fs/promises", async importOriginal => {
  const actual = await importOriginal<typeof fs>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

describe("Capsule storage", () => {
  let project: string;
  let storage: CapsuleStorage;
  const entries = [{ topic: "tests", content: "Run npm test", raw_history: "/retained/history", updatedAt: "2026-09-14" }];

  beforeEach(async () => {
    project = await fs.mkdtemp(join(tmpdir(), "capsule-storage-"));
    storage = new CapsuleStorage(project);
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(project, { recursive: true, force: true });
  });

  it("accepts absolute user-level paths and rejects relative overrides", () => {
    expect(() => new CapsuleStorage(project, `${project}-outside`)).not.toThrow();
    expect(() => new CapsuleStorage(project, "relative/state")).toThrow(/must be absolute/);
    expect(new CapsuleStorage(project, "").stateRoot).toBe(join(project, ".pi", "capsule"));
  });

  it("loads missing knowledge as empty and round-trips published lessons", async () => {
    expect(await storage.loadJit()).toEqual([]);
    await storage.publish(entries, new AbortController().signal);
    expect(await storage.loadJit()).toEqual(entries);
    expect(await fs.readdir(storage.stateRoot)).toEqual(["jit.json"]);
  });

  it("does not hide corrupt knowledge as an empty history", async () => {
    await fs.mkdir(storage.stateRoot, { recursive: true });
    await fs.writeFile(join(storage.stateRoot, "jit.json"), "not JSON");
    await expect(storage.loadJit()).rejects.toThrow(SyntaxError);
  });

  it("rejects unsupported versions and malformed entries instead of making them overwriteable emptiness", async () => {
    await fs.mkdir(storage.stateRoot, { recursive: true });
    for (const value of [
      { version: 99, entries: [] },
      { version: 1, entries: [{ topic: "../instruction", content: 7, raw_history: "relative", updatedAt: "today" }] },
      { version: 2, entries: [{ ...entries[0], context: { fingerprint: "wrong" } }] },
    ]) {
      await fs.writeFile(join(storage.stateRoot, "jit.json"), JSON.stringify(value));
      await expect(storage.loadJit()).rejects.toThrow(/invalid_jit_store/);
    }
  });

  it("loads v1 non-destructively as unknown freshness and preserves it during v2 migration", async () => {
    await fs.mkdir(storage.stateRoot, { recursive: true });
    await fs.writeFile(join(storage.stateRoot, "jit.json"), JSON.stringify({ version: 1, entries }));
    const legacy = await storage.loadJit();
    expect(legacy).toEqual(entries);
    expect(legacy[0]).not.toHaveProperty("context");
    await storage.publish(legacy, new AbortController().signal);
    expect(JSON.parse(await fs.readFile(join(storage.stateRoot, "jit.json"), "utf8"))).toMatchObject({
      version: 2, entries: [{ ...entries[0], context: null }],
    });
    expect(await storage.loadJit()).toEqual(entries);
  });

  it("retains unique absolute transcripts and notes with private permissions", async () => {
    const records = [{ type: "message", text: "line one\nline two" }];
    const first = await storage.retain(records);
    const second = await storage.retain(records);
    const notes = await storage.retainNotes("supplement");
    expect(first).not.toBe(second);
    expect((await fs.readFile(first, "utf8")).trim().split("\n").map(line => JSON.parse(line))).toEqual(records);
    expect(await fs.readFile(notes, "utf8")).toBe("supplement");
    for (const path of [first, second, notes]) {
      expect(isAbsolute(path)).toBe(true);
      expect((await fs.stat(path)).mode & 0o777).toBe(0o600);
    }
    expect((await fs.readdir(join(storage.stateRoot, "episodes"))).some(file => file.endsWith(".tmp"))).toBe(false);
  });

  it("preserves prior knowledge and removes partial temporary writes on failure", async () => {
    await storage.publish(entries, new AbortController().signal);
    const { writeFile } = await vi.importActual<typeof fs>("node:fs/promises");
    vi.mocked(fs.writeFile).mockImplementationOnce(async (...args) => {
      await writeFile(...args);
      throw Error("simulated partial-write failure");
    });
    await expect(storage.publish([], new AbortController().signal)).rejects.toThrow(/partial-write/);
    expect(await storage.loadJit()).toEqual(entries);
    expect(await fs.readdir(storage.stateRoot)).toEqual(["jit.json"]);
  });

  it("does not replace prior knowledge when publication is aborted", async () => {
    await storage.publish(entries, new AbortController().signal);
    await expect(storage.publish([], AbortSignal.abort())).rejects.toMatchObject({ name: "AbortError" });
    expect(await storage.loadJit()).toEqual(entries);
    expect(await fs.readdir(storage.stateRoot)).toEqual(["jit.json"]);
  });
});
