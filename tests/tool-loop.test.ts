import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { Type } from "typebox";
import { CAPSULE_SEQUENTIAL_TOOLS, installToolExecutionPolicy } from "../src/extension/tool-policy.js";
import capsuleExtension from "../src/extension/index.js";
import { createWorkerExtension } from "../src/extension/pi-backend.js";

const runtime = globalThis as Record<symbol, unknown>;
afterEach(() => { delete runtime[CAPSULE_SEQUENTIAL_TOOLS]; });

const sdkRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const core = dirname(sdkRequire.resolve("@earendil-works/pi-agent-core/package.json"));
const { runAgentLoop } = await import(pathToFileURL(join(core, "dist/agent-loop.js")).href);

it("patches the CLI/RPC bundle with the same tested sequential loop", () => {
  const extract = (source: string) => source.slice(source.indexOf("async function executeToolCallsSequential("),
    source.indexOf("async function executeToolCallsParallel("));
  const sdkLoop = extract(readFileSync(join(core, "dist/agent-loop.js"), "utf8"));
  expect(sdkLoop).toContain("Capsule: short-circuit sequential batches.");
  const chunks = join(dirname(fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"))), "bundle/chunks");
  const loops = readdirSync(chunks).filter(file => file.endsWith(".js"))
    .map(file => readFileSync(join(chunks, file), "utf8"))
    .filter(source => source.includes("async function executeToolCallsSequential("));
  expect(loops).toHaveLength(1);
  expect(extract(loops[0]!)).toBe(sdkLoop);
  const override = 'globalThis[Symbol.for("pi-capsule.sequential-tools")] === true || ';
  expect(readFileSync(join(core, "dist/agent-loop.js"), "utf8"))
    .toContain(override + 'config.toolExecution === "sequential" || hasSequentialToolCall');
  expect(loops[0]).toContain(override + 'config.toolExecution==="sequential"||hasSequentialToolCall');
});

async function run(failure: string, mode: "sequential" | "parallel" = "sequential", failedTool = "middle") {
  const executed: string[] = [];
  const prepared: string[] = [];
  const argumentsPrepared: string[] = [];
  const finalized: string[] = [];
  const events: any[] = [];
  let turn = 0;
  let active = 0, maxActive = 0;
  const tools = ["first", "middle", "last"].map(name => ({
    name, description: name, parameters: Type.Object({ n: Type.Number() }),
    executionMode: mode === "parallel" && failure === "marked" && name === "first" ? "sequential" : "parallel",
    prepareArguments(args: unknown) { argumentsPrepared.push(name); return args; },
    async execute() {
      executed.push(name);
      maxActive = Math.max(maxActive, ++active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      if (name === failedTool && ["throw", "marked"].includes(failure)) throw Error("failed");
      return { content: [{ type: "text", text: "ok" }], details: {} };
    },
  }));
  const messages = await runAgentLoop([], { systemPrompt: "", messages: [], tools }, {
    model: {}, toolExecution: mode, convertToLlm: (messages: any) => messages,
    beforeToolCall: ({ toolCall }: any) => {
      prepared.push(toolCall.name);
      if (toolCall.name === failedTool && failure === "blocked") return { block: true };
    },
    afterToolCall: ({ toolCall }: any) => {
      finalized.push(toolCall.name);
      if (toolCall.name === failedTool && failure === "result") return { isError: true };
    },
  }, (event: any) => { events.push(event); }, undefined, () => {
    const message = { role: "assistant", content: turn++ < 2 ? (turn === 1 ? tools : tools.slice(2)).map(tool => ({
      type: "toolCall", id: `${turn}-${tool.name}`,
      name: tool.name === failedTool && failure === "unknown" ? "missing" : tool.name,
      arguments: { n: tool.name === failedTool && failure === "invalid" ? "bad" : 1 },
    })) : [], stopReason: "stop", timestamp: Date.now() };
    return { async *[Symbol.asyncIterator]() { yield { type: "done" }; }, result: async () => message };
  });
  return { executed, prepared, argumentsPrepared, finalized, messages, events, maxActive };
}

it.each(["throw", "blocked", "result", "unknown", "invalid", "marked"])("short circuits %s and resets next response", async failure => {
  const result = await run(failure, failure === "marked" ? "parallel" : "sequential");
  const firstResults = result.messages.filter((m: any) => m.role === "toolResult").slice(0, 3);
  expect(firstResults.map((m: any) => m.toolCallId)).toEqual(["1-first", "1-middle", "1-last"]);
  expect(firstResults[2].isError).toBe(true);
  expect(firstResults[2].content[0].text).toContain("Skipped:");
  expect(result.executed.filter(name => name === "last")).toEqual(["last"]);
  expect(result.prepared.filter(name => name === "last")).toEqual(["last"]);
  expect(result.argumentsPrepared.filter(name => name === "last")).toEqual(["last"]);
  expect(result.finalized.filter(name => name === "last")).toEqual(["last"]);
  expect(result.events.filter(event => event.type === "tool_execution_end").map(event => event.toolCallId))
    .toEqual(["1-first", "1-middle", "1-last", "2-last"]);
});

it.each(["first", "last"])("handles failure at the %s batch boundary", async failedTool => {
  const result = await run("throw", "sequential", failedTool);
  expect(result.executed).toEqual(failedTool === "first" ? ["first", "last"] : ["first", "middle", "last", "last"]);
  const firstResults = result.messages.filter((m: any) => m.role === "toolResult").slice(0, 3);
  expect(firstResults).toHaveLength(3);
  expect(firstResults.filter((m: any) => m.content[0].text.startsWith("Skipped:")))
    .toHaveLength(failedTool === "first" ? 2 : 0);
});

it("runs successful batches in order", async () => {
  expect((await run("none")).executed).toEqual(["first", "middle", "last", "last"]);
});

it("leaves explicitly parallel unmarked batches unchanged", async () => {
  const result = await run("throw", "parallel");
  expect(result.executed).toEqual(["first", "middle", "last", "last"]);
  expect(result.maxActive).toBe(3);
});

it.each(["parent", "worker"])("%s plugin overrides parallel mode for ordinary tools", async role => {
  const pi = { on() {}, registerTool() {} } as any;
  if (role === "parent") capsuleExtension(pi);
  else {
    const worker = createWorkerExtension({ outputExample: "", jit: [] }, { hooksRan: false, duplicate: false });
    await (typeof worker === "function" ? worker : worker.factory)(pi);
  }
  expect(runtime[CAPSULE_SEQUENTIAL_TOOLS]).toBe(true);
  // No delegate_capsule/yield in the batch or even the tool registry.
  const failure = await run("throw", "parallel");
  expect(failure.executed).toEqual(["first", "middle", "last"]);
  expect(failure.maxActive).toBe(1);
  expect(failure.messages.find((m: any) => m.role === "toolResult" && m.toolCallId === "1-last")
    .content[0].text).toContain("Skipped:");
  const success = await run("none", "parallel");
  expect(success.executed).toEqual(["first", "middle", "last", "last"]);
  expect(success.maxActive).toBe(1);
});

it("recognizes structured failures without treating completed negative evidence as an error", () => {
  let handler: any;
  installToolExecutionPolicy({ on(_event: string, callback: any) { handler = callback; } } as any);
  for (const outcome of [{ exit_code: 1 }, { exit_code: null, signal: "SIGTERM" }, { exit_code: 0, timed_out: true }, { exit_code: 0, descendant_cleanup_attempted: true }]) {
    expect(handler({ toolName: "bash_exec", details: { outcome } })).toEqual({ isError: true });
  }
  expect(handler({ toolName: "bash_exec", details: { outcome: { exit_code: 0 } } })).toBeUndefined();
  expect(handler({ toolName: "delegate_capsule", details: { status: "blocked" } })).toEqual({ isError: true });
  expect(handler({ toolName: "delegate_capsule", details: { status: "completed", result: "test failed" } })).toBeUndefined();
});
