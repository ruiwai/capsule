import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { readFile, mkdir, appendFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { sha256 } from "../contracts/identity.js";
import { compileCapsule } from "../context/compile.js";
import { validateTaskRequest } from "../contracts/validate.js";
import { Controller } from "../controller/controller.js";
import { defaultRegistry } from "../recipes/registry.js";
import { compileRecipe } from "../recipes/compile.js";

type Config = { stateRoot: string; policy: any };
async function configuration(): Promise<Config> {
  const file = process.env.CAPSULE_OPERATOR_CONFIG;
  if (!file) throw new Error("configuration_required: set CAPSULE_OPERATOR_CONFIG");
  let value: any; try { value = JSON.parse(await readFile(resolve(file), "utf8")); } catch { throw new Error(`configuration_required: cannot read ${file}`); }
  if (!value.stateRoot || !value.policy) throw new Error("configuration_required: stateRoot and policy are required");
  return { stateRoot: resolve(value.stateRoot), policy: value.policy };
}
export default function capsuleExtension(pi: ExtensionAPI) {
  pi.registerTool(({ name: "delegate_episode", label: "Delegate capsule", description: "Admit and execute a registry recipe from an immutable task request", parameters: Type.Object({ request: Type.String() }), async execute(_id: string, p: any) {
    try { const cfg = await configuration(); const request = JSON.parse(await readFile(resolve(p.request), "utf8")); validateTaskRequest(request); const registry = defaultRegistry(); const capsule = compileCapsule(request, cfg.policy, { id: "operator-snapshot", digest: sha256(JSON.stringify(request.workspace)) }, registry.digests()); const controller = new Controller(capsule, cfg.stateRoot); await controller.init(); const recipeId = String((request as any).recipeId ?? "project.inspect"); const recipe = registry.get(recipeId); const params = (request as any).recipeParams; if (!params || typeof params.target !== "string") throw new Error("invalid_contract: typed recipeParams.target required"); const spec = compileRecipe(recipe, { projectRoot: String(request.workspace.projectRoot), ...params }); const receipt = await controller.action(request.clientRequestId, recipe, { ...spec, timeoutMs: recipe.maximumMs }, { unitId: request.acceptanceUnit.id }); return { content: [{ type: "text", text: JSON.stringify(receipt) }], details: { status: "completed", receipt } }; } catch (e) { return { content: [{ type: "text", text: String(e) }], details: { status: "rejected", actionable: true } }; }
  }} as any));
  pi.registerTool(({ name: "read_evidence", label: "Read capsule evidence", description: "Retrieve a digest-bound evidence range", parameters: Type.Object({ taskId: Type.String(), digest: Type.String(), start: Type.Optional(Type.Number()), end: Type.Optional(Type.Number()) }), async execute(_id: string, p: any) {
    try { const cfg = await configuration(); const path = join(resolve(cfg.stateRoot), p.taskId, "evidence", p.digest); const bytes = await readFile(path); if (sha256(bytes) !== p.digest) throw new Error("evidence_integrity: digest mismatch"); return { content: [{ type: "text", text: bytes.subarray(p.start ?? 0, p.end).toString() }], details: { sha256: p.digest, bytes: bytes.length } }; } catch (e) { return { content: [{ type: "text", text: String(e) }], details: { status: "rejected" } }; }
  }} as any));
  pi.registerTool({ name: "decide_episode", label: "Decide capsule", description: "Persist a scoped supervisor decision", parameters: Type.Object({ reportId: Type.String(), decision: Type.Union([Type.Literal("accept"), Type.Literal("reject"), Type.Literal("request_revision")]), rationale: Type.String() }), execute: async (_id, p) => {
    try { const cfg = await configuration(); if (!p.rationale.trim()) throw new Error("invalid_contract: rationale required"); const path = join(resolve(cfg.stateRoot), "decisions.jsonl"); await mkdir(resolve(cfg.stateRoot), { recursive: true }); const decision = { ...p, at: new Date().toISOString() }; await appendFile(path, JSON.stringify(decision) + "\n"); return { content: [{ type: "text", text: JSON.stringify(decision) }], details: { recorded: true } }; } catch (e) { return { content: [{ type: "text", text: String(e) }], details: { recorded: false } }; }
  }});
}
