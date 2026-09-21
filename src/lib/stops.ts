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
  const lowerQuery = query.toLowerCase();
  const rows = db
    .prepare(
      `SELECT s.stop_name
       FROM stops s
       LEFT JOIN stop_times st ON st.stop_id = s.stop_id
       WHERE s.stop_name_lower LIKE ?
       GROUP BY s.stop_id
       ORDER BY COUNT(st.trip_id) DESC`
    )
    .all(`%${lowerQuery}%`) as { stop_name: string }[];
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

  return getStopIdsByProximityOfCoord(anchor.stop_lat, anchor.stop_lon);
}

// All stop_ids within 250m bounding box of the given stop_id (always includes the
// input stop_id itself if it has coordinates). Used by the routing BFS to expand
// the free-walk cluster around any alighting stop.
export function getStopIdsByProximityOfStopId(stopId: string): string[] {
  const db = getDb();
  const anchor = db
    .prepare("SELECT stop_lat, stop_lon FROM stops WHERE stop_id = ? AND stop_lat IS NOT NULL AND stop_lon IS NOT NULL")
    .get(stopId) as { stop_lat: number; stop_lon: number } | undefined;
  if (!anchor) return [stopId];
  return getStopIdsByProximityOfCoord(anchor.stop_lat, anchor.stop_lon);
}

function getStopIdsByProximityOfCoord(lat: number, lon: number): string[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT stop_id FROM stops
       WHERE stop_lat BETWEEN ? AND ?
         AND stop_lon BETWEEN ? AND ?`
    )
    .all(
      lat - LAT_OFFSET,
      lat + LAT_OFFSET,
      lon - LON_OFFSET,
      lon + LON_OFFSET
    ) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}

// Returns all to_stop_id values explicitly listed in transfers.txt for the given
// from_stop_id set. Used in addition to geographic proximity when expanding a
// transfer cluster (transfers.txt may publish longer-distance transfer edges).
export function getTransferStopIds(fromStopIds: string[]): string[] {
  if (fromStopIds.length === 0) return [];
  const db = getDb();
  const ph = fromStopIds.map(() => "?").join(", ");
  const rows = db
    .prepare(`SELECT DISTINCT to_stop_id AS stop_id FROM transfers WHERE from_stop_id IN (${ph})`)
    .all(...fromStopIds) as { stop_id: string }[];
  return rows.map((r) => r.stop_id);
}

// Looks up stop_name for a single stop_id. Returns null if not found.
export function getStopName(stopId: string): string | null {
  const db = getDb();
  const row = db.prepare("SELECT stop_name FROM stops WHERE stop_id = ?").get(stopId) as
    | { stop_name: string }
    | undefined;
  return row?.stop_name ?? null;
}
