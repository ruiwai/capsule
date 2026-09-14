import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { join } from "node:path";

export const DEFAULT_JIT_ENTRY_LIMIT = 3;
export const DEFAULT_JIT_TEXT_BUDGET = 8_000;
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

export type SelectableJit = {
  topic: string;
  content: string;
  raw_history: string;
  updatedAt: string;
  context?: ContextObservation;
};

const GENERIC = new Set(["project", "projects", "result", "results", "file", "files", "task", "tasks",
  "work", "working", "run", "use", "using", "check", "checks", "test", "tests", "current", "change", "changes"]);

function terms(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(term => term.length > 1 && !GENERIC.has(term)));
}

/** Lexical applicability is deterministic guidance, not semantic certification. */
export function selectApplicableJit<T extends SelectableJit>(
  capsule: string,
  entries: T[],
  current: ContextObservation | undefined,
  options: { maxEntries?: number; maxTextChars?: number } = {},
): T[] {
  if (!current) return [];
  const query = terms(capsule);
  if (!query.size) return [];
  const ranked = entries.flatMap(entry => {
    if (!entry.context || entry.context.fingerprint !== current.fingerprint
      || entry.context.projectIdentity !== current.projectIdentity || entry.context.platform !== current.platform) return [];
    const topicTerms = terms(entry.topic), contentTerms = terms(entry.content);
    let score = 0;
    for (const term of query) score += (topicTerms.has(term) ? 2 : 0) + (contentTerms.has(term) ? 1 : 0);
    return score > 0 ? [{ entry, score }] : [];
  }).sort((a, b) => b.score - a.score
    || b.entry.updatedAt.localeCompare(a.entry.updatedAt)
    || a.entry.topic.localeCompare(b.entry.topic));
  const selected: T[] = [];
  let used = 0;
  const limit = options.maxEntries ?? DEFAULT_JIT_ENTRY_LIMIT;
  const budget = options.maxTextChars ?? DEFAULT_JIT_TEXT_BUDGET;
  for (const { entry } of ranked) {
    if (selected.length >= limit) break;
    const size = entry.topic.length + entry.content.length;
    if (used + size > budget) continue;
    selected.push(entry); used += size;
  }
  return selected;
}

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
