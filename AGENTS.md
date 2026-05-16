# Agent behaviour
Always remember to update this document (AGENTS.md) when
- Adding or modifying business rules
- New technical details that aren't clear from the code
- When a file is added or modified, make sure to update `Project Structure` tree

## Project Structure

```
scripts/
  ingest.ts               -- GTFS ingestion pipeline (schema → load → indexes → derived tables)
src/
  app/
    actions/
      query-trips.ts      -- Server Action: resolves stop names → IDs, calls queryCadence()
    layout.tsx
    page.tsx              -- SSR entry: fetches all stop names, passes to CadenceDashboard
  components/
    cadence-dashboard.tsx -- Client orchestrator: stop selectors, search button, 7 WeekdayCharts
    chart-legend.tsx      -- Color legend for transport modes + median headway swatch
    stop-selector.tsx     -- Searchable combobox (Radix Popover, client-side filter)
    weekday-chart.tsx     -- ComposedChart: stacked bars (trips/hour, left axis) + grouped bar
    |                        (median headway in min, right axis). Both axes labelled.
    ui/                   -- Shadcn primitives (button, popover)
  lib/
    db.ts                 -- SQLite singleton (node:sqlite)
    queries.ts            -- queryCadence(): queries direct_trips + departures + service_dates.
    |                        Computes per-weekday trip averages (weighted by active date count)
    |                        and median headways. Calendar expansion is precomputed in service_dates.
    route-types.ts        -- GTFS route_type → ModeKey mapping, colors, labels
    stops.ts              -- searchStopNames(), getStopIdsByName(), getStopIdsByProximity()
    |                        getStopIdsByProximity() expands a stop name to all stops within 250m
    |                        bounding box (purely geographic, no name filtering on result set)
    types.ts              -- CadenceResult, HourBucket (includes medianHeadway), Weekday
  sql/
    indexes.sql           -- All index CREATE statements
    tables/               -- One .sql per raw GTFS table (agency, calendar, calendar_dates,
    |                        routes, stops, trips, stop_times, transfers)
    derived_tables/
      service_dates.sql   -- Fully expanded active dates per service_id: one row per
      |                      (service_id, date YYYYMMDD, weekday 0=Mon..6=Sun).
      |                      Built at ingest via recursive CTE over calendar + calendar_dates.
    queries/              -- SQL query templates. Placeholders /*STOP_IDS_A*/ and /*STOP_IDS_B*/
    |                        are substituted at runtime by loadSql() in queries.ts
      direct_trips.sql    -- Grouped trip counts by hour/mode/service. Uses COUNT(DISTINCT trip_id)
      |                      to avoid overcounting when proximity expansion matches multiple stops per trip.
      departures.sql      -- Individual departure times for headway computation. Groups by trip_id with
      |                      MIN(departure_time) to deduplicate multi-platform matches.
```

## Chart architecture

`WeekdayChart` uses Recharts `ComposedChart` with two Y-axes:
- **Left axis** ("Afgange/time"): stacked `Bar` per transport mode showing average trips/hour
- **Right axis** ("Ventetid (min)"): grouped `Bar` for `medianHeadway` — median minutes between
  consecutive departures within each hour bucket, across all active dates for that weekday

`medianHeadway` is `null` for hours with fewer than 2 departures on any active date; Recharts renders no bar for null data points.

## Headway computation

`queryCadence()` runs a second SQL query (no GROUP BY) to get individual `departure_time` values. For each weekday, the TypeScript code expands departures per active calendar date (looked up from `service_dates`), sorts them within each hour bucket, computes consecutive gaps, then takes the median across all dates. GTFS times past midnight (e.g. "25:10:00") are normalized with `% 24` on the hour component before converting to minutes.

## Stop proximity expansion

`getStopIdsByProximity()` in `stops.ts` resolves a stop name to a geographic anchor (first stop with that name that has coordinates), then returns all stops within a 250m bounding box — regardless of their name. This is always-on: selecting "København H" also picks up "København H (Metro)" and any other nearby stops.

Constants for Denmark (~55.7°N): `LAT_OFFSET = 250 / 111_320`, `LON_OFFSET = 250 / 62_800`. Falls back to `getStopIdsByName()` if the anchor stop has no coordinates.

Both SQL queries use deduplication to handle the expanded stop sets:
- `direct_trips.sql`: `COUNT(DISTINCT st_a.trip_id)` prevents a trip from being counted multiple times when it passes through multiple stops in the proximity set.
- `departures.sql`: `GROUP BY st_a.trip_id` with `MIN(st_a.departure_time)` picks one departure per trip for headway computation.

## Calendar expansion

Active service dates are precomputed into `service_dates` at ingest time (see `service_dates.sql`). `queryCadence()` queries this table directly instead of expanding date ranges in TypeScript at runtime. The ingest script (`scripts/ingest.ts`) also cleans up SQLite WAL files (`-shm`, `-wal`) before recreating the database to prevent stale file errors.
