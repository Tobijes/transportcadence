CREATE TABLE calendar (
  service_id INTEGER PRIMARY KEY,
  monday     INTEGER NOT NULL,
  tuesday    INTEGER NOT NULL,
  wednesday  INTEGER NOT NULL,
  thursday   INTEGER NOT NULL,
  friday     INTEGER NOT NULL,
  saturday   INTEGER NOT NULL,
  sunday     INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL
);
