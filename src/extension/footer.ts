import { truncateToWidth, visibleWidth, type Component, type TUI } from "@earendil-works/pi-tui";
import { FooterComponent, SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { WorkerTelemetry } from "../capsule/worker.js";

function formatTokens(count: number): string {
  if (count < 1000) return count.toString();
  if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
  if (count < 1000000) return `${Math.round(count / 1000)}k`;
  if (count < 10000000) return `${(count / 1000000).toFixed(1)}M`;
  return `${Math.round(count / 1000000)}M`;
}

function align(left: string, right: string, width: number): string {
  if (!left) {
    const shortened = truncateToWidth(right, width, "…");
    return " ".repeat(Math.max(0, width - visibleWidth(shortened))) + shortened;
  }
  left = truncateToWidth(left, width, "...");
  const room = width - visibleWidth(left) - 2;
  if (!right || room <= 0) return left;
  const shortened = truncateToWidth(right, room, "…");
  const result = left + " ".repeat(Math.max(2, width - visibleWidth(left) - visibleWidth(shortened))) + shortened;
  return truncateToWidth(result, width, "…");
}

/** The same compact stats grammar as Pi's footer, with real worker values. */
export function formatFlashFooterLine(telemetry: WorkerTelemetry | undefined, width: number, theme: any, idleModel?: string, state = "idle"): string {
  if (!telemetry) {
    const model = idleModel?.slice(idleModel.indexOf("/") + 1);
    return align("", theme.fg("dim", `Flash: ${state}${model ? ` · ${model}` : ""}`), width);
  }
  const t = telemetry.tokens;
  const parts = [`↑${formatTokens(t.input)}`, `↓${formatTokens(t.output)}`];
  if (t.cacheRead) parts.push(`R${formatTokens(t.cacheRead)}`);
  if (t.cacheWrite) parts.push(`W${formatTokens(t.cacheWrite)}`);
  if ((t.cacheRead || t.cacheWrite) && telemetry.tokens.input + t.cacheRead + t.cacheWrite > 0) {
    parts.push(`CH${(telemetry.cacheHitRate ?? (t.cacheRead / (t.input + t.cacheRead + t.cacheWrite) * 100)).toFixed(1)}%`);
  }
  if (telemetry.cost || telemetry.subscription) parts.push(`$${telemetry.cost.toFixed(3)}${telemetry.subscription ? " (sub)" : ""}`);
  const context = telemetry.contextUsage;
  if (context) {
    const percent = context.percent == null ? "?" : `${context.percent.toFixed(1)}%`;
    parts.push(`${percent}/${formatTokens(context.contextWindow)}${telemetry.autoCompaction ? " (auto)" : ""}`);
  }
  const thinking = telemetry.thinkingLevel && telemetry.thinkingLevel !== "off" ? telemetry.thinkingLevel : "thinking off";
  return align(theme.fg("dim", parts.join(" ")), theme.fg("dim", `Flash: ${state} · ${telemetry.model} • ${thinking}`), width);
}

/** Use Pi's public footer for the parent, then append one independent Flash row. */
export function installCapsuleFooter(
  ctx: ExtensionContext,
  telemetry: () => WorkerTelemetry | undefined,
  onRender?: (requestRender: (() => void) | undefined) => void,
  idleModel?: () => string,
  workerState?: () => string,
): void {
  if (!ctx.hasUI || ctx.mode !== "tui") return;
  let requestRender: (() => void) | undefined;
  ctx.ui.setFooter((tui: TUI, theme: any, footerData: any) => {
    requestRender = () => tui.requestRender();
    onRender?.(requestRender);
    const state = {
      get model() { return ctx.model; },
      get thinkingLevel() { return ctx.thinkingLevel ?? "off"; },
    };
    const usingSubscription = (provider: string) => {
      const model = ctx.model;
      return !!model && ctx.modelRegistry.isUsingOAuth(model)
        && ctx.modelRegistry.getProvider(provider)?.auth?.oauth?.isSubscription === true;
    };
    const session = {
      get state() { return state; },
      sessionManager: ctx.sessionManager,
      getContextUsage: () => ctx.getContextUsage(),
      modelRuntime: { isUsingSubscription: usingSubscription },
      get model() { return ctx.model; },
      get thinkingLevel() { return ctx.thinkingLevel ?? "off"; },
    } as any;
    const parent = new FooterComponent(session, footerData);
    const settings = SettingsManager.create(ctx.cwd);
    parent.setAutoCompactEnabled(settings.getCompactionEnabled());
    const unsubscribe = footerData.onBranchChange(() => tui.requestRender());
    return {
      render(width: number) {
        const lines = parent.render(width);
        lines.splice(2, 0, formatFlashFooterLine(telemetry(), width, theme, idleModel?.(), workerState?.()));
        return lines;
      },
      invalidate() { parent.invalidate(); },
      dispose() { unsubscribe(); parent.dispose(); requestRender = undefined; onRender?.(undefined); },
    } as Component & { dispose(): void };
  });
}
