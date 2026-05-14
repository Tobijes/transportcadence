CREATE TABLE trips (
  trip_id               INTEGER PRIMARY KEY,
  route_id              TEXT NOT NULL,
  service_id            INTEGER NOT NULL,
  trip_headsign         TEXT,
  trip_short_name       TEXT,
  direction_id          INTEGER,
  block_id              TEXT,
  shape_id              TEXT,
  wheelchair_accessible INTEGER,
  bikes_allowed         INTEGER,
  FOREIGN KEY (route_id)    REFERENCES routes(route_id),
  FOREIGN KEY (service_id)  REFERENCES calendar(service_id)
);
