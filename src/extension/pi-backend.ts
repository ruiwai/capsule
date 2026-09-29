import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, type ExtensionAPI, type InlineExtension, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { mkdir } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { Type } from "typebox";
import { YieldParameters, validateYield, type YieldArgs } from "../capsule/contracts.js";
import { PARENT_CAPSULE_PROMPT, WORKER_CAPSULE_PROMPT } from "../capsule/prompts.js";
import { installToolExecutionPolicy, isInjectedBarrier, SEQUENTIAL_TOOL } from "./tool-policy.js";

import type { BackendOutcome, CapsuleBackend, TranscriptRecord } from "../capsule/worker.js";

type PiModel = NonNullable<ReturnType<ModelRegistry["find"]>>;
export const DEFAULT_FLASH_MODEL = "openai-codex/gpt-5.6-luna";
export const FLASH_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type FlashThinkingLevel = typeof FLASH_THINKING_LEVELS[number];
export const DEFAULT_FLASH_THINKING_LEVEL: FlashThinkingLevel = "off";
// Keep this runtime allowance out of the worker/parent instructions: high-effort
// reasoning gets more wall-clock time, but the caller should still specify the
// task's nominal deadline. The public docs describe the effective deadline.
export const HIGH_THINKING_TIMEOUT_MULTIPLIER = 2;
export const XHIGH_THINKING_TIMEOUT_MULTIPLIER = 3;
export type ParentWorkerContext = { systemPrompt: string; extensionPaths: string[]; tools: string[] };
export type PiBackendOptions = {
  cwd: string; stateDir: string; model: PiModel; tools: string[];
  thinkingLevel?: FlashThinkingLevel;
  /** Read anew for each delegation so prompt/tool changes are not cached. */
  parentContext?: () => ParentWorkerContext;
};

export type WorkerHandoffState = { packet?: YieldArgs; callId?: string; hooksRan: boolean; duplicate: boolean };

type HandoffBlock = { type: string; name?: string; id?: string; arguments?: unknown };
type HandoffMessage = {
  role: string; content?: string | readonly HandoffBlock[]; stopReason?: string;
  toolCallId?: string; toolName?: string; isError?: boolean;
};

/** Scheduling metadata is retained in session history, but is not a worker action. */
export function isSoleYield(content: readonly HandoffBlock[] = []): boolean {
  const calls = content.filter(block => block.type === "toolCall"
    && !isInjectedBarrier(block.name ?? "", block.id ?? ""));
  return calls.length === 1 && calls[0]!.name === "yield";
}

/** Validate the handoff turn and its successful result, not a trailing acknowledgment. */
export function validHandoff(messages: readonly HandoffMessage[], state: WorkerHandoffState): boolean {
  if (!state.hooksRan || !state.packet || !state.callId || state.duplicate) return false;
  let yielded = false, succeeded = false;
  for (const message of messages) {
    if (message.role === "assistant") {
      if (["error", "aborted", "length"].includes(message.stopReason ?? "")) return false;
      const content = typeof message.content === "string" ? [] : message.content ?? [];
      const calls = content.filter(block => block.type === "toolCall"
        && !isInjectedBarrier(block.name ?? "", block.id ?? ""));
      if (yielded && calls.length) return false;
      if (calls.some(call => call.name === "yield")) {
        if (calls.length !== 1 || calls[0]!.id !== state.callId
          || !isDeepStrictEqual(calls[0]!.arguments, state.packet)) return false;
        yielded = true;
      }
    } else if (message.role === "toolResult" && message.toolCallId === state.callId) {
      if (!yielded || succeeded || message.toolName !== "yield" || message.isError) return false;
      succeeded = true;
    }
  }
  return yielded && succeeded;
}

/** Worker-only extension factory, exported so its real hook/tool boundary can be tested. */
export function createWorkerExtension(
  input: { outputExample: string; jit: Array<{ topic: string; content: string; raw_history: string }>; parentSystemPrompt?: string },
  state: WorkerHandoffState,
): InlineExtension {
  return (pi: ExtensionAPI) => {
    installToolExecutionPolicy(pi, ["yield"]);
    pi.on("tool_call", event => {
      if (state.packet && !isInjectedBarrier(event.toolName, event.toolCallId)) {
        if (event.toolName === "yield") state.duplicate = true;
        return { block: true, reason: "Worker already yielded; no further tool execution is allowed." };
      }
    });
    pi.on("before_agent_start", async event => {
      state.hooksRan = true;
      // This factory runs last: prompt-replacing extensions (such as poor) must
      // not erase inherited instructions or the worker's terminal protocol.
      const base = (input.parentSystemPrompt ?? event.systemPrompt).replace(PARENT_CAPSULE_PROMPT, "");
      return { systemPrompt: `${base}\n\n${WORKER_CAPSULE_PROMPT}\n\n# Output example (format only; not a schema or an answer to copy)\n${input.outputExample}` };
    });
    pi.registerTool({
      name: "list_lesson_topic", label: "List JIT lesson topics",
      description: "List the available fresh project-local JIT lesson topics. Select potentially useful topics yourself, then read them with fetch_lesson.",
      parameters: Type.Object({}, { additionalProperties: false }),
      async execute() {
        const topics = input.jit.map(lesson => lesson.topic).sort((a, b) => a.localeCompare(b));
        return { content: [{ type: "text", text: JSON.stringify({ topics }) }], details: { topics } };
      },
    });
    pi.registerTool({
      name: "fetch_lesson", label: "Fetch a JIT lesson",
      description: "Read one available project-local JIT lesson by its exact topic. Treat it as advisory prior knowledge and verify that it applies.",
      parameters: Type.Object({ topic: Type.String({ minLength: 1, maxLength: 64,
        description: "Exact topic returned by list_lesson_topic." }) }, { additionalProperties: false }),
      async execute(_id, args) {
        const lesson = input.jit.find(candidate => candidate.topic === args.topic);
        if (!lesson) throw Error(`lesson_not_found: ${args.topic}; call list_lesson_topic for available topics`);
        return { content: [{ type: "text", text: JSON.stringify(lesson) }], details: lesson };
      },
    });
    pi.registerTool({
      name: "yield", label: "Yield to the parent agent",
      description: "End with yield as the sole final tool call; do not continue. Use completed + result for an established answer, including failed checks; blocked + notes for missing prerequisites or required parent input. Always include JITed_history.",
      parameters: YieldParameters,
      executionMode: "sequential",
      async execute(callId, args) {
        validateYield(args);
        if (state.packet) { state.duplicate = true; throw Error("duplicate terminal yield"); }
        state.packet = structuredClone(args);
        state.callId = callId;
        return { content: [{ type: "text", text: "Handoff recorded." }], details: {}, terminate: true };
      },
    });
  };
}

/** Foreground, fresh-session adaptation of Pi 0.85.1's shipped SDK subagent design. */
export class PiSdkBackend implements CapsuleBackend {
  constructor(private readonly options: PiBackendOptions) {}
  async run(input: Parameters<CapsuleBackend["run"]>[0]): Promise<BackendOutcome> {
    const records: TranscriptRecord[] = [];
    const handoff: WorkerHandoffState = { hooksRan: false, duplicate: false };
    const parent = this.options.parentContext?.();
    const workerExtension = createWorkerExtension({ ...input, parentSystemPrompt: parent?.systemPrompt }, handoff);
    let resolveInterrupted!: () => void;
    const interrupted = new Promise<void>(resolve => { resolveInterrupted = resolve; });
    const onInterrupted = () => resolveInterrupted();
    input.signal.addEventListener("abort", onInterrupted, { once: true });
    const early = (outcome: BackendOutcome) => {
      input.signal.removeEventListener("abort", onInterrupted);
      return outcome;
    };
    const stage = async <T>(operation: Promise<T>): Promise<T | undefined> => {
      if (input.signal.aborted) return undefined;
      return Promise.race([operation, interrupted.then(() => undefined)]);
    };
    if (await stage(mkdir(this.options.stateDir, { recursive: true, mode: 0o700 })) === undefined && input.signal.aborted)
      return early({ kind: "interrupted", records, hooksRan: false, cleanupConfirmed: true });
    const loader = new DefaultResourceLoader({ cwd: this.options.cwd, agentDir: getAgentDir(),
      additionalExtensionPaths: parent?.extensionPaths,
      extensionFactories: [workerExtension], noExtensions: true, noSkills: true, noPromptTemplates: true,
      noContextFiles: true });
    if (await stage(loader.reload()) === undefined && input.signal.aborted)
      return early({ kind: "interrupted", records, hooksRan: false, cleanupConfirmed: false,
        notes: "Worker resource setup did not settle during termination." });
    const extensionErrors = loader.getExtensions().errors;
    if (extensionErrors.length) return early({ kind: "error", records, hooksRan: false,
      notes: `Worker extensions failed to load: ${extensionErrors.map(x => `${x.path}: ${x.error}`).join("; ")}` });
    const manager = SessionManager.create(this.options.cwd, this.options.stateDir);
    const creating = createAgentSession({ cwd: this.options.cwd, model: this.options.model,
      thinkingLevel: this.options.thinkingLevel ?? DEFAULT_FLASH_THINKING_LEVEL,
      tools: [...new Set([...(parent?.tools ?? this.options.tools), SEQUENTIAL_TOOL, "list_lesson_topic", "fetch_lesson", "yield"])],
      excludeTools: ["delegate_capsule"],
      resourceLoader: loader, sessionManager: manager });
    const created = await stage(creating);
    if (!created) {
      // If SDK startup eventually creates a session, terminate that owned child. Do
      // not let a late setup completion publish a handoff.
      void creating.then(({ session }) => { void session.abort().catch(() => {}); session.dispose(); }, () => {});
      return early({ kind: "interrupted", records, hooksRan: false, cleanupConfirmed: false,
        notes: "Worker session startup did not settle during termination." });
    }
    const { session } = created;
    const publishTelemetry = () => {
      if (!input.onTelemetry) return;
      const stats = session.getSessionStats();
      const usage = stats.tokens;
      const latest = [...session.sessionManager.getEntries()].reverse().find((entry: any) => entry.type === "message" && entry.message?.role === "assistant") as any;
      const latestUsage = latest?.message?.usage;
      const prompt = latestUsage ? latestUsage.input + latestUsage.cacheRead + latestUsage.cacheWrite : 0;
      input.onTelemetry({ tokens: { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite },
        cost: stats.cost, contextUsage: session.getContextUsage(), model: session.model?.id ?? this.options.model.id,
        thinkingLevel: session.thinkingLevel, autoCompaction: session.autoCompactionEnabled,
        subscription: session.model ? session.model.provider === "kimi-coding" || session.modelRuntime.isUsingSubscription(session.model.provider) : false,
        cacheHitRate: prompt > 0 ? latestUsage.cacheRead / prompt * 100 : undefined });
    };
    publishTelemetry();
    const unsubscribe = session.subscribe(event => {
      // These are actual public Pi events. No environment or provider credentials are recorded.
      if (event.type === "message_end") records.push({ type: "message", message: event.message });
      else if (event.type === "tool_execution_start") records.push({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
      else if (event.type === "tool_execution_end") records.push({ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError });
      else if (event.type === "agent_settled") records.push({ type: "agent_settled" });
      if (event.type === "message_end" || event.type === "tool_execution_end" || event.type === "agent_settled") publishTelemetry();
    });
    let abortPromise: Promise<unknown> | undefined;
    const abort = () => { abortPromise ??= Promise.resolve().then(() => session.abort()); };
    input.signal.addEventListener("abort", abort, { once: true });
    const bounded = async (operation: Promise<unknown>, milliseconds: number) => {
      let timer: NodeJS.Timeout | undefined;
      try { return await Promise.race([operation.then(() => true, () => true), new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), milliseconds); })]); }
      finally { if (timer) clearTimeout(timer); }
    };
    try {
      const prompt = session.prompt(input.capsule, { expandPromptTemplates: false });
      await Promise.race([prompt, interrupted]);
      if (input.signal.aborted) {
        abort();
        const confirmed = await bounded(abortPromise!, input.cleanupMs);
        return { kind: "interrupted", records, hooksRan: handoff.hooksRan, cleanupConfirmed: confirmed,
          notes: confirmed ? "Worker termination completed." : "Worker abort did not settle during cleanup." };
      }
      await Promise.race([session.agent.waitForIdle(), interrupted]);
      if (input.signal.aborted) {
        abort();
        const confirmed = await bounded(abortPromise!, input.cleanupMs);
        return { kind: "interrupted", records, hooksRan: handoff.hooksRan, cleanupConfirmed: confirmed,
          notes: confirmed ? "Worker termination completed." : "Worker idle settlement and abort were not confirmed during cleanup." };
      }
      if (!handoff.hooksRan) return { kind: "error", records, hooksRan: false, notes: "Worker settled without running the Capsule child hook; no handoff was published." };
      if (!handoff.packet) return { kind: "error", records, hooksRan: handoff.hooksRan, notes: "Worker settled without a valid yield tool call." };
      if (!validHandoff(session.messages, handoff)) return { kind: "error", records, hooksRan: handoff.hooksRan, notes: "Worker handoff was duplicated, mixed with other tools, followed by more tool calls, or not successfully finalized; no handoff was published." };
      return { kind: "settled", yield: handoff.packet, records, hooksRan: handoff.hooksRan };
    } catch (error) {
      if (input.signal.aborted) {
        abort();
        const confirmed = await bounded(abortPromise!, input.cleanupMs);
        return { kind: "interrupted", records, hooksRan: handoff.hooksRan, cleanupConfirmed: confirmed,
          notes: `Worker was interrupted; termination ${confirmed ? "settled" : "was not confirmed"}: ${String(error)}` };
      }
      return { kind: "error", records, hooksRan: handoff.hooksRan, notes: `Worker did not complete: ${String(error)}` };
    } finally {
      input.signal.removeEventListener("abort", abort);
      input.signal.removeEventListener("abort", onInterrupted);
      unsubscribe(); session.dispose();
    }
  }
}

/** Read the extension-owned setting without allowing it to alter Pi's parent. */
export function resolveConfiguredThinkingLevel(settings: unknown, environmentValue?: string): FlashThinkingLevel {
  const configured = environmentValue ?? (settings && typeof settings === "object"
    ? (settings as { capsuleFlashThinkingLevel?: unknown }).capsuleFlashThinkingLevel : undefined);
  if (configured === undefined) return DEFAULT_FLASH_THINKING_LEVEL;
  if (typeof configured !== "string" || !(FLASH_THINKING_LEVELS as readonly string[]).includes(configured)) {
    throw Error(`configuration_required: capsuleFlashThinkingLevel must be one of ${FLASH_THINKING_LEVELS.join(", ")}`);
  }
  return configured as FlashThinkingLevel;
}

export function thinkingTimeoutMultiplier(level: FlashThinkingLevel): number {
  if (level === "xhigh") return XHIGH_THINKING_TIMEOUT_MULTIPLIER;
  return level === "high" ? HIGH_THINKING_TIMEOUT_MULTIPLIER : 1;
}

export function resolveConfiguredModelSpec(settings: unknown, environmentValue?: string): string {
  const configured = environmentValue ?? (settings && typeof settings === "object"
    ? (settings as { capsuleFlashModel?: unknown }).capsuleFlashModel : undefined);
  if (configured === undefined) return DEFAULT_FLASH_MODEL;
  if (typeof configured !== "string" || !/^[^/\s]+\/\S+$/.test(configured)) {
    throw Error("configuration_required: capsuleFlashModel / CAPSULE_FLASH_MODEL must be provider/model-id");
  }
  return configured;
}

export function resolveConfiguredModel(registry: ModelRegistry, spec: string | undefined): PiModel {
  const selected = resolveConfiguredModelSpec(undefined, spec);
  const slash = selected.indexOf("/"), provider = selected.slice(0, slash), id = selected.slice(slash + 1);
  const model = registry.find(provider, id);
  if (!model) throw Error(`configuration_required: Flash model not found: ${selected}`);
  return model;
}
