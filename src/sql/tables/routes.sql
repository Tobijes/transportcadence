CREATE TABLE routes (
  route_id         TEXT PRIMARY KEY,
  agency_id        INTEGER NOT NULL,
  route_short_name TEXT,
  route_long_name  TEXT,
  route_type       INTEGER NOT NULL,
  route_color      TEXT,
  route_text_color TEXT,
  route_desc       TEXT,
  FOREIGN KEY (agency_id) REFERENCES agency(agency_id)
);
