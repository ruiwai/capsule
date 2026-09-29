import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";
import { Type } from "typebox";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { installToolExecutionPolicy, SEQUENTIAL_TOOL } from "../src/extension/tool-policy.js";
import capsuleExtension from "../src/extension/index.js";
import { createWorkerExtension } from "../src/extension/pi-backend.js";

const sdkRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const core = dirname(sdkRequire.resolve("@earendil-works/pi-agent-core/package.json"));
const { runAgentLoop } = await import(pathToFileURL(join(core, "dist/agent-loop.js")).href);

it("requires unpatched SDK and CLI/RPC tool loops (no old Capsule core patch)", () => {
  const markers = ["Capsule: short-circuit sequential batches.", "pi-capsule.sequential-tools"];
  const sdkLoop = readFileSync(join(core, "dist/agent-loop.js"), "utf8");
  const bundle = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle");
  const chunks = join(bundle, "chunks");
  const sources = readdirSync(chunks).filter(file => file.endsWith(".js"))
    .map(file => readFileSync(join(chunks, file), "utf8"));
  const loops = sources
    .filter(source => source.includes("async function executeToolCallsSequential("));
  expect(loops).toHaveLength(1);
  for (const source of [sdkLoop, ...sources, ...["cli.js", "rpc-entry.js"].map(file => readFileSync(join(bundle, file), "utf8"))]) {
    for (const marker of markers) expect(source).not.toContain(marker);
  }
});

type Handler = (event: any) => any;
function policyHooks() {
  const handlers = new Map<string, Handler[]>();
  const dispatched: Array<{ event: string; payload: any }> = [];
  let activeTools = ["first", "middle", "last"];
  const pi = {
    on(event: string, callback: Handler) {
      const callbacks = handlers.get(event) ?? [];
      callbacks.push(callback);
      handlers.set(event, callbacks);
    },
    registerTool() {}, registerCommand() {},
    getActiveTools: () => [...activeTools],
    setActiveTools: (tools: string[]) => { activeTools = [...tools]; },
  } as any;
  async function dispatch(event: string, payload: any) {
    dispatched.push({ event, payload });
    let result: any;
    for (const callback of handlers.get(event) ?? []) {
      const response = await callback(payload);
      if (response !== undefined) result = response;
    }
    return result;
  }
  return { pi, handlers, dispatch, dispatched, activeTools: () => activeTools };
}

function installedPolicy() {
  const hooks = policyHooks();
  installToolExecutionPolicy(hooks.pi);
  return hooks;
}

async function run(failure: string, mode: "sequential" | "parallel" = "sequential", failedTool = "middle",
  hooks = installedPolicy()) {
  const executed: string[] = [];
  const prepared: string[] = [];
  const argumentsPrepared: string[] = [];
  const finalized: string[] = [];
  const events: any[] = [];
  let turn = 0;
  let active = 0, maxActive = 0;
  const tools = ["first", "middle", "last"].map(name => ({
    name, description: name, parameters: Type.Object({ n: Type.Number() }),
    executionMode: mode === "parallel" && failure === "marked" && name === "first" ? "sequential" : "parallel",
    prepareArguments(args: unknown) { argumentsPrepared.push(name); return args; },
    async execute() {
      executed.push(name);
      maxActive = Math.max(maxActive, ++active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      if (name === failedTool && ["throw", "marked"].includes(failure)) throw Error("failed");
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  }));
  const messages = await runAgentLoop([], { systemPrompt: "", messages: [], tools }, {
    model: {}, toolExecution: mode, convertToLlm: (messages: any) => messages,
    beforeToolCall: async ({ toolCall, args }: any) => {
      prepared.push(toolCall.name);
      const decision = await hooks.dispatch("tool_call", {
        type: "tool_call", toolName: toolCall.name, toolCallId: toolCall.id, input: args,
      });
      if (decision?.block) return decision;
      if (toolCall.name === failedTool && failure === "blocked" && turn === 1) {
        return { block: true, reason: "Blocked by another extension" };
      }
    },
    afterToolCall: async ({ toolCall, args, result, isError }: any) => {
      finalized.push(toolCall.name);
      const override = await hooks.dispatch("tool_result", {
        type: "tool_result", toolName: toolCall.name, toolCallId: toolCall.id,
        input: args, content: result.content, details: result.details, isError,
      });
      if (toolCall.name === failedTool && failure === "result" && turn === 1) return { ...override, isError: true };
      return override;
    },
  }, async (event: any) => {
    events.push(event);
    if (event.type === "turn_start" || event.type === "message_end") await hooks.dispatch(event.type, event);
  }, undefined, () => {
    const message = { role: "assistant", content: turn++ < 2 ? (turn === 1 ? tools : tools.slice(2)).map(tool => ({
      type: "toolCall", id: `${turn}-${tool.name}`,
      name: tool.name === failedTool && failure === "unknown" ? "missing" : tool.name,
      arguments: { n: tool.name === failedTool && failure === "invalid" ? "bad" : 1 },
    })) : [], stopReason: "stop", timestamp: Date.now() };
    return { async *[Symbol.asyncIterator]() { yield { type: "done" }; }, result: async () => message };
  });
  return { executed, prepared, argumentsPrepared, finalized, messages, events, hookEvents: hooks.dispatched, maxActive };
}

// This low-level core harness dispatches events but deliberately does not apply
// message_end replacements or register extension tools; these exercise raw loops.
it.each(["throw", "blocked", "result", "unknown", "invalid", "marked"])("raw loop short circuits %s with explicit sequential scheduling and resets next response", async failure => {
  const result = await run(failure, failure === "marked" ? "parallel" : "sequential");
  const results = result.messages.filter((m: any) => m.role === "toolResult");
  const firstResults = results.slice(0, 3);
  expect(results.map((m: any) => m.toolCallId)).toEqual(["1-first", "1-middle", "1-last", "2-last"]);
  expect(firstResults[0].isError).toBe(false);
  expect(firstResults[1].isError).toBe(true);
  expect(firstResults[2].isError).toBe(true);
  expect(firstResults[2].content[0].text).toContain("Skipped: earlier tool call 1-middle failed");
  expect(results[3].isError).toBe(false);
  expect(results[3].content[0].text).toBe("ok");
  expect(result.executed.filter(name => name === "last")).toEqual(["last"]);
  // SDK still prepares the blocked call; only the tool body/finalization is skipped.
  expect(result.prepared.filter(name => name === "last")).toEqual(["last", "last"]);
  expect(result.argumentsPrepared.filter(name => name === "last")).toEqual(["last", "last"]);
  expect(result.hookEvents.filter(({ event, payload }) => event === "tool_call" && payload.toolName === "last")
    .map(({ payload }) => payload.toolCallId)).toEqual(["1-last", "2-last"]);
  expect(result.finalized.filter(name => name === "last")).toEqual(["last"]);
  expect(result.hookEvents.filter(({ event, payload }) => event === "tool_result" && payload.toolName === "last")
    .map(({ payload }) => payload.toolCallId)).toEqual(["2-last"]);
  expect(result.events.filter(event => event.type === "tool_execution_end").map(event => event.toolCallId))
    .toEqual(["1-first", "1-middle", "1-last", "2-last"]);
  if (failure === "unknown" || failure === "invalid") {
    expect(result.prepared).toEqual(["first", "last", "last"]);
    expect(result.finalized).toEqual(["first", "last"]);
  }
  if (failure === "marked") expect(result.maxActive).toBe(1);
});

it.each(["first", "last"])("raw sequential loop handles failure at the %s batch boundary", async failedTool => {
  const result = await run("throw", "sequential", failedTool);
  expect(result.executed).toEqual(failedTool === "first" ? ["first", "last"] : ["first", "middle", "last", "last"]);
  const results = result.messages.filter((m: any) => m.role === "toolResult");
  const firstResults = results.slice(0, 3);
  expect(firstResults).toHaveLength(3);
  expect(firstResults.map((m: any) => m.isError)).toEqual(failedTool === "first"
    ? [true, true, true] : [false, false, true]);
  expect(firstResults.filter((m: any) => m.content[0].text.startsWith("Skipped:")))
    .toHaveLength(failedTool === "first" ? 2 : 0);
  expect(results[3].toolCallId).toBe("2-last");
  expect(results[3].isError).toBe(failedTool === "last");
});

it("raw sequential loop runs successful batches in order", async () => {
  const result = await run("none");
  expect(result.executed).toEqual(["first", "middle", "last", "last"]);
  expect(result.messages.filter((m: any) => m.role === "toolResult").map((m: any) => m.isError))
    .toEqual([false, false, false, false]);
  expect(result.maxActive).toBe(1);
});

it("raw loop does not serialize unmarked parallel batches when replacements are ignored", async () => {
  const result = await run("throw", "parallel");
  expect(result.executed).toEqual(["first", "middle", "last", "last"]);
  expect(result.maxActive).toBe(3);
  expect(result.messages.filter((m: any) => m.role === "toolResult").map((m: any) => m.isError))
    .toEqual([false, true, false, false]);
});

it.each(["parent", "worker"])("%s plugin installs local policy hooks, not a parallel override", async role => {
  const hooks = policyHooks();
  if (role === "parent") capsuleExtension(hooks.pi);
  else {
    const worker = createWorkerExtension({ outputExample: "", jit: [] }, { hooksRan: false, duplicate: false });
    await (typeof worker === "function" ? worker : worker.factory)(hooks.pi);
  }
  for (const event of ["turn_start", "message_end", "tool_call", "tool_result"]) {
    expect(hooks.handlers.get(event)).toHaveLength(1);
  }
  // This raw loop ignores the runner's message replacement and registered barrier.
  const failure = await run("throw", "sequential", "middle", hooks);
  expect(failure.messages.find((m: any) => m.role === "toolResult" && m.toolCallId === "1-last")
    .content[0].text).toContain("Skipped:");
  const success = await run("none", "parallel", "middle", hooks);
  expect(success.executed).toEqual(["first", "middle", "last", "last"]);
  expect(success.maxActive).toBe(3);
});

it("recognizes structured failures without treating completed negative evidence as an error", () => {
  const hooks = installedPolicy();
  const handler = hooks.handlers.get("tool_result")?.[0];
  expect(handler).toBeDefined();
  for (const outcome of [{ exit_code: 1 }, { exit_code: null, signal: "SIGTERM" }, { exit_code: 0, timed_out: true }, { exit_code: 0, descendant_cleanup_attempted: true }]) {
    expect(handler!({ toolName: "bash_exec", details: { outcome } })).toEqual({ isError: true });
  }
  expect(handler!({ toolName: "bash_exec", details: { outcome: { exit_code: 0 } } })).toBeUndefined();
  expect(handler!({ toolName: "delegate_capsule", details: { status: "blocked" } })).toEqual({ isError: true });
  expect(handler!({ toolName: "delegate_capsule", details: { status: "completed", result: "test failed" } })).toBeUndefined();
});

it("keeps the failure latch isolated between policy installations", async () => {
  const parent = installedPolicy();
  const worker = installedPolicy();
  await parent.dispatch("turn_start", { type: "turn_start" });
  await worker.dispatch("turn_start", { type: "turn_start" });
  await parent.dispatch("message_end", { type: "message_end", message: {
    role: "toolResult", toolCallId: "parent-first", isError: true,
  } });
  expect(await parent.dispatch("tool_call", { type: "tool_call" }))
    .toEqual({ block: true, reason: expect.stringContaining("parent-first") });
  expect(await worker.dispatch("tool_call", { type: "tool_call" })).toBeUndefined();
  await worker.dispatch("message_end", { type: "message_end", message: {
    role: "toolResult", toolCallId: "worker-first", isError: true,
  } });
  await parent.dispatch("turn_start", { type: "turn_start" });
  expect(await parent.dispatch("tool_call", { type: "tool_call" })).toBeUndefined();
  expect(await worker.dispatch("tool_call", { type: "tool_call" }))
    .toEqual({ block: true, reason: expect.stringContaining("worker-first") });
});

it("activates the barrier on session start and before agent start without duplicates", async () => {
  const hooks = installedPolicy();
  await hooks.dispatch("session_start", {});
  await hooks.dispatch("session_start", {});
  await hooks.dispatch("before_agent_start", { systemPrompt: "test" });
  expect(hooks.activeTools()).toEqual(["first", "middle", "last", SEQUENTIAL_TOOL]);
});

it("blocks tool bodies if the allowlist prevents barrier activation", async () => {
  const hooks = installedPolicy();
  hooks.pi.setActiveTools = () => {};
  await hooks.dispatch("session_start", {});
  expect(await hooks.dispatch("tool_call", { toolName: "first" })).toEqual({
    block: true, reason: expect.stringContaining("in the tool allowlist"),
  });
});

it("injects one leading barrier for tool replies, and leaves text-only and unsuccessful replies untouched", async () => {
  const hooks = installedPolicy();
  const call = { type: "toolCall", id: "real", name: "first", arguments: { n: 1 } };
  const assistant = { role: "assistant", content: [{ type: "text", text: "hi" }, call], stopReason: "toolUse" };
  const injected = (await hooks.dispatch("message_end", { message: assistant })).message;
  expect(injected.content[0]).toMatchObject({ type: "toolCall", name: SEQUENTIAL_TOOL, arguments: {},
    id: expect.stringMatching(/^capsule-barrier-/) });
  expect(injected.content.slice(1)).toEqual(assistant.content);
  expect(assistant.content).toHaveLength(2);
  expect(await hooks.dispatch("message_end", { message: injected })).toBeUndefined();
  for (const stopReason of ["stop", "error", "aborted", "length"]) {
    const content = stopReason === "stop" ? [{ type: "text", text: "done" }] : [call];
    expect(await hooks.dispatch("message_end", { message: { ...assistant, content, stopReason } })).toBeUndefined();
  }
});

it("filters persisted internal barrier calls/results from LLM context but retains ordinary calls", async () => {
  const hooks = installedPolicy();
  const barrier = { type: "toolCall", id: "capsule-barrier-persisted", name: SEQUENTIAL_TOOL, arguments: {} };
  const real = { type: "toolCall", id: "real-id", name: "first", arguments: { n: 1 } };
  const assistant = { role: "assistant", content: [barrier, { type: "text", text: "visible" }, real] };
  const barrierResult = { role: "toolResult", toolName: SEQUENTIAL_TOOL,
    toolCallId: barrier.id, content: [{ type: "text", text: "ok" }] };
  const realResult = { role: "toolResult", toolName: "first", toolCallId: real.id,
    content: [{ type: "text", text: "real result" }] };
  const orphanedBarrierResult = { ...barrierResult, toolCallId: "capsule-barrier-old-resume" };
  const other = { ...realResult, toolCallId: "capsule-barrier-other-tool" };
  const modelCall = { role: "assistant", content: [{ ...barrier, id: "model-generated" }] };
  const modelResult = { ...barrierResult, toolCallId: "model-generated" };
  const messages = [assistant, barrierResult, realResult, orphanedBarrierResult, other, modelCall, modelResult];
  const filtered = (await hooks.dispatch("context", { messages })).messages;
  expect(filtered).toEqual([{ ...assistant, content: assistant.content.slice(1) }, realResult, other, modelCall, modelResult]);
  expect(messages).toEqual([assistant, barrierResult, realResult, orphanedBarrierResult, other, modelCall, modelResult]);
  expect((await hooks.dispatch("context", { messages: filtered })).messages).toEqual(filtered);
});

it.each(["throw", "invalid", "unknown", "blocked", "structured", "success"])("serializes parallel ordinary tools after %s through the real Pi extension runner", async failure => {
  const root = mkdtempSync(join(tmpdir(), "capsule-hook-session-"));
  const executed: string[] = [];
  const errors: unknown[] = [];
  const contexts: any[][] = [];
  let active = 0, maxActive = 0;
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: root, settingsManager,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [pi => {
      installToolExecutionPolicy(pi);
      pi.on("tool_call", event => {
        if (event.toolCallId === "fail" && failure === "blocked") return { block: true, reason: "test block" };
      });
      for (const name of ["bash_exec", "tail"]) pi.registerTool({
        name, label: name, description: name, executionMode: "parallel",
        parameters: Type.Object({ n: Type.Number() }),
        async execute(id) {
          executed.push(id);
          maxActive = Math.max(maxActive, ++active);
          await new Promise(resolve => setTimeout(resolve, 2));
          active--;
          if (id === "fail" && failure === "throw") throw Error("test failure");
          return { content: [{ type: "text", text: "ok" }], details: { outcome: { exit_code: id === "fail" && failure === "structured" ? 1 : 0 } } };
        },
      });
    }],
  });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await loader.reload();
    const created = await createAgentSession({
      cwd: root, agentDir: root, resourceLoader: loader, settingsManager,
      sessionManager: SessionManager.inMemory(root), tools: ["bash_exec", "tail", SEQUENTIAL_TOOL],
      model: { id: "test", provider: "test", api: "test", contextWindow: 100000 } as any,
    });
    session = created.session;
    expect(created.extensionsResult.errors).toEqual([]);
    await session.bindExtensions({ onError: error => { errors.push(error); } });
    session.agent.toolExecution = "parallel";
    let turn = 0;
    session.agent.streamFunction = ((_model: any, context: any) => {
      contexts.push(structuredClone(context.messages));
      const call = (id: string, name: string, n: unknown = 1) => ({ type: "toolCall", id, name, arguments: { n } });
      const content = turn++ === 0
        ? [call("fail", failure === "unknown" ? "missing" : "bash_exec", failure === "invalid" ? "bad" : 1), call("skip", "tail")]
        : turn === 2 ? [call("retry", "tail")] : [{ type: "text", text: "done" }];
      const message = { role: "assistant", content, stopReason: turn <= 2 ? "toolUse" : "stop", timestamp: Date.now(),
        api: "test", provider: "test", model: "test",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      return { async *[Symbol.asyncIterator]() { yield { type: "done", message }; }, result: async () => message };
    }) as any;
    // Bypass provider authentication, but retain the real session event and tool hooks.
    await session.agent.prompt("test");
    const results = session.agent.state.messages.filter(message => message.role === "toolResult");
    const barriers = results.filter(message => message.toolName === SEQUENTIAL_TOOL);
    expect(barriers).toHaveLength(2);
    expect(barriers.every(message => message.toolCallId.startsWith("capsule-barrier-") && !message.isError)).toBe(true);
    expect(results.map(message => message.toolName)).toEqual([
      SEQUENTIAL_TOOL, failure === "unknown" ? "missing" : "bash_exec", "tail", SEQUENTIAL_TOOL, "tail",
    ]);
    const realResults = results.filter(message => message.toolName !== SEQUENTIAL_TOOL);
    expect(realResults.map(message => message.toolCallId)).toEqual(["fail", "skip", "retry"]);
    expect(realResults.map(message => message.isError)).toEqual(failure === "success"
      ? [false, false, false] : [true, true, false]);
    if (failure === "success") expect(executed).toEqual(["fail", "skip", "retry"]);
    else {
      expect(realResults[1]!.content).toEqual([{ type: "text", text: expect.stringContaining("Skipped: earlier tool call fail failed") }]);
      expect(executed).not.toContain("skip");
    }
    expect(executed).toContain("retry");
    expect(maxActive).toBe(1);
    expect(contexts).toHaveLength(3); // Text-only final does not request another turn.
    expect(contexts[1]!.filter(message => message.role === "toolResult").map(message => message.toolCallId))
      .toEqual(["fail", "skip"]);
    expect(contexts[2]!.filter(message => message.role === "toolResult").map(message => message.toolCallId))
      .toEqual(["fail", "skip", "retry"]);
    for (const context of contexts) {
      expect(context.flatMap(message => message.role === "assistant" ? message.content : [])
        .some((block: any) => block.type === "toolCall" && block.name === SEQUENTIAL_TOOL)).toBe(false);
      expect(context.some(message => message.role === "toolResult" && message.toolName === SEQUENTIAL_TOOL)).toBe(false);
    }
    const stateAssistants = session.agent.state.messages.filter(message => message.role === "assistant");
    expect(stateAssistants.map(message => message.content.filter(block => block.type === "toolCall" && block.name === SEQUENTIAL_TOOL).length))
      .toEqual([1, 1, 0]);
    expect(stateAssistants.at(-1)!.content).toEqual([{ type: "text", text: "done" }]);
    expect(contexts[1]!.find(message => message.role === "assistant")?.content.map((block: any) => block.id))
      .toEqual(["fail", "skip"]);
    expect(errors).toEqual([]);
  } finally {
    session?.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
