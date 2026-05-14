import { getDb } from "./db";
import { normalizeRouteType, type ModeKey } from "./route-types";
import type { CadenceResult, HourBucket, RawTripRow, Weekday } from "./types";

interface CalendarRow {
  service_id: number;
  monday: number;
  tuesday: number;
  wednesday: number;
  thursday: number;
  friday: number;
  saturday: number;
  sunday: number;
  start_date: string;
  end_date: string;
}

interface CalendarDateRow {
  service_id: number;
  date: string;
  exception_type: number;
}

function parseYYYYMMDD(s: string): Date {
  return new Date(
    parseInt(s.slice(0, 4)),
    parseInt(s.slice(4, 6)) - 1,
    parseInt(s.slice(6, 8))
  );
}

// Returns a Map<weekday (0=Mon), Set<dateString YYYYMMDD>>
function buildServiceDates(
  cal: CalendarRow,
  exceptions: CalendarDateRow[]
): Map<number, Set<string>> {
  const dayFlags = [cal.monday, cal.tuesday, cal.wednesday, cal.thursday, cal.friday, cal.saturday, cal.sunday];
  const added = new Set(exceptions.filter((e) => e.exception_type === 1).map((e) => e.date));
  const removed = new Set(exceptions.filter((e) => e.exception_type === 2).map((e) => e.date));

  const result = new Map<number, Set<string>>();
  for (let i = 0; i < 7; i++) result.set(i, new Set());

  const start = parseYYYYMMDD(cal.start_date);
  const end = parseYYYYMMDD(cal.end_date);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const dateStr = `${y}${m}${day}`;

    // JS: 0=Sun, 1=Mon...6=Sat → convert to 0=Mon...6=Sun
    const jsDow = d.getDay();
    const weekday = jsDow === 0 ? 6 : jsDow - 1;

    if (removed.has(dateStr)) continue;
    if (dayFlags[weekday] === 1 || added.has(dateStr)) {
      result.get(weekday)!.add(dateStr);
    }
  }

  return result;
}

function makePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function emptyHourBuckets(): HourBucket[] {
  return Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    bus: 0,
    rail: 0,
    stog: 0,
    metro: 0,
    tram: 0,
    ferry: 0,
  }));
}

export function queryCadence(stopIdsA: string[], stopIdsB: string[]): CadenceResult {
  const db = getDb();
  const t0 = Date.now();
  const log = (msg: string) => console.log(`[cadence] ${Date.now() - t0}ms ${msg}`);

  if (stopIdsA.length === 0 || stopIdsB.length === 0) {
    return buildEmptyResult();
  }

  log(`start — A:${stopIdsA.length} ids, B:${stopIdsB.length} ids`);

  // --- Direct trips query ---
  const phA = makePlaceholders(stopIdsA.length);
  const phB = makePlaceholders(stopIdsB.length);

  const directRows = db.prepare(`
    SELECT
      CAST(SUBSTR(st_a.departure_time, 1, 2) AS INTEGER) % 24 AS hour_bucket,
      r.route_type,
      t.service_id,
      COUNT(*) AS trip_count
    FROM stop_times st_a
    JOIN stop_times st_b
      ON st_a.trip_id = st_b.trip_id
      AND st_b.stop_sequence > st_a.stop_sequence
    JOIN trips t ON st_a.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    WHERE st_a.stop_id IN (${phA})
      AND st_b.stop_id IN (${phB})
    GROUP BY hour_bucket, r.route_type, t.service_id
  `).all(...stopIdsA, ...stopIdsB) as RawTripRow[];
  log(`direct query done — ${directRows.length} rows`);

  // --- Load calendar data for all relevant service_ids ---
  const serviceIds = new Set<number>();
  for (const r of directRows) serviceIds.add(r.service_id);

  const calRows = db.prepare(
    `SELECT * FROM calendar WHERE service_id IN (${makePlaceholders(serviceIds.size)})`
  ).all(...serviceIds) as CalendarRow[];

  const calDateRows = db.prepare(
    `SELECT * FROM calendar_dates WHERE service_id IN (${makePlaceholders(serviceIds.size)})`
  ).all(...serviceIds) as CalendarDateRow[];

  // Build per-service active date sets
  const serviceDateMap = new Map<number, Map<number, Set<string>>>();
  for (const cal of calRows) {
    const exceptions = calDateRows.filter((e) => e.service_id === cal.service_id);
    serviceDateMap.set(cal.service_id, buildServiceDates(cal, exceptions));
  }

  // Count active dates per weekday per service (fallback: use calendar_dates only for services not in calendar)
  function getActiveDateCount(serviceId: number, weekday: number): number {
    const dateMap = serviceDateMap.get(serviceId);
    if (!dateMap) return 0;
    return dateMap.get(weekday)?.size ?? 0;
  }

  // Accumulate: total trips and total active dates per (weekday, hour, mode)
  // We accumulate across service_ids, weighted by how many days that service runs
  type Acc = Record<number, Record<number, Record<ModeKey, number>>>;

  const totalTrips: Acc = {};
  const totalDates: Record<number, Partial<Record<ModeKey, Set<string>>>> = {};

  function ensureSlot(weekday: number, hour: number, mode: ModeKey) {
    if (!totalTrips[weekday]) totalTrips[weekday] = {};
    if (!totalTrips[weekday][hour]) totalTrips[weekday][hour] = { bus: 0, rail: 0, stog: 0, metro: 0, tram: 0, ferry: 0 };
    if (!totalDates[weekday]) totalDates[weekday] = {} as Partial<Record<ModeKey, Set<string>>>;
    if (!totalDates[weekday][mode]) totalDates[weekday][mode] = new Set();
  }

  for (const row of directRows) {
    const mode = normalizeRouteType(row.route_type);
    const hour = row.hour_bucket;
    for (let wd = 0; wd < 7; wd++) {
      const dateSet = serviceDateMap.get(row.service_id)?.get(wd);
      if (!dateSet || dateSet.size === 0) continue;
      ensureSlot(wd, hour, mode);
      totalTrips[wd][hour][mode] += row.trip_count * dateSet.size;
      for (const d of dateSet) totalDates[wd][mode]!.add(d);
    }
  }

  // Build final result: average = totalTrips / totalDates
  const result = buildEmptyResult();
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const bucket = result[wd as Weekday][h];
      if (!totalTrips[wd]?.[h]) continue;
      for (const mode of Object.keys(totalTrips[wd][h]) as ModeKey[]) {
        const trips = totalTrips[wd][h][mode];
        const dates = totalDates[wd]?.[mode]?.size ?? 0;
        if (dates > 0) {
          bucket[mode] = Math.round((trips / dates) * 10) / 10;
        }
      }
    }
  }

  log(`done`);
  return result;
}

function buildEmptyResult(): CadenceResult {
  return {
    0: emptyHourBuckets(),
    1: emptyHourBuckets(),
    2: emptyHourBuckets(),
    3: emptyHourBuckets(),
    4: emptyHourBuckets(),
    5: emptyHourBuckets(),
    6: emptyHourBuckets(),
  };
}
