import { SettingsManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isAbsolute } from "node:path";
import { DelegateCapsuleParameters, MAX_TIMER_MS, type DelegateCapsuleResult } from "../capsule/contracts.js";
import { DEFAULT_FLASH_MODEL, PiSdkBackend, resolveConfiguredModel, resolveConfiguredThinkingLevel } from "../capsule/backend.js";
import { CapsuleService } from "../capsule/service.js";
import { capsuleRenderers } from "./renderer.js";
import { DELEGATE_CAPSULE_DESCRIPTION, PARENT_CAPSULE_PROMPT } from "../capsule/prompts.js";
import { installCapsuleFooter, type FlashTelemetry } from "./footer.js";
import { captureParentContext } from "./parent-context.js";

export default function capsuleExtension(pi: ExtensionAPI) {
  let service: CapsuleService | undefined;
  let workerIdentity: { workerProvider: string; workerModel: string } | undefined;
  let workerTelemetry: FlashTelemetry | undefined;
  let workerState = "idle";
  let requestFooterRender: (() => void) | undefined;
  let sessionGeneration = 0;
  const flashModel = () => workerIdentity
    ? `${workerIdentity.workerProvider}/${workerIdentity.workerModel}`
    : (process.env.CAPSULE_FLASH_MODEL || DEFAULT_FLASH_MODEL);
  const showFlashStatus = (ctx: ExtensionContext, state: string) => {
    workerState = state;
    // TUI uses the custom footer; other UI modes use a status row.
    if (ctx.hasUI && ctx.mode !== "tui") {
      ctx.ui.setStatus("capsule.flash", `Flash: ${state} · ${flashModel()}`);
    }
    requestFooterRender?.();
  };
  pi.on("session_start", async (_event, ctx) => {
    // A replacement session must not inherit the previous worker's row or identity.
    sessionGeneration++;
    service = undefined;
    workerTelemetry = undefined;
    workerIdentity = undefined;
    requestFooterRender = undefined;
    showFlashStatus(ctx, "idle");
    installCapsuleFooter(ctx, () => workerTelemetry, render => { requestFooterRender = render; }, flashModel, () => workerState);
  });
  pi.on("before_agent_start", async event => ({
    systemPrompt: `${event.systemPrompt}\n\n${PARENT_CAPSULE_PROMPT}`,
  }));
  pi.registerTool({
    name: "delegate_capsule", label: "Delegate capsule to Flash",
    description: DELEGATE_CAPSULE_DESCRIPTION,
    parameters: DelegateCapsuleParameters,
    async execute(_id, args, signal, _update, ctx) {
      showFlashStatus(ctx, "starting");
      workerTelemetry = undefined;
      try {
        if (!service) {
          // A failed setup must not leave the previous worker's identity on its
          // fallback result.
          workerIdentity = undefined;
          const model = resolveConfiguredModel(ctx.modelRegistry, process.env.CAPSULE_FLASH_MODEL);
          const toolOverride = process.env.CAPSULE_FLASH_TOOLS?.split(",").map(x => x.trim()).filter(Boolean);
          const settings = SettingsManager.create(ctx.cwd);
          const projectSettings = settings.getProjectSettings() as Record<string, unknown>;
          const globalSettings = settings.getGlobalSettings() as Record<string, unknown>;
          const thinkingLevel = resolveConfiguredThinkingLevel(
            { ...globalSettings, ...projectSettings }, process.env.CAPSULE_FLASH_THINKING_LEVEL);
          workerIdentity = { workerProvider: model.provider, workerModel: model.id };
          const stateRoot = process.env.CAPSULE_STATE_DIR;
          if (stateRoot && !isAbsolute(stateRoot)) throw Error("configuration_required: CAPSULE_STATE_DIR must be absolute");
          const timeoutMs = Number(process.env.CAPSULE_FLASH_TIMEOUT_MS ?? 300_000);
          if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS) throw Error("configuration_required: CAPSULE_FLASH_TIMEOUT_MS must be a representable positive integer");
          const backend = new PiSdkBackend({ cwd: ctx.cwd, stateDir: stateRoot ? `${stateRoot}/worker-sessions` : `${ctx.cwd}/.pi/capsule/worker-sessions`,
            model, thinkingLevel, tools: toolOverride ?? [], parentContext: () => captureParentContext(pi, ctx, toolOverride) });
          const generation = sessionGeneration;
          service = new CapsuleService(backend, { projectRoot: ctx.cwd, stateRoot, timeoutMs,
            onTelemetry: telemetry => {
              if (generation !== sessionGeneration) return;
              workerTelemetry = telemetry;
              requestFooterRender?.();
            } });
        }
        showFlashStatus(ctx, "running");
        const value = await service.delegate(args, signal);
        showFlashStatus(ctx, value.status);
        return { content: [{ type: "text", text: JSON.stringify(value) }], details: { ...value, capsuleUi: workerIdentity } };
      } catch (error) {
        if ((error as any)?.name === "AbortError" || signal?.aborted) {
          showFlashStatus(ctx, "cancelled");
          throw error;
        }
        showFlashStatus(ctx, "error");
        const value: DelegateCapsuleResult = { status: "error", notes: `Capsule setup failed before a result was established. Correct the configuration or runtime error and retry: ${String(error)}` };
        return { content: [{ type: "text", text: JSON.stringify(value) }], details: { ...value, capsuleUi: workerIdentity } };
      }
    },
    ...capsuleRenderers(flashModel),
  });
}
