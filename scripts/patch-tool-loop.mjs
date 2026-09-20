import { createRequire } from "node:module";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Patch the exact SDK used by this checkout, not an unrelated global Pi.
const sdkEntry = import.meta.resolve("@earendil-works/pi-coding-agent");
const sdkRequire = createRequire(sdkEntry);
const manifest = sdkRequire.resolve("@earendil-works/pi-agent-core/package.json");
const sdkManifest = join(dirname(fileURLToPath(sdkEntry)), "../package.json");
if ([manifest, sdkManifest].some(path => JSON.parse(readFileSync(path, "utf8")).version !== "0.85.1")) {
  throw Error("Review the Capsule short-circuit patch before upgrading Pi.");
}
const path = join(dirname(manifest), "dist/agent-loop.js");
const originalSource = readFileSync(path, "utf8");
let source = originalSource;
const override = 'globalThis[Symbol.for("pi-capsule.sequential-tools")] === true || ';
function forceSequential(text, condition) {
  const replacement = override + condition;
  if (text.split(condition).length !== 2) throw Error("Pi execution-mode dispatch changed; refusing to patch.");
  if (text.includes(replacement)) return text;
  return text.replace(condition, replacement);
}
source = forceSequential(source, 'config.toolExecution === "sequential" || hasSequentialToolCall');
const marker = "// Capsule: short-circuit sequential batches.";
const before = `        if (signal?.aborted) {
            break;
        }
    }
    return {
        messages,
        terminate: shouldTerminateToolBatch(finalizedCalls),
    };`;
const after = `        ${marker}
        if (finalized.isError && !signal?.aborted) {
            // Preserve one result per call without preparing or executing the tail.
            for (const skipped of toolCalls.slice(messages.length)) {
                const skippedResult = {
                    toolCall: skipped,
                    result: createErrorToolResult(\`Skipped: earlier tool call \${toolCall.id} failed. Not executed; reassess before retrying.\`),
                    isError: true,
                };
                await emit({ type: "tool_execution_start", toolCallId: skipped.id,
                    toolName: skipped.name, args: skipped.arguments });
                await emitToolExecutionEnd(skippedResult, emit);
                const message = createToolResultMessage(skippedResult);
                await emitToolResultMessage(message, emit);
                messages.push(message);
            }
            return { messages, terminate: false };
        }
${before}`;
if (source.includes(marker)) {
  if (!source.includes(after)) throw Error("Capsule tool-loop patch differs from expected content.");
} else {
  if (source.split(before).length !== 2) throw Error("Pi tool-loop patch context changed; refusing to patch.");
  source = source.replace(before, after);
}
// Validate all targets before writing either copy. Unchanged files are not
// rewritten, so re-running postinstall is a no-op. Writes are not transactional.
const writes = source === originalSource ? [] : [[path, source]];

// Pi's CLI/RPC bundle embeds its own copy, rather than importing the SDK loop.
const start = "async function executeToolCallsSequential(";
const end = "async function executeToolCallsParallel(";
const from = source.indexOf(start), to = source.indexOf(end, from);
if (from < 0 || to < 0 || source.indexOf(start, from + 1) >= 0) throw Error("Ambiguous SDK Pi loop.");
const replacement = source.slice(from, to);
const chunks = join(dirname(fileURLToPath(sdkEntry)), "bundle/chunks");
let found = 0;
for (const file of readdirSync(chunks).filter(file => file.endsWith(".js"))) {
  const target = join(chunks, file);
  const original = readFileSync(target, "utf8");
  if (!original.includes(start)) continue;
  const text = forceSequential(original, 'config.toolExecution==="sequential"||hasSequentialToolCall');
  const from = text.indexOf(start);
  const to = text.indexOf(end, from);
  const current = text.slice(from, to);
  if (to < 0 || text.indexOf(start, from + 1) >= 0) throw Error("Ambiguous bundled Pi loop.");
  found++;
  if (current === replacement) {
    if (text !== original) writes.push([target, text]);
    continue;
  }
  if (current.includes(marker) || !current.endsWith("messages.push(toolResultMessage),signal?.aborted)break}return{messages,terminate:shouldTerminateToolBatch(finalizedCalls)}}")) {
    throw Error("Bundled Pi tool-loop patch context changed; refusing to patch.");
  }
  writes.push([target, text.slice(0, from) + replacement + text.slice(to)]);
}
if (found !== 1) throw Error(`Expected one bundled Pi loop, found ${found}.`);
for (const [target, contents] of writes) writeFileSync(target, contents);
