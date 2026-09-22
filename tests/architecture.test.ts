import { readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as extension from "../src/extension/index.js";

describe("production architecture", () => {
  it("exposes only the Capsule entrypoint", () => {
    expect(Object.keys(extension)).toEqual(["default"]);
    const tools: string[] = [];
    const commands: string[] = [];
    extension.default({
      on() {},
      registerCommand(name: string) { commands.push(name); },
      registerTool(tool: { name: string }) { tools.push(tool.name); },
    } as any);
    expect(tools).toEqual(["delegate_capsule"]);
    expect(commands).toEqual(["flash"]);
  });

  it("keeps source dependencies inside the two production modules", async () => {
    const root = resolve("src");
    const entries = await readdir(root, { withFileTypes: true });
    // Empty directories may survive local deletions; inspect source files instead.
    const files = (await readdir(root, { recursive: true }))
      .filter(path => path.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    expect(entries.some(entry => entry.name === "capsule")).toBe(true);
    const graph = new Map<string, string[]>();
    for (const file of files) {
      expect(file).toMatch(/^(capsule|extension)\//);
      const path = join(root, file);
      const source = await readFile(path, "utf8");
      const dependencies: string[] = [];
      graph.set(path, dependencies);
      for (const dependency of ts.preProcessFile(source).importedFiles) {
        const name = dependency.fileName;
        expect(name).not.toBe("node:sqlite");
        if (!name.startsWith(".")) continue;
        const target = resolve(dirname(path), name).replace(/\.js$/, ".ts");
        dependencies.push(target);
        expect(files.map(file => join(root, file))).toContain(target);
        if (file.startsWith("capsule/")) {
          expect(target.startsWith(join(root, "capsule") + "/")).toBe(true);
        }
      }
      if (file.startsWith("capsule/")) {
        expect(ts.preProcessFile(source).importedFiles.some(x => x.fileName.startsWith("@earendil-works/"))).toBe(false);
      }
    }
    const reachable = new Set<string>();
    const visiting = new Set<string>();
    const visit = (file: string) => {
      expect(visiting.has(file), `Dependency cycle at ${file}`).toBe(false);
      if (reachable.has(file)) return;
      visiting.add(file);
      reachable.add(file);
      for (const dependency of graph.get(file) ?? []) visit(dependency);
      visiting.delete(file);
    };
    visit(join(root, "extension/index.ts"));
    expect([...graph.keys()].filter(file => !reachable.has(file))).toEqual([]);
  });
});
