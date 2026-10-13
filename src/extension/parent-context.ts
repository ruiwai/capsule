import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import type { ParentWorkerContext } from "./pi-backend.js";
import { SEQUENTIAL_TOOL } from "./tool-policy.js";

export type WorkerPolicy = { excludedTools: string[]; excludedExtensions: string[]; sharedInstructions: string };
const DEFAULT_EXCLUDED_EXTENSIONS = ["pi-goal-x"];
const packageName = /^(?:@[a-z0-9_-]+\/)?[a-z0-9_-][a-z0-9._-]*$/i;

/** Match the owning package, not a substring of its installation directory. */
function owningPackage(path: string): string | undefined {
  for (let directory = dirname(path); ; directory = dirname(directory)) {
    try {
      const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8"));
      return typeof manifest.name === "string" ? manifest.name : undefined;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw Error(`configuration_required: cannot identify extension package at ${directory}: ${String(error)}`);
    }
    if (dirname(directory) === directory) return undefined;
  }
}

/** Project fields override global fields; arrays replace rather than append. */
export function resolveWorkerPolicy(global: Record<string, unknown>, project: Record<string, unknown>, cwd: string): WorkerPolicy {
  const section = (settings: Record<string, unknown>): Record<string, unknown> => {
    const value = settings.capsule;
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("configuration_required: capsule must be an object");
    return value as Record<string, unknown>;
  };
  const config = { ...section(global), ...section(project) };
  const strings = (key: string, fallback: string[] = []): string[] => {
    const value = config[key] === undefined ? fallback : config[key];
    if (!Array.isArray(value) || value.some(x => typeof x !== "string" || !x.trim()))
      throw Error(`configuration_required: capsule.${key} must be an array of nonempty strings`);
    return [...new Set(value.map(x => x.trim()))];
  };
  const excludedTools = strings("excludedTools");
  const required = ["yield", "list_lesson_topic", "fetch_lesson", SEQUENTIAL_TOOL];
  if (excludedTools.some(name => required.includes(name))) throw Error("configuration_required: cannot exclude required Capsule worker tools");
  const sharedInstructions = config.sharedInstructions === undefined ? "" : config.sharedInstructions;
  if (typeof sharedInstructions !== "string") throw Error("configuration_required: capsule.sharedInstructions must be a string");
  return { excludedTools, sharedInstructions, excludedExtensions: strings("excludedExtensions", DEFAULT_EXCLUDED_EXTENSIONS).map(path =>
    packageName.test(path) ? path : resolve(cwd, path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : path)) };
}

/** Snapshot live parent state without sharing its mutable extension runtime. */
export function captureParentContext(
  pi: ExtensionAPI,
  toolOverride?: string[],
  policy: WorkerPolicy = { excludedTools: [], excludedExtensions: DEFAULT_EXCLUDED_EXTENSIONS, sharedInstructions: "" },
): ParentWorkerContext {
  const configured = pi.getAllTools();
  const capsulePath = configured.find(tool => tool.name === "delegate_capsule")?.sourceInfo.path;
  // Source metadata includes CLI-loaded extensions, not just settings. Pi does
  // not expose hook-only or inline extension factories through this API.
  const paths = [
    ...configured.map(tool => tool.sourceInfo.path),
    ...pi.getCommands().filter(command => command.source === "extension").map(command => command.sourceInfo.path),
  ];
  const excludedPackages = policy.excludedExtensions.filter(name => !isAbsolute(name));
  const excludedPaths = new Set(paths.filter(path => isAbsolute(path)
    && (policy.excludedExtensions.includes(resolve(path))
      || (excludedPackages.length > 0 && excludedPackages.includes(owningPackage(path) ?? "")))));
  const excludedProviderTools = new Set(configured.filter(tool => excludedPaths.has(tool.sourceInfo.path)).map(tool => tool.name));
  return {
    sharedInstructions: policy.sharedInstructions,
    excludedTools: policy.excludedTools,
    extensionPaths: [...new Set(paths.filter(path => isAbsolute(path) && path !== capsulePath
      && !excludedPaths.has(path)))],
    // Explicit overrides remain strict: a requested tool with an excluded provider
    // produces the backend's missing-tool diagnostic instead of silently vanishing.
    tools: [...new Set(toolOverride ?? pi.getActiveTools().filter(name => !excludedProviderTools.has(name)))]
      .filter(name => name !== "delegate_capsule" && name !== "yield" && !policy.excludedTools.includes(name)),
  };
}
