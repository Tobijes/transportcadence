import { DatabaseSync } from "node:sqlite";

export default function postIngest(db: DatabaseSync): void {
  const rows = db.prepare("SELECT stop_id, stop_name FROM stops").all() as { stop_id: string; stop_name: string }[];
  const stmt = db.prepare("UPDATE stops SET stop_name_lower = ? WHERE stop_id = ?");
  db.exec("BEGIN");
  for (const { stop_id, stop_name } of rows) {
    stmt.run(stop_name.toLowerCase(), stop_id);
  }
  db.exec("COMMIT");
}
