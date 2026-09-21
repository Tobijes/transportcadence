-- Finds all boarding stop_ids that can reach a single destination stop_id via
-- one trip. Uses the precomputed reachable_pairs table (indexed on alight_id).
-- The boarding-stop filtering against the BFS frontier is done in TypeScript.
SELECT board_id
FROM reachable_pairs
WHERE alight_id = ?1
