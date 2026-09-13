import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const nonBlank = "\\S";

export const DelegateCapsuleParameters = Type.Object({
  capsule: Type.String({ minLength: 1, maxLength: 32_000, pattern: nonBlank,
    description: "Self-contained Markdown instructions for this delegation." }),
}, { additionalProperties: false });

export const JitEntryParameters = Type.Object({
  topic: Type.String({ minLength: 1, maxLength: 64, pattern: "^[a-z0-9][a-z0-9_-]*$",
    description: "Stable project-local topic key, not a filesystem path." }),
  content: Type.String({ minLength: 1, maxLength: 4_000, pattern: nonBlank,
    description: "Complete replacement lesson for this topic." }),
}, { additionalProperties: false });

export const YieldParameters = Type.Object({
  reason: Type.Union([Type.Literal("completed"), Type.Literal("needs_decision"), Type.Literal("blocked")]),
  report: Type.String({ minLength: 1, maxLength: 12_000, pattern: nonBlank }),
  JITed_history: Type.Array(JitEntryParameters, { maxItems: 8 }),
}, { additionalProperties: false });

export type DelegateCapsuleArgs = Static<typeof DelegateCapsuleParameters>;
export type JitEntry = Static<typeof JitEntryParameters>;
export type YieldArgs = Static<typeof YieldParameters>;
export type DelegateCapsuleResult =
  | { status: "yielded"; reply: YieldArgs; /** Absolute, readable transcript file path; never transcript data. */ raw_history: string }
  | { status: "cancelled" | "timeout" | "error"; report: string; /** Absolute readable partial transcript, or null. */ raw_history: string | null };

function validationError(name: string): Error { return Error(`invalid_contract: malformed ${name}`); }
export function validateDelegate(value: unknown): asserts value is DelegateCapsuleArgs {
  if (!Value.Check(DelegateCapsuleParameters, value)) throw validationError("delegate_capsule");
}
export function validateYield(value: unknown): asserts value is YieldArgs {
  if (!Value.Check(YieldParameters, value)) throw validationError("yield");
  const topics = (value as YieldArgs).JITed_history.map(x => x.topic);
  if (new Set(topics).size !== topics.length) throw Error("invalid_contract: duplicate JIT topic");
}
