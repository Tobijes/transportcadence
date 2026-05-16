"use server";

import { getStopIdsByProximity, searchStopNames } from "@/lib/stops";
import { queryCadence } from "@/lib/queries";
import { getDb } from "@/lib/db";
import type { CadenceQueryResult } from "@/lib/types";

export async function searchStops(query: string): Promise<string[]> {
  return searchStopNames(query);
}

function stopNamesForIds(ids: string[]): string[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const ph = ids.map(() => "?").join(", ");
  const rows = db.prepare(
    `SELECT DISTINCT stop_name FROM stops WHERE stop_id IN (${ph}) ORDER BY stop_name`
  ).all(...ids) as { stop_name: string }[];
  return rows.map((r) => r.stop_name);
}

export async function queryTripCadence(
  stopNameA: string,
  stopNameB: string
): Promise<CadenceQueryResult> {
  const stopIdsA = getStopIdsByProximity(stopNameA);
  const stopIdsB = getStopIdsByProximity(stopNameB);
  const cadence = queryCadence(stopIdsA, stopIdsB);
  const fromStops = stopNamesForIds(stopIdsA);
  const toStops = stopNamesForIds(stopIdsB);
  return { cadence, meta: { fromStops, toStops } };
}
