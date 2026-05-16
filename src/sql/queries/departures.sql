SELECT
  CAST(SUBSTR(st_a.departure_time, 1, 2) AS INTEGER) % 24 AS hour_bucket,
  t.service_id,
  st_a.departure_time
FROM stop_times st_a
JOIN stop_times st_b
  ON st_a.trip_id = st_b.trip_id
  AND st_b.stop_sequence > st_a.stop_sequence
JOIN trips t ON st_a.trip_id = t.trip_id
WHERE st_a.stop_id IN (/*STOP_IDS_A*/)
  AND st_b.stop_id IN (/*STOP_IDS_B*/)
