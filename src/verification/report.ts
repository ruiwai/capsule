import { digestRecord, newId } from "../contracts/identity.js";
import type { Capsule, ExecutionReceipt, UnitResult } from "../contracts/types.js";
export type Draft = { schemaVersion: 1; taskId: string; episodeId: string; capsuleDigest: string; summary: string; unitResults: UnitResult[]; requestedDisposition: string; [key: string]: unknown };
export function validateDraft(c: Capsule, episodeId: string, draft: unknown) {
  if (!draft || typeof draft !== "object") return { valid: false, errors: ["draft is not an object"] };
  const d = draft as any; const errors: string[] = [];
  if (d.schemaVersion !== 1 || d.taskId !== c.taskId || d.episodeId !== episodeId || d.capsuleDigest !== c.digest) errors.push("stale or wrong report identity");
  if (typeof d.summary !== "string" || d.summary.length > c.request.report.narrativeMaxChars) errors.push("malformed summary");
  if (!Array.isArray(d.unitResults) || !d.unitResults.some((u: any) => u.unitId === c.request.acceptanceUnit.id)) errors.push("absent acceptance unit result");
  if (d.unitResults?.some((u: any) => u.acceptance === "accepted")) errors.push("worker cannot self-accept");
  return { valid: errors.length === 0, errors };
}
export function gateReport(c: Capsule, episodeId: string, draft: Draft | null, receipts: ExecutionReceipt[], fields: Record<string, unknown> = {}) {
  const missing = c.request.report.requiredFieldIds.filter(id => !(id in fields) || fields[id] === undefined);
  const supplied = draft?.unitResults ?? [{ unitId: c.request.acceptanceUnit.id, executionState: receipts.length ? "failed" : "unknown", verification: "unknown", acceptance: "pending", criterionIds: [], evidenceRefs: [], explanation: "controller-generated: worker report unavailable" }];
  const unitResults = supplied.map((u: any) => { const rs = receipts.filter(r => r.acceptanceUnitId === u.unitId); const failed = rs.some(r => r.exitCode !== 0 || r.cancelled || r.timedOut); return { ...u, verification: failed || !rs.length ? "unknown" : u.verification, acceptance: "pending" }; });
  const handle = (fields["env.handle"] as { id?: string } | undefined)?.id;
  const report: any = { schemaVersion: 1, id: newId("report"), taskId: c.taskId, episodeId, capsuleDigest: c.digest, summary: draft?.summary ?? "Worker report unavailable; controller receipts preserved.", unitResults, authoritativeExecutionIds: receipts.map(x => x.id), requiredFieldValues: fields, missingRequiredFieldIds: missing, decisiveEvidenceRefs: receipts.flatMap(r => [r.stdout, r.stderr]), snapshotStatus: "unknown", validationStatus: missing.length ? "incomplete" : "valid", permittedNextAction: "supervisor review or a separately authorized new capsule", requestedDecision: null, environmentHandleIds: handle ? [handle] : [], limitationCodes: ["trusted_host", "nix_daemon_accounting_incomplete"] };
  report.digest = digestRecord(report); return report;
}
