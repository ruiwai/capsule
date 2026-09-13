import type { YieldArgs } from "./contracts.js";

export type TranscriptRecord = { type: string; [key: string]: unknown };
export type BackendOutcome = {
  kind: "settled" | "interrupted" | "error";
  yield?: YieldArgs;
  records: TranscriptRecord[];
  notes?: string;
  hooksRan: boolean;
  /** False means owned worker cleanup could not be observed within the allowance. */
  cleanupConfirmed?: boolean;
};
export type WorkerTelemetry = {
  tokens: { input: number; output: number; cacheRead: number; cacheWrite: number };
  cost: number;
  contextUsage?: { tokens: number | null; contextWindow: number; percent: number | null };
  model: string;
  thinkingLevel?: string;
  subscription?: boolean;
  cacheHitRate?: number;
  autoCompaction?: boolean;
};
export interface CapsuleBackend {
  run(input: { capsule: string; outputExample: string; jit: Array<{ topic: string; content: string; raw_history: string }>;
    signal: AbortSignal; cleanupMs: number; onTelemetry?: (telemetry: WorkerTelemetry) => void }): Promise<BackendOutcome>;
}
