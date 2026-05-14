CREATE TABLE stop_times (
  trip_id        INTEGER NOT NULL,
  stop_sequence  INTEGER NOT NULL,
  stop_id        TEXT NOT NULL,
  arrival_time   TEXT NOT NULL,
  departure_time TEXT NOT NULL,
  pickup_type    INTEGER,
  drop_off_type  INTEGER,
  stop_headsign  TEXT,
  PRIMARY KEY (trip_id, stop_sequence),
  FOREIGN KEY (trip_id) REFERENCES trips(trip_id),
  FOREIGN KEY (stop_id) REFERENCES stops(stop_id)
);
