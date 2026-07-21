"use server";

import { getStopIdsByProximity, getStopName, searchStopNames } from "@/lib/stops";
import { queryCadence } from "@/lib/queries";
import { findRoutes as findRoutesImpl } from "@/lib/routing";
import { getDb } from "@/lib/db";
import type { CadenceQueryResult, FindRoutesResult } from "@/lib/types";

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

// Multi-transfer route finder. Returns all unique full routes (by stop_name sequence)
// from originName to destName with at most maxTransfers transfers. Walk transfers
// (250m proximity or transfers.txt edges) are free and don't count toward the budget.
export async function findRoutes(
  originName: string,
  destName: string,
  maxTransfers: number
): Promise<FindRoutesResult> {
  return findRoutesImpl(originName, destName, maxTransfers);
}

// Per-leg cadence: queries direct-trip cadence for a single leg (board → alight).
// Reuses the existing queryCadence() with the 250m proximity cluster of each stop_id.
export async function queryLegCadence(
  fromStopId: string,
  toStopId: string
): Promise<CadenceQueryResult> {
  const fromName = getStopName(fromStopId) ?? "";
  const toName = getStopName(toStopId) ?? "";
  const stopIdsA = getStopIdsByProximity(fromName);
  const stopIdsB = getStopIdsByProximity(toName);
  const cadence = queryCadence(stopIdsA, stopIdsB);
  const fromStops = stopNamesForIds(stopIdsA);
  const toStops = stopNamesForIds(stopIdsB);
  return { cadence, meta: { fromStops, toStops } };
}

