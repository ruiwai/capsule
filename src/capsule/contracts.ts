import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const nonBlank = "\\S";
export const MAX_TIMER_MS = 2_147_483_647;

export const DelegateCapsuleParameters = Type.Object({
  capsule: Type.String({ minLength: 1, maxLength: 32_000, pattern: nonBlank,
    description: "Self-contained assignment: goal, cwd/inputs, scope, allowed actions, acceptance checks, stop conditions, and report/artifact requirements. Include needed context; the worker cannot see the parent conversation." }),
  output_example: Type.String({ minLength: 1, pattern: nonBlank,
    description: "Result-format example, passed verbatim to Flash; not a schema or an answer to copy. Show required evidence and artifact fields." }),
  timeout_s: Type.Optional(Type.Number({ exclusiveMinimum: 0,
    description: "Deadline in seconds, including startup and result preparation. Default: configured timeout (normally 300s)." })),
}, { additionalProperties: false });

export const JitEntryParameters = Type.Object({
  topic: Type.String({ minLength: 1, maxLength: 64, pattern: "^[a-z0-9][a-z0-9_-]*$",
    description: "Stable project-local topic key, not a filesystem path." }),
  content: Type.String({ minLength: 1, maxLength: 4_000, pattern: nonBlank,
    description: "Complete replacement lesson for this topic." }),
}, { additionalProperties: false });

const JitArray = Type.Array(JitEntryParameters, { maxItems: 8 });
export const YieldParameters = Type.Union([
  Type.Object({
    reason: Type.Literal("completed"),
    result: Type.Unknown({ description: "Any JSON value; not checked against output_example." }),
    notes: Type.Optional(Type.String({ minLength: 1, maxLength: 12_000, pattern: nonBlank })),
    JITed_history: JitArray,
  }, { additionalProperties: false }),
  Type.Object({
    reason: Type.Literal("blocked"),
    notes: Type.String({ minLength: 1, maxLength: 12_000, pattern: nonBlank }),
    JITed_history: JitArray,
  }, { additionalProperties: false }),
]);

export type DelegateCapsuleArgs = Static<typeof DelegateCapsuleParameters>;
export type JitEntry = Static<typeof JitEntryParameters>;
export type YieldArgs = Static<typeof YieldParameters>;
export type DelegateCapsuleResult =
  | { status: "completed"; result: unknown; notes_path?: string; raw_history: string }
  | { status: "blocked" | "timeout" | "error"; notes: string; raw_history?: string };

function validationError(name: string): Error { return Error(`invalid_contract: malformed ${name}`); }
function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? value.every(item => isJsonValue(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype
      && Object.values(value as Record<string, unknown>).every(item => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}
export function validateDelegate(value: unknown): asserts value is DelegateCapsuleArgs {
  if (!Value.Check(DelegateCapsuleParameters, value)) throw validationError("delegate_capsule");
  const seconds = (value as DelegateCapsuleArgs).timeout_s;
  if (seconds !== undefined && (!Number.isFinite(seconds) || seconds * 1000 > MAX_TIMER_MS)) throw validationError("delegate_capsule");
}
export function validateYield(value: unknown): asserts value is YieldArgs {
  if (!Value.Check(YieldParameters, value)) throw validationError("yield");
  if ((value as YieldArgs).reason === "completed" && !isJsonValue((value as any).result)) throw validationError("yield");
  const topics = (value as YieldArgs).JITed_history.map(x => x.topic);
  if (new Set(topics).size !== topics.length) throw Error("invalid_contract: duplicate JIT topic");
}
