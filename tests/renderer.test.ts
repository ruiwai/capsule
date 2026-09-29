import { initTheme } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import { renderCapsuleCall, renderCapsuleResult } from "../src/extension/renderer.js";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { installToolExecutionPolicy, SEQUENTIAL_TOOL } from "../src/extension/tool-policy.js";

initTheme("dark");

it("hides the barrier throughout real Pi tool rendering without blank spacing", async () => {
  const root = dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent")));
  const { ToolExecutionComponent } = await import(pathToFileURL(join(root,
    "modes/interactive/components/tool-execution.js")).href);
  let definition: any;
  installToolExecutionPolicy({ on() {}, registerTool(tool: any) { definition = tool; } } as any);
  expect(definition.name).toBe(SEQUENTIAL_TOOL);
  const component = new ToolExecutionComponent(SEQUENTIAL_TOOL, "capsule-barrier-test", {}, {},
    definition, { requestRender() {} }, process.cwd());
  const hidden = () => {
    for (const width of [20, 80]) expect(component.render(width)).toEqual([]);
  };
  hidden();
  component.setArgsComplete();
  component.markExecutionStarted();
  hidden();
  for (const isError of [false, true]) {
    for (const partial of [true, false]) {
      component.updateResult({ content: [{ type: "text", text: "internal result" }], details: {}, isError }, partial);
      hidden();
      component.setExpanded(true);
      component.invalidate();
      hidden();
      component.setExpanded(false);
    }
  }
});

const theme = {
  fg: (_name: string, value: string) => value,
  bold: (value: string) => value,
} as any;
function output(component: { render(width: number): string[] }, width = 80) {
  return component.render(width).join("\n");
}

describe("delegate_capsule renderer", () => {
  it("keeps calls compact, previews Markdown, and hides output_example", () => {
    vi.stubEnv("CAPSULE_FLASH_MODEL", "provider/flash-override");
    try {
      const text = output(renderCapsuleCall({ capsule: "# Investigate\n\nDo the **important** thing.", output_example: "SECRET_EXAMPLE", timeout_s: 12 }, theme));
      expect(text).toContain("delegate_capsule");
      expect(text).toContain("provider/flash-override");
      expect(text).toContain("Investigate");
      expect(text).toContain("important");
      expect(text).not.toContain("SECRET_EXAMPLE");
    } finally { vi.unstubAllEnvs(); }
  });

  it.each([false, null, 0, "answer"]) ("preserves completed primitive %j", value => {
    const text = output(renderCapsuleResult({ content: [], details: { status: "completed", result: value, capsuleUi: { workerProvider: "actual", workerModel: "stored" } } }, {}, theme));
    expect(text).toContain(String(value));
    expect(text).toContain("actual/stored");
  });

  it("uses the default model and a cached worker identity for call previews", () => {
    vi.unstubAllEnvs();
    expect(output(renderCapsuleCall({ capsule: "work" }, theme))).toContain("openai-codex/gpt-5.6-luna");
    expect(output(renderCapsuleCall({ capsule: "work" }, theme, () => "cached/provider-model"))).toContain("cached/provider-model");
  });

  it("keeps Markdown and list newlines in call previews", () => {
    const text = output(renderCapsuleCall({ capsule: "# Heading\n\n- first\n- second" }, theme));
    expect(text).toContain("Heading");
    expect(text).toContain("first");
    expect(text).toContain("second");
  });

  it("bounds multiline call previews without promising expansion", () => {
    const capsule = Array.from({ length: 30 }, (_, i) => `line-${i}`).join("\n");
    const text = output(renderCapsuleCall({ capsule }, theme));
    expect(text).toContain("line-7");
    expect(text).not.toContain("line-8");
    expect(text).toContain("…");
    expect(text).not.toContain("expand");
  });

  it.each(["false", "null", "0", '"answer"'])("preserves raw primitive %s with empty details", raw => {
    const text = output(renderCapsuleResult({ content: [{ type: "text", text: raw }], details: {} }, {}, theme));
    expect(text).toContain(raw);
    expect(text).not.toContain("no data");
  });

  it("collapses long results with an expand hint and expands fully", () => {
    const value = Array.from({ length: 12 }, (_, i) => `item-${i}-${"x".repeat(120)}`).join("\n");
    const compact = output(renderCapsuleResult({ content: [], details: { status: "completed", result: value } }, {}, theme));
    expect(compact).toContain("expand to view full result");
    expect(compact).not.toContain("item-11-");
    const expanded = output(renderCapsuleResult({ content: [], details: { status: "completed", result: value } }, { expanded: true }, theme));
    expect(expanded).toContain("item-11-");
    expect(expanded).toContain("x".repeat(40));
  });

  it("uses a neutral heading for no data", () => {
    const text = output(renderCapsuleResult({ content: [], details: { status: "completed" } }, {}, theme));
    expect(text).toContain("no data");
    expect(text).not.toContain("✓ completed");
  });

  it("shows plain text error fallbacks", () => {
    const text = output(renderCapsuleResult({ content: [{ type: "text", text: "plain worker error" }] }, {}, theme, { isError: true }));
    expect(text).toContain("plain worker error");
    expect(text).toContain("✗ error");
  });

  it("formats structured results and shows only paths when expanded", () => {
    const result = { content: [], details: { status: "completed", result: { ok: false, items: ["a", "b"] }, raw_history: "/tmp/history.jsonl", notes_path: "/tmp/notes.md" } };
    const compact = output(renderCapsuleResult(result, { expanded: false }, theme));
    expect(compact).toContain("ok: false");
    expect(compact).not.toContain("history.jsonl");
    const expanded = output(renderCapsuleResult(result, { expanded: true }, theme));
    expect(expanded).toContain("History: /tmp/history.jsonl");
    expect(expanded).toContain("Notes: /tmp/notes.md");
  });

  it.each(["blocked", "timeout", "error"])("renders %s notes inline", status => {
    const text = output(renderCapsuleResult({ content: [], details: { status, notes: "worker could not finish" } }, {}, theme));
    expect(text).toContain("worker could not finish");
    expect(text).not.toContain('"status"');
  });

  it("survives partial and missing arguments/details at narrow widths", () => {
    expect(output(renderCapsuleCall(undefined, theme), 24)).toContain("capsule unavailable");
    expect(output(renderCapsuleResult(undefined, { isPartial: true }, theme), 24)).toContain("working");
    expect(output(renderCapsuleResult({ content: [{ type: "text", text: "plain fallback" }] }, {}, theme), 24)).toContain("plain fallback");
  });
});
