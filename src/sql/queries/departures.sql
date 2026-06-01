SELECT
  CAST(SUBSTR(MIN(st_a.departure_time), 1, 2) AS INTEGER) % 24 AS hour_bucket,
  t.service_id,
  MIN(st_a.departure_time) AS departure_time
FROM stop_times st_a
JOIN stop_times st_b
  ON st_a.trip_id = st_b.trip_id
  AND st_b.stop_sequence > st_a.stop_sequence
  AND st_b.drop_off_type = 0
JOIN trips t ON st_a.trip_id = t.trip_id
WHERE st_a.stop_id IN (/*STOP_IDS_A*/)
  AND st_a.pickup_type = 0
  AND st_b.stop_id IN (/*STOP_IDS_B*/)
GROUP BY st_a.trip_id
