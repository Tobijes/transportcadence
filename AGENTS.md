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
    queries.ts            -- queryCadence(): two SQL queries (grouped trip counts + individual
    |                        departure times), computes per-weekday averages and median headways
    route-types.ts        -- GTFS route_type → ModeKey mapping, colors, labels
    stops.ts              -- getAllStopNames(), getStopIdsByName()
    types.ts              -- CadenceResult, HourBucket (includes medianHeadway), Weekday
  sql/
    indexes.sql           -- All index CREATE statements
    tables/               -- One .sql per raw GTFS table (agency, calendar, calendar_dates,
    |                        routes, stops, trips, stop_times, transfers)
    derived_tables/
      service_weekdays.sql  -- Weekday weights per service_id (calendar + calendar_dates merged)
    queries/              -- SQL query templates. Placeholders /*STOP_IDS_A*/ and /*STOP_IDS_B*/
    |                        are substituted at runtime by loadSql() in queries.ts
      direct_trips.sql    -- Grouped trip counts by hour/mode/service (used by queryCadence)
      departures.sql      -- Individual departure times for headway computation (used by queryCadence)
      trips_between.sql   -- Scratch/dev query (not used at runtime)
```

## Chart architecture

`WeekdayChart` uses Recharts `ComposedChart` with two Y-axes:
- **Left axis** ("Afgange/time"): stacked `Bar` per transport mode showing average trips/hour
- **Right axis** ("Ventetid (min)"): grouped `Bar` for `medianHeadway` — median minutes between
  consecutive departures within each hour bucket, across all active dates for that weekday

`medianHeadway` is `null` for hours with fewer than 2 departures on any active date; Recharts renders no bar for null data points.

## Headway computation

`queryCadence()` runs a second SQL query (no GROUP BY) to get individual `departure_time` values. For each weekday, the TypeScript code expands departures per active calendar date, sorts them within each hour bucket, computes consecutive gaps, then takes the median across all dates. GTFS times past midnight (e.g. "25:10:00") are normalized with `% 24` on the hour component before converting to minutes.
