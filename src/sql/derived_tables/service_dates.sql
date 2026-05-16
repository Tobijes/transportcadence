CREATE TABLE service_dates (
  service_id INTEGER NOT NULL,
  date       TEXT    NOT NULL,
  weekday    INTEGER NOT NULL,
  PRIMARY KEY (service_id, date)
);

CREATE INDEX idx_service_dates_weekday ON service_dates (weekday);
