// New reproduction against the immutable reviewed source snapshot, not the
// working implementation. Synthetic, bounded children only.
import { mkdtemp, readFile, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
const source = resolve("audit/2026-09-13-stabilization-recheck/source-snapshot/src");
const { execute } = await import(pathToFileURL(join(source, "execution/spawn.ts")).href);
const { EvidenceStore } = await import(pathToFileURL(join(source, "evidence/store.ts")).href);
const root = await mkdtemp(join(tmpdir(), "capsule-scripted-prefixed-synthetic-"));
const store = new EvidenceStore(join(root, "capture")); await store.init();
const late = "setTimeout(()=>console.log('SYNTHETIC-LATE'),100);setTimeout(()=>process.exit(0),400)";
const parent = `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(late)}],{stdio:['ignore',1,2]});c.unref();process.exit(0)`;
const receipt = await execute({ argv: [process.execPath, "-e", parent], cwd: root, timeoutMs: 1000 }, { taskId: "t", episodeId: "e", requestId: "r", capsuleDigest: "a".repeat(64), unitId: "u", recipeId: "synthetic", recipeDigest: "b".repeat(64) }, store);
const retained = (await store.get(receipt.stdout.sha256)).toString();
await new Promise(r => setTimeout(r, 600));
const quota = new EvidenceStore(join(root, "quota"), 8); await quota.init();
const writes = await Promise.allSettled([quota.put("12345678"), quota.put("abcdefgh")]);
const result = { classification: "synthetic execution of immutable reviewed snapshot", source, root, lateCapture: { invariant: !receipt.stdout.complete || retained.includes("SYNTHETIC-LATE"), receipt, retained }, quota: { invariant: writes.filter(x => x.status === "fulfilled").length <= 1, writes } };
console.log(JSON.stringify(result, null, 2));
// Exit one means a reproduced invariant violation, not a harness failure.
process.exitCode = result.lateCapture.invariant && result.quota.invariant ? 0 : 1;
