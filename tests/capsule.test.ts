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
import { DEFAULT_LUNA_MODEL, createWorkerExtension, resolveConfiguredModel, type BackendOutcome, type CapsuleBackend } from "../src/capsule/backend.js";

const lesson = "Applies while lock-v1 is current. Run the focused check; guard against changing the lock. Verify the decisive assertion.";
const handoff: YieldArgs = { reason: "completed", result: { ok: false }, notes: "SUPPLEMENT_ONLY_991",
  JITed_history: [{ topic: "project-tests", content: lesson }] };
type BackendInput = Parameters<CapsuleBackend["run"]>[0];

class RecordingBackend implements CapsuleBackend {
  inputs: Array<Omit<BackendInput, "signal">> = [];
  constructor(private readonly outcomes: BackendOutcome[]) {}
  async run(input: BackendInput) {
    const { signal: _signal, ...recorded } = input;
    this.inputs.push(structuredClone(recorded));
    return structuredClone(this.outcomes.shift()!);
  }
}
function root() { return mkdtempSync(join(tmpdir(), "capsule-context-")); }
function settled(marker: string, packet = handoff): BackendOutcome {
  return { kind: "settled", yield: packet, hooksRan: true, records: [
    { type: "message", message: { role: "user", content: "capsule delivered once" } },
    { type: "tool_end", toolName: "read_probe", result: `observation ${marker}` },
    { type: "tool_start", toolName: "dependent_action", args: { selectedBecause: marker } },
    { type: "agent_settled" },
  ] };
}

describe("refined Capsule contracts", () => {
  it("accepts text guidance and arbitrary completed JSON without checking its shape", () => {
    for (const output_example of ['{"ok":true}', "A short sentence in past tense."])
      expect(() => validateDelegate({ capsule: "Run it", output_example, timeout_s: 0.01 })).not.toThrow();
    for (const result of [{ different: 7 }, "plain answer", false, null, [1, "x"]])
      expect(() => validateYield({ reason: "completed", result, JITed_history: [] })).not.toThrow();
  });
  it("enforces only the fixed envelopes", () => {
    for (const value of [
      { capsule: "x" }, { capsule: " ", output_example: "x" }, { capsule: "x", output_example: " " },
      { capsule: "x", output_example: "x", timeout_s: 0 }, { capsule: "x", output_example: "x", extra: true },
    ]) expect(() => validateDelegate(value)).toThrow(/invalid_contract/);
    for (const value of [
      { reason: "completed", JITed_history: [] },
      { reason: "blocked", notes: " ", JITed_history: [] },
      { reason: "blocked", notes: "blocked", result: false, JITed_history: [] },
      { reason: "needs_decision", notes: "x", JITed_history: [] },
      { reason: "completed", result: undefined, JITed_history: [] },
      { ...handoff, report: "old envelope" },
      { ...handoff, JITed_history: [{ topic: "a", content: "x" }, { topic: "a", content: "y" }] },
    ]) expect(() => validateYield(value)).toThrow(/invalid_contract/);
  });
});

describe("refined Capsule lifecycle", () => {
  it("keeps state project-scoped", () => {
    const project = root(), backend = new RecordingBackend([]);
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "state") })).not.toThrow();
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "..", "outside") })).toThrow(/scoped inside/);
  });

  it("returns a compact negative completion with retained searchable paths", async () => {
    const marker = "RAW_ONLY_DIAGNOSTIC_7719", project = root(), backend = new RecordingBackend([settled(marker)]);
    const result = await new CapsuleService(backend, { projectRoot: project }).delegate({ capsule: "CAPSULE_A_ONLY", output_example: '{"ok":true}' });
    expect(result.status).toBe("completed");
    if (result.status !== "completed") throw Error("expected completion");
    expect(result.result).toEqual({ ok: false });
    expect(Object.keys(result).sort()).toEqual(["notes_path", "raw_history", "result", "status"]);
    expect(JSON.stringify(result)).not.toContain(marker);
    expect(JSON.stringify(result)).not.toContain("SUPPLEMENT_ONLY_991");
    expect(JSON.stringify(result)).not.toContain(lesson);
    for (const path of [result.raw_history, result.notes_path!]) { expect(isAbsolute(path)).toBe(true); await access(path, constants.R_OK); }
    expect(await readFile(result.notes_path!, "utf8")).toBe("SUPPLEMENT_ONLY_991");
    expect(execFileSync("rg", ["-n", "-F", "--", marker, result.raw_history], { encoding: "utf8" })).toContain(marker);
    expect(backend.inputs[0].outputExample).toBe('{"ok":true}');
  });

  it("returns blockers inline without result or notes_path", async () => {
    const packet: YieldArgs = { reason: "blocked", notes: "Service is unavailable; no answer was established. Astra must decide whether to start it.", JITed_history: [] };
    const result = await new CapsuleService(new RecordingBackend([settled("partial", packet)]), { projectRoot: root() })
      .delegate({ capsule: "work", output_example: "Say yes or no" });
    expect(result).toMatchObject({ status: "blocked", notes: packet.notes });
    expect(result).not.toHaveProperty("result"); expect(result).not.toHaveProperty("notes_path");
    expect(result).toHaveProperty("raw_history");
  });

  it("reclaims old episode text and passes only new guidance plus retained JIT", async () => {
    const backend = new RecordingBackend([settled("OLD_TRANSCRIPT_NOISE_88"), settled("second", { reason: "completed", result: "different text shape", JITed_history: [] })]);
    const service = new CapsuleService(backend, { projectRoot: root() });
    await service.delegate({ capsule: "CAPSULE_A_DISTINCT", output_example: '{"ok":true}' });
    const second = await service.delegate({ capsule: "CAPSULE_B_DISTINCT", output_example: "Return one sentence" });
    expect(second.status === "completed" && second.result).toBe("different text shape");
    expect(backend.inputs[1].capsule).toBe("CAPSULE_B_DISTINCT"); expect(backend.inputs[1].outputExample).toBe("Return one sentence");
    expect(JSON.stringify(backend.inputs[1])).not.toContain("CAPSULE_A_DISTINCT");
    expect(JSON.stringify(backend.inputs[1])).not.toContain("OLD_TRANSCRIPT_NOISE_88");
    expect(backend.inputs[1].jit[0].content).toContain("Verify the decisive assertion");
  });

  it("returns mandatory inline error notes when transcript storage fails and preserves old JIT", async () => {
    const project = root(), state = join(project, "state"), first = new CapsuleService(new RecordingBackend([settled("first")]), { projectRoot: project, stateRoot: state });
    expect((await first.delegate({ capsule: "first", output_example: "x" })).status).toBe("completed");
    const oldJit = await readFile(join(state, "jit.json"), "utf8");
    const broken = join(project, "broken"); await mkdir(broken); await writeFile(join(broken, "jit.json"), oldJit); await writeFile(join(broken, "episodes"), "not a directory");
    const result = await new CapsuleService(new RecordingBackend([settled("lost")]), { projectRoot: project, stateRoot: broken })
      .delegate({ capsule: "second", output_example: "x" });
    expect(result.status).toBe("error"); expect(result).toHaveProperty("notes"); expect(result).not.toHaveProperty("raw_history");
    expect(result).not.toHaveProperty("result"); expect(result).not.toHaveProperty("notes_path");
    expect(await readFile(join(broken, "jit.json"), "utf8")).toBe(oldJit);
  });

  it("owns the deadline, requests stop, returns once, and publishes no late yield/JIT", async () => {
    let stopped = 0;
    const lateBackend: CapsuleBackend = { run: input => new Promise(resolve => {
      input.signal.addEventListener("abort", () => { stopped++; setTimeout(() => resolve(settled("LATE_MARKER")), 35); }, { once: true });
    }) };
    const project = root(), service = new CapsuleService(lateBackend, { projectRoot: project, cleanupMs: 10 });
    const started = Date.now();
    const result = await service.delegate({ capsule: "hang", output_example: "x", timeout_s: 0.01 });
    expect(Date.now() - started).toBeLessThan(150); expect(stopped).toBe(1);
    expect(result.status).toBe("timeout"); expect(result).toHaveProperty("notes"); expect(result).not.toHaveProperty("result");
    expect((await service.delegate({ capsule: "overlap", output_example: "x" })).status).toBe("error");
    await new Promise(resolve => setTimeout(resolve, 70));
    await expect(readFile(join(project, ".pi", "capsule", "jit.json"), "utf8")).rejects.toThrow();
  });

  it("bounds hanging storage after an early yield", async () => {
    const service = new CapsuleService(new RecordingBackend([settled("ready")]), { projectRoot: root(), cleanupMs: 10 });
    (service as any).retain = () => new Promise(() => {});
    const result = await service.delegate({ capsule: "work", output_example: "x", timeout_s: 0.01 });
    expect(result.status).toBe("timeout"); expect(result).not.toHaveProperty("raw_history");
    expect((result as any).notes).toMatch(/not confirmed/);
  });
});

describe("parent/child tool separation", () => {
  it("configures Astra and Luna defaults while retaining the Luna override", async () => {
    const settings = JSON.parse(await readFile(join(process.cwd(), ".pi", "settings.json"), "utf8"));
    expect(settings).toMatchObject({ defaultProvider: "openai-codex", defaultModel: "gpt-6-astra" });
    expect(settings.extensions).toContain("../src/extension/index.ts");
    expect(DEFAULT_LUNA_MODEL).toBe("openai-codex/gpt-5.6-luna");
    const finds: string[] = [], registry = { find(provider: string, id: string) { finds.push(`${provider}/${id}`); return { provider, id }; } };
    expect(resolveConfiguredModel(registry as any, undefined)).toMatchObject({ provider: "openai-codex", id: "gpt-5.6-luna" });
    expect(resolveConfiguredModel(registry as any, "other/custom")).toMatchObject({ provider: "other", id: "custom" });
    expect(finds).toEqual(["openai-codex/gpt-5.6-luna", "other/custom"]);
  });
  it("registers only delegate_capsule in Astra", () => {
    const tools: any[] = []; capsuleExtension({ registerTool: (tool: any) => tools.push(tool) } as any);
    expect(tools.map(x => x.name)).toEqual(["delegate_capsule"]);
  });
  it("injects exact example/JIT and exposes only terminating yield in Luna", async () => {
    const tools: any[] = [], hooks = new Map<string, any>(), state = { hooksRan: false, duplicate: false };
    const extension = createWorkerExtension({ outputExample: "PLAIN EXAMPLE", jit: [{ topic: "project-tests", content: lesson, raw_history: "/project/episode.jsonl" }] }, state);
    await (extension as any)({ registerTool: (tool: any) => tools.push(tool), on: (name: string, handler: any) => hooks.set(name, handler) });
    const injected = await hooks.get("before_agent_start")({ systemPrompt: "base" });
    expect(injected.systemPrompt).toContain("PLAIN EXAMPLE"); expect(injected.systemPrompt).toContain(lesson);
    expect(tools.map(x => x.name)).toEqual(["yield"]);
    expect((await tools[0].execute("yield-1", handoff)).terminate).toBe(true);
    await expect(tools[0].execute("yield-2", handoff)).rejects.toThrow(/duplicate/);
  });
});
