CREATE TABLE transfers (
  from_stop_id      TEXT NOT NULL,
  to_stop_id        TEXT NOT NULL,
  transfer_type     INTEGER NOT NULL,
  min_transfer_time INTEGER,
  from_route_id     TEXT,
  to_route_id       TEXT,
  from_trip_id      INTEGER,
  to_trip_id        INTEGER,
  PRIMARY KEY (from_stop_id, to_stop_id),
  FOREIGN KEY (from_stop_id)  REFERENCES stops(stop_id),
  FOREIGN KEY (to_stop_id)    REFERENCES stops(stop_id),
  FOREIGN KEY (from_route_id) REFERENCES routes(route_id),
  FOREIGN KEY (to_route_id)   REFERENCES routes(route_id),
  FOREIGN KEY (from_trip_id)  REFERENCES trips(trip_id),
  FOREIGN KEY (to_trip_id)    REFERENCES trips(trip_id)
);
