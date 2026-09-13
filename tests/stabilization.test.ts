import { describe, expect, it } from "vitest";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EvidenceStore } from "../src/evidence/store.js";
import { execute } from "../src/execution/spawn.js";
import { sha256 } from "../src/contracts/identity.js";

describe("controller stabilization regressions", () => {
  it("does not spawn after an already-aborted signal", async () => {
    const root = await mkdtemp(join(tmpdir(), "capsule-stabilize-"));
    const store = new EvidenceStore(root); await store.init();
    const ac = new AbortController(); ac.abort();
    await expect(execute({ argv: ["/bin/sh", "-c", "touch side-effect"], cwd: root, timeoutMs: 1000 },
      { taskId: "task_x", episodeId: "episode_x", requestId: "request_x", capsuleDigest: "a".repeat(64), unitId: "u", recipeId: "project.inspect", recipeDigest: "b".repeat(64) }, store, ac.signal)).rejects.toThrow("cancelled_before_spawn");
  });

  it("rebuilds quota accounting and never authenticates changed blob content", async () => {
    const root = await mkdtemp(join(tmpdir(), "capsule-stabilize-"));
    const first = new EvidenceStore(root, 4); await first.init();
    await expect(first.put("12345")).rejects.toThrow("quota");
    const second = new EvidenceStore(root, 10); await second.init();
    const receipt = await second.put("1234");
    await writeFile(join(root, "evidence", receipt.sha256), "evil");
    await expect(second.get(receipt.sha256)).rejects.toThrow("digest mismatch");
    expect(sha256("1234")).toBe(receipt.sha256);
  });

  it("reports truncation as incomplete rather than a complete retained blob", async () => {
    const root = await mkdtemp(join(tmpdir(), "capsule-stabilize-"));
    const store = new EvidenceStore(root, 8); await store.init();
    const result = await execute({ argv: ["/bin/sh", "-c", "printf 1234567890"], cwd: root, timeoutMs: 1000 },
      { taskId: "task_x", episodeId: "episode_x", requestId: "request_x", capsuleDigest: "a".repeat(64), unitId: "u", recipeId: "project.inspect", recipeDigest: "b".repeat(64) }, store);
    expect(result.stdout.observedBytes).toBe(10); expect(result.stdout.complete).toBe(false); expect(result.stdout.storedBytes).toBe(8);
  });
});
