import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager } from "@earendil-works/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { createWorkerExtension, isSoleYield, validHandoff, type WorkerHandoffState } from "../src/extension/pi-backend.js";
import { SEQUENTIAL_TOOL } from "../src/extension/tool-policy.js";

const packet = { reason: "completed" as const, result: "answer", JITed_history: [] };
const yieldCall = { type: "toolCall" as const, id: "yield-1", name: "yield", arguments: packet };
const barrier = { type: "toolCall" as const, id: "capsule-barrier-test", name: SEQUENTIAL_TOOL, arguments: {} };
const text = { type: "text" as const, text: "acknowledged" };
const assistant = (content: Array<{ type: string; name?: string; id?: string }> = [yieldCall]) => ({ role: "assistant", stopReason: "toolUse", content });
const result = { role: "toolResult", toolName: "yield", toolCallId: yieldCall.id, isError: false,
  content: [{ type: "text", text: "Handoff recorded." }] };
const handoff = (): WorkerHandoffState => ({ packet, callId: yieldCall.id, hooksRan: true, duplicate: false });

type Handler = (event: any) => any;
function workerHooks(state: WorkerHandoffState = { hooksRan: false, duplicate: false }) {
  const handlers = new Map<string, Handler[]>();
  const tools = new Map<string, any>();
  let activeTools = ["yield", "bash_exec"];
  const pi = {
    registerTool(tool: any) { tools.set(tool.name, tool); },
    on(name: string, handler: Handler) {
      const callbacks = handlers.get(name) ?? [];
      callbacks.push(handler);
      handlers.set(name, callbacks);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools: (names: string[]) => { activeTools = [...names]; },
  } as any;
  const extension = createWorkerExtension({ outputExample: "answer", jit: [] }, state);
  (typeof extension === "function" ? extension : extension.factory)(pi);
  async function dispatch(name: string, event: any) {
    const responses = [];
    for (const handler of handlers.get(name) ?? []) responses.push(await handler(event));
    return responses;
  }
  return { state, handlers, tools, dispatch };
}

describe("final worker handoff", () => {
  it("leaves a sole yield unchanged in the worker message hook", async () => {
    const hooks = workerHooks();
    const message = assistant([text, yieldCall]);
    expect(hooks.handlers.get("message_end")).toHaveLength(1);
    expect(await hooks.dispatch("message_end", { message })).toEqual([undefined]);
    expect(message.content).toEqual([text, yieldCall]);
    expect(isSoleYield(message.content)).toBe(true);
  });

  it("recognizes only a single yield, ignoring injected scheduling metadata", () => {
    expect(isSoleYield([yieldCall])).toBe(true);
    expect(isSoleYield([barrier, text, yieldCall])).toBe(true);
    expect(isSoleYield([barrier, yieldCall, { ...yieldCall, id: "yield-2" }])).toBe(false);
    expect(isSoleYield([yieldCall, { type: "toolCall", id: "other", name: "bash_exec" }])).toBe(false);
    expect(isSoleYield([yieldCall, { ...barrier, id: "model-generated" }])).toBe(false);
    expect(isSoleYield([barrier])).toBe(false);
    expect(isSoleYield()).toBe(false);
  });

  it("accepts a successful yield with trailing text and an optional injected barrier", () => {
    expect(validHandoff([assistant(), result, assistant([text])], handoff())).toBe(true);
    expect(validHandoff([assistant([barrier, text, yieldCall]), result, assistant([text])], handoff())).toBe(true);
  });

  it("rejects duplicates, mixed ordinary calls, model-issued barriers, and later tool calls", () => {
    const other = { type: "toolCall", id: "other", name: "bash_exec", arguments: {} };
    for (const messages of [
      [assistant([yieldCall, { ...yieldCall, id: "yield-2" }]), result],
      [assistant([yieldCall, other]), result],
      [assistant([yieldCall, { ...barrier, id: "model-generated" }]), result],
      [assistant(), result, assistant([other])],
      [assistant(), result, assistant([{ ...yieldCall, id: "yield-2" }])],
    ]) expect(validHandoff(messages, handoff())).toBe(false);
    expect(validHandoff([assistant(), result], { ...handoff(), duplicate: true })).toBe(false);
  });

  it("requires the matching successful yield result and a recorded packet", () => {
    expect(validHandoff([assistant()], handoff())).toBe(false);
    expect(validHandoff([assistant(), { ...result, isError: true }], handoff())).toBe(false);
    expect(validHandoff([assistant(), { ...result, toolName: "bash_exec" }], handoff())).toBe(false);
    expect(validHandoff([assistant(), { ...result, toolCallId: "wrong" }], handoff())).toBe(false);
    expect(validHandoff([assistant([{ ...yieldCall, id: "wrong" }]), result], handoff())).toBe(false);
    expect(validHandoff([assistant(), result, result], handoff())).toBe(false);
    expect(validHandoff([result, assistant()], handoff())).toBe(false);
    expect(validHandoff([assistant(), result], { ...handoff(), callId: undefined })).toBe(false);
    expect(validHandoff([assistant(), result], { ...handoff(), packet: undefined })).toBe(false);
    expect(validHandoff([assistant(), result], { ...handoff(), hooksRan: false })).toBe(false);
    expect(validHandoff([assistant(), result], { ...handoff(), packet: { ...packet, result: "different" } })).toBe(false);
    for (const stopReason of ["error", "aborted", "length"]) {
      expect(validHandoff([assistant(), result, { ...assistant([text]), stopReason }], handoff())).toBe(false);
    }
  });

  it("blocks further real tool calls after a successful yield", async () => {
    const hooks = workerHooks();
    await hooks.dispatch("session_start", {});
    expect(hooks.handlers.get("tool_call")).toHaveLength(2);
    expect(await hooks.dispatch("tool_call", { toolName: "bash_exec", toolCallId: "before" }))
      .toEqual([undefined, undefined]);
    const executed = await hooks.tools.get("yield").execute(yieldCall.id, packet);
    expect(executed.terminate).toBe(true);
    expect(hooks.state).toMatchObject({ packet, callId: yieldCall.id, duplicate: false });
    expect(await hooks.dispatch("tool_call", { toolName: "bash_exec", toolCallId: "after" }))
      .toEqual([undefined, { block: true, reason: expect.stringContaining("already yielded") }]);
    expect(await hooks.dispatch("tool_call", { toolName: SEQUENTIAL_TOOL, toolCallId: barrier.id }))
      .toEqual([undefined, undefined]);
    expect(await hooks.dispatch("tool_call", { toolName: "yield", toolCallId: "yield-2" }))
      .toEqual([undefined, { block: true, reason: expect.stringContaining("already yielded") }]);
    expect(hooks.state.duplicate).toBe(true);
  });
});

it("terminates a real worker session after a sole yield without a barrier or second model request", async () => {
  const root = mkdtempSync(join(tmpdir(), "capsule-worker-handoff-"));
  const state: WorkerHandoffState = { hooksRan: false, duplicate: false };
  const errors: unknown[] = [];
  const settingsManager = SettingsManager.inMemory();
  const loader = new DefaultResourceLoader({
    cwd: root, agentDir: root, settingsManager,
    noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    extensionFactories: [createWorkerExtension({ outputExample: "answer", jit: [] }, state)],
  });
  let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
  try {
    await loader.reload();
    const created = await createAgentSession({
      cwd: root, agentDir: root, resourceLoader: loader, settingsManager,
      sessionManager: SessionManager.inMemory(root), tools: ["yield", SEQUENTIAL_TOOL],
      model: { id: "test", provider: "test", api: "test", contextWindow: 100000 } as any,
    });
    session = created.session;
    expect(created.extensionsResult.errors).toEqual([]);
    await session.bindExtensions({ onError: error => { errors.push(error); } });
    // The model stream is stubbed; bypass only the SDK prompt's auth preflight.
    session.modelRuntime.hasConfiguredAuth = () => true;
    let requests = 0;
    session.agent.streamFunction = ((_model: any, _context: any) => {
      requests++;
      const message = { role: "assistant", content: requests === 1 ? [yieldCall] : [text],
        stopReason: requests === 1 ? "toolUse" : "stop", timestamp: Date.now(),
        api: "test", provider: "test", model: "test",
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      return { async *[Symbol.asyncIterator]() { yield { type: "done", message }; }, result: async () => message };
    }) as any;
    // Stub the model, but exercise the real SDK runner, extension hooks, and tool result.
    await session.prompt("test", { expandPromptTemplates: false });
    expect(requests).toBe(1);
    expect(session.agent.state.messages.filter(message => message.role === "assistant")
      .map(message => message.content)).toEqual([[yieldCall]]);
    expect(session.agent.state.messages.filter(message => message.role === "toolResult")
      .map(message => ({ name: message.toolName, id: message.toolCallId, error: message.isError })))
      .toEqual([{ name: "yield", id: yieldCall.id, error: false }]);
    expect(session.agent.state.messages.some(message => message.role === "toolResult" && message.toolName === SEQUENTIAL_TOOL)).toBe(false);
    expect(state).toMatchObject({ hooksRan: true, packet, callId: yieldCall.id, duplicate: false });
    expect(validHandoff(session.messages, state)).toBe(true);
    expect(errors).toEqual([]);
  } finally {
    session?.dispose();
    rmSync(root, { recursive: true, force: true });
  }
});
