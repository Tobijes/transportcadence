# Agent behaviour

Always remember to update this document (AGENTS.md) when
- Adding or modifying business rules
- New technical details that aren't clear from the code
- When a file is added or modified, make sure to update `Project Structure` tree

# Transport Cadence

**Transport Kadence** answers the question: _"How often can I get from stop A to stop B?"_ using Danish public transit data.

Users select an origin and destination stop and a maximum number of transfers (0–3). The app finds all unique full routes (A → B → C → …) using breadth-first search over the GTFS stop graph and lists them in the UI. The user can click any individual leg (e.g. B → C) to see a grid of 7 bar charts — one per weekday (Monday–Sunday) — showing the **average number of trips per hour** and the **median headway (waiting time)** for that leg. Bars are stacked and colour-coded by transport mode (Bus, Tog, S-tog, Metro, Letbane, Færge).

The dataset is the Danish national transit schedule from [Rejseplanen](https://www.rejseplanen.dk/), distributed in [GTFS format](https://gtfs.org/documentation/schedule/reference/).

## Stack

| Layer        | Technology                                                          |
|--------------|---------------------------------------------------------------------|
| Framework    | Next.js (App Router)                                                |
| Language     | TypeScript                                                          |
| UI Library   | React 19                                                            |
| Styling      | Tailwind CSS v4 + Shadcn UI primitives (Radix Popover)              |
| Theme        | Warm orange/amber palette defined inline in `src/app/globals.css`    |
| Database     | `node:sqlite` (Node.js 22+ built-in, read-only at runtime)          |
| Charts       | Recharts `ComposedChart`                                            |
| Combobox     | Radix Popover + plain `<input>` (no cmdk)                           |

Mode colours are hard-coded in `src/lib/route-types.ts` (`MODE_CONFIG`), not the theme.

## Project Structure

```
.github/
  workflows/
    docker-publish.yml    -- Builds and pushes the Dockerfile to GitHub Container
                            Registry. Triggers: push to any branch, `v*` tags,
                            manual dispatch. Computes the tag in a bash step:
                              - `v*` tag push → image:<ref> + image:latest
                              - push to main  → image:<semVer> + image:latest
                                (semVer from GitVersion, run only on main/tag)
                              - other branch push → image:<normalized-branch>
                                (lowercased, non-[a-z0-9._-] → `-`, leading
                                `-`/`.` stripped, ≤128 chars; falls back to
                                `branch` if empty)
                            No `pull_request` trigger — every PR commit already
                            produces an image via the source branch's push event.
scripts/
  ingest.ts               -- GTFS ingestion pipeline (schema → load → per-table .ts hooks
                            → indexes → derived tables + .ts hooks). Cleans WAL files
                            first. Output: dataset/gtfs.db
src/
  app/
    actions/
      query-trips.ts      -- Server Actions: searchStops, findRoutes, queryLegCadence.
                            queryTripCadence (legacy direct A→B, still used by
                            queryLegCadence internally).
    api/
      healthz/route.ts    -- GET /api/healthz → "ok" (used by the deploy platform)
    layout.tsx            -- Root layout: <html lang="da">, imports globals.css
    page.tsx              -- SSR entry: renders <CadenceDashboard /> directly. Stop
    |                        names are NOT pre-fetched here — they're loaded on-demand
    |                        by the searchStops Server Action as the user types.
  components/
    cadence-dashboard.tsx -- Client orchestrator: stop selectors + swap button +
    |                        transfers selector, route list, per-leg cadence (7
    |                        WeekdayCharts). Recent-stop storage via localStorage.
    chart-legend.tsx      -- Color legend for transport modes + median headway swatch
    route-list.tsx        -- Renders found routes as clickable legs (A → B → C).
    |                        Each leg shows coloured route badges (route_short_name
    |                        on a mode-coloured chip with a Lucide mode icon).
    |                        Walk transfers between legs shown with a footprints icon.
    |                        Same-stop transfer (same stop_id or same stop_name,
    |                        i.e. intra-station platform switch) shown with
    |                        ArrowRightLeft.
    stop-selector.tsx     -- Searchable combobox (Radix Popover + plain input,
    |                        client-side filter). Highlights matched substring.
    |                        Shows "Seneste valg" (recent stops) from localStorage
    |                        above search results. 250ms debounce on search.
    transfers-selector.tsx -- 4-button group (0, 1, 2, 3) for max transfer count.
    weekday-chart.tsx     -- ComposedChart: stacked bars (trips/hour, left axis)
    |                        + grouped bar (median headway in min, right axis).
    |                        Both axes labelled. Hours 0–23. Empty state when no data.
    ui/                   -- Shadcn primitives (button, popover)
  lib/
    db.ts                 -- SQLite singleton (node:sqlite, readOnly:true)
    queries.ts            -- queryCadence(): queries direct_trips + departures + service_dates.
    |                        Computes per-weekday trip averages (weighted by active date count)
    |                        and median headways. Calendar expansion is precomputed in service_dates.
    recent-stops.ts       -- localStorage-backed list of the last 3 stops selected in each
                            selector (keyed by storageKey passed to StopSelector).
    route-types.ts        -- GTFS route_type → ModeKey mapping, hard-coded HSL colors
    |                      and Danish labels per mode.
    routing.ts            -- findRoutes(): BFS over stop_ids with walk-transfer expansion.
    |                      Returns Route[] (each Route has legs + resolved stopNames).
    |                      15s time budget; returns truncated=true if exceeded.
    |                      Sort tiebreaker: min(tripCount) across legs (popularity > stand-still).
    stops.ts              -- searchStopNames(), getStopIdsByName(), getStopIdsByProximity(),
    |                      getStopIdsByProximityOfStopId(), getTransferStopIds(), getStopName().
    |                      searchStopNames() matches against stop_name_lower (Unicode-safe),
    |                      LEFT JOIN stop_times and ORDER BY trip count (popularity ranking),
    |                      then filters out zone-boundary / leading-slash artifacts.
    |                      getStopIdsByProximity() expands a stop name to all stops within
    |                      250m bounding box (purely geographic, no name filtering on
    |                      result set).
    types.ts              -- CadenceResult, HourBucket (includes medianHeadway), Weekday,
    |                      Leg (includes routes: LegRoute[], tripCount?: number), LegRoute,
    |                      Route, FindRoutesResult. tripCount is populated from the
    |                      trip_count column on reachable_pairs by computeLegTripCounts()
    |                      and used as a route-sort tiebreaker.
    utils.ts              -- cn() helper (clsx + tailwind-merge)
  sql/
    indexes.sql           -- All index CREATE statements
    tables/               -- One .sql per raw GTFS table (agency, calendar, calendar_dates,
    |                      routes, stops, trips, stop_times, transfers)
    |                      A matching .ts file (e.g. stops.ts) can export a default
    |                      postIngest(db: DatabaseSync) function; ingest.ts calls it
    |                      automatically after loading that table's rows.
      stops.ts            -- Post-ingest hook: populates stop_name_lower using JS toLowerCase()
                            (SQLite LOWER() is ASCII-only; this handles Æ, Ø, Å correctly)
    derived_tables/
      reachable_pairs.sql  -- Precomputed (board_id, alight_id, trip_count) rows: one row per
      |                      stop pair where a single trip carries passengers from board to alight,
      |                      plus the COUNT(DISTINCT trip_id) of trips serving that pair.
      |                      Primary key (board_id, alight_id); index on alight_id.
      |                      Built at ingest (~50s for ~1.08M rows). The BFS queries this
      |                      table in ~50ms per wave instead of self-joining stop_times (~12s);
      |                      the post-BFS sort tiebreaker reads the trip_count column in ~ms
      |                      per 250-pair batch.
      reachable_pairs.ts   -- Post-ingest hook: GROUP BY (board_id, alight_id) over the stop_times
      |                      self-join (pickup_type=0, drop_off_type=0), with COUNT(DISTINCT trip_id).
      reachable_pair_routes.sql -- Precomputed distinct (board_id, alight_id, route_short_name,
      |                      route_type) tuples: one row per stop pair + route that serves that
      |                      pair on some trip. Primary key (board_id, alight_id, route_short_name,
      |                      route_type) — the prefix (board_id, alight_id) serves as a covering
      |                      index for forward lookups, no separate index needed. Built at ingest
      |                      (~40s for ~1.35M rows). computeLegRoutes() queries this table in ~1ms
      |                      per 250-pair batch instead of self-joining stop_times (~480ms per batch,
      |                      ~18s total for 830 pairs — exceeds the 15s budget).
      reachable_pair_routes.ts -- Post-ingest hook: INSERT INTO reachable_pair_routes SELECT DISTINCT
      |                      from stop_times self-join + trips + routes.
      service_dates.sql   -- Fully expanded active dates per service_id: one row per
      |                    (service_id, date YYYYMMDD, weekday 0=Mon..6=Sun).
      |                    Index on weekday. Built at ingest via TypeScript loop over calendar +
      |                    calendar_dates (calendar expansion requires date arithmetic).
      service_dates.ts    -- Post-ingest hook (default export postIngest): populates service_dates
                            rows in TypeScript (calendar expansion requires date arithmetic)
    queries/              -- SQL query templates. Placeholders /*STOP_IDS_A*/, /*STOP_IDS_B*/,
    |                      /*STOP_IDS*/, /*PAIRS*/ are substituted at runtime by loadSql() helpers.
      direct_trips.sql    -- Grouped trip counts by hour/mode/service. Uses COUNT(DISTINCT trip_id)
      |                    to avoid overcounting when proximity expansion matches multiple stops per trip.
      |                    Filters pickup_type=0 at board, drop_off_type=0 at alight.
      departures.sql      -- Individual departure times for headway computation. Groups by trip_id with
                            MIN(departure_time) to deduplicate multi-platform matches.
      leg_destinations.sql -- Distinct (board_id, alight_id) pairs reachable from a set of boarding
      |                      stops. Used by the BFS in routing.ts to expand one level per wave.
      leg_destinations_to_dest_single.sql -- Distinct (board_id) values that can reach a single
      |                      (alight_id) on one trip. Indexed lookup on alight_id (~30x faster
      |                      than a large IN clause on board_id). Used by computeDestReachable1Leg
      |                      for destination-directed pruning and by the last-wave BFS query.
      leg_routes.sql       -- Distinct (route_short_name, route_type) for a batch of (board_id, alight_id)
                            leg pairs. Queries the precomputed reachable_pair_routes table. Used by
                            routing.ts after the BFS to populate Leg.routes for the coloured route
                            badges shown in route-list.tsx. Row-value IN clause, batched at 250 pairs.
      pair_trip_counts.sql  -- Trip counts for a batch of (board_id, alight_id) pairs read from
                              the trip_count column of the precomputed reachable_pairs table.
                              Row-value IN clause, batched at 250.
```

## Data Pipeline

### Input
- `GTFS.zip` (~59 MB) at the project root — standard GTFS `.txt` files.

### Process
`scripts/ingest.ts` reads the zip, parses each CSV via `csv-parse`, and loads it into
`dataset/gtfs.db` via `node:sqlite`. It:
1. Deletes any existing `gtfs.db` plus `-shm` / `-wal` files (avoids stale WAL errors).
2. Extracts the zip to a temp dir.
3. Applies the schema from `src/sql/tables/*.sql` (PRAGMAs first, then all tables).
4. Inserts each table's rows in batches of **10 000** wrapped in a manual transaction.
   Uses `INSERT OR IGNORE` so re-runs don't fail on duplicate PKs.
5. For each table, if `src/sql/tables/<name>.ts` exports a default `postIngest(db)`,
   calls it (currently only `stops.ts` uses this to populate `stop_name_lower`).
6. Creates all indexes from `src/sql/indexes.sql`.
7. Creates derived tables from `src/sql/derived_tables/*.sql`, calling each matching
   `<name>.ts` post-ingest hook to populate them.
8. Runs `ANALYZE`, `PRAGMA wal_checkpoint(TRUNCATE)`, switches `journal_mode` back to
   `DELETE`, closes the DB, removes the temp dir.

### Skipped GTFS files
- `shapes.txt` (geometries, ~113 MB, not needed)
- `frequencies.txt` (empty in the Denmark feed)
- `attributions.txt`

### Raw tables

| Table            | Primary Key                       | Notes                          |
|------------------|-----------------------------------|--------------------------------|
| `agency`         | `agency_id` INTEGER               | Transit operators              |
| `calendar`       | `service_id` INTEGER              | Weekly service patterns        |
| `calendar_dates` | `(service_id, date)`              | Exceptions (holidays/additions)|
| `routes`         | `route_id` TEXT                   | Lines with type and colour     |
| `stops`          | `stop_id` TEXT (12-digit zero-pad)| All `location_type=0`          |
| `trips`          | `trip_id` INTEGER                 | Individual vehicle journeys    |
| `stop_times`     | `(trip_id, stop_sequence)`        | Core query table               |
| `transfers`      | `(from_stop_id, to_stop_id)`      | Allowed interchange points     |

### Performance settings during ingest
- `PRAGMA journal_mode = WAL;` (then reverted to `DELETE` at the end)
- `PRAGMA synchronous = OFF;`
- `PRAGMA foreign_keys = OFF;` (re-enabled after derived tables are built)
- Batch size: 10 000 rows per manual transaction.

### Indexes (`src/sql/indexes.sql`)

```
idx_stops_name              stops(stop_name)
idx_stops_name_lower        stops(stop_name_lower)        -- searchStopNames
idx_stops_lat_lon           stops(stop_lat, stop_lon)     -- walkExpand proximity scan
idx_stop_times_stop_id      stop_times(stop_id)
idx_stop_times_stop_trip_seq stop_times(stop_id, trip_id, stop_sequence, departure_time)
idx_stop_times_trip_id      stop_times(trip_id)
idx_stop_times_trip_seq_stop stop_times(trip_id, stop_sequence, stop_id)
idx_trips_route_id          trips(route_id)
idx_trips_service_id        trips(service_id)
idx_transfers_from          transfers(from_stop_id)
idx_transfers_to            transfers(to_stop_id)
idx_calendar_dates_service  calendar_dates(service_id, date)
```
Plus indexes created by derived-table definitions (notably `idx_reachable_pairs_alight` and `idx_service_dates_weekday`).

### Data characteristics (Denmark GTFS)

- 37 043 stops, all `location_type=0`, no `parent_station` populated.
- `transfers` table: 60 788 entries, all `transfer_type=2`, all bidirectional.
- `stop_id` is already station-level for rail (e.g., "København H" = `000008600626`) and platform/stop-level for buses. No platform explosion in BFS.

## UI

### Stop selector
- Radix `Popover` + plain `<input>` (no `cmdk`).
- `searchStops("")` is fetched eagerly on mount so the dropdown opens instantly.
- 250 ms debounce while typing; results are ranked by trip count (popular stops first)
  via `LEFT JOIN stop_times GROUP BY stop_id`.
- Filters out zone-boundary markers (`/…`, `\d+/\d+ Zonegrænse …`).
- Each selector persists up to 3 most-recently chosen stops to `localStorage` under
  `recent-stops-<storageKey>` and renders them as a "Seneste valg" section above the
  search results.
- Matched substring is rendered in bold via `HighlightedName`.

### Swap button
- Between the two selectors: swaps `stopA` ↔ `stopB` and re-records both as recent.

### Transfers selector
- 3-button group `0 1 2` (default: **1**). Label: "Skift" (Danish for "transfers/changes").
- Disabled while routes are loading.
- Re-triggers the BFS on change.

### Route list
- Each route renders as a row of clickable leg buttons. A leg button shows
  `fromName` + coloured `route_short_name` chip(s) + arrow + `toName`.
- A `<Footprints>` icon separates legs whose `fromStopId` ≠ previous leg's `toStopId`
  AND whose `fromName` ≠ previous leg's `toName` (real walk to a different-named stop).
- A `<ArrowRightLeft>` icon separates legs whose `fromStopId` == previous `toStopId`
  or whose `fromName` == previous `toName` (same station, same stop — no walk).
- Clicking a leg sets `selectedLeg`, which triggers the per-leg cadence query.
- If `truncated === true`, an amber banner "Søgningen blev afbrudt (tidsgrænse) …"
  is shown above the list.

### Per-leg cadence
When a leg is clicked, `queryLegCadence(fromStopId, toStopId)` resolves stop names,
expands both ends to their 250 m proximity clusters, and calls `queryCadence()`.
The same 7 `WeekdayChart`s render the result. An `Info` popover next to the heading
lists the actual `fromStops` and `toStops` included in the proximity expansion.

## Chart architecture

`WeekdayChart` uses Recharts `ComposedChart` with two Y-axes:
- **Left axis** ("Afgange/time"): stacked `Bar` per transport mode showing average trips/hour
- **Right axis** ("Ventetid (min)"): grouped `Bar` for `medianHeadway` — median minutes between
  consecutive departures within each hour bucket, across all active dates for that weekday

`medianHeadway` is `null` for hours with fewer than 2 departures on any active date; Recharts renders no bar for null data points. `ChartLegend` only shows the headway swatch if at least one bucket has a non-null headway.

### Mode → colour mapping (`MODE_CONFIG` in `route-types.ts`)

| Mode     | Label    | HSL              |
|----------|----------|------------------|
| bus      | Bus      | `hsl(45, 80%, 60%)` |
| stog     | S-tog    | `hsl(29, 87%, 44%)` |
| rail     | Tog      | `hsl(200, 60%, 50%)`|
| metro    | Metro    | `hsl(0, 80%, 55%)`  |
| tram     | Letbane  | `hsl(130, 50%, 45%)`|
| ferry    | Færge    | `hsl(0, 0%, 41%)`   |

### GTFS route_type → ModeKey
| Raw codes | Mode    |
|-----------|---------|
| 3, 700, 715 | bus   |
| 2         | rail   |
| 109       | stog   |
| 1         | metro  |
| 0         | tram   |
| 4         | ferry  |
| anything else | bus (fallback in `normalizeRouteType`) |

## Headway computation

`queryCadence()` runs a second SQL query (no GROUP BY on hour) to get individual `departure_time` values. For each weekday, the TypeScript code expands departures per active calendar date (looked up from `service_dates`), sorts them within each hour bucket, computes consecutive gaps, then takes the median across all dates. GTFS times past midnight (e.g. "25:10:00") are normalized with `% 24` on the hour component before converting to minutes.

## Stop proximity expansion

`getStopIdsByProximity()` in `stops.ts` resolves a stop name to a geographic anchor (first stop with that name that has coordinates), then returns all stops within a 250m bounding box — regardless of their name. This is always-on: selecting "København H" also picks up "København H (Metro)" and any other nearby stops.

Constants for Denmark (~55.7°N): `LAT_OFFSET = 250 / 111_320`, `LON_OFFSET = 250 / 62_800`. Falls back to `getStopIdsByName()` if the anchor stop has no coordinates.

Both SQL queries use deduplication to handle the expanded stop sets:
- `direct_trips.sql`: `COUNT(DISTINCT st_a.trip_id)` prevents a trip from being counted multiple times when it passes through multiple stops in the proximity set.
- `departures.sql`: `GROUP BY st_a.trip_id` with `MIN(st_a.departure_time)` picks one departure per trip for headway computation.

## Calendar expansion

Active service dates are precomputed into `service_dates` at ingest time (see `service_dates.sql` / `service_dates.ts`). `queryCadence()` queries this table directly instead of expanding date ranges in TypeScript at runtime. The ingest script (`scripts/ingest.ts`) also cleans up SQLite WAL files (`-shm`, `-wal`) before recreating the database to prevent stale file errors.

`service_dates.ts` expands the calendar iteratively in TypeScript because the date
arithmetic (`d.setDate(d.getDate() + 1)`) is easier than a recursive SQL CTE, and it
correctly applies both calendar additions (`exception_type=1`) and removals
(`exception_type=2`).

## Multi-transfer routing

`findRoutes(originName, destName, maxTransfers)` in `routing.ts` finds all unique full routes from origin to destination with at most `maxTransfers` trip-to-trip transfers. It uses breadth-first search over `stop_id` (the unambiguous unique identifier for stops in the Denmark GTFS — rail stations like "København H" are a single `stop_id`, while bus stops with the same name are correctly distinguished).

### BFS design

- **Node**: a `stop_id`. The Denmark GTFS has no `parent_station` hierarchy (all stops have `location_type=0`), so `stop_id` is the natural granularity.
- **Route uniqueness**: by `stop_name` sequence (via `routeNameKey()` in `routing.ts`). The BFS explores `stop_id`s for unambiguous graph traversal, but two routes are considered identical iff they have the same sequence of stop_NAMES. This collapses routes that differ only in platform-level `stop_id`s at the same station — e.g., "Roskilde St. (Stationscentret)" has 10 `stop_id`s; without name-based dedup the BFS would emit 10+ visually identical routes. Walk transfers between same-name stops are collapsed in the key (the duplicate name is omitted).
- **Wave**: one BFS level = one leg of the journey. Wave 0 finds all 1-leg routes (0 transfers). Wave N finds all (N+1)-leg routes (N transfers). The loop runs while `wave <= maxTransfers && queue not empty`.
- **Transfer counting**: `transfers = legs.length - 1`. A path is extended only if `newLegs.length <= maxTransfers`.
- **Cycle prevention**: no `stop_id` may appear twice in a path's visited set. The boarding stop is allowed to equal the previous alighting stop (no-walk case) but a walked-to boarding stop must not have been visited before.
- **Leg shape**: each `Leg` carries both `fromStopId`/`toStopId` (for graph traversal and per-leg cadence queries) and `fromName`/`toName` (for UI display). Stop names are populated during the BFS via a cached lookup (`makeStopNameLookup()`).

### Walk transfers (free, don't count toward max_transfers)

When alighting at stop X, the passenger can walk to any stop in `walkExpand(X)` before boarding the next trip:
1. X itself (no walk — board at the same stop)
2. All stops within the 250m bounding box of X (`getStopIdsByProximityOfStopId`)
3. All `to_stop_id` values from `transfers` where `from_stop_id = X` (`getTransferStopIds`)

These are cached per `stop_id` for the duration of one `findRoutes()` call. The walk is free — only the trip switch counts as a transfer.

### SQL: leg_destinations.sql

Each wave runs a batched `SELECT board_id, alight_id` query for all unique boarding stop_ids in that wave. Chunks into batches of 500 to stay within SQLite parameter limits. Queries the precomputed `reachable_pairs` table (not `stop_times` directly) for ~240x faster lookups.

### SQL: leg_destinations_to_dest_single.sql

In the last BFS wave (wave == maxTransfers), we can't extend further, so we only need pairs where `alight_id` is in the destination set. Instead of a large `IN (...)` clause on `board_id` (which is slow even with the precomputed table), we iterate over `destStopIds` one at a time — for each destStopId, query `reachable_pairs WHERE alight_id = ?` (indexed) and filter against the BFS frontier in TypeScript. This is ~30x faster than a large IN clause.

### Destination-directed pruning

Before the BFS, we compute `destReachable1Leg` = set of stop_ids that can reach ANY destStopId in exactly 1 leg (using `leg_destinations_to_dest_single.sql`). In the last intermediate wave (wave == maxTransfers - 1), we only extend paths whose `walkExpand(currentAlightId)` intersects `destReachable1Leg`. This prevents the BFS from exploring stops that can't possibly reach the destination, which is the key optimization that makes `max_transfers=2` viable.

### Index: stops(stop_lat, stop_lon)

The `walkExpand()` function calls `getStopIdsByProximityOfStopId()` for each unique alighting stop. Without an index on `stop_lat`/`stop_lon`, each proximity query is a full table scan of 37K rows (~1ms each). With 10K+ unique alight stops per wave, this becomes the bottleneck. The composite index `idx_stops_lat_lon` makes each query an index range scan (~0.01ms each).

### Precomputed reachable_pairs table

Built at ingest time (~50s for ~1.08M distinct pairs). The BFS queries this table instead of self-joining `stop_times` (4.8M rows). Performance comparison for 2548 boarding stops:
- Without precompute: self-join `stop_times` → ~12s per wave
- With precompute: index lookup on `reachable_pairs` → ~50ms per wave (240x faster)

### Time budget

A 15-second wall-clock budget prevents server crashes on dense networks. If exceeded, the BFS returns partial results with `truncated: true`, and the UI shows an amber warning. Typical performance: max_transfers=0 (<100ms), max_transfers=1 (100ms-4s), max_transfers=2 (2-6s). Max UI option is 2 transfers.

### Route limit

The BFS stops as soon as `routes.length` reaches `MAX_RAW_ROUTES` (50,000) and returns `truncated: true`, reusing the same amber warning the UI already shows for time-budget truncation. The check runs once per wave (before SQL) and after each push mid-wave (labeled `break waveLoop`) so dense results like Roskilde → Hedehusene at 2 transfers (~90K routes) cap at 50K instead of exhausting memory/time.

### Tuple-based dedup

After the BFS (and after `computeLegRoutes()` populates `leg.routes`), routes are grouped by a canonical tuple key `(origin_name, ordered per-leg route-set, dest_name)` and collapsed to a single representative per tuple. The per-leg route-set is the sorted `route_short_name`s joined by `+` — so a leg served by both 206 and 350 buckets as `"206+350"`, not as separate tuples. The tuple ends are the specific stop names from `legs[0].fromName` / `legs[N-1].toName` (not the user's typed search names), so variants that board at different stops within the origin's 250m cluster stay distinct.

Representative selection per tuple (priority order):
1. **Highest min(tripCount) across legs** — `minTripCount(legs)` (computed from the
   `trip_count` column on `reachable_pairs`).
   The bottleneck leg dominates so a route with one weak leg sinks even if other legs are busy.
2. **Most stand-still transfers** — `legs[i].fromStopId === legs[i-1].toStopId` (no walk between trips).
3. **Fewest visible name changes** — `routeNameKey(legs).split("|").length` (already collapses same-name walks).
4. **Fewest legs** (fewest transfers).
5. **Lexicographic `routeNameKey`** (stable tiebreak).

After dedup, the deduped list is sorted by `(legs.length, min(tripCount) desc, routeNameKey)` and capped
at `MAX_UI_ROUTES` (1000) — if the deduped count exceeds 1000 the list is truncated to 1000 and
`truncated=true` is set, reusing the same amber warning. This keeps UI payloads bounded regardless of
raw BFS size.

### Per-leg route badges

After the BFS, `computeLegRoutes()` queries distinct `(route_short_name, route_type)` pairs for each unique `(board_id, alight_id)` leg pair across all routes' legs, using `leg_routes.sql` against the precomputed `reachable_pair_routes` table (~1ms per 250-pair batch; self-joining `stop_times` was ~480ms/batch and ~18s total — exceeded the 15s budget). The result is attached to each `Leg.routes` (an array of `LegRoute`). The UI renders each entry as a small rounded coloured chip labelled with `route_short_name`; the chip background uses the same mode colour as the plot legend (`MODE_CONFIG[mode].color`). Computed once per unique pair, then assigned to every `Leg` instance sharing that pair. Batched at 250 pairs per query (row-value IN clause) to stay within SQLite parameter limits. If the time budget is exceeded mid-batch, `truncated=true` is returned and legs may have empty `routes` arrays.

### Per-leg trip counts (sort tiebreaker)

After `computeLegRoutes()`, `computeLegTripCounts()` queries `pair_trip_counts.sql` for the same unique pairs, reading the `trip_count` column from the precomputed `reachable_pairs` table (`COUNT(DISTINCT trip_id)` across all services/weekdays, computed at ingest). Same batching pattern (~ms per 250-pair batch via row-value IN clause against the covering PK). The value is attached to each `Leg.tripCount`. Used as the primary tiebreaker in route sorting (both per-tuple representative selection and final deduped sort): the route whose `min(leg.tripCount)` is highest ranks first within the same transfer count — the bottleneck leg dominates so a route with one weak leg sinks even if other legs are busy. If the time budget is exceeded mid-batch, legs keep `tripCount=undefined`, sort falls back to lex `routeNameKey` via the `?? 0` in `minTripCount()`, and `truncated=true` is set (reusing the same amber warning).

### Per-leg cadence

When the user clicks a leg in the route list, `queryLegCadence(fromStopId, toStopId)` resolves the stop names and calls the existing `queryCadence()` with the 250m proximity clusters. The same 7 `WeekdayChart`s are reused for the selected leg.

## Server Actions

`src/app/actions/query-trips.ts` exposes:

- `searchStops(query)` — stop name search (called as the user types, 250 ms debounced by the client).
- `findRoutes(originName, destName, maxTransfers)` — BFS route finder (called on origin/dest/transfer-count change).
- `queryLegCadence(fromStopId, toStopId)` — per-leg cadence (called when the user clicks a leg).
- `queryTripCadence(stopNameA, stopNameB)` — legacy direct A→B cadence (used internally by `queryLegCadence`).

The SQLite connection is a module-level singleton (`db.ts`) opened **read-only** and re-used across requests within the same Node.js process. `page.tsx` is a Server Component that simply renders `<CadenceDashboard />` — stop names are loaded on-demand via the `searchStops` Server Action as the user types.

## Running locally

```bash
npm install
npm run ingest   # builds dataset/gtfs.db (~5 min total)
npm run dev      # http://localhost:3000
```

`GTFS.zip` must be at the project root before `npm run ingest`. The ingest always
recreates `dataset/gtfs.db` from scratch — no incremental updates.
