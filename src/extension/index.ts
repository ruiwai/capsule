import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { ScriptedService } from "../controller/scripted.js";
import { object, text } from "../controller/scripted-contract.js";

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
export default function capsuleExtension(pi: ExtensionAPI) {
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
