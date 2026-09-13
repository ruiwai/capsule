import { createHash, randomUUID } from "node:crypto";

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("canonical JSON rejects non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map(k => `${JSON.stringify(k)}:${canonicalJson(object[k])}`).join(",")}}`;
  }
  throw new Error(`canonical JSON rejects ${typeof value}`);
}

export const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
export const digestRecord = (record: Record<string, unknown>) => {
  const { digest: _digest, ...unsigned } = record;
  return sha256(canonicalJson(unsigned));
};
export const newId = (prefix: string) => `${prefix}_${randomUUID()}`;
