-- Precomputed distinct (board_id, alight_id, trip_count) tuples: one row per
-- reachable stop pair with the number of distinct GTFS trips that carry
-- passengers from board_id to alight_id (board before alight, pickup and
-- dropoff allowed). Built at ingest time from stop_times self-join.
--
-- Used by the BFS in routing.ts to populate Leg.tripCount, which is then
-- used as a tiebreaker in route sorting: within the same transfer count,
-- the route whose bottleneck leg has the highest trip_count ranks first.
-- Min() across legs is used so the worst-served leg dominates (rather than
-- the average), which matches user intuition that the weakest link in a
-- journey matters most.
--
-- The primary key (board_id, alight_id) serves as a covering index for the
-- row-value IN clause used by computeLegTripCounts() — no secondary index
-- needed.
CREATE TABLE pair_trip_counts (
  board_id   TEXT    NOT NULL,
  alight_id  TEXT    NOT NULL,
  trip_count INTEGER NOT NULL,
  PRIMARY KEY (board_id, alight_id)
);