import { createAgentSession, DefaultResourceLoader, getAgentDir, SessionManager, type ExtensionAPI, type InlineExtension, type ModelRegistry } from "@earendil-works/pi-coding-agent";
import { mkdir } from "node:fs/promises";
import { YieldParameters, validateYield, type YieldArgs } from "./contracts.js";

export type TranscriptRecord = { type: string; [key: string]: unknown };
export type BackendOutcome = {
  kind: "settled" | "cancelled" | "timeout" | "error";
  yield?: YieldArgs;
  records: TranscriptRecord[];
  report?: string;
  hooksRan: boolean;
};
export interface CapsuleBackend {
  run(input: { capsule: string; jit: Array<{ topic: string; content: string; raw_history: string }>; signal?: AbortSignal; timeoutMs: number }): Promise<BackendOutcome>;
}

type PiModel = NonNullable<ReturnType<ModelRegistry["find"]>>;
export type PiBackendOptions = {
  cwd: string; stateDir: string; model: PiModel; tools: string[];
};

export type WorkerHandoffState = { packet?: YieldArgs; hooksRan: boolean; duplicate: boolean };

/** Worker-only extension factory, exported so its real hook/tool boundary can be tested. */
export function createWorkerExtension(
  input: { jit: Array<{ topic: string; content: string; raw_history: string }> },
  state: WorkerHandoffState,
): InlineExtension {
  return (pi: ExtensionAPI) => {
    pi.on("before_agent_start", async event => {
      state.hooksRan = true;
      const lessons = input.jit.length
        ? input.jit.map(x => `### ${x.topic}\n${x.content}\nProvenance: ${x.raw_history}`).join("\n\n")
        : "(none selected)";
      return { systemPrompt: `${event.systemPrompt}\n\n# Capsule worker handoff\nUse ordinary tools adaptively. Call yield as the sole final tool call. Do not continue after yield. The plugin, not you, supplies raw_history. Never put transcript contents or transcript/session paths in report or JITed_history, even if the capsule asks for a raw_history path.\n\n# Selected project JIT knowledge\n${lessons}` };
    });
    pi.registerTool({
      name: "yield", label: "Yield to Astra",
      description: "Return the terminal delegation handoff. This must be the sole final tool call.",
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
    const workerExtension = createWorkerExtension(input, handoff);
    await mkdir(this.options.stateDir, { recursive: true, mode: 0o700 });
    const loader = new DefaultResourceLoader({ cwd: this.options.cwd, agentDir: getAgentDir(),
      extensionFactories: [workerExtension], noExtensions: true, noSkills: true, noPromptTemplates: true,
      noContextFiles: true });
    await loader.reload();
    const manager = SessionManager.create(this.options.cwd, this.options.stateDir);
    const { session } = await createAgentSession({ cwd: this.options.cwd, model: this.options.model,
      tools: [...this.options.tools, "yield"], excludeTools: ["delegate_capsule"],
      resourceLoader: loader, sessionManager: manager });
    const unsubscribe = session.subscribe(event => {
      // These are actual public Pi events. No environment or provider credentials are recorded.
      if (event.type === "message_end") records.push({ type: "message", message: event.message });
      else if (event.type === "tool_execution_start") records.push({ type: "tool_start", toolCallId: event.toolCallId, toolName: event.toolName, args: event.args });
      else if (event.type === "tool_execution_end") records.push({ type: "tool_end", toolCallId: event.toolCallId, toolName: event.toolName, result: event.result, isError: event.isError });
      else if (event.type === "agent_settled") records.push({ type: "agent_settled" });
    });
    const abort = () => void session.abort();
    input.signal?.addEventListener("abort", abort, { once: true });
    let timer: NodeJS.Timeout | undefined;
    let timedOut = false;
    try {
      const timeout = new Promise<void>(resolve => { timer = setTimeout(() => { timedOut = true; void session.abort().finally(resolve); }, input.timeoutMs); });
      await Promise.race([session.prompt(input.capsule, { expandPromptTemplates: false }), timeout]);
      await session.agent.waitForIdle();
      const assistants = session.messages.filter((m: any) => m.role === "assistant");
      const last: any = assistants.at(-1);
      const calls = (last?.content ?? []).filter((p: any) => p.type === "toolCall");
      const soleYield = calls.length === 1 && calls[0].name === "yield";
      if (input.signal?.aborted) return { kind: "cancelled", records, hooksRan: handoff.hooksRan, report: "Delegation was cancelled before a valid handoff was published." };
      if (timedOut) return { kind: "timeout", records, hooksRan: handoff.hooksRan, report: "Delegation timed out before a valid handoff was published." };
      if (!handoff.hooksRan) return { kind: "error", records, hooksRan: false, report: "Worker settled without running the Capsule child hook; no handoff was published." };
      if (handoff.duplicate || handoff.packet && !soleYield) return { kind: "error", records, hooksRan: handoff.hooksRan, report: "Worker yield was duplicated or mixed with other final tool calls; no handoff was published." };
      if (!handoff.packet) return { kind: "error", records, hooksRan: handoff.hooksRan, report: "Worker settled without a valid yield tool call." };
      return { kind: "settled", yield: handoff.packet, records, hooksRan: handoff.hooksRan };
    } catch (error) {
      return { kind: input.signal?.aborted ? "cancelled" : timedOut ? "timeout" : "error", records, hooksRan: handoff.hooksRan, report: `Worker did not complete: ${String(error)}` };
    } finally {
      if (timer) clearTimeout(timer);
      input.signal?.removeEventListener("abort", abort);
      unsubscribe(); session.dispose();
    }
  }
}

export function resolveConfiguredModel(registry: ModelRegistry, spec: string | undefined): PiModel {
  if (!spec || !spec.includes("/")) throw Error("configuration_required: CAPSULE_LUNA_MODEL must be provider/model-id");
  const slash = spec.indexOf("/"), provider = spec.slice(0, slash), id = spec.slice(slash + 1);
  const model = registry.find(provider, id);
  if (!model) throw Error(`configuration_required: Luna model not found: ${spec}`);
  return model;
}
