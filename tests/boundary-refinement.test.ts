import { existsSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { action, fixture } from "./scripted-fixture.js";
import { publicCall } from "../src/extension/index.js";

describe("scripted boundary refinements", () => {
  it("captures action identity before yielding to caller mutations", async () => {
    const f = fixture();
    try {
      const admitted = f.service.submit(f.request);
      const original = action(admitted, "inspection");
      const live = f.service.execute(original);
      original.unitId = "check";

      const receipt = await live;
      expect(receipt.acceptanceUnitId).toBe("inspection");
      expect(receipt.requestId).toBe("inspection:0");
      expect(existsSync(join(f.project, "effects"))).toBe(false);
      const duplicate = await f.service.execute(action(admitted, "inspection"));
      expect(duplicate.id).toBe(receipt.id);
    } finally {
      f.service.close();
    }
  });

  it("rejects malformed public envelopes before domain work", async () => {
    const f = fixture();
    try {
      for (const value of [null, false, 1, "text", []]) {
        await expect(publicCall("read_evidence", value)).rejects.toThrow("invalid_contract");
      }
      await expect(publicCall("unsupported", {})).rejects.toThrow("unsupported public operation");
      expect(existsSync(join(f.project, "effects"))).toBe(false);
    } finally {
      f.service.close();
    }
  });
});
