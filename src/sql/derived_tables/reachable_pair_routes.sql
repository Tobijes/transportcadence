-- Precomputed distinct (board_id, alight_id, route_short_name, route_type) tuples:
-- one row per stop pair + route that serves that pair on some GTFS trip (board before
-- alight, pickup and dropoff allowed). Built at ingest time from stop_times.
-- The BFS in routing.ts queries this table in computeLegRoutes() to populate
-- Leg.routes (the coloured route badges shown in route-list.tsx), instead of
-- self-joining stop_times (~18s for ~830 pairs). Indexed lookup is ~ms.
--
-- Also stores the mean travel time (board departure → alight arrival, in
-- minutes, fractional) across all GTFS trips that serve the pair on that route.
-- The UI rounds up (ceiling) to integer minutes before display.
--
-- The primary key (board_id, alight_id, route_short_name, route_type) serves as
-- a covering index for forward (board_id, alight_id) lookups — no separate
-- index needed for the IN (...) clause used by computeLegRoutes().
CREATE TABLE reachable_pair_routes (
  board_id            TEXT    NOT NULL,
  alight_id           TEXT    NOT NULL,
  route_short_name    TEXT    NOT NULL,
  route_type          INTEGER NOT NULL,
  mean_travel_time     REAL,
  PRIMARY KEY (board_id, alight_id, route_short_name, route_type)
);
