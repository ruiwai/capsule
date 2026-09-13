import { SettingsManager, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isAbsolute } from "node:path";
import { ScriptedService } from "../controller/scripted.js";
import { object, text } from "../controller/scripted-contract.js";
import { DelegateCapsuleParameters, MAX_TIMER_MS, type DelegateCapsuleResult } from "../capsule/contracts.js";
import { DEFAULT_FLASH_MODEL, PiSdkBackend, resolveConfiguredModel, resolveConfiguredThinkingLevel } from "../capsule/backend.js";
import { CapsuleService } from "../capsule/service.js";
import { capsuleRenderers } from "./renderer.js";
import { DELEGATE_CAPSULE_DESCRIPTION, PARENT_CAPSULE_PROMPT } from "../capsule/prompts.js";
import { installCapsuleFooter, type FlashTelemetry } from "./footer.js";
import { captureParentContext } from "./parent-context.js";

/** Both adapters use this boundary; caller identity comes only from trusted
 * operator configuration, never from a model-supplied issuer field. */
export async function publicCall(name: string, p: any, signal?: AbortSignal) {
  if (!["delegate_episode", "read_evidence", "decide_episode"].includes(name)) {
    throw Error("unsupported public operation");
  }
  if (name === "delegate_episode") object(p, ["request"]);
  if (name === "read_evidence") {
    const optional = ["start", "end"].filter(key =>
      p !== null && typeof p === "object" && Object.hasOwn(p, key));
    object(p, ["taskId", "executionId", "stream", ...optional]);
    [p.taskId, p.executionId, p.stream].forEach(text);
  }
  const path = process.env.CAPSULE_OPERATOR_CONFIG;
  if (!path) throw Error("configuration_required: CAPSULE_OPERATOR_CONFIG");
  const service = new ScriptedService(path);
  try {
    if (name === "delegate_episode") return await service.runRequest(p.request, signal);
    if (name === "read_evidence") return await service.evidence(p.taskId, p.executionId, p.stream, p.start, p.end);
    if (name === "decide_episode") return service.decide(p);
    throw Error("unsupported public operation");
  } finally { service.close(); }
}

/** Legacy scripted extension entrypoint, kept separate with its closed contract. */
export function scriptedExtension(pi: ExtensionAPI) {
  const tools = [
    { name: "delegate_episode", parameters: Type.Object({ request: Type.Unknown() }, { additionalProperties: false }) },
    { name: "read_evidence", parameters: Type.Object({ taskId: Type.String(), executionId: Type.String(), stream: Type.Union([Type.Literal("stdout"), Type.Literal("stderr")]), start: Type.Optional(Type.Integer({ minimum: 0 })), end: Type.Optional(Type.Integer({ minimum: 0 })) }, { additionalProperties: false }) },
    { name: "decide_episode", parameters: Type.Object({ taskId: Type.String(), episodeId: Type.String(), reportId: Type.String(), reportDigest: Type.String(), decisionId: Type.String(), acceptedUnits: Type.Array(Type.String()), decision: Type.Union([Type.Literal("accept"), Type.Literal("reject")]), rationale: Type.String() }, { additionalProperties: false }) },
  ];
  for (const tool of tools) pi.registerTool({ ...tool, label: tool.name, description: "Authorized durable scripted capsule service", async execute(_id: string, p: any, signal?: AbortSignal) {
    try { const value = await publicCall(tool.name, p, signal); return { content: [{ type: "text", text: JSON.stringify(value) }], details: { status: "completed", value } }; }
    catch (e) { return { content: [{ type: "text", text: String(e) }], details: { status: "rejected" } }; }
  } } as any);
}

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
    // The custom TUI footer owns the single Flash row. Keep the status fallback
    // only for other UI modes, and clear any status left by an earlier version.
    if (ctx.hasUI) ctx.ui.setStatus("capsule.flash", ctx.mode === "tui"
      ? undefined : `Flash: ${state} · ${flashModel()}`);
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
