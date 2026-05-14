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
  lib/
    db.ts                 -- SQLite singleton (node:sqlite)
    queries.ts            -- queryCadence() — main runtime query
    route-types.ts
    types.ts
  sql/
    indexes.sql           -- All index CREATE statements
    tables/               -- One .sql per raw GTFS table (agency, calendar, calendar_dates,
    |                        routes, stops, trips, stop_times, transfers)
    derived_tables/       -- Materialized tables built post-ingestion
      service_weekdays.sql  -- Weekday weights per service_id (calendar + calendar_dates merged)
    queries/              -- Scratch/dev queries (not used at runtime)
      trip_days.sql
      trips_between.sql
```
