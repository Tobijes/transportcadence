import { DatabaseSync } from "node:sqlite";

// Populates pair_trip_counts with the number of distinct GTFS trips that carry
// passengers from board_id to alight_id. Same self-join as reachable_pairs
// (board before alight, pickup and dropoff allowed) plus COUNT(DISTINCT
// trip_id) per (board, alight) group. Built once at ingest; the BFS then
// queries this table in ~ms per batch in computeLegTripCounts().
export default function postIngest(db: DatabaseSync): number {
  const begin = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");

  begin.run();
  db.exec(`
    INSERT INTO pair_trip_counts (board_id, alight_id, trip_count)
    SELECT st_a.stop_id, st_b.stop_id, COUNT(DISTINCT st_a.trip_id)
    FROM stop_times st_a
    JOIN stop_times st_b
      ON st_a.trip_id = st_b.trip_id
      AND st_b.stop_sequence > st_a.stop_sequence
      AND st_b.drop_off_type = 0
    WHERE st_a.pickup_type = 0
    GROUP BY st_a.stop_id, st_b.stop_id
  `);
  commit.run();

  const row = db.prepare("SELECT COUNT(*) AS n FROM pair_trip_counts").get() as {
    n: number;
  };
  return row.n;
}