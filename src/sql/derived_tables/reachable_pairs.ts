import { DatabaseSync } from "node:sqlite";

// Populates reachable_pairs with all distinct (board_id, alight_id) pairs where
// a single trip carries passengers from board_id to alight_id. This is a one-time
// ~50s computation at ingest; the BFS then queries this table in ~50ms per wave.
export default function postIngest(db: DatabaseSync): number {
  const begin = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");

  begin.run();
  db.exec(`
    INSERT INTO reachable_pairs (board_id, alight_id)
    SELECT DISTINCT st_a.stop_id, st_b.stop_id
    FROM stop_times st_a
    JOIN stop_times st_b
      ON st_a.trip_id = st_b.trip_id
      AND st_b.stop_sequence > st_a.stop_sequence
      AND st_b.drop_off_type = 0
    WHERE st_a.pickup_type = 0
  `);
  commit.run();

  const row = db.prepare("SELECT COUNT(*) AS n FROM reachable_pairs").get() as {
    n: number;
  };
  return row.n;
}
