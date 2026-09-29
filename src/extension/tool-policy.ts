import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { Type } from "typebox";

export const SEQUENTIAL_TOOL = "capsule_sequential_barrier";
const BARRIER_ID_PREFIX = "capsule-barrier-";

export function isInjectedBarrier(name: string, id: string): boolean {
  return name === SEQUENTIAL_TOOL && id.startsWith(BARRIER_ID_PREFIX);
}

const renderHiddenBarrier = () => ({ render: () => [], invalidate() {} });

type ToolDetails = {
  outcome?: { exit_code?: number | null; signal?: string | null;
    timed_out?: boolean; descendant_cleanup_attempted?: boolean };
  status?: string;
};

// Only omit the barrier for tools the caller registers as sequential in this session.
export function installToolExecutionPolicy(pi: ExtensionAPI, sequentialTools: readonly string[] = ["delegate_capsule"]) {
  pi.registerTool({
    name: SEQUENTIAL_TOOL, label: "Capsule sequential barrier",
    description: "Internal Capsule scheduling no-op; do not call directly.",
    parameters: Type.Object({}), executionMode: "sequential",
    // Self framing avoids the default tool box and its surrounding padding.
    renderShell: "self",
    renderCall: renderHiddenBarrier,
    renderResult: renderHiddenBarrier,
    async execute() { return { content: [{ type: "text", text: "ok" }], details: {} }; },
  });
  let barrierUnavailable = false;
  const activate = () => {
    const tools = pi.getActiveTools();
    if (!tools.includes(SEQUENTIAL_TOOL)) pi.setActiveTools([...tools, SEQUENTIAL_TOOL]);
    barrierUnavailable = !pi.getActiveTools().includes(SEQUENTIAL_TOOL);
  };
  pi.on("session_start", activate);
  pi.on("before_agent_start", activate);
  pi.on("context", event => {
    // Filter persisted barriers too, so resume does not expose internal calls.
    return {
      messages: event.messages
        .filter(message => !(message.role === "toolResult"
          && isInjectedBarrier(message.toolName, message.toolCallId)))
        .map(message => message.role === "assistant" ? {
          ...message,
          content: message.content.filter(block => !(block.type === "toolCall"
            && isInjectedBarrier(block.name, block.id))),
        } : message),
    };
  });
  // Local to this extension/session, not shared with delegated workers.
  // This blocks tool bodies, not argument preparation or other extension hooks.
  // Pi serializes the entire batch when any called tool is sequential.
  let failedCall: string | undefined;
  pi.on("turn_start", () => { failedCall = undefined; });
  pi.on("message_end", event => {
    const message = event.message;
    if (message.role === "assistant" && message.stopReason !== "error"
      && message.stopReason !== "aborted" && message.stopReason !== "length"
      && message.content.some(block => block.type === "toolCall")
      && !message.content.some(block => block.type === "toolCall"
        && (block.name === SEQUENTIAL_TOOL || sequentialTools.includes(block.name)))) {
      // Already-sequential tools need no barrier. In particular a barrier would
      // prevent yield termination: Pi requires every result in a batch to terminate.
      // Prepend so the no-op completes before a real failure can latch blocking.
      // No injection into text-only replies: that would cause endless extra turns.
      return { message: { ...message, content: [{ type: "toolCall" as const,
        id: `${BARRIER_ID_PREFIX}${randomUUID()}`, name: SEQUENTIAL_TOOL, arguments: {} }, ...message.content] } };
    }
    // Unlike tool_result, finalized messages include validation failures,
    // missing tools, and calls blocked before execution.
    if (message.role === "toolResult" && message.isError) {
      failedCall ??= message.toolCallId;
    }
  });
  pi.on("tool_call", () => {
    if (barrierUnavailable) {
      return { block: true, reason: `Capsule requires ${SEQUENTIAL_TOOL} in the tool allowlist. Not executed.` };
    }
    if (failedCall !== undefined) {
      return { block: true, reason: `Skipped: earlier tool call ${failedCall} failed. Not executed; reassess before retrying.` };
    }
    return undefined;
  });
  // Structured negative outcomes are not thrown errors in these custom tools.
  pi.on("tool_result", event => {
    const details = event.details as ToolDetails | undefined;
    if (event.toolName === "bash_exec" && details?.outcome) {
      const outcome = details.outcome;
      if (outcome.exit_code !== 0 || outcome.signal != null || outcome.timed_out
        || outcome.descendant_cleanup_attempted) return { isError: true };
    }
    if (event.toolName === "delegate_capsule" && details?.status
      && details.status !== "completed") return { isError: true };
    return undefined;
  });
}
