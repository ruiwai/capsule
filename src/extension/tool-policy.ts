import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// Shared with the version-guarded SDK/CLI patch. Symbol.for crosses module
// copies loaded by Pi's extension loader. Loading Capsule opts this process in,
// including worker sessions; no environment variable leaks to child processes.
export const CAPSULE_SEQUENTIAL_TOOLS = Symbol.for("pi-capsule.sequential-tools");

type ToolDetails = {
  outcome?: { exit_code?: number | null; signal?: string | null;
    timed_out?: boolean; descendant_cleanup_attempted?: boolean };
  status?: string;
};

export function installToolExecutionPolicy(pi: ExtensionAPI) {
  (globalThis as Record<symbol, unknown>)[CAPSULE_SEQUENTIAL_TOOLS] = true;
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
