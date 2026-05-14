CREATE TABLE service_weekdays (
  service_id INTEGER PRIMARY KEY,
  monday     INTEGER NOT NULL,
  tuesday    INTEGER NOT NULL,
  wednesday  INTEGER NOT NULL,
  thursday   INTEGER NOT NULL,
  friday     INTEGER NOT NULL,
  saturday   INTEGER NOT NULL,
  sunday     INTEGER NOT NULL
);

INSERT INTO service_weekdays (service_id, monday, tuesday, wednesday, thursday, friday, saturday, sunday)
SELECT
  c.service_id,
  c.monday * 12    + COALESCE(cd.monday, 0)    AS monday,
  c.tuesday * 12   + COALESCE(cd.tuesday, 0)   AS tuesday,
  c.wednesday * 12 + COALESCE(cd.wednesday, 0) AS wednesday,
  c.thursday * 12  + COALESCE(cd.thursday, 0)  AS thursday,
  c.friday * 12    + COALESCE(cd.friday, 0)    AS friday,
  c.saturday * 12  + COALESCE(cd.saturday, 0)  AS saturday,
  c.sunday * 12    + COALESCE(cd.sunday, 0)    AS sunday
FROM calendar c
LEFT JOIN (
  SELECT
    service_id,
    SUM(CASE WHEN dow = '1' THEN adj ELSE 0 END) AS monday,
    SUM(CASE WHEN dow = '2' THEN adj ELSE 0 END) AS tuesday,
    SUM(CASE WHEN dow = '3' THEN adj ELSE 0 END) AS wednesday,
    SUM(CASE WHEN dow = '4' THEN adj ELSE 0 END) AS thursday,
    SUM(CASE WHEN dow = '5' THEN adj ELSE 0 END) AS friday,
    SUM(CASE WHEN dow = '6' THEN adj ELSE 0 END) AS saturday,
    SUM(CASE WHEN dow = '0' THEN adj ELSE 0 END) AS sunday
  FROM (
    SELECT
      service_id,
      strftime('%w', substr(cd.date,1,4)||'-'||substr(cd.date,5,2)||'-'||substr(cd.date,7,2)) AS dow,
      CASE WHEN exception_type = 1 THEN 1 ELSE -1 END AS adj
    FROM calendar_dates cd
  )
  GROUP BY service_id
) cd ON cd.service_id = c.service_id;
