import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Local, process-safe transactions. FULL synchronous commits are the spawn
 * barrier. Never hold a transaction across an await or an external process. */
export class Durable {
  readonly db: DatabaseSync;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(path);
    try {
      this.db.exec("PRAGMA busy_timeout=10000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;");
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  transaction<T>(body: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const value = body();
      this.db.exec("COMMIT");
      return value;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.db.close(); }
}
