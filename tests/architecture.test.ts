import { readdir, readFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import * as extension from "../src/extension/index.js";

describe("production architecture", () => {
  it("exposes only the Capsule entrypoint", () => {
    expect(Object.keys(extension)).toEqual(["default"]);
    const tools: string[] = [];
    extension.default({
      on() {},
      registerTool(tool: { name: string }) { tools.push(tool.name); },
    } as any);
    expect(tools).toEqual(["delegate_capsule"]);
  });

  it("keeps source dependencies inside the two production modules", async () => {
    const root = resolve("src");
    const entries = await readdir(root, { withFileTypes: true });
    // Empty directories may survive local deletions; inspect source files instead.
    const files = (await readdir(root, { recursive: true }))
      .filter(path => path.endsWith(".ts"));
    expect(files.length).toBeGreaterThan(0);
    expect(entries.some(entry => entry.name === "capsule")).toBe(true);
    for (const file of files) {
      expect(file).toMatch(/^(capsule|extension)\//);
      const path = join(root, file);
      const source = await readFile(path, "utf8");
      for (const dependency of ts.preProcessFile(source).importedFiles) {
        const name = dependency.fileName;
        expect(name).not.toBe("node:sqlite");
        if (!name.startsWith(".")) continue;
        const target = resolve(dirname(path), name).replace(/\.js$/, ".ts");
        expect(files.map(file => join(root, file))).toContain(target);
        if (file.startsWith("capsule/")) {
          expect(target.startsWith(join(root, "capsule") + "/")).toBe(true);
        }
      }
    }
  });
});
