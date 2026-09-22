import { describe, expect, it } from "vitest";
import { DEFAULT_FLASH_MODEL, resolveConfiguredModel, resolveConfiguredModelSpec } from "../src/extension/pi-backend.js";

describe("Flash model configuration", () => {
  it("uses the built-in default when unset", () => {
    expect(resolveConfiguredModelSpec({})).toBe(DEFAULT_FLASH_MODEL);
  });

  it("uses settings and gives the environment precedence", () => {
    const global = { capsuleFlashModel: "global/model" };
    const project = { capsuleFlashModel: "project/model/path" };
    expect(resolveConfiguredModelSpec(global)).toBe("global/model");
    expect(resolveConfiguredModelSpec({ ...global, ...project })).toBe("project/model/path");
    expect(resolveConfiguredModelSpec(project, "env/model")).toBe("env/model");
  });

  it.each([null, 42, "", "model", "/model", "provider/", "provider/model name"])("rejects invalid setting %j", value => {
    expect(() => resolveConfiguredModelSpec({ capsuleFlashModel: value })).toThrow(/capsuleFlashModel/);
  });

  it("validates explicit overrides before consulting the registry", () => {
    expect(() => resolveConfiguredModelSpec({}, "provider/")).toThrow(/provider\/model-id/);
    expect(() => resolveConfiguredModel({} as any, "/model")).toThrow(/provider\/model-id/);
    expect(resolveConfiguredModelSpec({ capsuleFlashModel: 42 }, "env/model")).toBe("env/model");
  });
});
