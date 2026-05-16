CREATE TABLE stops (
  stop_id             TEXT PRIMARY KEY,
  stop_code           TEXT,
  stop_name           TEXT NOT NULL,
  stop_name_lower     TEXT,
  stop_desc           TEXT,
  stop_lat            REAL,
  stop_lon            REAL,
  location_type       INTEGER,
  parent_station      TEXT,
  wheelchair_boarding INTEGER,
  platform_code       TEXT,
  stop_timezone       TEXT
);
