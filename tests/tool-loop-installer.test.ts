import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "capsule-loop-installer-"));
  roots.push(root);
  const sdk = join(root, "node_modules/@earendil-works/pi-coding-agent");
  const core = join(sdk, "node_modules/@earendil-works/pi-agent-core");
  mkdirSync(join(sdk, "dist/bundle/chunks"), { recursive: true });
  mkdirSync(join(core, "dist"), { recursive: true });
  writeFileSync(join(sdk, "package.json"), JSON.stringify({ version: "0.85.1", exports: { ".": "./dist/index.js" } }));
  writeFileSync(join(sdk, "dist/index.js"), "");
  writeFileSync(join(core, "package.json"), JSON.stringify({ version: "0.85.1", exports: { "./package.json": "./package.json" } }));
  const entry = import.meta.resolve("@earendil-works/pi-coding-agent");
  const installedCore = dirname(createRequire(entry).resolve("@earendil-works/pi-agent-core/package.json"));
  const loop = join(core, "dist/agent-loop.js");
  const installed = readFileSync(join(installedCore, "dist/agent-loop.js"), "utf8");
  // Exercise initial SDK patching, not just an already-patched no-op.
  const pristine = installed.replace('globalThis[Symbol.for("pi-capsule.sequential-tools")] === true || ', "")
    .replace(/        \/\/ Capsule: short-circuit sequential batches\.[\s\S]*?(?=        if \(signal\?\.aborted\))/, "");
  expect(pristine).not.toContain("Capsule: short-circuit");
  writeFileSync(loop, pristine);
  const chunks = join(dirname(fileURLToPath(entry)), "bundle/chunks");
  const bundled = readdirSync(chunks).filter(file => file.endsWith(".js"))
    .map(file => readFileSync(join(chunks, file), "utf8"))
    .find(text => text.includes("async function executeToolCallsSequential("))!;
  const bundle = join(sdk, "dist/bundle/chunks/loop.js");
  // Only the inspected functions are needed; never execute this fixture bundle.
  writeFileSync(bundle, bundled.slice(bundled.indexOf("async function executeToolCalls("),
    bundled.indexOf("async function executeToolCallsParallel(")) + "async function executeToolCallsParallel() {}");
  const script = join(root, "patch-tool-loop.mjs");
  writeFileSync(script, readFileSync("scripts/patch-tool-loop.mjs"));
  const run = () => execFileSync(process.execPath, [script], { stdio: "pipe" });
  return { sdk, core, loop, bundle, run, installed, pristine };
}

it("patches the SDK and does not rewrite unchanged files on rerun", () => {
  const f = fixture();
  f.run();
  expect(readFileSync(f.loop, "utf8")).toBe(f.installed);
  const before = [f.loop, f.bundle].map(path => statSync(path, { bigint: true }).mtimeNs);
  f.run();
  expect([f.loop, f.bundle].map(path => statSync(path, { bigint: true }).mtimeNs)).toEqual(before);
});

it("rejects an unexpected bundle before writing the SDK", () => {
  const f = fixture();
  writeFileSync(f.bundle, "// unsupported bundle");
  expect(f.run).toThrow(/Expected one bundled Pi loop/);
  expect(readFileSync(f.loop, "utf8")).toBe(f.pristine);
  expect(readFileSync(f.bundle, "utf8")).toBe("// unsupported bundle");
});

it.each(["sdk", "core"] as const)("rejects an unsupported %s version before writing", target => {
  const f = fixture();
  const manifest = join(f[target], "package.json");
  const pkg = JSON.parse(readFileSync(manifest, "utf8"));
  writeFileSync(manifest, JSON.stringify({ ...pkg, version: "0.86.0" }));
  expect(f.run).toThrow(/Review the Capsule short-circuit patch/);
  expect(readFileSync(f.loop, "utf8")).toBe(f.pristine);
});
