CREATE TABLE calendar_dates (
  service_id     INTEGER NOT NULL,
  date           TEXT NOT NULL,
  exception_type INTEGER NOT NULL,
  PRIMARY KEY (service_id, date),
  FOREIGN KEY (service_id) REFERENCES calendar(service_id)
);
