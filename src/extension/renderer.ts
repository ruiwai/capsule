import { getMarkdownTheme, type Theme } from "@earendil-works/pi-coding-agent";
import { Container, Markdown, Text, type Component } from "@earendil-works/pi-tui";
import { DEFAULT_FLASH_MODEL } from "./pi-backend.js";

export type CapsuleUiDetails = {
  workerProvider?: string;
  workerModel?: string;
};

type RenderContext = {
  args?: unknown;
  state?: Record<string, unknown>;
  isError?: boolean;
  cwd?: string;
};

type ToolResult = {
  content?: Array<{ type?: string; text?: string }>;
  details?: unknown;
};

const CALL_PREVIEW_LIMIT = 280;
const RESULT_LIMIT = 1_000;
const RESULT_LINES = 8;

function textValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function preview(value: unknown, limit: number, maxLines?: number, expandable = true): string {
  const text = typeof value === "string" ? value : String(value ?? "");
  const lines = text.trim().split("\n");
  const bounded = maxLines === undefined || lines.length <= maxLines ? lines : lines.slice(0, maxLines);
  let result = bounded.join("\n");
  const shortened = bounded.length < lines.length || result.length > limit;
  if (result.length > limit) result = `${result.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
  if (!shortened) return result;
  return expandable ? `${result}\n… (expand to view full result)` : `${result.replace(/…$/, "")}…`;
}

function defaultModelName(): string {
  return process.env.CAPSULE_FLASH_MODEL || DEFAULT_FLASH_MODEL;
}

function formatValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "boolean" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value.length === 0 ? "[]" : value.map((item, i) => `${i + 1}. ${formatValue(item)}`).join("\n");
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    return entries.length === 0 ? "{}" : entries.map(([key, item]) => `${key}: ${formatValue(item)}`).join("\n");
  }
  return String(value);
}

function resultPayload(result: ToolResult): { status?: string; result?: unknown; value?: unknown; notes?: string; raw_history?: string; notes_path?: string } {
  const details = result.details && typeof result.details === "object" ? result.details as Record<string, unknown> : undefined;
  const raw = result.content?.find(part => part?.type === "text")?.text;
  if (details) {
    // Keep the structured details authoritative, but do not lose a plain-text
    // error emitted by a tool alongside an otherwise empty envelope.
    if (raw && !Object.hasOwn(details, "result") && !Object.hasOwn(details, "value") && !Object.hasOwn(details, "notes")) {
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") return { ...parsed, ...details } as ReturnType<typeof resultPayload>;
      } catch { /* Preserve plain text alongside an empty details envelope. */ }
      return { ...details, value: raw } as ReturnType<typeof resultPayload>;
    }
    return details as ReturnType<typeof resultPayload>;
  }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed && typeof parsed === "object") return parsed as ReturnType<typeof resultPayload>;
  } catch { /* Older/partial results may simply be text. */ }
  return { value: raw };
}

function pathLines(payload: ReturnType<typeof resultPayload>): string[] {
  const paths: string[] = [];
  if (typeof payload.notes_path === "string") paths.push(`Notes: ${payload.notes_path}`);
  if (typeof payload.raw_history === "string") paths.push(`History: ${payload.raw_history}`);
  return paths;
}

export function renderCapsuleCall(args: unknown, theme: Theme, getModelName: () => string = defaultModelName): Component {
  const input = args && typeof args === "object" ? args as Record<string, unknown> : {};
  const capsule = preview(input.capsule, CALL_PREVIEW_LIMIT, 8, false) || "(capsule unavailable)";
  const timeout = typeof input.timeout_s === "number" && Number.isFinite(input.timeout_s) ? ` · timeout ${input.timeout_s}s` : "";
  const container = new Container();
  container.addChild(new Text(`${theme.fg("toolTitle", theme.bold("delegate_capsule"))} ${theme.fg("muted", `· Flash ${getModelName()}${timeout}`)}`, 0, 0));
  container.addChild(new Markdown(capsule, 0, 0, getMarkdownTheme()));
  return container;
}

export function renderCapsuleResult(result: ToolResult | undefined, options: { expanded?: boolean; isPartial?: boolean } = {}, theme: Theme, context: RenderContext = {}): Component {
  if (options.isPartial) return new Text(theme.fg("warning", "Flash is working…"), 0, 0);

  const payload = resultPayload(result ?? {});
  const hasValue = Object.hasOwn(payload, "result") || Object.hasOwn(payload, "value") || Object.hasOwn(payload, "notes");
  const status = typeof payload.status === "string" ? payload.status : context.isError ? "error" : undefined;
  const failed = status === "blocked" || status === "timeout" || status === "error" || context.isError;
  const neutral = !failed && !hasValue;
  const heading = failed
    ? theme.fg("error", `✗ ${status ?? "error"}`)
    : neutral ? theme.fg("muted", "• no data") : theme.fg("success", `✓ ${status ?? "completed"}`);
  const container = new Container();
  const actual = result?.details && typeof result.details === "object" ? (result.details as Record<string, unknown>).capsuleUi as CapsuleUiDetails | undefined : undefined;
  const worker = actual?.workerProvider && actual.workerModel ? `${actual.workerProvider}/${actual.workerModel}` : undefined;
  container.addChild(new Text(`${heading}${worker ? theme.fg("muted", ` · Flash ${worker}`) : ""}`, 0, 0));

  const message = failed ? (textValue(payload.notes) ?? textValue(payload.value)) : (Object.hasOwn(payload, "result") ? payload.result : payload.value);
  if (message !== undefined) {
    const readable = options.expanded ? formatValue(message) : preview(formatValue(message), RESULT_LIMIT, RESULT_LINES);
    if (typeof message === "string" && !failed) container.addChild(new Markdown(readable, 0, 0, getMarkdownTheme()));
    else container.addChild(new Text(theme.fg(failed ? "error" : "toolOutput", readable), 0, 0));
  }
  if (options.expanded) {
    for (const path of pathLines(payload)) container.addChild(new Text(theme.fg("dim", path), 0, 0));
  }
  return container;
}

export function capsuleRenderers(getModelName: () => string = defaultModelName) {
  return {
    renderCall(args: unknown, theme: Theme) { return renderCapsuleCall(args, theme, getModelName); },
    renderResult(result: ToolResult, options: { expanded?: boolean; isPartial?: boolean }, theme: Theme, context: RenderContext) {
      return renderCapsuleResult(result, options, theme, context);
    },
  };
}
