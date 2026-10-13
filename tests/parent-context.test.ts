import { AgentSession, createAgentSession, DefaultResourceLoader, SessionManager, SettingsManager, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { Type } from "typebox";
import { describe, expect, it, vi } from "vitest";
import { PiSdkBackend } from "../src/extension/pi-backend.js";
import { captureParentContext, resolveWorkerPolicy } from "../src/extension/parent-context.js";
import { SEQUENTIAL_TOOL } from "../src/extension/tool-policy.js";

async function writePackageExtension(directory: string, name: string, entrypoint: string): Promise<string> {
  const path = join(directory, entrypoint);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(join(directory, "package.json"), JSON.stringify({ name }));
  await writeFile(path, "export default function extension() {}\n");
  return path;
}

describe("worker isolation policy", () => {
  const cwd = "/project/root";

  it("defaults to excluding pi-goal-x without shared instructions or tool exclusions", () => {
    expect(resolveWorkerPolicy({}, {}, cwd)).toEqual({
      sharedInstructions: "", excludedTools: [], excludedExtensions: ["pi-goal-x"],
    });
  });

  it.each(["global", "project"])("lets explicit %s extension arrays clear or replace the default", scope => {
    for (const excludedExtensions of [[], ["replacement-package", "@custom/goal-tools"]]) {
      const settings = { capsule: { excludedExtensions } };
      expect(resolveWorkerPolicy(scope === "global" ? settings : {},
        scope === "project" ? settings : {}, cwd)).toEqual({
        sharedInstructions: "", excludedTools: [], excludedExtensions,
      });
    }
  });

  it("merges nested Capsule fields, with project arrays replacing global arrays", () => {
    const global = { capsule: { sharedInstructions: "Global safety", excludedTools: ["global_tool"],
      excludedExtensions: ["./global.ts"] } };
    expect(resolveWorkerPolicy(global, { capsule: {
      excludedTools: ["project_tool"], excludedExtensions: ["./project.ts"],
    } }, cwd)).toEqual({
      sharedInstructions: "Global safety", excludedTools: ["project_tool"],
      excludedExtensions: [join(cwd, "project.ts")],
    });
    expect(resolveWorkerPolicy(global, { capsule: { sharedInstructions: "Project safety" } }, cwd)).toEqual({
      sharedInstructions: "Project safety", excludedTools: ["global_tool"],
      excludedExtensions: [join(cwd, "global.ts")],
    });
    expect(resolveWorkerPolicy(global, { capsule: {
      sharedInstructions: "", excludedTools: [], excludedExtensions: [],
    } }, cwd)).toEqual({ sharedInstructions: "", excludedTools: [], excludedExtensions: [] });
  });

  it("trims and deduplicates package selectors and resolves extension paths against cwd or home", () => {
    expect(resolveWorkerPolicy({ capsule: {
      excludedTools: [" bash_exec ", "bash_exec", "\tapply_patch\n"],
      excludedExtensions: [" ./extensions/poor.ts ", "./extensions/poor.ts", "../commands.ts",
        "/extensions/absolute.ts", " ~/extensions/private.ts ", " pi-goal-x ", "pi-goal-x",
        " @custom/goal-tools ", "@custom/goal-tools"],
    } }, {}, cwd)).toEqual({
      sharedInstructions: "", excludedTools: ["bash_exec", "apply_patch"],
      excludedExtensions: [join(cwd, "extensions/poor.ts"), resolve(cwd, "../commands.ts"),
        "/extensions/absolute.ts", join(homedir(), "extensions/private.ts"), "pi-goal-x", "@custom/goal-tools"],
    });
  });

  it.each(["global", "project"])("rejects non-object %s Capsule sections", scope => {
    for (const capsule of [null, false, "invalid", 42, []]) {
      const settings = { capsule };
      expect(() => resolveWorkerPolicy(scope === "global" ? settings : {},
        scope === "project" ? settings : {}, cwd))
        .toThrow("configuration_required: capsule must be an object");
    }
  });

  it.each(["excludedTools", "excludedExtensions"])("validates %s as nonempty string entries", key => {
    for (const value of [null, "tool", 42, {}, [""], [" \t\n"], ["valid", 42], ["valid", null]]) {
      expect(() => resolveWorkerPolicy({}, { capsule: { [key]: value } }, cwd))
        .toThrow(`configuration_required: capsule.${key} must be an array of nonempty strings`);
    }
  });

  it("requires shared instructions to be a string", () => {
    for (const sharedInstructions of [null, false, 42, [], {}]) {
      expect(() => resolveWorkerPolicy({}, { capsule: { sharedInstructions } }, cwd))
        .toThrow("configuration_required: capsule.sharedInstructions must be a string");
    }
  });

  it.each(["yield", "list_lesson_topic", "fetch_lesson", SEQUENTIAL_TOOL])(
    "rejects excluding required worker tool %s even with surrounding whitespace", name => {
      const settings = { capsule: { excludedTools: [` ${name}\n`] } };
      expect(() => resolveWorkerPolicy(settings, {}, cwd))
        .toThrow("configuration_required: cannot exclude required Capsule worker tools");
      expect(() => resolveWorkerPolicy({}, settings, cwd))
        .toThrow("configuration_required: cannot exclude required Capsule worker tools");
    },
  );
});

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

  it("deduplicates extension files, excluding builtins, inline sources, and Capsule", () => {
    expect(captureParentContext(pi)).toEqual({
      sharedInstructions: "",
      excludedTools: [],
      extensionPaths: ["/extensions/poor.ts", "/extensions/commands.ts"],
      tools: ["bash_exec", "apply_patch"],
    });
  });

  it("uses only explicit shared instructions without a parent system prompt", () => {
    const isolated = captureParentContext(pi, undefined,
      { sharedInstructions: "Shared safety only", excludedTools: [], excludedExtensions: [] });
    expect(isolated.sharedInstructions).toBe("Shared safety only");
    expect(isolated).not.toHaveProperty("systemPrompt");
  });

  it("honors explicit tool overrides without enabling delegation or duplicating yield", () => {
    const override = ["bash_exec", "bash_exec", "delegate_capsule", "yield"];
    expect(captureParentContext(pi, override).tools).toEqual(["bash_exec"]);
    expect(override).toHaveLength(4);
    expect(captureParentContext(pi, []).tools).toEqual([]);
  });

  it("applies tool exclusions after an override without removing their extension", () => {
    const policy = resolveWorkerPolicy({}, { capsule: { excludedTools: [" bash_exec "] } }, "/project");
    const override = ["read", "bash_exec", "apply_patch", "delegate_capsule", "yield", "read"];
    expect(captureParentContext(pi, override, policy)).toEqual({
      sharedInstructions: "", excludedTools: ["bash_exec"],
      extensionPaths: ["/extensions/poor.ts", "/extensions/commands.ts"],
      tools: ["read", "apply_patch"],
    });
    expect(captureParentContext(pi, undefined, policy).tools).toEqual(["apply_patch"]);
    expect(override).toEqual(["read", "bash_exec", "apply_patch", "delegate_capsule", "yield", "read"]);
  });

  it("removes excluded tool and command extension paths independently of tool selection", () => {
    const policy = resolveWorkerPolicy({}, { capsule: {
      excludedExtensions: ["./poor.ts", "./commands.ts"],
    } }, "/extensions");
    expect(captureParentContext(pi, undefined, policy)).toEqual({
      sharedInstructions: "", excludedTools: [], extensionPaths: [], tools: [],
    });
    expect(captureParentContext(pi, ["bash_exec"], policy).tools).toEqual(["bash_exec"]);
    expect(captureParentContext(pi, [], { ...policy, excludedExtensions: [] }).extensionPaths)
      .toEqual(["/extensions/poor.ts", "/extensions/commands.ts"]);
  });

  it.each([
    { label: "default exclusions", settings: {}, allowsGoal: false },
    { label: "explicit empty exclusions", settings: { capsule: { excludedExtensions: [] } }, allowsGoal: true },
  ])("matches owning package names with $label, not installation directory substrings", async ({ settings, allowsGoal }) => {
    const project = await mkdtemp(join(tmpdir(), "capsule-package-context-"));
    try {
      const goalDirectory = join(project, "vendor", "arbitrarily-named-addon");
      const goalExtension = await writePackageExtension(goalDirectory, "pi-goal-x", "src/tools.mjs");
      const goalCommands = await writePackageExtension(goalDirectory, "pi-goal-x", "src/commands-only.mjs");
      const unrelatedDirectory = join(project, "vendor", "pi-goal-x-lookalike");
      const unrelatedExtension = await writePackageExtension(unrelatedDirectory, "not-pi-goal-x", "src/tools.mjs");
      const unrelatedCommands = await writePackageExtension(unrelatedDirectory, "not-pi-goal-x", "src/commands-only.mjs");
      const packagePi = {
        getAllTools: () => [
          { name: "read", sourceInfo: { path: "<builtin:read>" } },
          { name: "create_goal", sourceInfo: { path: goalExtension } },
          { name: "unrelated_tool", sourceInfo: { path: unrelatedExtension } },
        ],
        getCommands: () => [
          { source: "extension", sourceInfo: { path: goalCommands } },
          { source: "extension", sourceInfo: { path: unrelatedCommands } },
        ],
        getActiveTools: () => ["read", "create_goal", "unrelated_tool"],
      } as unknown as ExtensionAPI;
      const policy = resolveWorkerPolicy({}, settings, project);
      const expected = {
        sharedInstructions: "", excludedTools: [],
        extensionPaths: allowsGoal
          ? [goalExtension, unrelatedExtension, goalCommands, unrelatedCommands]
          : [unrelatedExtension, unrelatedCommands],
        tools: allowsGoal ? ["read", "create_goal", "unrelated_tool"] : ["read", "unrelated_tool"],
      };
      expect(captureParentContext(packagePi, undefined, policy)).toEqual(expected);
      if (!allowsGoal) expect(captureParentContext(packagePi)).toEqual(expected);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("matches custom scoped package exclusions exactly and replaces default and global exclusions", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-scoped-packages-"));
    try {
      const goalExtension = await writePackageExtension(join(project, "first-addon"), "pi-goal-x", "src/tools.mjs");
      const scopedDirectory = join(project, "second-addon");
      const scopedExtension = await writePackageExtension(scopedDirectory, "@custom/goal-tools", "src/tools.mjs");
      const scopedCommands = await writePackageExtension(scopedDirectory, "@custom/goal-tools", "src/commands-only.mjs");
      const otherExtension = await writePackageExtension(join(project, "third-addon"), "@other/goal-tools", "src/tools.mjs");
      const packagePi = {
        getAllTools: () => [
          { name: "create_goal", sourceInfo: { path: goalExtension } },
          { name: "scoped_goal", sourceInfo: { path: scopedExtension } },
          { name: "other_tool", sourceInfo: { path: otherExtension } },
        ],
        getCommands: () => [{ source: "extension", sourceInfo: { path: scopedCommands } }],
        getActiveTools: () => ["create_goal", "scoped_goal", "other_tool"],
      } as unknown as ExtensionAPI;
      const policy = resolveWorkerPolicy({ capsule: { excludedExtensions: ["pi-goal-x", "@other/goal-tools"] } },
        { capsule: { excludedExtensions: ["@custom/goal-tools"] } }, project);
      expect(policy.excludedExtensions).toEqual(["@custom/goal-tools"]);
      expect(captureParentContext(packagePi, undefined, policy)).toEqual({
        sharedInstructions: "", excludedTools: [],
        extensionPaths: [goalExtension, otherExtension], tools: ["create_goal", "other_tool"],
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("uses the nearest nested package boundary instead of an ancestor pi-goal-x package", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-nested-packages-"));
    try {
      const goalDirectory = join(project, "arbitrarily-named-host");
      const goalExtension = await writePackageExtension(goalDirectory, "pi-goal-x", "src/tools.mjs");
      const goalCommands = await writePackageExtension(goalDirectory, "pi-goal-x", "src/commands-only.mjs");
      const nestedDirectory = join(goalDirectory, "node_modules", "embedded-helper");
      const nestedExtension = await writePackageExtension(nestedDirectory, "nested-worker-tools", "src/tools.mjs");
      const nestedCommands = await writePackageExtension(nestedDirectory, "nested-worker-tools", "src/commands-only.mjs");
      const packagePi = {
        getAllTools: () => [
          { name: "create_goal", sourceInfo: { path: goalExtension } },
          { name: "nested_tool", sourceInfo: { path: nestedExtension } },
        ],
        getCommands: () => [
          { source: "extension", sourceInfo: { path: goalCommands } },
          { source: "extension", sourceInfo: { path: nestedCommands } },
        ],
        getActiveTools: () => ["create_goal", "nested_tool"],
      } as unknown as ExtensionAPI;
      expect(captureParentContext(packagePi)).toEqual({
        sharedInstructions: "", excludedTools: [],
        extensionPaths: [nestedExtension, nestedCommands], tools: ["nested_tool"],
      });
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("never loads an excluded goal extension before reporting a missing worker tool", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-excluded-goal-"));
    try {
      const goalExtension = join(project, "goal.mjs");
      const loadError = "EXCLUDED_GOAL_EXTENSION_LOADED";
      await writeFile(goalExtension, `throw new Error("${loadError}");
        export default function goalExtension() {}\n`);
      const goalPi = {
        getAllTools: () => [
          { name: "read", sourceInfo: { path: "<builtin:read>" } },
          { name: "create_goal", sourceInfo: { path: goalExtension } },
        ],
        getCommands: () => [{ source: "extension", sourceInfo: { path: goalExtension } }],
        getActiveTools: () => ["read", "create_goal"],
      } as unknown as ExtensionAPI;
      const inherited = captureParentContext(goalPi);
      expect(inherited.extensionPaths).toEqual([goalExtension]);
      expect(inherited.tools).toEqual(["read", "create_goal"]);
      const policy = resolveWorkerPolicy({}, { capsule: { excludedExtensions: ["./goal.mjs"] } }, project);
      const filtered = captureParentContext(goalPi, undefined, policy);
      expect(filtered).toEqual({ sharedInstructions: "", excludedTools: [], extensionPaths: [], tools: ["read"] });

      // Force the backend to stop after SDK setup, before any prompt/provider request.
      const missing = "capsule_test_missing_tool";
      const backend = new PiSdkBackend({ cwd: project, stateDir: join(project, "sessions"),
        model: { provider: "test", id: "unused", api: "test", contextWindow: 100000 } as any,
        tools: [], parentContext: () => ({ ...filtered, tools: [...filtered.tools, missing] }) });
      const result = await backend.run({ capsule: "Do not run", outputExample: "unused", jit: [],
        signal: new AbortController().signal, cleanupMs: 100 });
      expect(result.kind).toBe("error");
      expect(result.hooksRan).toBe(false);
      expect(result.records).toEqual([]);
      expect(result.notes).toBe(`Worker tools unavailable (check tool providers and extension exclusions): ${missing}`);
      expect(result.notes).not.toContain("Worker extensions failed to load");
      expect(result.notes).not.toContain(loadError);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });

  it("excludes a registered goal tool from real SDK active tools even when explicitly requested", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-excluded-goal-tool-"));
    let session: Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
    try {
      const settingsManager = SettingsManager.inMemory();
      const loader = new DefaultResourceLoader({
        cwd: project, agentDir: project, settingsManager,
        noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
        extensionFactories: [pi => {
          pi.registerTool({ name: "create_goal", label: "Create goal", description: "Test goal tool",
            parameters: Type.Object({}),
            async execute() { return { content: [{ type: "text", text: "unused" }], details: {} }; },
          });
        }],
      });
      await loader.reload();
      const created = await createAgentSession({
        cwd: project, agentDir: project, resourceLoader: loader, settingsManager,
        sessionManager: SessionManager.inMemory(project), tools: ["read", "create_goal"],
        excludeTools: ["create_goal"],
        model: { provider: "test", id: "unused", api: "test", contextWindow: 100000 } as any,
      });
      session = created.session;
      expect(created.extensionsResult.errors).toEqual([]);
      expect(created.extensionsResult.extensions.some(extension => extension.tools.has("create_goal"))).toBe(true);
      expect(session.getActiveToolNames()).toEqual(["read"]);
      expect(session.messages).toEqual([]);
    } finally {
      session?.dispose();
      await rm(project, { recursive: true, force: true });
    }
  });

  it("passes the capsule and output example exactly once as user content without prompt template expansion", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-user-content-"));
    const prompt = vi.spyOn(AgentSession.prototype, "prompt").mockResolvedValue(undefined);
    try {
      const capsule = "Unique worker assignment: inspect only the assigned file.";
      const outputExample = '{"result":"Unique worker output example"}';
      const backend = new PiSdkBackend({ cwd: project, stateDir: join(project, "sessions"),
        model: { provider: "test", id: "unused", api: "test", contextWindow: 100000 } as any,
        tools: ["read"], parentContext: () => ({ sharedInstructions: "", excludedTools: [],
          extensionPaths: [], tools: ["read"] }) });
      const result = await backend.run({ capsule, outputExample, jit: [],
        signal: new AbortController().signal, cleanupMs: 100 });

      expect(prompt).toHaveBeenCalledTimes(1);
      expect(prompt).toHaveBeenCalledWith(
        `${capsule}\n\n# Output example (format only; not an answer to copy)\n${outputExample}`,
        { expandPromptTemplates: false },
      );
      const [content] = prompt.mock.calls[0]!;
      expect(content.split(capsule)).toHaveLength(2);
      expect(content.split(outputExample)).toHaveLength(2);
      // The stub bypasses the child hook and model request, so no handoff is expected.
      expect(result.kind).toBe("error");
      expect(result.hooksRan).toBe(false);
      expect(result.notes).toBe("Worker settled without running the Capsule child hook; no handoff was published.");
      expect(result.records).toEqual(expect.arrayContaining([expect.objectContaining({
        type: "worker_configuration",
        tools: expect.arrayContaining(["read", "yield", "list_lesson_topic", "fetch_lesson", SEQUENTIAL_TOOL]),
        extensionPaths: [], excludedTools: expect.arrayContaining(["delegate_capsule"]),
      })]));
    } finally {
      prompt.mockRestore();
      await rm(project, { recursive: true, force: true });
    }
  });

  it("fails before a provider request if an inherited extension cannot load", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-extension-failure-"));
    try {
      const missing = join(project, "missing-extension.ts");
      const backend = new PiSdkBackend({ cwd: project, stateDir: join(project, "sessions"),
        model: { provider: "test", id: "unused" } as any, tools: [],
        parentContext: () => ({ sharedInstructions: "Shared safety", excludedTools: [],
          extensionPaths: [missing], tools: [] }) });
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

  it("fails before a provider request if a requested worker tool is unavailable", async () => {
    const project = await mkdtemp(join(tmpdir(), "capsule-tool-failure-"));
    try {
      const missing = "capsule_test_missing_tool";
      const backend = new PiSdkBackend({ cwd: project, stateDir: join(project, "sessions"),
        model: { provider: "test", id: "unused", api: "test", contextWindow: 100000 } as any,
        tools: [], parentContext: () => ({ sharedInstructions: "", excludedTools: [],
          extensionPaths: [], tools: ["read", missing] }) });
      const result = await backend.run({ capsule: "Do not run", outputExample: "unused", jit: [],
        signal: new AbortController().signal, cleanupMs: 100 });
      expect(result.kind).toBe("error");
      expect(result.hooksRan).toBe(false);
      expect(result.records).toEqual([]);
      expect(result.notes).toBe(`Worker tools unavailable (check tool providers and extension exclusions): ${missing}`);
    } finally {
      await rm(project, { recursive: true, force: true });
    }
  });
});
