import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isAbsolute } from "node:path";
import type { ParentWorkerContext } from "../capsule/backend.js";

/** Snapshot live parent state without sharing its mutable extension runtime. */
export function captureParentContext(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  toolOverride?: string[],
): ParentWorkerContext {
  const configured = pi.getAllTools();
  const capsulePath = configured.find(tool => tool.name === "delegate_capsule")?.sourceInfo.path;
  // Source metadata includes CLI-loaded extensions, not just settings. Pi does
  // not expose hook-only or inline extension factories through this API.
  const paths = [
    ...configured.map(tool => tool.sourceInfo.path),
    ...pi.getCommands().filter(command => command.source === "extension").map(command => command.sourceInfo.path),
  ];
  return {
    systemPrompt: ctx.getSystemPrompt(),
    extensionPaths: [...new Set(paths.filter(path => isAbsolute(path) && path !== capsulePath))],
    tools: [...new Set(toolOverride ?? pi.getActiveTools())]
      .filter(name => name !== "delegate_capsule" && name !== "yield"),
  };
}
