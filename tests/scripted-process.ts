import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ScriptedService } from "../src/controller/scripted.js";
import { EvidenceStore } from "../src/evidence/store.js";

const cfg = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (cfg.ready) {
  writeFileSync(cfg.ready, String(process.pid));
  const until = Date.now() + 8000;
  while (!existsSync(cfg.gate)) { if (Date.now() > until) throw Error("barrier timeout"); await new Promise(r => setTimeout(r, 10)); }
}
try {
  if (cfg.quota) {
    const store = new EvidenceStore(cfg.quota.root, cfg.quota.limit); await store.init();
    console.log(JSON.stringify({ value: await store.put(cfg.quota.bytes), pid: process.pid }));
  } else {
    const s = new ScriptedService(cfg.configPath);
    try {
      let value: any;
      if (cfg.operation === "submit") value = s.submit(cfg.request);
      else if (cfg.operation === "run") value = await s.runRequest(cfg.request);
      else value = await s.execute(cfg.action);
      console.log(JSON.stringify({ value, pid: process.pid }));
    } finally { s.close(); }
  }
} catch (e) { console.log(JSON.stringify({ error: String(e), pid: process.pid })); }
