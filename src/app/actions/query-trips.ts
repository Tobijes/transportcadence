"use server";

import { getStopIdsByName } from "@/lib/stops";
import { queryCadence } from "@/lib/queries";
import type { CadenceResult } from "@/lib/types";

export async function queryTripCadence(
  stopNameA: string,
  stopNameB: string
): Promise<CadenceResult> {
  const stopIdsA = getStopIdsByName(stopNameA);
  const stopIdsB = getStopIdsByName(stopNameB);
  return queryCadence(stopIdsA, stopIdsB);
}
