import { DatabaseSync } from "node:sqlite";

// Populates reachable_pair_routes with all distinct (board_id, alight_id,
// route_short_name, route_type) tuples where a single trip carries passengers
// from board_id to alight_id, plus the mean travel time in minutes (board
// departure → alight arrival) across all GTFS trips serving that tuple.
// This is a one-time computation at ingest; the BFS then queries this table
// in ~ms instead of self-joining stop_times (~18s). The UI rounds the mean
// up (ceiling) to integer minutes before display.
export default function postIngest(db: DatabaseSync): number {
  const begin = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");

  begin.run();
  db.exec(`
    INSERT INTO reachable_pair_routes (board_id, alight_id, route_short_name, route_type, mean_travel_time)
    SELECT
      st_a.stop_id,
      st_b.stop_id,
      r.route_short_name,
      r.route_type,
      AVG(
        (
          CAST(SUBSTR(COALESCE(st_b.arrival_time, st_b.departure_time), 1, INSTR(COALESCE(st_b.arrival_time, st_b.departure_time), ':') - 1) AS INTEGER) * 60
          + CAST(SUBSTR(COALESCE(st_b.arrival_time, st_b.departure_time), INSTR(COALESCE(st_b.arrival_time, st_b.departure_time), ':') + 1, 2) AS INTEGER)
        ) - (
          CAST(SUBSTR(COALESCE(st_a.departure_time, st_a.arrival_time), 1, INSTR(COALESCE(st_a.departure_time, st_a.arrival_time), ':') - 1) AS INTEGER) * 60
          + CAST(SUBSTR(COALESCE(st_a.departure_time, st_a.arrival_time), INSTR(COALESCE(st_a.departure_time, st_a.arrival_time), ':') + 1, 2) AS INTEGER)
        )
      ) AS mean_travel_time
    FROM stop_times st_a
    JOIN stop_times st_b
      ON st_a.trip_id = st_b.trip_id
      AND st_b.stop_sequence > st_a.stop_sequence
      AND st_b.drop_off_type = 0
    JOIN trips t ON st_a.trip_id = t.trip_id
    JOIN routes r ON t.route_id = r.route_id
    WHERE st_a.pickup_type = 0
    GROUP BY st_a.stop_id, st_b.stop_id, r.route_short_name, r.route_type
  `);
  commit.run();

  const row = db.prepare("SELECT COUNT(*) AS n FROM reachable_pair_routes").get() as {
    n: number;
  };
  return row.n;
}
