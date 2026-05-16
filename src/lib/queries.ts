import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "./db";
import { normalizeRouteType, type ModeKey } from "./route-types";
import type { CadenceResult, HourBucket, RawTripRow, Weekday } from "./types";

const SQL_DIR = join(process.cwd(), "src/sql/queries");

function loadSql(file: string, phA: string, phB: string): string {
  return readFileSync(join(SQL_DIR, file), "utf8")
    .replace("/*STOP_IDS_A*/", phA)
    .replace("/*STOP_IDS_B*/", phB);
}

function makePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

function departureTimeToMinutes(dt: string): number {
  const parts = dt.split(":");
  return (parseInt(parts[0], 10) % 24) * 60 + parseInt(parts[1], 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
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
    medianHeadway: null,
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

  const phA = makePlaceholders(stopIdsA.length);
  const phB = makePlaceholders(stopIdsB.length);

  const directRows = db.prepare(loadSql("direct_trips.sql", phA, phB))
    .all(...stopIdsA, ...stopIdsB) as RawTripRow[];
  log(`direct query done — ${directRows.length} rows`);

  const departureRows = db.prepare(loadSql("departures.sql", phA, phB))
    .all(...stopIdsA, ...stopIdsB) as { hour_bucket: number; service_id: number; departure_time: string }[];
  log(`departure query done — ${departureRows.length} rows`);

  const serviceIds = new Set<number>();
  for (const r of directRows) serviceIds.add(r.service_id);
  for (const r of departureRows) serviceIds.add(r.service_id);

  const svcIdList = [...serviceIds];
  const ph = makePlaceholders(svcIdList.length);

  // Per-service-per-weekday date counts (for trip count weighting)
  const dateCountRows = db.prepare(
    `SELECT service_id, weekday, COUNT(*) as date_count FROM service_dates WHERE service_id IN (${ph}) GROUP BY service_id, weekday`
  ).all(...svcIdList) as { service_id: number; weekday: number; date_count: number }[];

  const svcWdCount = new Map<number, Map<number, number>>();
  for (const r of dateCountRows) {
    if (!svcWdCount.has(r.service_id)) svcWdCount.set(r.service_id, new Map());
    svcWdCount.get(r.service_id)!.set(r.weekday, r.date_count);
  }

  // Full date list per service per weekday (for headway computation)
  const serviceDateRows = db.prepare(
    `SELECT service_id, weekday, date FROM service_dates WHERE service_id IN (${ph})`
  ).all(...svcIdList) as { service_id: number; weekday: number; date: string }[];

  const serviceDateMap = new Map<number, Map<number, string[]>>();
  for (const r of serviceDateRows) {
    if (!serviceDateMap.has(r.service_id)) serviceDateMap.set(r.service_id, new Map());
    const byWd = serviceDateMap.get(r.service_id)!;
    if (!byWd.has(r.weekday)) byWd.set(r.weekday, []);
    byWd.get(r.weekday)!.push(r.date);
  }
  log(`service_dates loaded`);

  // Compute headway: weekday -> hour -> date -> departure minutes[]
  const deptsByDateHour = new Map<number, Map<number, Map<string, number[]>>>();
  for (const row of departureRows) {
    const mins = departureTimeToMinutes(row.departure_time);
    for (let wd = 0; wd < 7; wd++) {
      const dates = serviceDateMap.get(row.service_id)?.get(wd);
      if (!dates || dates.length === 0) continue;
      if (!deptsByDateHour.has(wd)) deptsByDateHour.set(wd, new Map());
      const byHour = deptsByDateHour.get(wd)!;
      if (!byHour.has(row.hour_bucket)) byHour.set(row.hour_bucket, new Map());
      const byDate = byHour.get(row.hour_bucket)!;
      for (const date of dates) {
        if (!byDate.has(date)) byDate.set(date, []);
        byDate.get(date)!.push(mins);
      }
    }
  }

  type Acc = Record<number, Record<number, Record<ModeKey, number>>>;
  const totalTrips: Acc = {};
  const modeServiceIds = new Map<ModeKey, Set<number>>();

  function ensureSlot(weekday: number, hour: number) {
    if (!totalTrips[weekday]) totalTrips[weekday] = {};
    if (!totalTrips[weekday][hour]) totalTrips[weekday][hour] = { bus: 0, rail: 0, stog: 0, metro: 0, tram: 0, ferry: 0 };
  }

  for (const row of directRows) {
    const mode = normalizeRouteType(row.route_type);
    const hour = row.hour_bucket;
    for (let wd = 0; wd < 7; wd++) {
      const dateCount = svcWdCount.get(row.service_id)?.get(wd) ?? 0;
      if (dateCount === 0) continue;
      ensureSlot(wd, hour);
      totalTrips[wd][hour][mode] += row.trip_count * dateCount;
      if (!modeServiceIds.has(mode)) modeServiceIds.set(mode, new Set());
      modeServiceIds.get(mode)!.add(row.service_id);
    }
  }

  // Distinct active dates per (weekday, mode) — used as the averaging denominator
  const totalDatesCount: Record<number, Partial<Record<ModeKey, number>>> = {};
  for (const [mode, sids] of modeServiceIds) {
    const rows = db.prepare(
      `SELECT weekday, COUNT(DISTINCT date) as date_count FROM service_dates WHERE service_id IN (${makePlaceholders(sids.size)}) GROUP BY weekday`
    ).all(...sids) as { weekday: number; date_count: number }[];
    for (const r of rows) {
      if (!totalDatesCount[r.weekday]) totalDatesCount[r.weekday] = {};
      totalDatesCount[r.weekday]![mode] = r.date_count;
    }
  }

  const result = buildEmptyResult();
  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const bucket = result[wd as Weekday][h];
      if (!totalTrips[wd]?.[h]) continue;
      for (const mode of Object.keys(totalTrips[wd][h]) as ModeKey[]) {
        const trips = totalTrips[wd][h][mode];
        const dates = totalDatesCount[wd]?.[mode] ?? 0;
        if (dates > 0) {
          bucket[mode] = Math.round((trips / dates) * 10) / 10;
        }
      }
    }
  }

  for (let wd = 0; wd < 7; wd++) {
    for (let h = 0; h < 24; h++) {
      const dateMap = deptsByDateHour.get(wd)?.get(h);
      if (!dateMap) continue;
      const allGaps: number[] = [];
      for (const departures of dateMap.values()) {
        departures.sort((a, b) => a - b);
        for (let i = 1; i < departures.length; i++) {
          allGaps.push(departures[i] - departures[i - 1]);
        }
      }
      if (allGaps.length > 0) {
        result[wd as Weekday][h].medianHeadway = Math.round(median(allGaps) * 10) / 10;
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
