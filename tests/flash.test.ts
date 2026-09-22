import { afterEach, expect, it, vi } from "vitest";
import capsuleExtension from "../src/extension/index.js";
import { initTheme, ModelSelectorComponent, SettingsManager } from "@earendil-works/pi-coding-agent";
import { CapsuleService } from "../src/capsule/service.js";

initTheme("dark");

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllEnvs(); });

function setup() {
  let command: any, tool: any;
  const hooks = new Map<string, any>();
  const pi = { registerCommand: (name: string, value: any) => {
    expect(name).toBe("flash"); command = value;
  }, registerTool: (value: any) => { tool = value; },
  on: (name: string, handler: any) => hooks.set(name, handler), setModel: vi.fn() };
  capsuleExtension(pi as any);
  const ctx: any = { cwd: process.cwd(), hasUI: true, mode: "rpc", isIdle: () => true,
    scopedModels: [], modelRegistry: { find: vi.fn((provider, id) =>
      provider === "test" ? { provider, id } : undefined) },
    ui: { notify: vi.fn(), setStatus: vi.fn(), custom: vi.fn() } };
  return { command, tool, hooks, ctx, pi };
}

it("shows the configured project default and restores it after a session override", async () => {
  vi.stubEnv("CAPSULE_FLASH_MODEL", undefined);
  vi.spyOn(SettingsManager, "create").mockReturnValue({
    getGlobalSettings: () => ({ capsuleFlashModel: "test/global" }),
    getProjectSettings: () => ({ capsuleFlashModel: "test/project" }),
  } as any);
  const { command, hooks, ctx } = setup();
  await hooks.get("session_start")({}, ctx);
  expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("capsule.flash", "Flash: idle · test/project");
  await command.handler("test/selected", ctx);
  expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("capsule.flash", "Flash: idle · test/selected");
  await hooks.get("session_start")({}, ctx);
  expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("capsule.flash", "Flash: idle · test/project");
});

it.each([
  [undefined, undefined, "global"],
  ["test/project", undefined, "project"],
  ["test/project", "test/environment", "environment"],
  [42, undefined, undefined],
  ["test/", undefined, undefined],
])("uses model settings during worker setup (%j, %j)", async (projectModel, environmentModel, expected) => {
  vi.stubEnv("CAPSULE_FLASH_MODEL", environmentModel);
  vi.stubEnv("CAPSULE_FLASH_THINKING_LEVEL", "off");
  vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", "300000");
  vi.stubEnv("CAPSULE_STATE_DIR", undefined);
  vi.spyOn(SettingsManager, "create").mockReturnValue({
    getGlobalSettings: () => ({ capsuleFlashModel: "test/global" }),
    getProjectSettings: () => projectModel === undefined ? {} : { capsuleFlashModel: projectModel },
  } as any);
  const delegate = vi.spyOn(CapsuleService.prototype, "delegate").mockResolvedValue({ status: "error", notes: "test only" });
  const { tool, hooks, ctx, pi } = setup();
  ctx.hasUI = false;
  ctx.ui = {};
  ctx.sessionManager = { getSessionId: () => "flash-config-test" };
  await hooks.get("session_start")({}, ctx);
  const result = await tool.execute("id", { capsule: "test", output_example: "test" }, undefined, undefined, ctx);
  if (expected) {
    expect(result.details.capsuleUi.workerModel).toBe(expected);
    expect(delegate).toHaveBeenCalledOnce();
  } else {
    expect(result.details.notes).toContain("capsuleFlashModel");
    expect(delegate).not.toHaveBeenCalled();
    expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
  }
  expect(pi.setModel).not.toHaveBeenCalled();
});

it("selects Flash independently, preserves selection on invalid input, and resets on session start", async () => {
  vi.stubEnv("CAPSULE_FLASH_MODEL", "test/default");
  const { command, hooks, ctx, pi } = setup();
  await command.handler(" test/other ", ctx);
  expect(ctx.ui.setStatus).toHaveBeenLastCalledWith("capsule.flash", "Flash: idle · test/other");
  await command.handler("missing/model", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("not found"), "error");
  await command.handler("", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("test/other"), "info");
  expect(pi.setModel).not.toHaveBeenCalled();
  ctx.hasUI = false;
  await hooks.get("session_start")({}, ctx);
  await command.handler("", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("test/default"), "info");
});

it("uses the built-in picker and leaves the model unchanged on cancellation", async () => {
  const { command, ctx } = setup();
  ctx.mode = "tui";
  const model = { provider: "test", id: "picked", name: "Picked" };
  ctx.scopedModels = [{ model }];
  ctx.modelRegistry.getAvailable = vi.fn(() => [model]);
  ctx.modelRegistry.getError = vi.fn();
  ctx.modelRegistry.refresh = vi.fn(async () => ({ errors: new Map() }));
  let key = "\r";
  ctx.ui.custom.mockImplementation(async (factory: any) => {
    let result: unknown;
    const picker = factory({ requestRender: vi.fn() }, {}, {}, (value: unknown) => { result = value; });
    try {
      expect(picker).toBeInstanceOf(ModelSelectorComponent);
      await new Promise(resolve => setImmediate(resolve));
      expect(picker.render(100).join("\n")).toContain("picked");
      picker.handleInput(key);
      return result;
    } finally { picker.dispose(); }
  });
  await command.handler("", ctx);
  expect(ctx.modelRegistry.refresh).toHaveBeenCalledOnce();
  expect(ctx.ui.notify).toHaveBeenLastCalledWith("Flash model: test/picked", "info");
  key = "\x1b";
  await command.handler("", ctx);
  ctx.mode = "rpc";
  await command.handler("", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("test/picked"), "info");
});

it("rejects changes while the agent is busy", async () => {
  const { command, ctx } = setup();
  ctx.isIdle = () => false;
  await command.handler("test/other", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.any(String), "warning");
  expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
});

it("recreates the cached worker service after changing Flash", async () => {
  vi.stubEnv("CAPSULE_FLASH_MODEL", "test/default");
  vi.stubEnv("CAPSULE_FLASH_THINKING_LEVEL", "off");
  vi.stubEnv("CAPSULE_FLASH_TIMEOUT_MS", "300000");
  vi.stubEnv("CAPSULE_STATE_DIR", undefined);
  const instances: unknown[] = [];
  vi.spyOn(CapsuleService.prototype, "delegate").mockImplementation(async function (this: CapsuleService) {
    instances.push(this);
    return { status: "error", notes: "test only" };
  });
  const { command, tool, ctx } = setup();
  ctx.cwd = process.cwd();
  ctx.sessionManager = { getSessionId: () => "flash-test" };
  const execute = () => tool.execute("id", { capsule: "test", output_example: "test" }, undefined, undefined, ctx);
  expect((await execute()).details.capsuleUi.workerModel).toBe("default");
  await execute();
  expect(instances[0]).toBe(instances[1]);
  await command.handler("test/new", ctx);
  expect((await execute()).details.capsuleUi.workerModel).toBe("new");
  expect(instances[2]).not.toBe(instances[0]);
  // Parent idleness alone cannot prove an interrupted worker has stopped.
  vi.spyOn(CapsuleService.prototype, "isActive", "get").mockReturnValue(true);
  await command.handler("test/unsafe", ctx);
  expect(ctx.ui.notify).toHaveBeenLastCalledWith(expect.stringContaining("cleanup"), "warning");
  expect((await execute()).details.capsuleUi.workerModel).toBe("new");
  expect(instances[3]).toBe(instances[2]);
});

it.each(["session change", "agent busy"])("ignores picker results after %s", async change => {
  const { command, hooks, ctx } = setup();
  ctx.mode = "tui";
  ctx.ui.custom.mockImplementation(async () => {
    if (change === "session change") {
      ctx.hasUI = false;
      await hooks.get("session_start")({}, ctx);
    } else ctx.isIdle = () => false;
    return { provider: "test", id: "stale" };
  });
  await command.handler("", ctx);
  expect(ctx.ui.notify).not.toHaveBeenCalledWith("Flash model: test/stale", "info");
  expect(ctx.modelRegistry.find).not.toHaveBeenCalled();
});
