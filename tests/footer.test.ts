import { describe, expect, it, vi } from "vitest";
import { visibleWidth } from "@earendil-works/pi-tui";
import { initTheme } from "@earendil-works/pi-coding-agent";
import { formatFlashFooterLine, installCapsuleFooter } from "../src/extension/footer.js";
import capsuleExtension from "../src/extension/index.js";

const theme = { fg: (_: string, value: string) => value } as any;

describe("Flash footer", () => {
  it("clears the legacy TUI status rather than adding a duplicate Flash line", async () => {
    const hooks = new Map<string, any>();
    const setStatus = vi.fn(), setFooter = vi.fn();
    capsuleExtension({ on: (name: string, handler: any) => hooks.set(name, handler), registerTool: vi.fn() } as any);
    await hooks.get("session_start")({}, { hasUI: true, mode: "tui", ui: { setStatus, setFooter } });
    expect(setStatus).toHaveBeenCalledExactlyOnceWith("capsule.flash", undefined);
    expect(setFooter).toHaveBeenCalledOnce();
  });

  it("shows the current state and model id in the sole aligned row before telemetry arrives", () => {
    const line = formatFlashFooterLine(undefined, 80, theme, "openai-codex/gpt-5.6-luna", "starting");
    expect(line).toMatch(/^Flash: starting +gpt-5\.6-luna$/);
    expect(visibleWidth(line)).toBe(80);
    expect(line).not.toContain("idle");
  });

  it("uses worker telemetry and right-aligns its independent model", () => {
    const line = formatFlashFooterLine({
      tokens: { input: 19000, output: 1700, cacheRead: 83000, cacheWrite: 0 },
      cost: 0.358, contextUsage: { tokens: 262000, contextWindow: 272000, percent: 96.5 },
      model: "gpt-6-astra", thinkingLevel: "medium", subscription: true, cacheHitRate: 96.5,
    }, 120, theme);
    expect(line).toContain("↑19k ↓1.7k R83k CH96.5% $0.358 (sub) 96.5%/272k");
    expect(line.endsWith("gpt-6-astra • medium")).toBe(true);
    expect(line.length).toBe(120);
  });

  it("preserves Pi's parent footer and appends Flash below it", () => {
    initTheme("dark", false);
    let telemetry: any;
    let factory: any;
    let redraw: (() => void) | undefined;
    const requestRender = vi.fn();
    const model = { provider: "parent", id: "parent-model", reasoning: true, contextWindow: 100000 };
    const ctx: any = {
      hasUI: true, mode: "tui", cwd: `${process.env.HOME}/project`, model,
      thinkingLevel: "high", getContextUsage: () => ({ tokens: 50000, contextWindow: 100000, percent: 50 }),
      sessionManager: {
        getEntries: () => [{ type: "message", message: { role: "assistant", usage: { input: 1000, output: 2000, cacheRead: 3000, cacheWrite: 0, cost: { total: 0.123 } } } }],
        getCwd: () => `${process.env.HOME}/project`, getSessionName: () => "session-name",
      },
      modelRegistry: { isUsingOAuth: () => true, getProvider: () => ({ auth: { oauth: { isSubscription: true } } }) },
      settingsManager: { getProjectSettings: () => ({ compaction: { enabled: true } }) },
      ui: { setFooter: (value: any) => { factory = value; } },
    };
    installCapsuleFooter(ctx, () => telemetry, value => { redraw = value; }, () => "flash-model");
    const footerData = {
      getGitBranch: () => "main", getSessionName: () => "session-name", getAvailableProviderCount: () => 1,
      getExtensionStatuses: () => new Map([["other", "Other status"]]),
      onBranchChange: () => () => {},
    };
    const component = factory({ requestRender }, theme, footerData);
    const parentLines = component.render(120);
    expect(parentLines[0]).toContain("~/project (main) • session-name");
    expect(parentLines[1]).toContain("CH");
    expect(parentLines[1]).toContain("(sub)");
    expect(parentLines[3]).toContain("Other status");
    expect(parentLines).toHaveLength(4);
    expect(parentLines[2]).toContain("Flash: idle");
    expect(parentLines[2].endsWith("flash-model")).toBe(true);
    telemetry = { tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, cost: 0, model: "flash-model", thinkingLevel: "low" };
    redraw?.();
    expect(requestRender).toHaveBeenCalledOnce();
    component.dispose();
  });

  it("truncates safely at narrow widths without inventing usage", () => {
    const line = formatFlashFooterLine(undefined, 24, theme);
    expect(line).toBe("Flash: idle");
    const populated = formatFlashFooterLine({
      tokens: { input: 1, output: 2, cacheRead: 0, cacheWrite: 0 }, cost: 0,
      contextUsage: { tokens: null, contextWindow: 272000, percent: null }, model: "very-long-worker-model", thinkingLevel: "high",
    }, 24, theme);
    expect(visibleWidth(populated)).toBeLessThanOrEqual(24);
    expect(populated).not.toContain("undefined");
  });
});
