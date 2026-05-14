import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = path.resolve(process.cwd(), "gtfs.db");

let _db: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (!_db) {
    _db = new DatabaseSync(DB_PATH, { open: true });
  }
  return _db;
}
