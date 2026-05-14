WITH
FromTrips AS (
    SELECT DISTINCT t.trip_id, st.stop_sequence, s.stop_name, st.departure_time , st.arrival_time, t.service_id 
    FROM stops s 
    INNER JOIN stop_times st ON st.stop_id = s.stop_id 
    INNER JOIN trips t ON t.trip_id = st.trip_id 
    WHERE s.stop_name = 'Roskilde St.'
),
ToTrips AS (
    SELECT DISTINCT t.trip_id, st.stop_sequence,  s.stop_name, st.departure_time , st.arrival_time, t.service_id 
    FROM stops s 
    INNER JOIN stop_times st ON st.stop_id = s.stop_id 
    INNER JOIN trips t ON t.trip_id = st.trip_id 
    WHERE s.stop_name = 'København H'
),
IntersectionTrips AS (
	SELECT
	ft.trip_id,
	ft.stop_name AS from_stop,
	ft.departure_time,
	tt.stop_name AS to_stop,
	tt.arrival_time
	FROM FromTrips ft
	INNER JOIN ToTrips tt ON ft.trip_id = tt.trip_id
	WHERE ft.stop_sequence < tt.stop_sequence
)
SELECT
	it.trip_id,
    it.from_stop,
    it.departure_time,
    it.to_stop,
    it.arrival_time,
	CAST(SUBSTR(it.departure_time, 1, INSTR(it.departure_time, ':') - 1) AS INTEGER) % 24 AS clock_hour,
	sw.monday,
	sw.tuesday,
	sw.wednesday,
	sw.thursday,
	sw.friday,
	sw.saturday,
	sw.sunday
FROM IntersectionTrips it
LEFT JOIN trips t ON it.trip_id = t.trip_id
LEFT JOIN service_weekdays sw ON sw.service_id = t.service_id