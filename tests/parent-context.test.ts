import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PiSdkBackend } from "../src/capsule/backend.js";
import { captureParentContext } from "../src/extension/parent-context.js";

describe("parent worker context", () => {
  const pi = {
    getAllTools: () => [
      { name: "read", sourceInfo: { path: "<builtin:read>" } },
      { name: "bash_exec", sourceInfo: { path: "/extensions/poor.ts" } },
      { name: "apply_patch", sourceInfo: { path: "/extensions/poor.ts" } },
      { name: "delegate_capsule", sourceInfo: { path: "/extensions/capsule.ts" } },
      { name: "inline_tool", sourceInfo: { path: "<inline:1>" } },
    ],
    getCommands: () => [
      { source: "extension", sourceInfo: { path: "/extensions/poor.ts" } },
      { source: "extension", sourceInfo: { path: "/extensions/commands.ts" } },
      { source: "prompt", sourceInfo: { path: "/prompts/review.md" } },
      { source: "skill", sourceInfo: { path: "/skills/check/SKILL.md" } },
    ],
    getActiveTools: () => ["bash_exec", "apply_patch", "delegate_capsule"],
  } as unknown as ExtensionAPI;
  const ctx = { getSystemPrompt: () => "Effective poor instructions" } as ExtensionContext;

  it("deduplicates extension files, excluding builtins, inline sources, and Capsule", () => {
    expect(captureParentContext(pi, ctx)).toEqual({
      systemPrompt: "Effective poor instructions",
      extensionPaths: ["/extensions/poor.ts", "/extensions/commands.ts"],
      tools: ["bash_exec", "apply_patch"],
    });
  });

  it("honors explicit tool overrides without enabling delegation or duplicating yield", () => {
    const override = ["bash_exec", "bash_exec", "delegate_capsule", "yield"];
    expect(captureParentContext(pi, ctx, override).tools).toEqual(["bash_exec"]);
    expect(override).toHaveLength(4);
    expect(captureParentContext(pi, ctx, []).tools).toEqual([]);
  });

  it("fails before a provider request if an inherited extension cannot load", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-extension-failure-"));
    try {
      const missing = join(project, "missing-extension.ts");
      const backend = new PiSdkBackend({ cwd: project, stateDir: join(project, "sessions"),
        model: { provider: "test", id: "unused" } as any, tools: [],
        parentContext: () => ({ systemPrompt: "parent", extensionPaths: [missing], tools: [] }) });
      const result = await backend.run({ capsule: "Do not run", outputExample: "unused", jit: [],
        signal: new AbortController().signal, cleanupMs: 100 });
      expect(result.kind).toBe("error");
      expect(result.hooksRan).toBe(false);
      expect(result.records).toEqual([]);
      expect(result.notes).toContain("Worker extensions failed to load");
      expect(result.notes).toContain(missing);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
