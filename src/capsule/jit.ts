import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

const MAX_GUARD_FILE_BYTES = 1_000_000;

/** Deliberately fixed and small: these are project/tool context, not a repository scan. */
export const GUARDED_PROJECT_FILES = [
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock",
  "pyproject.toml", "uv.lock", "Cargo.toml", "Cargo.lock", "go.mod", "go.sum",
  "composer.json", "composer.lock", "Gemfile", "Gemfile.lock", "tsconfig.json", ".nvmrc",
] as const;

export type ContextObservation = {
  fingerprint: string;
  projectIdentity: string;
  platform: NodeJS.Platform;
  guardedFiles: string[];
  observedAt: string;
};

/** Returns unknown on unreadable identity/guards or bounded-read overflow. Missing files are observed explicitly. */
export async function observeProjectContext(projectRoot: string): Promise<ContextObservation | undefined> {
  try {
    const identity = await realpath(projectRoot);
    const hash = createHash("sha256");
    hash.update(`identity\0${identity}\0platform\0${process.platform}\0`);
    let total = 0;
    for (const name of GUARDED_PROJECT_FILES) {
      try {
        const body = await readFile(join(identity, name));
        total += body.length;
        if (body.length > MAX_GUARD_FILE_BYTES || total > MAX_GUARD_FILE_BYTES) return undefined;
        hash.update(`present\0${name}\0${body.length}\0`); hash.update(body); hash.update("\0");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return undefined;
        hash.update(`missing\0${name}\0`);
      }
    }
    return { fingerprint: hash.digest("hex"), projectIdentity: identity, platform: process.platform,
      guardedFiles: [...GUARDED_PROJECT_FILES], observedAt: new Date().toISOString() };
  } catch { return undefined; }
}
