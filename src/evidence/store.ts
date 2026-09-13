import { mkdir, open, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "../contracts/identity.js";

export class EvidenceStore {
  private used=0;
  constructor(readonly root:string, readonly quotaBytes=64*1024*1024){}
  async init(){await mkdir(join(this.root,"evidence"),{recursive:true,mode:0o700});await mkdir(join(this.root,"events"),{recursive:true,mode:0o700})}
  async put(bytes:Buffer|string){const b=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);const digest=sha256(b);const path=join(this.root,"evidence",digest);try{await readFile(path);return {sha256:digest,storedBytes:b.length,observedBytes:b.length,complete:true};}catch{/* absent */} if(this.used+b.length>this.quotaBytes) throw new Error("evidence_incomplete: task evidence quota exhausted");try{await writeFile(path,b,{flag:"wx",mode:0o600});this.used+=b.length}catch(e:any){if(e.code!=="EEXIST")throw e}return {sha256:digest,storedBytes:b.length,observedBytes:b.length,complete:true}}
  async get(digest:string,start=0,end?:number){if(!/^[a-f0-9]{64}$/.test(digest))throw new Error("invalid evidence digest");const b=await readFile(join(this.root,"evidence",digest));if(sha256(b)!==digest)throw new Error("evidence_integrity: digest mismatch");return b.subarray(start,end)}
  async appendEvent(event:unknown){await this.init();const h=await open(join(this.root,"events","events.jsonl"),"a",0o600);try{await h.appendFile(JSON.stringify(event)+"\n");await h.sync()}finally{await h.close()}}
}
