import { getDb } from "./db";

const STOP_FILTER_PATTERNS: RegExp[] = [
  /^\/+/,              // stops starting with "/"
  /^\d+\/\d+ Zonegrænse/, // zone boundary markers like "1/2 Zonegrænse"
];

function isRealStop(name: string): boolean {
  return !STOP_FILTER_PATTERNS.some((pattern) => pattern.test(name));
}

export function searchStopNames(query: string, limit = 20): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT s.stop_name
       FROM stops s
       LEFT JOIN stop_times st ON st.stop_id = s.stop_id
       WHERE s.stop_name LIKE ?
       GROUP BY s.stop_id
       ORDER BY COUNT(st.trip_id) DESC`
    )
    .all(`%${query}%`) as { stop_name: string }[];
  const seen = new Set<string>();
  const results: string[] = [];
  for (const { stop_name } of rows) {
    if (seen.has(stop_name) || !isRealStop(stop_name)) continue;
    seen.add(stop_name);
    results.push(stop_name);
    if (results.length >= limit) break;
  }
  return results;
}

export function getStopIdsByName(name: string): string[] {
  const db = getDb();
  const rows = db.prepare("SELECT stop_id FROM stops WHERE stop_name = ?").all(name) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}

// 250m bounding box offsets for Denmark (~55.7°N)
const LAT_OFFSET = 250 / 111_320;  // ~0.00225°
const LON_OFFSET = 250 / 62_800;   // ~0.00398°

export function getStopIdsByProximity(name: string): string[] {
  const db = getDb();
  const anchor = db
    .prepare("SELECT stop_lat, stop_lon FROM stops WHERE stop_name = ? AND stop_lat IS NOT NULL AND stop_lon IS NOT NULL LIMIT 1")
    .get(name) as { stop_lat: number; stop_lon: number } | undefined;
  if (!anchor) return getStopIdsByName(name);

  const rows = db
    .prepare(
      `SELECT stop_id FROM stops
       WHERE stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`
    )
    .all(
      anchor.stop_lat - LAT_OFFSET,
      anchor.stop_lat + LAT_OFFSET,
      anchor.stop_lon - LON_OFFSET,
      anchor.stop_lon + LON_OFFSET
    ) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}
