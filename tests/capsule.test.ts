import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { mkdtempSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import { Type } from "typebox";
import { DefaultResourceLoader, getAgentDir } from "@earendil-works/pi-coding-agent";
import { agentLoop } from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-agent-core/dist/index.js";
import { AssistantMessageEventStream } from "../node_modules/@earendil-works/pi-coding-agent/node_modules/@earendil-works/pi-ai/dist/utils/event-stream.js";
import capsuleExtension from "../src/extension/index.js";
import { DELEGATE_CAPSULE_DESCRIPTION, DELEGATION_EXAMPLES, PARENT_CAPSULE_PROMPT, WORKER_CAPSULE_PROMPT } from "../src/capsule/prompts.js";
import { DelegateCapsuleParameters, validateDelegate, validateYield, type YieldArgs } from "../src/capsule/contracts.js";
import { CapsuleService } from "../src/capsule/service.js";
import { DEFAULT_FLASH_MODEL, DEFAULT_FLASH_THINKING_LEVEL, FLASH_THINKING_LEVELS, HIGH_THINKING_TIMEOUT_MULTIPLIER, PiSdkBackend, XHIGH_THINKING_TIMEOUT_MULTIPLIER, createWorkerExtension, resolveConfiguredModel, resolveConfiguredThinkingLevel, thinkingTimeoutMultiplier } from "../src/extension/pi-backend.js";
import type { BackendOutcome, CapsuleBackend } from "../src/capsule/worker.js";
import { CapsuleStorage } from "../src/capsule/storage.js";

const lesson = "Applies while lock-v1 is current. Run the focused check; guard against changing the lock. Verify the decisive assertion.";
const execFileAsync = promisify(execFile);
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
  it("keeps the bounded task examples valid, specific, and diverse", () => {
    expect(DELEGATION_EXAMPLES).toHaveLength(10);
    for (const { args } of DELEGATION_EXAMPLES) {
      expect(() => validateDelegate(args)).not.toThrow();
      expect(args.capsule).toMatch(/Report|report/);
    }
    expect(DELEGATION_EXAMPLES.map(x => x.task)).toEqual(expect.arrayContaining([
      "Target code search (read-only)",
      "Environment install (locked, project-local)",
      "Requirement check and smoke (no fixes)",
      "Fix a specified Cargo error (not troubleshooting)",
      "Explore a specified log (extract, do not diagnose)",
      "Run an existing test/workflow",
      "Git command (read-only)",
      "Target literature search (retrieve, do not evaluate)",
      "Targeted needle-in-a-haystack aggregation",
      "Coarse text processing and extraction",
    ]));
    expect(DELEGATION_EXAMPLES.some(x => x.args.timeout_s === undefined)).toBe(true);
    expect(DELEGATION_EXAMPLES.some(x => x.args.output_example.startsWith("{"))).toBe(true);
    expect(DELEGATION_EXAMPLES.some(x => x.args.output_example.startsWith("|"))).toBe(true);
    expect((DelegateCapsuleParameters.properties.timeout_s as unknown as { description: string }).description)
      .toContain("For a complex capsule, explicitly set a larger value");
  });
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
  it("allows an absolute state directory outside the project", () => {
    const project = root(), backend = new RecordingBackend([]);
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "state") })).not.toThrow();
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: join(project, "..", "outside") })).not.toThrow();
    expect(() => new CapsuleService(backend, { projectRoot: project, stateRoot: "relative/state" })).toThrow(/must be absolute/);
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

  it("passes a material constraint and its rationale unchanged", async () => {
    const capsule = "Do not update dependencies: this run must remain comparable with the reviewed lockfile. You may adjust invocation; a required dependency change is a blocker.";
    const backend = new RecordingBackend([settled("rationale", { reason: "completed", result: true, JITed_history: [] })]);
    await new CapsuleService(backend, { projectRoot: root() }).delegate({ capsule, output_example: "true" });
    expect(backend.inputs[0]!.capsule).toBe(capsule);
  });

  it("returns blockers inline without result or notes_path", async () => {
    const packet: YieldArgs = { reason: "blocked", notes: "Service is unavailable; no answer was established. The parent agent must decide whether to start it.", JITed_history: [] };
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
    const second = await service.delegate({ capsule: "Run the focused project assertion under the current lock", output_example: "Return one sentence" });
    expect(second.status === "completed" && second.result).toBe("different text shape");
    expect(backend.inputs[1].capsule).toBe("Run the focused project assertion under the current lock"); expect(backend.inputs[1].outputExample).toBe("Return one sentence");
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
    const retain = vi.spyOn(CapsuleStorage.prototype, "retain").mockImplementation(() => new Promise(() => {}));
    try {
      const result = await service.delegate({ capsule: "work", output_example: "x", timeout_s: 0.01 });
      expect(result.status).toBe("timeout"); expect(result).not.toHaveProperty("raw_history");
      expect((result as any).notes).toMatch(/not confirmed/);
    } finally {
      retain.mockRestore();
    }
  });

  it("applies the runtime timeout multiplier to an explicit nominal deadline", async () => {
    const backend: CapsuleBackend = { run: () => new Promise(() => {}) };
    const service = new CapsuleService(backend, { projectRoot: root(), timeoutMultiplier: 2, cleanupMs: 1 });
    const result = await service.delegate({ capsule: "wait", output_example: "x", timeout_s: 0.01 });
    expect(result.status).toBe("timeout");
    expect((result as any).notes).toContain("0.02-second deadline");
  });
});

describe("parent/child tool separation", () => {
  it("validates the Flash-only reasoning setting without changing the parent setting", () => {
    expect(DEFAULT_FLASH_THINKING_LEVEL).toBe("off");
    for (const level of FLASH_THINKING_LEVELS) expect(resolveConfiguredThinkingLevel({ capsuleFlashThinkingLevel: level })).toBe(level);
    expect(resolveConfiguredThinkingLevel({ capsuleFlashThinkingLevel: "low" }, "high")).toBe("high");
    expect(resolveConfiguredThinkingLevel({ capsuleFlashThinkingLevel: "high" })).toBe("high");
    expect(() => resolveConfiguredThinkingLevel({ capsuleFlashThinkingLevel: "turbo" })).toThrow(/capsuleFlashThinkingLevel/);
    expect(() => resolveConfiguredThinkingLevel({}, "turbo")).toThrow(/capsuleFlashThinkingLevel/);
  });

  it("allows extra runtime for high-effort Flash reasoning", () => {
    expect(HIGH_THINKING_TIMEOUT_MULTIPLIER).toBe(2);
    expect(XHIGH_THINKING_TIMEOUT_MULTIPLIER).toBe(3);
    for (const level of ["off", "minimal", "low", "medium"] as const)
      expect(thinkingTimeoutMultiplier(level)).toBe(1);
    expect(thinkingTimeoutMultiplier("high")).toBe(2);
    expect(thinkingTimeoutMultiplier("xhigh")).toBe(3);
    expect(DELEGATE_CAPSULE_DESCRIPTION).not.toMatch(/multiplier|high-effort|thinking level/i);
    expect(PARENT_CAPSULE_PROMPT).not.toMatch(/multiplier|high-effort|thinking level/i);
  });

  it("uses project settings over global settings before resolving Flash reasoning", () => {
    const globalSettings = { capsuleFlashThinkingLevel: "medium" };
    const projectSettings = { capsuleFlashThinkingLevel: "minimal" };
    expect(resolveConfiguredThinkingLevel({ ...globalSettings, ...projectSettings })).toBe("minimal");
    expect(resolveConfiguredThinkingLevel(globalSettings)).toBe("medium");
  });

  it("keeps the effective parent prompt when a preceding extension replaces it", async () => {
    const project = root();
    const replacing = join(project, "poor-like.mjs");
    await writeFile(replacing, `export default function poorLike(pi) {
      pi.on("before_agent_start", async () => ({ systemPrompt: "POOR_REPLACED_PROMPT" }));
    }\n`);
    const state = { hooksRan: false, duplicate: false };
    const worker = createWorkerExtension({
      outputExample: "WORKER_OUTPUT_EXAMPLE",
      jit: [],
      parentSystemPrompt: `BASE_PARENT\n\n${PARENT_CAPSULE_PROMPT}`,
    }, state);
    const loader = new DefaultResourceLoader({ cwd: project, agentDir: getAgentDir(),
      additionalExtensionPaths: [replacing], extensionFactories: [worker], noExtensions: true,
      noSkills: true, noPromptTemplates: true, noContextFiles: true });
    await loader.reload();
    expect(loader.getExtensions().errors).toEqual([]);
    const extensions = loader.getExtensions().extensions;
    expect(extensions.at(-1)?.tools.has("yield")).toBe(true);
    let effective = `BASE_PARENT\n\n${PARENT_CAPSULE_PROMPT}`;
    for (const extension of extensions) {
      for (const handler of extension.handlers.get("before_agent_start") ?? []) {
        const result: any = await handler({ systemPrompt: effective } as any, undefined as any);
        if (result?.systemPrompt !== undefined) effective = result.systemPrompt;
      }
    }
    expect(effective).toContain("BASE_PARENT");
    expect(effective).not.toContain(PARENT_CAPSULE_PROMPT);
    expect(effective).toContain(WORKER_CAPSULE_PROMPT);
    expect(effective).toContain("WORKER_OUTPUT_EXAMPLE");
    expect(effective).not.toContain("POOR_REPLACED_PROMPT");
    expect(state.hooksRan).toBe(true);
  });

  it("refreshes parent prompt, active tools, and extension source paths for each worker run", async () => {
    const tools: any[] = [], hooks = new Map<string, any>();
    let prompt = "PARENT_PROMPT_ONE", active = ["read", "delegate_capsule"];
    let configured = [
      { name: "read", sourceInfo: { path: "/tmp/read-extension.mjs" } },
      { name: "delegate_capsule", sourceInfo: { path: "/tmp/capsule-extension.mjs" } },
    ];
    let commands = [{ source: "extension", sourceInfo: { path: "/tmp/command-extension.mjs" } }];
    const pi = {
      registerTool: (tool: any) => tools.push(tool),
      on: (name: string, handler: any) => hooks.set(name, handler),
      getSystemPrompt: () => prompt,
      getActiveTools: () => active,
      getAllTools: () => configured,
      getCommands: () => commands,
    };
    const run = vi.spyOn(PiSdkBackend.prototype, "run").mockImplementation(async function (this: PiSdkBackend) {
      const parent = (this as any).options.parentContext();
      (this as any).__parents ??= [];
      (this as any).__parents.push(parent);
      return settled("parent-context");
    });
    const project = root();
    vi.stubEnv("CAPSULE_STATE_DIR", join(project, ".pi", "capsule"));
    vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", undefined);
    vi.stubEnv("CAPSULE_FLASH_TOOLS", undefined);
    try {
      capsuleExtension(pi as any);
      const ctx = { hasUI: false, mode: "print", ui: { setStatus: vi.fn() }, cwd: project,
        modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) },
        getSystemPrompt: () => prompt };
      const delegate = tools[0];
      await delegate.execute("one", { capsule: "first", output_example: "x" }, undefined, undefined, ctx);
      prompt = "PARENT_PROMPT_TWO"; active = ["bash", "write", "delegate_capsule", "yield"];
      configured = [{ name: "bash", sourceInfo: { path: "/tmp/bash-extension.mjs" } },
        { name: "delegate_capsule", sourceInfo: { path: "/tmp/capsule-extension.mjs" } }];
      commands = [{ source: "extension", sourceInfo: { path: "/tmp/new-command-extension.mjs" } }];
      await delegate.execute("two", { capsule: "second", output_example: "x" }, undefined, undefined, ctx);
      const parents = (run.mock.instances[0] as any).__parents;
      expect(parents).toHaveLength(2);
      expect(parents[0]).toEqual({ systemPrompt: "PARENT_PROMPT_ONE",
        extensionPaths: ["/tmp/read-extension.mjs", "/tmp/command-extension.mjs"], tools: ["read"] });
      expect(parents[1]).toEqual({ systemPrompt: "PARENT_PROMPT_TWO",
        extensionPaths: ["/tmp/bash-extension.mjs", "/tmp/new-command-extension.mjs"], tools: ["bash", "write"] });
    } finally {
      run.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it("defaults extension state to the user-level capsule sessions directory", async () => {
    const tools: any[] = [];
    const delegate = vi.spyOn(CapsuleService.prototype, "delegate")
      .mockResolvedValue({ status: "blocked", notes: "stub" });
    vi.stubEnv("CAPSULE_STATE_DIR", undefined);
    vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", undefined);
    try {
      capsuleExtension({ registerTool: (tool: any) => tools.push(tool), on: vi.fn() } as any);
      const ctx = { hasUI: false, mode: "print", ui: { setStatus: vi.fn() }, cwd: root(),
        modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) } };
      await tools[0].execute("id", { capsule: "work", output_example: "answer" }, undefined, undefined, ctx);
      const service = delegate.mock.instances[0] as any;
      const expected = join(homedir(), ".pi", "agent", "capsule-sessions");
      expect(service.storage.stateRoot).toBe(expected);
      expect(service.backend.options.stateDir).toBe(join(expected, "worker-sessions"));
    } finally {
      delegate.mockRestore();
      vi.unstubAllEnvs();
    }
  });

  it.each(["completed", "blocked", "timeout", "error", "cancelled"])("shows independent Flash status through %s", async status => {
    const tools: any[] = [], hooks = new Map<string, any>();
    const setStatus = vi.fn();
    const ctx = { hasUI: true, ui: { setStatus }, cwd: process.cwd(),
      modelRegistry: { find: (provider: string, id: string) => ({ provider, id }) } };
    vi.stubEnv("CAPSULE_FLASH_MODEL", "other/custom");
    vi.stubEnv("CAPSULE_STATE_DIR", undefined);
    vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", undefined);
    const delegate = vi.spyOn(CapsuleService.prototype, "delegate");
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    if (status === "cancelled") delegate.mockRejectedValue(abort);
    else delegate.mockResolvedValue({ status, notes: "stub" } as any);
    try {
      capsuleExtension({ registerTool: (tool: any) => tools.push(tool),
        on: (name: string, handler: any) => hooks.set(name, handler) } as any);
      await hooks.get("session_start")({}, ctx);
      expect(setStatus).toHaveBeenLastCalledWith("capsule.flash", "Flash: idle · other/custom");
      const result = tools[0].execute("id", { capsule: "work", output_example: "answer" }, undefined, undefined, ctx);
      if (status === "cancelled") await expect(result).rejects.toBe(abort);
      else await result;
      expect(setStatus.mock.calls.map(call => call[1])).toEqual([
        "Flash: idle · other/custom", "Flash: starting · other/custom",
        "Flash: running · other/custom", `Flash: ${status} · other/custom`,
      ]);
      setStatus.mockClear();
      await hooks.get("session_start")({}, { ...ctx, hasUI: false });
      expect(setStatus).not.toHaveBeenCalled();
    } finally {
      delegate.mockRestore();
      vi.unstubAllEnvs();
    }
  });
  it("leaves the Pi-selected parent model alone and retains the independent Flash default/override", async () => {
    const settings = JSON.parse(await readFile(join(process.cwd(), ".pi", "settings.json"), "utf8"));
    expect(settings).not.toHaveProperty("defaultProvider");
    expect(settings).not.toHaveProperty("defaultModel");
    expect(settings.extensions).toContain("../src/extension/index.ts");
    expect(DEFAULT_FLASH_MODEL).toBe("openai-codex/gpt-5.6-luna");
    const finds: string[] = [], registry = { find(provider: string, id: string) { finds.push(`${provider}/${id}`); return { provider, id }; } };
    expect(resolveConfiguredModel(registry as any, undefined)).toMatchObject({ provider: "openai-codex", id: "gpt-5.6-luna" });
    expect(resolveConfiguredModel(registry as any, "other/custom")).toMatchObject({ provider: "other", id: "custom" });
    expect(finds).toEqual(["openai-codex/gpt-5.6-luna", "other/custom"]);
  });
  it("adds parent-only policy without duplicating it in the tool introduction", async () => {
    const tools: any[] = [], hooks = new Map<string, any>();
    capsuleExtension({ registerTool: (tool: any) => tools.push(tool), on: (name: string, handler: any) => hooks.set(name, handler) } as any);
    expect(tools.map(x => x.name)).toEqual(["delegate_capsule"]);
    const injected = await hooks.get("before_agent_start")({ systemPrompt: "base" });
    expect(injected.systemPrompt).toBe(`base\n\n${PARENT_CAPSULE_PROMPT}`);
    expect(injected.systemPrompt).toContain("Sequential batches stop at the first tool error");
    expect(injected.systemPrompt).toContain("remaining calls are reported skipped, not executed");
    expect(injected.systemPrompt).toContain("Speculatively batch known-argument calls");
    expect(injected.systemPrompt).toContain("apply_patch followed by bash_exec to test it");
    expect(injected.systemPrompt).toContain("intermediate result requires a decision or branch");
    expect(injected.systemPrompt).toContain("# Saving input tokens");
    expect(injected.systemPrompt).toContain("Use delegate_capsule for a specific, bounded execution or evidence task");
    expect(injected.systemPrompt).toContain("Delegate: targeted code/literature search");
    expect(injected.systemPrompt).toContain("needle-in-a-haystack aggregation");
    expect(injected.systemPrompt).toContain("Do not delegate: architecture decisions");
    for (const work of ["architecture decisions", "bug troubleshooting", "data interpretation", "large refactors",
      "literature integration", "hypothesis generation", "evidence evaluation", "trade-offs",
      "complex failure-mode identification", "roadmaps or plans"])
      expect(injected.systemPrompt).toContain(work);
    expect(injected.systemPrompt).toContain("completed can be negative");
    expect(injected.systemPrompt).toContain("Do not overlap delegate_capsule calls");
    expect(injected.systemPrompt).not.toContain(WORKER_CAPSULE_PROMPT);
    expect(tools[0].description).not.toContain(PARENT_CAPSULE_PROMPT);
    expect(tools[0].executionMode).toBe("sequential");
    expect(tools[0].description.split(JSON.stringify(DELEGATION_EXAMPLES[0]!.args))).toHaveLength(2);
    for (const { args } of DELEGATION_EXAMPLES.slice(1))
      expect(tools[0].description).not.toContain(JSON.stringify(args));
    expect(PARENT_CAPSULE_PROMPT.length + tools[0].description.length
      + JSON.stringify(tools[0].parameters).length).toBeLessThan(2500);
    expect(injected.systemPrompt).not.toContain("JITed_history");
    expect(tools[0].description).not.toContain("JITed_history");
  });
  it("blocks a later sibling until a bash_exec sleep finishes", async () => {
    const registered: any[] = [];
    capsuleExtension({ registerTool: (tool: any) => registered.push(tool), on() {} } as any);
    const order: string[] = [];
    const bashTool = {
      name: "bash_exec", label: "Bash sleep", description: "Test-only sleep", parameters: Type.Object({}),
      async execute() {
        order.push("bash:start");
        await execFileAsync("bash", ["-c", "sleep 5"]);
        order.push("bash:end");
        return { content: [{ type: "text" as const, text: "slept" }], details: {}, terminate: true };
      },
    };
    const delegateTool = {
      ...registered[0],
      async execute() {
        order.push("delegate:start");
        return { content: [{ type: "text" as const, text: "delegated" }], details: {}, terminate: true };
      },
    };
    const assistant: any = {
      role: "assistant", api: "test", provider: "test", model: "test", stopReason: "toolUse", timestamp: Date.now(),
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      content: [
        { type: "toolCall", id: "sleep-1", name: "bash_exec", arguments: {} },
        { type: "toolCall", id: "delegate-1", name: "delegate_capsule", arguments: { capsule: "x", output_example: "x" } },
      ],
    };
    const streamFn = () => {
      const stream = new AssistantMessageEventStream();
      stream.push({ type: "start", partial: assistant });
      stream.push({ type: "done", reason: "toolUse", message: assistant });
      return stream;
    };
    const events = agentLoop(
      [{ role: "user", content: "run both", timestamp: Date.now() }],
      { systemPrompt: "test", messages: [], tools: [bashTool, delegateTool] },
      { model: {} as any, convertToLlm: messages => messages as any, toolExecution: "parallel" },
      undefined,
      streamFn as any,
    );
    for await (const _event of events) { /* drain the real scheduler */ }
    expect(delegateTool.executionMode).toBe("sequential");
    expect(order).toEqual(["bash:start", "bash:end", "delegate:start"]);
  });
  it("lets Flash list and fetch JIT without injecting lesson text", async () => {
    const tools: any[] = [], hooks = new Map<string, any>(), state = { hooksRan: false, duplicate: false };
    const extension = createWorkerExtension({ outputExample: "PLAIN EXAMPLE", jit: [
      { topic: "project-tests", content: lesson, raw_history: "/project/episode.jsonl" },
      { topic: "alpha-setup", content: "another complete lesson", raw_history: "/project/earlier.jsonl" },
    ] }, state);
    await (extension as any)({ registerTool: (tool: any) => tools.push(tool), on: (name: string, handler: any) => hooks.set(name, handler) });
    const injected = await hooks.get("before_agent_start")({ systemPrompt: "base" });
    expect(injected.systemPrompt).toContain("PLAIN EXAMPLE");
    expect(injected.systemPrompt).not.toContain(lesson);
    expect(injected.systemPrompt).not.toContain("another complete lesson");
    expect(injected.systemPrompt.split("PLAIN EXAMPLE")).toHaveLength(2);
    expect(injected.systemPrompt).toContain(WORKER_CAPSULE_PROMPT);
    expect(injected.systemPrompt).toContain("Return your report through the yield tool, not a plain-text final answer");
    expect(injected.systemPrompt).toContain("verified procedures useful to a future independently specified task");
    expect(injected.systemPrompt).toContain("JIT is prior knowledge, not current permission or task state");
    expect(injected.systemPrompt).toContain("pending work, current answers/progress, one-off authority");
    expect(injected.systemPrompt).toContain("blocked yield ends this single-pass delegation");
    expect(injected.systemPrompt).toContain("Use [] if none");
    expect(injected.systemPrompt).not.toContain(PARENT_CAPSULE_PROMPT);
    expect(injected.systemPrompt).not.toContain("sole final tool call");
    expect(tools.map(x => x.name)).toEqual(["list_lesson_topic", "fetch_lesson", "yield"]);
    const listed = await tools[0].execute("list", {});
    expect(JSON.parse(listed.content[0].text)).toEqual({ topics: ["alpha-setup", "project-tests"] });
    const fetched = await tools[1].execute("fetch", { topic: "project-tests" });
    expect(JSON.parse(fetched.content[0].text)).toEqual({ topic: "project-tests", content: lesson, raw_history: "/project/episode.jsonl" });
    await expect(tools[1].execute("missing", { topic: "unknown" })).rejects.toThrow(/lesson_not_found/);
    expect(tools[2].description).toContain("sole final tool call");
    expect(tools[2].executionMode).toBe("sequential");
    expect((await tools[2].execute("yield-1", handoff)).terminate).toBe(true);
    await expect(tools[2].execute("yield-2", handoff)).rejects.toThrow(/duplicate/);
  });
  it.each([undefined, "other/custom"])("keeps parent model ownership with Flash configured as %s", async configured => {
    const tools: any[] = [], setModel = vi.fn();
    const parentModel = vi.fn(() => ({ provider: "user", id: "selected" }));
    const find = vi.fn((provider: string, id: string) => ({ provider, id }));
    const delegate = vi.spyOn(CapsuleService.prototype, "delegate")
      .mockResolvedValue({ status: "error", notes: "Stubbed delegation; no provider call." });
    vi.stubEnv("CAPSULE_FLASH_MODEL", configured);
    vi.stubEnv("CAPSULE_STATE_DIR", undefined);
    vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", undefined);
    try {
      capsuleExtension({ registerTool: (tool: any) => tools.push(tool), on: vi.fn(), setModel } as any);
      const ctx = { cwd: process.cwd(), modelRegistry: { find }, get model() { return parentModel(); } };
      const args = { capsule: "work", output_example: "Answer briefly" };
      await tools[0].execute("delegate-1", args, undefined, undefined, ctx);
      expect(find).toHaveBeenCalledExactlyOnceWith(...(configured ?? DEFAULT_FLASH_MODEL).split("/"));
      expect(delegate).toHaveBeenCalledExactlyOnceWith(args, undefined);
      expect(setModel).not.toHaveBeenCalled();
      expect(parentModel).not.toHaveBeenCalled();
    } finally {
      delegate.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});
