-- Trip count for a batch of (board_id, alight_id) leg pairs. Reads the
-- trip_count column from the precomputed reachable_pairs table (built at
-- ingest) instead of self-joining stop_times. Used by routing.ts in
-- computeLegTripCounts() to populate Leg.tripCount, which is then used as a
-- tiebreaker in route sorting: within the same transfer count, the route whose
-- bottleneck leg has the highest trip_count ranks first. Row-value IN clause,
-- batched at 250 pairs.
SELECT
  board_id,
  alight_id,
  trip_count
FROM reachable_pairs
WHERE (board_id, alight_id) IN (/*PAIRS*/)