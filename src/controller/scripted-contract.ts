import { canonicalJson, sha256 } from "../contracts/identity.js";

export function object(value: any, keys: string[]): asserts value is Record<string, any> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k => !keys.includes(k)) || keys.some(k => !(k in value))) throw Error("invalid_contract: exact object fields required");
}
export function text(value: any): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 8192) throw Error("invalid_contract: string");
}
export function names(value: any): asserts value is string[] {
  if (!Array.isArray(value)) throw Error("invalid_contract: array");
  value.forEach(text);
  if (new Set(value).size !== value.length) throw Error("invalid_contract: duplicate");
}
export function relativePath(value: any): asserts value is string {
  text(value);
  if (value.startsWith("/") || value.includes("\\") || value.split("/").some((p: string) => !p || p === "." || p === "..") || value.includes("\0")) throw Error("invalid_contract: relative path");
}
export const capabilityNames = ["environmentCreate", "lockedSync", "fhsEntry", "directLoader", "nixRealization", "downloads"] as const;
export type Budget = { wallMs: number; reportReserveMs: number; commandMsTotal: number; perCommandMs: number; maxToolActions: number; evidenceBytes: number };
export function budget(value: any): asserts value is Budget {
  object(value, ["wallMs", "reportReserveMs", "commandMsTotal", "perCommandMs", "maxToolActions", "evidenceBytes"]);
  for (const n of Object.values(value)) if (!Number.isSafeInteger(n) || n <= 0) throw Error("invalid_contract: positive budget");
  if (value.reportReserveMs >= value.wallMs) throw Error("invalid_contract: reporting reserve");
}
export type Scope = { projectRoot: string; readPaths: string[]; writePaths: string[]; tools: string[]; operations: string[]; effects: string[]; capabilities: Record<typeof capabilityNames[number], boolean>; budget: Budget; recovery: number };
export function scope(s: any): asserts s is Scope {
  object(s, ["projectRoot", "readPaths", "writePaths", "tools", "operations", "effects", "capabilities", "budget", "recovery"]);
  text(s.projectRoot); if (!s.projectRoot.startsWith("/")) throw Error("invalid_contract: absolute project root");
  for (const key of ["readPaths", "writePaths", "tools", "operations", "effects"]) names(s[key]);
  s.readPaths.forEach(relativePath); s.writePaths.forEach(relativePath);
  object(s.capabilities, [...capabilityNames]);
  for (const b of Object.values(s.capabilities)) if (typeof b !== "boolean") throw Error("invalid_contract: boolean");
  budget(s.budget);
  if (!Number.isSafeInteger(s.recovery) || s.recovery < 0) throw Error("invalid_contract: recovery");
}
export type ScriptedRequest = {
  version: 1; mode: "scripted"; clientRequestId: string; grant: string; scope: Scope;
  trustedLocal: true; requiresHardIsolation: false; goal: string;
  decisions: { statement: string; rationale: string }[]; nonGoals: string[];
  sourceBinding: "protected-workspace"; protectedPaths: string[];
  units: { id: string; description: string; operation: string; params: Record<string, unknown> }[];
  criteria: { id: string; unitId: string; kind: "protected" | "completion" | "structured" | "evidence"; required: true }[];
  requiredReportFields: string[]; stop: { on: string[]; recovery: number };
};
export function request(value: any): asserts value is ScriptedRequest {
  object(value, ["version", "mode", "clientRequestId", "grant", "scope", "trustedLocal", "requiresHardIsolation", "goal", "decisions", "nonGoals", "sourceBinding", "protectedPaths", "units", "criteria", "requiredReportFields", "stop"]);
  if (value.version !== 1 || value.mode !== "scripted" || value.trustedLocal !== true || value.requiresHardIsolation !== false || value.sourceBinding !== "protected-workspace") throw Error("unsupported: scripted trusted-local protected workspace only");
  [value.clientRequestId, value.grant, value.goal].forEach(text); scope(value.scope);
  if (value.scope.writePaths.length || value.scope.effects.some((e: string) => !["read", "check"].includes(e))) throw Error("permission_denied: source effects unavailable");
  names(value.nonGoals); names(value.protectedPaths); value.protectedPaths.forEach(relativePath);
  if (!value.protectedPaths.length || value.scope.readPaths.some((p: string) => !value.protectedPaths.includes(p))) throw Error("invalid_contract: protected source coverage required");
  if (!Array.isArray(value.decisions) || !value.decisions.length) throw Error("invalid_contract: decisions");
  value.decisions.forEach((d: any) => { object(d, ["statement", "rationale"]); text(d.statement); text(d.rationale); });
  if (!Array.isArray(value.units) || !value.units.length) throw Error("invalid_contract: units");
  value.units.forEach((u: any) => { object(u, ["id", "description", "operation", "params"]); [u.id, u.description, u.operation].forEach(text); if (!/^[a-zA-Z0-9_-]+$/.test(u.id)) throw Error("invalid_contract: unit identity"); });
  names(value.units.map((u: any) => u.id));
  if (!Array.isArray(value.criteria)) throw Error("invalid_contract: criteria");
  value.criteria.forEach((c: any) => { object(c, ["id", "unitId", "kind", "required"]); text(c.id); if (c.required !== true || !["protected", "completion", "structured", "evidence"].includes(c.kind) || !value.units.some((u: any) => u.id === c.unitId)) throw Error("invalid_contract: criterion"); });
  names(value.criteria.map((c: any) => c.id));
  for (const u of value.units) for (const kind of ["protected", "completion", "evidence", ...(u.operation === "project.inspect" ? [] : ["structured"])]) if (!value.criteria.some((c: any) => c.unitId === u.id && c.kind === kind)) throw Error("invalid_contract: missing verifier");
  names(value.requiredReportFields);
  if (canonicalJson([...value.requiredReportFields].sort()) !== canonicalJson(["criteria", "evidence", "protected", "units"])) throw Error("unsupported: report fields");
  object(value.stop, ["on", "recovery"]); names(value.stop.on);
  if (value.stop.on.some((s: string) => !["command", "structured", "protected", "incomplete"].includes(s)) || !Number.isSafeInteger(value.stop.recovery) || value.stop.recovery < 0) throw Error("invalid_contract: stop rules");
}
export const identity = (v: unknown) => sha256(canonicalJson(v));
