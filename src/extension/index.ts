import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { isAbsolute } from "node:path";
import { ScriptedService } from "../controller/scripted.js";
import { object, text } from "../controller/scripted-contract.js";
import { DelegateCapsuleParameters, MAX_TIMER_MS, type DelegateCapsuleResult } from "../capsule/contracts.js";
import { PiSdkBackend, resolveConfiguredModel } from "../capsule/backend.js";
import { CapsuleService } from "../capsule/service.js";

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
  pi.registerTool({
    name: "delegate_capsule", label: "Delegate capsule to Luna",
    description: "Run one foreground Luna delegation and return its compact terminal handoff.",
    parameters: DelegateCapsuleParameters,
    async execute(_id, args, signal, _update, ctx) {
      try {
        if (!service) {
          const model = resolveConfiguredModel(ctx.modelRegistry, process.env.CAPSULE_LUNA_MODEL);
          const tools = (process.env.CAPSULE_LUNA_TOOLS ?? "read,bash,edit,write").split(",").map(x => x.trim()).filter(Boolean);
          const stateRoot = process.env.CAPSULE_STATE_DIR;
          if (stateRoot && !isAbsolute(stateRoot)) throw Error("configuration_required: CAPSULE_STATE_DIR must be absolute");
          const timeoutMs = Number(process.env.CAPSULE_LUNA_TIMEOUT_MS ?? 300_000);
          if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > MAX_TIMER_MS) throw Error("configuration_required: CAPSULE_LUNA_TIMEOUT_MS must be a representable positive integer");
          const backend = new PiSdkBackend({ cwd: ctx.cwd, stateDir: stateRoot ? `${stateRoot}/worker-sessions` : `${ctx.cwd}/.pi/capsule/worker-sessions`, model, tools });
          service = new CapsuleService(backend, { projectRoot: ctx.cwd, stateRoot, timeoutMs });
        }
        const value = await service.delegate(args, signal);
        return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
      } catch (error) {
        if ((error as any)?.name === "AbortError" || signal?.aborted) throw error;
        const value: DelegateCapsuleResult = { status: "error", notes: `Capsule setup failed before a result was established. Correct the configuration or runtime error and retry: ${String(error)}` };
        return { content: [{ type: "text", text: JSON.stringify(value) }], details: value };
      }
    },
  });
}
