import { readFileSync } from "fs";
import { join } from "path";
import { getDb } from "./db";
import {
  getStopIdsByProximity,
  getStopIdsByProximityOfStopId,
  getTransferStopIds,
  getStopName,
} from "./stops";
import type { FindRoutesResult, Leg, LegRoute, Route } from "./types";

const SQL_DIR = join(process.cwd(), "src/sql/queries");
const TIME_BUDGET_MS = 15_000;
const SQL_BATCH_SIZE = 500;
const LEG_PAIRS_BATCH_SIZE = 250;
const MAX_RAW_ROUTES = 50_000;
const MAX_UI_ROUTES = 1000;

interface Path {
  legs: Leg[];
  visited: Set<string>;
  currentAlightId: string;
}

function loadLegDestinationsSql(stopIdsPlaceholder: string): string {
  return readFileSync(join(SQL_DIR, "leg_destinations.sql"), "utf8").replace(
    "/*STOP_IDS*/",
    stopIdsPlaceholder
  );
}

function loadLegDestinationsToDestSingleSql(): string {
  return readFileSync(join(SQL_DIR, "leg_destinations_to_dest_single.sql"), "utf8");
}

function loadLegRoutesSql(pairsPlaceholder: string): string {
  return readFileSync(join(SQL_DIR, "leg_routes.sql"), "utf8").replace(
    "/*PAIRS*/",
    pairsPlaceholder
  );
}

function loadPairTripCountsSql(pairsPlaceholder: string): string {
  return readFileSync(join(SQL_DIR, "pair_trip_counts.sql"), "utf8").replace(
    "/*PAIRS*/",
    pairsPlaceholder
  );
}

function makePlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}

// Cached stop_id → stop_name lookup for the duration of one findRoutes() call.
// Avoids redundant DB queries when the same stop_id appears in many paths.
function makeStopNameLookup() {
  const cache = new Map<string, string>();
  return function getStopNameCached(stopId: string): string {
    let name = cache.get(stopId);
    if (name === undefined) {
      name = getStopName(stopId) ?? "";
      cache.set(stopId, name);
    }
    return name;
  };
}

// Returns all stop_ids walkable from the given stop_id: the stop itself,
// its 250m proximity cluster, and any to_stop_id listed in transfers.txt.
// Cached per stop_id for the duration of one findRoutes() call.
function makeWalkExpander() {
  const cache = new Map<string, Set<string>>();
  return function walkExpand(stopId: string): Set<string> {
    const cached = cache.get(stopId);
    if (cached) return cached;
    const result = new Set<string>([stopId]);
    for (const id of getStopIdsByProximityOfStopId(stopId)) result.add(id);
    for (const id of getTransferStopIds([stopId])) result.add(id);
    cache.set(stopId, result);
    return result;
  };
}

// Queries distinct (board_id, alight_id) pairs for the given boarding stop_ids.
//
// Two modes:
// - Full mode (destStopIds undefined): returns all (board, alight) pairs reachable
//   from the boarding stops. Used in intermediate BFS waves where we need to extend
//   further. Batches boardIds into chunks of 500 to stay within SQLite parameter limits.
//
// - Filtered mode (destStopIds provided): only returns pairs where alight_id is in
//   the destination set. Used in the last BFS wave where we can't extend further.
//   Iterates over destStopIds (typically ~10) one at a time — for each destStopId,
//   finds all boardStopIds that can reach it via a single trip, then filters against
//   the boardIds set in TypeScript. This is ~30x faster than a large IN clause on
//   st_a.stop_id because the index lookup is driven by the small destStopId set.
//
// Returns null if the time budget is exceeded mid-batch (caller should truncate).
function queryLegDestinations(
  boardIds: string[],
  deadline: number,
  destStopIds?: string[]
): Array<[string, string]> | null {
  if (boardIds.length === 0) return [];

  const db = getDb();
  const boardIdSet = new Set(boardIds);

  if (destStopIds !== undefined && destStopIds.length > 0) {
    // Filtered (last wave) mode: iterate over destStopIds one at a time.
    const sql = loadLegDestinationsToDestSingleSql();
    const stmt = db.prepare(sql);
    const pairs: Array<[string, string]> = [];
    for (const destStopId of destStopIds) {
      if (Date.now() > deadline) return null;
      const rows = stmt.all(destStopId) as { board_id: string }[];
      for (const r of rows) {
        if (boardIdSet.has(r.board_id)) {
          pairs.push([r.board_id, destStopId]);
        }
      }
    }
    return pairs;
  }

  // Full (intermediate wave) mode: batch boardIds into chunks of 500.
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < boardIds.length; i += SQL_BATCH_SIZE) {
    if (Date.now() > deadline) return null;
    const batch = boardIds.slice(i, i + SQL_BATCH_SIZE);
    const ph = makePlaceholders(batch.length);
    const sql = loadLegDestinationsSql(ph);
    const rows = db.prepare(sql).all(...batch) as {
      board_id: string;
      alight_id: string;
    }[];
    for (const r of rows) pairs.push([r.board_id, r.alight_id]);
  }
  return pairs;
}

// Canonical dedup key based on the stop_NAME sequence (not stop_id sequence).
//
// This collapses routes that look identical to the user but use different
// platform-level stop_ids at the same station. For example, "Roskilde St.
// (Stationscentret)" has 10 stop_ids — without name-based dedup, the BFS
// produces 10+ visually identical routes that differ only in which platform
// was used for the transfer.
//
// Walk transfers between same-name stops are collapsed: if leg[i].fromName
// equals leg[i-1].toName (walk within the same station), the duplicate name
// is not included in the key. Walk transfers between different-name stops
// ARE included, since they represent a visible change of station.
function routeNameKey(legs: Leg[]): string {
  if (legs.length === 0) return "";
  const parts: string[] = [legs[0].fromName];
  for (let i = 0; i < legs.length; i++) {
    if (i > 0 && legs[i].fromName !== legs[i - 1].toName) {
      parts.push(legs[i].fromName);
    }
    parts.push(legs[i].toName);
  }
  return parts.join("|");
}

// Canonical tuple key for post-BFS dedup: (origin_name, ordered per-leg
// route-set, dest_name). Collapses variants that differ only in transfer
// stop — same journey from the user's perspective. leg.routes must be
// populated before calling.
//
// Per-leg route-set: sorted route_short_names joined by "+", so a leg served
// by both 206 and 350 buckets as "206+350" rather than as separate tuples.
function routeTupleKey(legs: Leg[]): string {
  if (legs.length === 0) return "";
  const origin = legs[0].fromName;
  const dest = legs[legs.length - 1].toName;
  const legSets = legs.map((leg) =>
    leg.routes.map((r) => r.shortName).sort().join("+")
  );
  return `${origin}|${legSets.join(">")}|${dest}`;
}

// Counts "stand still" transfers — legs where the boarding stop_id equals
// the previous leg's alighting stop_id (no walk required to switch trips).
function standStillCount(legs: Leg[]): number {
  let n = 0;
  for (let i = 1; i < legs.length; i++) {
    if (legs[i].fromStopId === legs[i - 1].toStopId) n++;
  }
  return n;
}

// Min trip count across all legs in a route — the bottleneck leg. Used as
// a tiebreaker so the weakest-served leg dominates route ranking. Returns
// 0 if any leg lacks tripCount (e.g. time-budget truncation during lookup),
// which makes the route sink in sort and falls back to routeNameKey lex.
function minTripCount(legs: Leg[]): number {
  let min = Infinity;
  for (const leg of legs) {
    const tc = leg.tripCount ?? 0;
    if (tc < min) min = tc;
  }
  return min === Infinity ? 0 : min;
}

// Computes the set of stop_ids that can reach ANY destStopId in exactly 1 leg.
// Uses the precomputed reachable_pairs table (indexed on alight_id).
// Returns null if the time budget is exceeded.
function computeDestReachable1Leg(
  destStopIds: string[],
  deadline: number
): Set<string> | null {
  const db = getDb();
  const sql = loadLegDestinationsToDestSingleSql();
  const stmt = db.prepare(sql);
  const result = new Set<string>();
  for (const destStopId of destStopIds) {
    if (Date.now() > deadline) return null;
    const rows = stmt.all(destStopId) as { board_id: string }[];
    for (const r of rows) result.add(r.board_id);
  }
  return result;
}

// Queries distinct (route_short_name, route_type) for each unique (board_id, alight_id)
// leg pair across all routes' legs. Returns a Map keyed by `${board_id}|${alight_id}`.
//
// Batches pairs into chunks to stay within SQLite parameter limits. Uses row-value
// IN clause: WHERE (st_a.stop_id, st_b.stop_id) IN ((?,?), ...).
function computeLegRoutes(legs: Leg[], deadline: number): Map<string, LegRoute[]> | null {
  const uniquePairs = new Map<string, [string, string]>();
  for (const leg of legs) {
    const key = `${leg.fromStopId}|${leg.toStopId}`;
    if (!uniquePairs.has(key)) uniquePairs.set(key, [leg.fromStopId, leg.toStopId]);
  }
  if (uniquePairs.size === 0) return new Map();

  const db = getDb();
  const result = new Map<string, LegRoute[]>();

  const pairsList = [...uniquePairs.values()];
  for (let i = 0; i < pairsList.length; i += LEG_PAIRS_BATCH_SIZE) {
    if (Date.now() > deadline) return null;
    const batch = pairsList.slice(i, i + LEG_PAIRS_BATCH_SIZE);
    const pairsPlaceholder = batch.map(() => "(?, ?)").join(", ");
    const sql = loadLegRoutesSql(pairsPlaceholder);
    const params: string[] = [];
    for (const [b, a] of batch) {
      params.push(b, a);
    }
    const rows = db.prepare(sql).all(...params) as {
      board_id: string;
      alight_id: string;
      route_short_name: string;
      route_type: number;
      mean_travel_time: number | null;
    }[];
    for (const r of rows) {
      const key = `${r.board_id}|${r.alight_id}`;
      let list = result.get(key);
      if (!list) {
        list = [];
        result.set(key, list);
      }
      const meanTravelTime =
        r.mean_travel_time !== null ? r.mean_travel_time : undefined;
      list.push({
        shortName: r.route_short_name,
        routeType: r.route_type,
        meanTravelTime,
      });
    }
  }
  return result;
}

// Queries trip_count for each unique (board_id, alight_id) leg pair across all
// routes' legs. Returns a Map keyed by `${board_id}|${alight_id}`. Same batching
// and truncation pattern as computeLegRoutes(). The result is used as a
// tiebreaker in route sorting: within the same transfer count, the route whose
// min(tripCount) across legs is highest ranks first. Min() ensures the
// bottleneck leg dominates.
function computeLegTripCounts(legs: Leg[], deadline: number): Map<string, number> | null {
  const uniquePairs = new Map<string, [string, string]>();
  for (const leg of legs) {
    const key = `${leg.fromStopId}|${leg.toStopId}`;
    if (!uniquePairs.has(key)) uniquePairs.set(key, [leg.fromStopId, leg.toStopId]);
  }
  if (uniquePairs.size === 0) return new Map();

  const db = getDb();
  const result = new Map<string, number>();

  const pairsList = [...uniquePairs.values()];
  for (let i = 0; i < pairsList.length; i += LEG_PAIRS_BATCH_SIZE) {
    if (Date.now() > deadline) return null;
    const batch = pairsList.slice(i, i + LEG_PAIRS_BATCH_SIZE);
    const pairsPlaceholder = batch.map(() => "(?, ?)").join(", ");
    const sql = loadPairTripCountsSql(pairsPlaceholder);
    const params: string[] = [];
    for (const [b, a] of batch) {
      params.push(b, a);
    }
    const rows = db.prepare(sql).all(...params) as {
      board_id: string;
      alight_id: string;
      trip_count: number;
    }[];
    for (const r of rows) {
      result.set(`${r.board_id}|${r.alight_id}`, r.trip_count);
    }
  }
  return result;
}

export function findRoutes(
  originName: string,
  destName: string,
  maxTransfers: number
): FindRoutesResult {
  const t0 = Date.now();
  const log = (msg: string) =>
    console.log(`[routing] ${Date.now() - t0}ms ${msg}`);

  if (!originName || !destName || originName === destName) {
    return { routes: [], originName, destName, truncated: false };
  }

  const originStopIds = getStopIdsByProximity(originName);
  const destStopIds = getStopIdsByProximity(destName);
  const destSet = new Set(destStopIds);

  if (originStopIds.length === 0 || destStopIds.length === 0) {
    return { routes: [], originName, destName, truncated: false };
  }

  log(
    `start — origin:${originStopIds.length} ids, dest:${destStopIds.length} ids, maxTransfers:${maxTransfers}`
  );

  const walkExpand = makeWalkExpander();
  const getStopNameCached = makeStopNameLookup();
  const deadline = Date.now() + TIME_BUDGET_MS;

  // Destination-directed pruning: compute the set of stops that can reach
  // destSet in exactly 1 leg. In the last intermediate wave, we only extend
  // paths whose walk-expanded currentAlightId intersects this set — preventing
  // the BFS from exploring stops that can't possibly reach the destination.
  // This is the key optimization that makes max_transfers=2 viable.
  const destReachable1Leg = computeDestReachable1Leg(destStopIds, deadline);
  if (destReachable1Leg === null) {
    return { routes: [], originName, destName, truncated: true };
  }
  log(`dest reachability: ${destReachable1Leg.size} stops can reach dest in 1 leg`);

  // Seed: one path per origin cluster stop. Wave 0 walk-expands each seed
  // stop to find candidate boarding stops for the first leg.
  let queue: Path[] = originStopIds.map((id) => ({
    legs: [],
    visited: new Set<string>([id]),
    currentAlightId: id,
  }));

  const routes: Route[] = [];
  const seenRouteKeys = new Set<string>();
  let truncated = false;

  waveLoop: for (let wave = 0; wave <= maxTransfers && queue.length > 0; wave++) {
    if (Date.now() > deadline) {
      truncated = true;
      log(`time budget exceeded at wave ${wave}`);
      break;
    }
    if (routes.length >= MAX_RAW_ROUTES) {
      truncated = true;
      log(`route limit (${MAX_RAW_ROUTES}) reached at wave ${wave}`);
      break;
    }

    // Collect valid (path, boardId) expansion pairs for this wave.
    // A boardId is valid for a path if it equals currentAlightId (no-walk case)
    // or is not in path.visited (cycle prevention for walk transfers).
    const boardIdToPaths = new Map<string, Path[]>();
    for (const path of queue) {
      const walkCandidates = walkExpand(path.currentAlightId);
      for (const boardId of walkCandidates) {
        if (boardId !== path.currentAlightId && path.visited.has(boardId)) continue;
        let list = boardIdToPaths.get(boardId);
        if (!list) {
          list = [];
          boardIdToPaths.set(boardId, list);
        }
        list.push(path);
      }
    }

    const boardIds = [...boardIdToPaths.keys()];
    if (boardIds.length === 0) break;

    log(`wave ${wave}: ${queue.length} paths, ${boardIds.length} unique boardIds`);

    // In the last wave (wave == maxTransfers), we can't extend further, so we
    // only need pairs where alight_id is in the destination set. This turns a
    // 100K-row query into a tiny one and makes max_transfers=1 fast.
    const isLastWave = wave === maxTransfers;
    const pairs = queryLegDestinations(
      boardIds,
      deadline,
      isLastWave ? destStopIds : undefined
    );
    if (pairs === null) {
      truncated = true;
      log(`time budget exceeded during SQL at wave ${wave}`);
      break;
    }
    log(`wave ${wave}: ${pairs.length} (board, alight) pairs`);

    // Group pairs by boardId for lookup.
    const pairsByBoard = new Map<string, string[]>();
    for (const [boardId, alightId] of pairs) {
      let list = pairsByBoard.get(boardId);
      if (!list) {
        list = [];
        pairsByBoard.set(boardId, list);
      }
      list.push(alightId);
    }

    // Build next queue: for each (boardId, alightId) pair, for each path that
    // can board at boardId, extend the path with a new leg.
    const nextQueue: Path[] = [];
    for (const [boardId, alightIds] of pairsByBoard) {
      const paths = boardIdToPaths.get(boardId);
      if (!paths) continue;
      const boardName = getStopNameCached(boardId);
      for (const alightId of alightIds) {
        const alightName = getStopNameCached(alightId);
        for (const path of paths) {
          if (path.visited.has(alightId)) continue; // cycle prevention

          const newLeg: Leg = {
            fromStopId: boardId,
            toStopId: alightId,
            fromName: boardName,
            toName: alightName,
            routes: [],
          };
          const newLegs: Leg[] = [...path.legs, newLeg];

          // Deduplicate by stop_name sequence, not stop_id sequence.
          // This collapses routes that differ only in platform-level stop_ids
          // at the same station (e.g., 10 platforms at "Roskilde St. (Stationscentret)").
          const key = routeNameKey(newLegs);
          if (seenRouteKeys.has(key)) continue;
          seenRouteKeys.add(key);

          const newVisited = new Set(path.visited);
          newVisited.add(boardId); // no-op if boardId == currentAlightId
          newVisited.add(alightId);

          const newPath: Path = {
            legs: newLegs,
            visited: newVisited,
            currentAlightId: alightId,
          };

          if (destSet.has(alightId)) {
            routes.push({ legs: newLegs });
            if (routes.length >= MAX_RAW_ROUTES) {
              truncated = true;
              log(`route limit (${MAX_RAW_ROUTES}) reached mid-wave ${wave}`);
              break waveLoop;
            }
            // Destination reached — don't extend further.
          } else if (newLegs.length <= maxTransfers) {
            // transfersUsed = newLegs.length - 1; extend only if transfersUsed < maxTransfers
            // Destination-directed pruning: in the last intermediate wave, only
            // extend paths that can reach destSet in 1 more leg. This prevents
            // the BFS from exploring stops that can't possibly reach the destination.
            if (wave === maxTransfers - 1 && maxTransfers > 0) {
              const walkStops = walkExpand(alightId);
              let canReach = false;
              for (const stop of walkStops) {
                if (destReachable1Leg.has(stop)) {
                  canReach = true;
                  break;
                }
              }
              if (!canReach) continue; // prune — can't reach dest in remaining transfers
            }
            nextQueue.push(newPath);
          }
        }
      }
    }

    queue = nextQueue;
  }

  // Sort: fewer legs (transfers) first, then name key for stable order.
  routes.sort((a, b) => {
    if (a.legs.length !== b.legs.length) return a.legs.length - b.legs.length;
    return routeNameKey(a.legs).localeCompare(routeNameKey(b.legs));
  });

  // Populate route info (route_short_name + route_type) for each leg. Computed
  // once per unique (board_id, alight_id) pair, then attached to every Leg
  // instance sharing that pair. Returns truncated=true if the time budget is
  // exceeded — the UI shows partial results without route badges in that case.
  const allLegs: Leg[] = [];
  for (const route of routes) allLegs.push(...route.legs);
  const legRoutesMap = computeLegRoutes(allLegs, deadline);
  if (legRoutesMap === null) {
    truncated = true;
    log(`time budget exceeded during leg route lookup`);
  } else {
    for (const route of routes) {
      for (const leg of route.legs) {
        leg.routes = legRoutesMap.get(`${leg.fromStopId}|${leg.toStopId}`) ?? [];
      }
    }
  }

  // Populate tripCount per leg. Same dedup + attach pattern as leg routes.
  // Returns truncated=true if the time budget is exceeded — legs then keep
  // tripCount=undefined and the sort falls back to routeNameKey (via the
  // `?? 0` below) so behaviour matches the pre-tripCount version.
  const legTripCountsMap = computeLegTripCounts(allLegs, deadline);
  if (legTripCountsMap === null) {
    truncated = true;
    log(`time budget exceeded during leg trip count lookup`);
  } else {
    for (const leg of allLegs) {
      const tc = legTripCountsMap.get(`${leg.fromStopId}|${leg.toStopId}`);
      if (tc !== undefined) leg.tripCount = tc;
    }
  }

  // Dedup by (origin, ordered per-leg route-sets, dest) tuple. Pick one
  // representative per tuple: stand-still transfers first (no walk between
  // trips), then fewest visible name changes, then fewest legs, then
  // stable name key.
  const byTuple = new Map<string, Route[]>();
  for (const route of routes) {
    const key = routeTupleKey(route.legs);
    let list = byTuple.get(key);
    if (!list) {
      list = [];
      byTuple.set(key, list);
    }
    list.push(route);
  }
  const deduped: Route[] = [];
  for (const list of byTuple.values()) {
    if (list.length === 1) {
      deduped.push(list[0]);
      continue;
    }
    list.sort((a, b) => {
      const tc = minTripCount(b.legs) - minTripCount(a.legs);
      if (tc !== 0) return tc;
      const ss = standStillCount(b.legs) - standStillCount(a.legs);
      if (ss !== 0) return ss;
      const kp =
        routeNameKey(a.legs).split("|").length -
        routeNameKey(b.legs).split("|").length;
      if (kp !== 0) return kp;
      const lc = a.legs.length - b.legs.length;
      if (lc !== 0) return lc;
      return routeNameKey(a.legs).localeCompare(routeNameKey(b.legs));
    });
    deduped.push(list[0]);
  }
  deduped.sort((a, b) => {
    if (a.legs.length !== b.legs.length) return a.legs.length - b.legs.length;
    const tc = minTripCount(b.legs) - minTripCount(a.legs);
    if (tc !== 0) return tc;
    return routeNameKey(a.legs).localeCompare(routeNameKey(b.legs));
  });
  if (deduped.length > MAX_UI_ROUTES) {
    deduped.length = MAX_UI_ROUTES;
    truncated = true;
    log(`UI route cap (${MAX_UI_ROUTES}) reached after dedup`);
  }

  log(`done — ${routes.length} raw -> ${deduped.length} deduped${truncated ? " (truncated)" : ""}`);
  return { routes: deduped, originName, destName, truncated };
}
