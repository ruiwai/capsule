import { ModelSelectorComponent, SettingsManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { DelegateCapsuleParameters, MAX_TIMER_MS, type DelegateCapsuleResult } from "../capsule/contracts.js";
import { DEFAULT_FLASH_MODEL, PiSdkBackend, resolveConfiguredModel, resolveConfiguredModelSpec, resolveConfiguredThinkingLevel, thinkingTimeoutMultiplier } from "./pi-backend.js";
import { CapsuleService } from "../capsule/service.js";
import { capsuleRenderers } from "./renderer.js";
import { DELEGATE_CAPSULE_DESCRIPTION, PARENT_CAPSULE_PROMPT } from "../capsule/prompts.js";
import { installCapsuleFooter } from "./footer.js";
import type { WorkerTelemetry } from "../capsule/worker.js";
import { captureParentContext } from "./parent-context.js";
import { installToolExecutionPolicy } from "./tool-policy.js";

const DEFAULT_CAPSULE_STATE_DIR = join(homedir(), ".pi", "agent", "capsule-sessions");

export default function capsuleExtension(pi: ExtensionAPI) {
  installToolExecutionPolicy(pi);
  let service: CapsuleService | undefined;
  let workerIdentity: { workerProvider: string; workerModel: string } | undefined;
  let workerTelemetry: WorkerTelemetry | undefined;
  let workerState = "idle";
  let requestFooterRender: (() => void) | undefined;
  let sessionGeneration = 0;
  let selectedFlashModel: string | undefined;
  let defaultFlashModel = DEFAULT_FLASH_MODEL;
  const flashModel = () => workerIdentity
    ? `${workerIdentity.workerProvider}/${workerIdentity.workerModel}`
    : (selectedFlashModel ?? process.env.CAPSULE_FLASH_MODEL ?? defaultFlashModel);
  const showFlashStatus = (ctx: ExtensionContext, state: string) => {
    workerState = state;
    // TUI uses the custom footer; other UI modes use a status row.
    if (ctx.hasUI && ctx.mode !== "tui") {
      ctx.ui.setStatus("capsule.flash", `Flash: ${state} · ${flashModel()}`);
    }
    requestFooterRender?.();
  };
  pi.registerCommand("flash", {
    description: "Select Flash's model (or /flash provider/model-id)",
    async handler(args, ctx) {
      const canChangeModel = () => {
        if (ctx.isIdle() && !service?.isActive) return true;
        ctx.ui.notify("Wait for the current operation and Flash cleanup to finish before changing Flash's model.", "warning");
        return false;
      };
      if (!canChangeModel()) {
        return;
      }
      const generation = sessionGeneration;
      try {
        let spec = args.trim();
        if (!spec) {
          if (!ctx.hasUI || ctx.mode !== "tui") {
            ctx.ui.notify(`Flash: ${flashModel()}. Use /flash provider/model-id.`, "info");
            return;
          }
          const registry = ctx.modelRegistry;
          // The built-in picker expects the internal ModelRuntime. Adapt only its
          // catalogue operations to the public extension registry (Pi 0.85.1).
          const runtime = {
            getAvailableSnapshot: () => registry.getAvailable(),
            getModel: (provider: string, id: string) => registry.find(provider, id),
            getError: () => registry.getError(),
            refresh: (options: Parameters<typeof registry.refresh>[0]) => registry.refresh(options),
          } satisfies Pick<ConstructorParameters<typeof ModelSelectorComponent>[2],
            "getAvailableSnapshot" | "getModel" | "getError" | "refresh">;
          const current = flashModel();
          const slash = current.indexOf("/");
          const model = await ctx.ui.custom<ReturnType<typeof registry.find>>((tui, _theme, _keys, done) =>
            new ModelSelectorComponent(tui, registry.find(current.slice(0, slash), current.slice(slash + 1)),
              runtime as unknown as ConstructorParameters<typeof ModelSelectorComponent>[2],
              ctx.scopedModels, done, () => done(undefined)));
          if (!model) return;
          spec = `${model.provider}/${model.id}`;
        }
        if (generation !== sessionGeneration || !canChangeModel()) return;
        const model = resolveConfiguredModel(ctx.modelRegistry, spec);
        selectedFlashModel = `${model.provider}/${model.id}`;
        service = undefined;
        workerIdentity = undefined;
        workerTelemetry = undefined;
        showFlashStatus(ctx, "idle");
        ctx.ui.notify(`Flash model: ${selectedFlashModel}`, "info");
      } catch (error) {
        ctx.ui.notify(String(error), "error");
      }
    },
  });
  pi.on("session_start", async (_event, ctx) => {
    // A replacement session must not inherit the previous worker's row or identity.
    sessionGeneration++;
    selectedFlashModel = undefined;
    service = undefined;
    workerTelemetry = undefined;
    workerIdentity = undefined;
    requestFooterRender = undefined;
    defaultFlashModel = DEFAULT_FLASH_MODEL;
    try {
      const settings = SettingsManager.create(ctx.cwd);
      defaultFlashModel = resolveConfiguredModelSpec(
        { ...settings.getGlobalSettings(), ...settings.getProjectSettings() }, process.env.CAPSULE_FLASH_MODEL);
    } catch (error) {
      if (ctx.hasUI) ctx.ui.notify(String(error), "error");
    }
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
    executionMode: "sequential",
    async execute(_id, args, signal, _update, ctx) {
      showFlashStatus(ctx, "starting");
      workerTelemetry = undefined;
      try {
        if (!service) {
          // A failed setup must not leave the previous worker's identity on its
          // fallback result.
          workerIdentity = undefined;
          const toolOverride = process.env.CAPSULE_FLASH_TOOLS?.split(",").map(x => x.trim()).filter(Boolean);
          const settings = SettingsManager.create(ctx.cwd);
          const flashSettings = { ...settings.getGlobalSettings(), ...settings.getProjectSettings() };
          const model = resolveConfiguredModel(ctx.modelRegistry, selectedFlashModel ?? resolveConfiguredModelSpec(
            flashSettings, process.env.CAPSULE_FLASH_MODEL));
          const thinkingLevel = resolveConfiguredThinkingLevel(
            flashSettings, process.env.CAPSULE_FLASH_THINKING_LEVEL);
          workerIdentity = { workerProvider: model.provider, workerModel: model.id };
          const configuredStateRoot = process.env.CAPSULE_STATE_DIR;
          if (configuredStateRoot && !isAbsolute(configuredStateRoot)) throw Error("configuration_required: CAPSULE_STATE_DIR must be absolute");
          // Persist across resumes, but never share lessons with another Pi session.
          const sessionId = ctx.sessionManager.getSessionId();
          if (!sessionId) throw Error("configuration_required: Capsule requires a Pi session ID");
          const stateRoot = join(
            configuredStateRoot || DEFAULT_CAPSULE_STATE_DIR,
            `session-${encodeURIComponent(sessionId)}`,
          );
          const timeoutMs = Number(process.env.CAPSULE_FLASH_TIMEOUT_MS ?? 300_000);
          if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS) throw Error("configuration_required: CAPSULE_FLASH_TIMEOUT_MS must be a representable positive integer");
          const backend = new PiSdkBackend({ cwd: ctx.cwd, stateDir: join(stateRoot, "worker-sessions"),
            model, thinkingLevel, tools: toolOverride ?? [], parentContext: () => captureParentContext(pi, ctx, toolOverride) });
          const generation = sessionGeneration;
          service = new CapsuleService(backend, { projectRoot: ctx.cwd, stateRoot, timeoutMs,
            timeoutMultiplier: thinkingTimeoutMultiplier(thinkingLevel),
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
