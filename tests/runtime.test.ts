import { mkdtemp,readFile,writeFile,mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe,expect,it } from "vitest";
import { EvidenceStore } from "../src/evidence/store.js";
import { execute } from "../src/execution/spawn.js";
import { compileRecipe } from "../src/recipes/compile.js";
import { defaultRegistry } from "../src/recipes/registry.js";
import { createHandle,validateHandle } from "../src/environment/handles.js";
import { sha256 } from "../src/contracts/identity.js";

describe("WP1/WP3 runtime",()=>{
 it("preserves failed stdout independently of a later reader",async()=>{const root=await mkdtemp(join(tmpdir(),"capsule-")),store=new EvidenceStore(root);await store.init();const ids={taskId:"t",episodeId:"e",requestId:"r",capsuleDigest:"a".repeat(64),unitId:"u",recipeId:"x",recipeDigest:"b".repeat(64)};const receipt=await execute({argv:["/bin/sh","-c","echo decisive; echo diagnostic >&2; exit 7"],cwd:root,timeoutMs:2000},ids,store);expect(receipt.exitCode).toBe(7);expect((await store.get(receipt.stdout.sha256)).toString()).toContain("decisive");expect((await store.get(receipt.stderr.sha256)).toString()).toContain("diagnostic")});
 it("cancels a process and retains partial output",async()=>{const root=await mkdtemp(join(tmpdir(),"capsule-")),store=new EvidenceStore(root);await store.init();const ac=new AbortController();setTimeout(()=>ac.abort(),100);const r=await execute({argv:["/bin/sh","-c","echo started; sleep 10"],cwd:root,timeoutMs:5000},{taskId:"t",episodeId:"e",requestId:"r",capsuleDigest:"a".repeat(64),unitId:"u",recipeId:"x",recipeDigest:"b".repeat(64)},store,ac.signal);expect(r.cancelled).toBe(true);expect((await store.get(r.stdout.sha256)).toString()).toContain("started")});
 it("FHS compilation always re-enters the wrapper and puts binding inside",()=>{const r=defaultRegistry().get("environment.verify_fresh");const c=compileRecipe(r,{projectRoot:"/tmp/project",target:"/bin/python3",args:["-V"],innerEnv:{PYTHONPATH:"/tmp/project/src"}});expect(c.argv.slice(0,6)).toEqual(["nix","--extra-experimental-features","nix-command flakes","run","/tmp/project#capsule-fhs","--no-update-lock-file"]);expect(c.argv).toContain("PYTHONPATH=/tmp/project/src")});
 it("marks a materialization/config handle stale without Nix GC",async()=>{const root=await mkdtemp(join(tmpdir(),"capsule-")),cfg=join(root,"uv.lock"),mat=join(root,"env");await writeFile(cfg,"locked");await mkdir(mat);const h=createHandle({taskId:"t",capsuleDigest:"a".repeat(64),recipeId:"r",recipeDigest:"b".repeat(64),wrapperKind:"fhs",sourceBinding:"workspace",projectRoot:root,sourceSnapshotId:"s",requiredConfigDigests:{[cfg]:sha256("locked")},materializationRoot:mat,entryParameters:{},observedPython:{},observedImports:[],observedTools:[],observedStorePaths:[],validForCriterionIds:[],invalidationConditions:[]});await writeFile(cfg,"changed");expect(await validateHandle(h)).toBe(false);expect(h.status).toBe("stale")});
});
