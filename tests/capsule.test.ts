import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import capsuleExtension from "../src/extension/index.js";
import { validateDelegate, validateYield, type YieldArgs } from "../src/capsule/contracts.js";
import { CapsuleService } from "../src/capsule/service.js";
import { createWorkerExtension, type BackendOutcome, type CapsuleBackend } from "../src/capsule/backend.js";

const lesson = "Applies while lock-v1 is current. Run the focused check; guard against changing the lock. Verify the decisive assertion.";
const handoff: YieldArgs = { reason: "completed", report: "The requested check ran and genuinely failed; investigation gate reached.", JITed_history: [{ topic: "project-tests", content: lesson }] };

class RecordingBackend implements CapsuleBackend {
  inputs: Parameters<CapsuleBackend["run"]>[0][] = [];
  constructor(private readonly outcomes: BackendOutcome[]) {}
  async run(input: Parameters<CapsuleBackend["run"]>[0]) {
    this.inputs.push(structuredClone({ ...input, signal: undefined }));
    return structuredClone(this.outcomes.shift()!);
  }
}
function root() { return mkdtempSync(join(tmpdir(), "capsule-context-")); }
function settled(marker: string, packet = handoff): BackendOutcome {
  return { kind: "settled", yield: packet, hooksRan: true, records: [
    { type: "message", message: { role: "user", content: "capsule delivered once" } },
    { type: "tool_start", toolName: "read_probe", args: {} },
    { type: "tool_end", toolName: "read_probe", result: `observation ${marker}` },
    { type: "tool_start", toolName: "dependent_action", args: { selectedBecause: marker } },
    { type: "tool_end", toolName: "yield", result: { recorded: true } },
    { type: "agent_settled" },
  ] };
}

describe("context-first Capsule contracts", () => {
  it("accepts exact valid inputs including completed failing checks", () => {
    expect(() => validateDelegate({ capsule: "Run it" })).not.toThrow();
    expect(() => validateYield(handoff)).not.toThrow();
    expect(() => validateYield({ ...handoff, JITed_history: [] })).not.toThrow();
  });
  it("rejects unknown, blank, oversized, malformed and duplicate inputs", () => {
    for (const value of [{ capsule: " " }, { capsule: "x", extra: true }, { capsule: "x".repeat(32001) }, {}, null]) expect(() => validateDelegate(value)).toThrow(/invalid_contract/);
    for (const value of [
      { ...handoff, extra: true }, { ...handoff, report: "\n " }, { ...handoff, report: "x".repeat(12001) },
      { ...handoff, reason: "done" }, { ...handoff, JITed_history: [{ topic: "Bad/path", content: "x" }] },
      { ...handoff, JITed_history: [{ topic: "a", content: " " }] },
      { ...handoff, JITed_history: [{ topic: "a", content: "x" }, { topic: "a", content: "y" }] },
      { ...handoff, JITed_history: Array.from({ length: 9 }, (_, i) => ({ topic: `t${i}`, content: "x" })) },
    ]) expect(() => validateYield(value)).toThrow(/invalid_contract/);
  });
});

describe("context-first Capsule lifecycle", () => {
  it("requires custom plugin state to remain project-scoped", () => {
    const project = root(), backend = new RecordingBackend([]);
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "state") })).not.toThrow();
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "..", "outside") })).toThrow(/scoped inside/);
  });

  it("runs an adaptive episode and returns only a readable path and compact handoff", async () => {
    const marker = "RAW_ONLY_DIAGNOSTIC_7719", project = root(), backend = new RecordingBackend([settled(marker)]);
    const service = new CapsuleService(backend, { projectRoot: project });
    const result = await service.delegate({ capsule: "CAPSULE_A_ONLY investigate then adapt" });
    expect(result.status).toBe("yielded");
    if (result.status !== "yielded") throw Error("expected yield");
    expect(backend.inputs).toHaveLength(1);
    expect(backend.inputs[0].capsule).toContain("CAPSULE_A_ONLY");
    expect(result.raw_history).not.toContain(marker);
    expect(isAbsolute(result.raw_history)).toBe(true);
    await access(result.raw_history, constants.R_OK);
    expect(await readFile(result.raw_history, "utf8")).toContain(marker);
    expect(JSON.stringify(result)).not.toContain(marker);
    const search = execFileSync("rg", ["-n", "-F", "-C", "1", "--", marker, result.raw_history], { encoding: "utf8" });
    expect(search).toContain("dependent_action");
    expect(backend.inputs).toHaveLength(1); // troubleshooting was caller-driven, never automatic
  });

  it("reclaims the first capsule/transcript and reuses guarded JIT in episode two", async () => {
    const project = root(), oldNoise = "OLD_TRANSCRIPT_NOISE_88";
    const second = { ...handoff, JITed_history: [] };
    const backend = new RecordingBackend([settled(oldNoise), settled("SECOND_MARKER", second)]);
    const service = new CapsuleService(backend, { projectRoot: project });
    const first = await service.delegate({ capsule: "CAPSULE_A_DISTINCT_42" });
    const secondResult = await service.delegate({ capsule: "CAPSULE_B_DISTINCT_43" });
    expect(first.status).toBe("yielded"); expect(secondResult.status).toBe("yielded");
    expect(backend.inputs[0].jit).toEqual([]);
    expect(backend.inputs[1].capsule).toContain("CAPSULE_B_DISTINCT_43");
    expect(JSON.stringify(backend.inputs[1])).not.toContain("CAPSULE_A_DISTINCT_42");
    expect(JSON.stringify(backend.inputs[1])).not.toContain(oldNoise);
    expect(backend.inputs[1].jit[0].content).toContain("Applies while lock-v1");
    expect(backend.inputs[1].jit[0].content).toContain("Verify the decisive assertion");
    if (first.status === "yielded") expect(await readFile(first.raw_history, "utf8")).toContain(oldNoise);
  });

  it.each([
    ["mixed yield/work", { kind: "error", report: "Worker yield was mixed with work", records: [{ type: "mixed" }], hooksRan: true }],
    ["missing yield", { kind: "error", report: "Worker settled without yield", records: [{ type: "settled" }], hooksRan: true }],
    ["cancel", { kind: "cancelled", report: "cancelled", records: [{ type: "partial", value: "kept" }], hooksRan: true }],
    ["timeout", { kind: "timeout", report: "timed out", records: [{ type: "partial", value: "kept" }], hooksRan: true }],
  ] as const)("preserves honest %s outcomes without publishing JIT", async (_name, outcome) => {
    const project = root(), backend = new RecordingBackend([outcome as unknown as BackendOutcome]);
    const result = await new CapsuleService(backend, { projectRoot: project }).delegate({ capsule: "work" });
    expect(result.status).not.toBe("yielded"); expect(result.raw_history).not.toBeNull();
    await expect(readFile(join(project, ".pi", "capsule", "jit.json"), "utf8")).rejects.toThrow();
  });

  it("rejects malformed backend yield and does not publish it", async () => {
    const backend = new RecordingBackend([settled("bad", { ...handoff, JITed_history: [{ topic: "dup", content: "x" }, { topic: "dup", content: "y" }] } as YieldArgs)]);
    const project = root(), result = await new CapsuleService(backend, { projectRoot: project }).delegate({ capsule: "work" });
    expect(result.status).toBe("error");
    await expect(readFile(join(project, ".pi", "capsule", "jit.json"), "utf8")).rejects.toThrow();
  });

  it("makes archive-write failure an error and retains prior JIT", async () => {
    const project = root(), state = join(project, "state"), backend = new RecordingBackend([settled("first"), settled("second")]);
    const service = new CapsuleService(backend, { projectRoot: project, stateRoot: state });
    expect((await service.delegate({ capsule: "first" })).status).toBe("yielded");
    const before = await readFile(join(state, "jit.json"), "utf8");
    const broken = join(state, "broken");
    await mkdir(broken);
    await writeFile(join(broken, "jit.json"), before);
    await writeFile(join(broken, "episodes"), "not a directory");
    const result = await new CapsuleService(new RecordingBackend([settled("unretained")]), { projectRoot: project, stateRoot: broken }).delegate({ capsule: "second" });
    expect(result.status).toBe("error"); expect(result.raw_history).toBeNull();
    expect(await readFile(join(state, "jit.json"), "utf8")).toBe(before);
  });
});

describe("parent/child tool separation", () => {
  it("registers only delegate_capsule in Astra and returns model-visible content once", () => {
    const tools: any[] = [], fakePi = { registerTool: (tool: any) => tools.push(tool) };
    capsuleExtension(fakePi as any);
    expect(tools.map(x => x.name)).toEqual(["delegate_capsule"]);
    expect(tools[0].parameters).toBeTruthy();
    // PiSdkBackend's worker-local extension is the only registration site for yield;
    // its terminating result is consumed there and is never returned as parent terminate.
  });
  it("loads the JIT hook and sole terminating yield interface in Luna", async () => {
    const tools: any[] = [], hooks = new Map<string, any>(), state = { hooksRan: false, duplicate: false };
    const extension = createWorkerExtension({ jit: [{ topic: "project-tests", content: lesson, raw_history: "/project/episode.jsonl" }] }, state);
    await (extension as any)({ registerTool: (tool: any) => tools.push(tool), on: (name: string, handler: any) => hooks.set(name, handler) });
    expect(tools.map(x => x.name)).toEqual(["yield"]);
    expect(hooks.has("before_agent_start")).toBe(true);
    const injected = await hooks.get("before_agent_start")({ systemPrompt: "base" });
    expect(state.hooksRan).toBe(true);
    expect(injected.systemPrompt).toContain(lesson);
    expect(injected.systemPrompt).toContain("/project/episode.jsonl");
    const result = await tools[0].execute("yield-1", handoff);
    expect(result.terminate).toBe(true);
    await expect(tools[0].execute("yield-2", handoff)).rejects.toThrow(/duplicate/);
  });
});
