import { mkdirSync, openSync, readFileSync, writeFileSync, readdirSync, statSync, realpathSync, fsyncSync, closeSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { sha256 } from "../contracts/identity.js";
import { Durable } from "../controller/durable.js";

export class EvidenceStore {
  constructor(readonly root:string, readonly quotaBytes=64*1024*1024){}
  private contained(path: string) {
    const base = resolve(this.root);
    if (realpathSync(base) !== base || !realpathSync(path).startsWith(base + sep)) throw Error("permission_denied: evidence containment");
    return path;
  }
  async init() {
    mkdirSync(this.root, { recursive: true, mode: 0o700 });
    if (realpathSync(this.root) !== resolve(this.root)) throw Error("permission_denied: task containment");
    mkdirSync(join(this.root, "evidence"), { recursive: true, mode: 0o700 });
    mkdirSync(join(this.root, "events"), { recursive: true, mode: 0o700 });
    this.contained(join(this.root, "evidence")); this.contained(join(this.root, "events"));
  }
  async put(bytes: Buffer | string, observedBytes?: number) {
    await this.init();
    const b = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes), observed = observedBytes ?? b.length;
    if (!Number.isSafeInteger(observed) || observed < b.length) throw Error("invalid observed bytes");
    const digest = sha256(b), path = join(this.root, "evidence", digest);
    const db = new Durable(join(this.root, "evidence.sqlite"));
    try { return db.transaction(() => {
      db.db.exec("CREATE TABLE IF NOT EXISTS quota (singleton INTEGER PRIMARY KEY CHECK(singleton=1), ceiling INTEGER NOT NULL)");
      db.db.prepare("INSERT OR IGNORE INTO quota VALUES(1,?)").run(this.quotaBytes);
      db.db.prepare("UPDATE quota SET ceiling=min(ceiling,?) WHERE singleton=1").run(this.quotaBytes);
      const ceiling = Number((db.db.prepare("SELECT ceiling FROM quota").get() as any).ceiling);
      // Enumerate under the same cross-process write lock. An interrupted file
      // write consumes quota too; no crash can free a reservation implicitly.
      let used = 0;
      for (const n of readdirSync(join(this.root, "evidence"))) used += statSync(this.contained(join(this.root, "evidence", n))).size;
      try {
        const old = readFileSync(this.contained(path));
        if (sha256(old) !== digest) throw Error("evidence_integrity: corrupt existing blob");
        return { sha256: digest, storedBytes: old.length, observedBytes: observed, complete: old.length === observed };
      } catch (e: any) { if (e.code !== "ENOENT") throw e; }
      if (used + b.length > ceiling) throw Error("evidence_incomplete: task evidence quota exhausted");
      const fd = openSync(path, "wx", 0o600);
      try { writeFileSync(fd, b); fsyncSync(fd); } finally { closeSync(fd); }
      const dir = openSync(join(this.root, "evidence"), "r"); try { fsyncSync(dir); } finally { closeSync(dir); }
      return { sha256: digest, storedBytes: b.length, observedBytes: observed, complete: observed === b.length };
    }); } finally { db.close(); }
  }
  async get(digest: string, start = 0, end?: number) {
    if (!/^[a-f0-9]{64}$/.test(digest)) throw Error("invalid evidence digest");
    if (!Number.isSafeInteger(start) || start < 0 || end !== undefined && (!Number.isSafeInteger(end) || end < start)) throw Error("invalid evidence range");
    const b = readFileSync(this.contained(join(this.root, "evidence", digest)));
    if (sha256(b) !== digest) throw Error("evidence_integrity: digest mismatch");
    if (start > b.length || end !== undefined && end > b.length) throw Error("invalid evidence range");
    return b.subarray(start, end);
  }
  async appendEvent(event: unknown) {
    await this.init();
    const db = new Durable(join(this.root, "evidence.sqlite"));
    try { db.transaction(() => {
      db.db.exec("CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
      db.db.prepare("INSERT INTO events(body) VALUES (?)").run(JSON.stringify(event));
    }); } finally { db.close(); }
  }
}
