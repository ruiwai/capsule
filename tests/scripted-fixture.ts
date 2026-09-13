import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { sha256 } from "../src/contracts/identity.js";
import { capabilityNames, type ScriptedRequest } from "../src/controller/scripted-contract.js";
import { ScriptedService } from "../src/controller/scripted.js";

export function fixture(mode = "pass", change?: (r: ScriptedRequest) => void) {
  process.env.CAPSULE_TRUSTED_LOCAL = "1";
  const root = mkdtempSync(join(tmpdir(), "capsule-scripted-synthetic-"));
  const project = join(root, "project"); mkdirSync(project); writeFileSync(join(project, "protected.txt"), "SYNTHETIC protected source\n");
  const scope = { projectRoot: project, readPaths: ["protected.txt"], writePaths: [], tools: ["exec_action", "read_evidence"], operations: ["project.inspect", "check.fixture"], effects: ["read", "check"], capabilities: Object.fromEntries(capabilityNames.map(k => [k, false])) as any, budget: { wallMs: 15000, reportReserveMs: 500, commandMsTotal: 8000, perCommandMs: 2000, maxToolActions: 4, evidenceBytes: 4096 }, recovery: 0 };
  const request: ScriptedRequest = { version: 1, mode: "scripted", clientRequestId: "synthetic-request", grant: "operator-grant", scope, trustedLocal: true, requiresHardIsolation: false, goal: "Synthetic inspection and certified fixture check", decisions: [{ statement: "Never change protected source", rationale: "Check validity independently of reader exit" }], nonGoals: ["Luna", "Nix", "source repair"], sourceBinding: "protected-workspace", protectedPaths: ["protected.txt"], units: [{ id: "inspection", description: "Read approved protected file", operation: "project.inspect", params: { path: "protected.txt" } }, { id: "check", description: "Synthetic certification must be true and complete", operation: "check.fixture", params: { mode } }], criteria: [], requiredReportFields: ["criteria", "evidence", "protected", "units"], stop: { on: ["protected", "structured", "command", "incomplete"], recovery: 0 } };
  request.criteria = request.units.flatMap(u => ["protected", "completion", "evidence", ...(u.id === "check" ? ["structured"] : [])].map(kind => ({ id: `${u.id}-${kind}`, unitId: u.id, kind: kind as any, required: true })));
  change?.(request);
  const script = resolve("tests/fixtures/scripted-check.cjs");
  const config = { stateRoot: join(root, "state"), principal: "synthetic-operator", trustedLocal: true, ceiling: structuredClone(request.scope), grants: { "operator-grant": { principal: "synthetic-operator", enabled: true, review: true, scope: structuredClone(request.scope) } }, checks: [{ id: "check.fixture", builder: "node-check", script, sha256: sha256(readFileSync(script)), parameters: { mode: ["pass", "fail", "command-fail", "null", "slow", "recover"] }, requiredCapabilities: [] as string[] }] };
  const configPath = join(root, "operator.json"), requestPath = join(root, "request.json");
  const save = () => { writeFileSync(configPath, JSON.stringify(config, null, 2)); writeFileSync(requestPath, JSON.stringify(request, null, 2)); };
  save(); process.env.CAPSULE_OPERATOR_CONFIG = configPath;
  const service = new ScriptedService(configPath);
  return { root, project, config, configPath, request, requestPath, save, service };
}
export function action(admitted: any, unitId = "check", attempt = 0) { return { taskId: admitted.taskId, episodeId: admitted.episodeId, capsuleDigest: admitted.capsuleDigest, unitId, attempt }; }
export function decision(report: any) { return { taskId: report.taskId, episodeId: report.episodeId, reportId: report.id, reportDigest: report.digest, decisionId: "synthetic-decision", acceptedUnits: ["inspection", "check"], decision: "accept" as const, rationale: "All named synthetic criteria verified from actual receipts" }; }
