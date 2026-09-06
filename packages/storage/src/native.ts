import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRepository, type Repository } from "./repository";

/** Open only the caller's dedicated Commander file; schema ownership is verified before migration. */
export function openNativeRepository(path: string): Repository {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  try {
    return createRepository({
      exec(sql, bind) {
        if (bind) db.run(sql, bind);
        else db.exec(sql);
      },
      rows(sql, bind) {
        return db.query(sql).all(...(bind ?? [])) as Record<string, unknown>[];
      },
      close() {
        db.close();
      },
    });
  } catch (error) {
    db.close();
    throw error;
  }
}
