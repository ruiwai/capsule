import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, type ExtensionAPI, type InlineExtension, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { mkdir } from "node:fs/promises";
import { YieldParameters, validateYield, type YieldArgs } from "../capsule/contracts.js";
import { PARENT_CAPSULE_PROMPT, WORKER_CAPSULE_PROMPT } from "../capsule/prompts.js";

import type { BackendOutcome, CapsuleBackend, TranscriptRecord } from "../capsule/worker.js";

type PiModel = NonNullable<ReturnType<ModelRegistry["find"]>>;
export const DEFAULT_FLASH_MODEL = "openai-codex/gpt-5.6-luna";
export const FLASH_THINKING_LEVELS = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
export type FlashThinkingLevel = typeof FLASH_THINKING_LEVELS[number];
export const DEFAULT_FLASH_THINKING_LEVEL: FlashThinkingLevel = "off";
export type ParentWorkerContext = { systemPrompt: string; extensionPaths: string[]; tools: string[] };
export type PiBackendOptions = {
  cwd: string; stateDir: string; model: PiModel; tools: string[];
  thinkingLevel?: FlashThinkingLevel;
  /** Read anew for each delegation so prompt/tool changes are not cached. */
  parentContext?: () => ParentWorkerContext;
};

export type WorkerHandoffState = { packet?: YieldArgs; hooksRan: boolean; duplicate: boolean };

/** Worker-only extension factory, exported so its real hook/tool boundary can be tested. */
export function createWorkerExtension(
  input: { outputExample: string; jit: Array<{ topic: string; content: string; raw_history: string }>; parentSystemPrompt?: string },
  state: WorkerHandoffState,
): InlineExtension {
  return (pi: ExtensionAPI) => {
    pi.on("before_agent_start", async event => {
      state.hooksRan = true;
      const lessons = input.jit.length
        ? input.jit.map(x => `### ${x.topic}\n${x.content}\nProvenance: ${x.raw_history}`).join("\n\n")
        : "(none selected)";
      // This factory runs last: prompt-replacing extensions (such as poor) must
      // not erase inherited instructions or the worker's terminal protocol.
      const base = (input.parentSystemPrompt ?? event.systemPrompt).replace(PARENT_CAPSULE_PROMPT, "");
      return { systemPrompt: `${base}\n\n${WORKER_CAPSULE_PROMPT}\n\n# Output example (format only; not a schema or an answer to copy)\n${input.outputExample}\n\n# Selected project JIT knowledge (verify applicability)\n${lessons}` };
    });
    pi.registerTool({
      name: "yield", label: "Yield to the parent agent",
      description: "End with yield as the sole final tool call; do not continue. Use completed + result for an established answer, including failed checks; blocked + notes for missing prerequisites or required parent input. Always include JITed_history.",
      parameters: YieldParameters,
      async execute(_id, args) {
        validateYield(args);
        if (state.packet) { state.duplicate = true; throw Error("duplicate terminal yield"); }
        state.packet = structuredClone(args);
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
      tools: [...(parent?.tools ?? this.options.tools), "yield"], excludeTools: ["delegate_capsule"],
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
      const assistants = session.messages.filter((m: any) => m.role === "assistant");
      const last: any = assistants.at(-1);
      const calls = (last?.content ?? []).filter((p: any) => p.type === "toolCall");
      const soleYield = calls.length === 1 && calls[0].name === "yield";
      if (!handoff.hooksRan) return { kind: "error", records, hooksRan: false, notes: "Worker settled without running the Capsule child hook; no handoff was published." };
      if (handoff.duplicate || handoff.packet && !soleYield) return { kind: "error", records, hooksRan: handoff.hooksRan, notes: "Worker yield was duplicated or mixed with other final tool calls; no handoff was published." };
      if (!handoff.packet) return { kind: "error", records, hooksRan: handoff.hooksRan, notes: "Worker settled without a valid yield tool call." };
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

export function resolveConfiguredModel(registry: ModelRegistry, spec: string | undefined): PiModel {
  const selected = spec ?? DEFAULT_FLASH_MODEL;
  if (!selected.includes("/")) throw Error("configuration_required: CAPSULE_FLASH_MODEL must be provider/model-id");
  const slash = selected.indexOf("/"), provider = selected.slice(0, slash), id = selected.slice(slash + 1);
  const model = registry.find(provider, id);
  if (!model) throw Error(`configuration_required: Flash model not found: ${selected}`);
  return model;
}
