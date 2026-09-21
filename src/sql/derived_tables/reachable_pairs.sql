-- Precomputed pairs with aggregate per-leg metrics: one row per (board_id, alight_id)
-- pair where a single GTFS trip carries passengers from board_id to alight_id (board
-- before alight, pickup and dropoff allowed). Built at ingest time from stop_times.
-- The BFS in routing.ts queries this table instead of self-joining stop_times
-- (240x faster: ~50ms vs ~12s for 2500 boarding stops). The post-BFS sort
-- tiebreaker (min(tripCount) across legs) also reads from this table.
CREATE TABLE reachable_pairs (
  board_id   TEXT    NOT NULL,
  alight_id  TEXT    NOT NULL,
  trip_count INTEGER NOT NULL,
  PRIMARY KEY (board_id, alight_id)
);

CREATE INDEX idx_reachable_pairs_alight ON reachable_pairs(alight_id);
