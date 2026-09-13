import { mkdir, open, readFile, writeFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "../contracts/identity.js";

export class EvidenceStore {
  private used=0;
  constructor(readonly root:string, readonly quotaBytes=64*1024*1024){}
  async init(){await mkdir(join(this.root,"evidence"),{recursive:true,mode:0o700});await mkdir(join(this.root,"events"),{recursive:true,mode:0o700});this.used=0;for(const n of await readdir(join(this.root,"evidence"))){try{this.used+=(await stat(join(this.root,"evidence",n))).size}catch{}}}
  async put(bytes:Buffer|string, observedBytes?:number){const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);const observed=observedBytes??b.length;const digest=sha256(b);const path=join(this.root,"evidence",digest);try{const old=await readFile(path);if(sha256(old)!==digest)throw new Error("evidence_integrity: corrupt existing blob");return {sha256:digest,storedBytes:old.length,observedBytes:observed,complete:old.length===observed};}catch(e:any){if(e?.code!=="ENOENT")throw e} if(this.used+b.length>this.quotaBytes) throw new Error("evidence_incomplete: task evidence quota exhausted");try{await writeFile(path,b,{flag:"wx",mode:0o600});this.used+=b.length}catch(e:any){if(e.code!=="EEXIST")throw e}return {sha256:digest,storedBytes:b.length,observedBytes:observed,complete:observed===b.length}}
  async get(digest:string,start=0,end?:number){if(!/^[a-f0-9]{64}$/.test(digest))throw new Error("invalid evidence digest");if(!Number.isInteger(start)||start<0||end!==undefined&&(!Number.isInteger(end)||end<start))throw new Error("invalid evidence range");const b=await readFile(join(this.root,"evidence",digest));if(sha256(b)!==digest)throw new Error("evidence_integrity: digest mismatch");return b.subarray(start,end)}
  async appendEvent(event:unknown){await this.init();const h=await open(join(this.root,"events","events.jsonl"),"a",0o600);try{await h.appendFile(JSON.stringify(event)+"\n");await h.sync()}finally{await h.close()}}
}
