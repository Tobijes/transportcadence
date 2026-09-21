-- Distinct (route_short_name, route_type) for a batch of (board_id, alight_id)
-- leg pairs. Queries the precomputed reachable_pair_routes table (built at ingest)
-- instead of self-joining stop_times. Used by routing.ts in computeLegRoutes()
-- to populate Leg.routes for the coloured route badges shown in route-list.tsx.
-- Also returns the mean travel time (in fractional minutes) per route option;
-- the UI rounds up (ceiling) to integer minutes for display. Row-value IN clause, batched at 250 pairs.
SELECT
  board_id,
  alight_id,
  route_short_name,
  route_type,
  mean_travel_time
FROM reachable_pair_routes
WHERE (board_id, alight_id) IN (/*PAIRS*/)
