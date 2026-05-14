import { getDb } from "./db";

export function getAllStopNames(): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT DISTINCT stop_name FROM stops ORDER BY stop_name").all() as { stop_name: string }[];
  return rows.map((r) => r.stop_name);
}

export function getStopIdsByName(name: string): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT stop_id FROM stops WHERE stop_name = ?").all(name) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}
