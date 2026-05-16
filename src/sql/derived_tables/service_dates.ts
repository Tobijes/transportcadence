import { DatabaseSync } from "node:sqlite";

interface CalendarRow {
  service_id: number;
  monday: number; tuesday: number; wednesday: number; thursday: number;
  friday: number; saturday: number; sunday: number;
  start_date: string; end_date: string;
}

interface CalendarDateRow {
  service_id: number;
  date: string;
  exception_type: number;
}

const DAY_FLAGS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;

function parseYYYYMMDD(s: string): Date {
  return new Date(parseInt(s.slice(0, 4)), parseInt(s.slice(4, 6)) - 1, parseInt(s.slice(6, 8)));
}

function toYYYYMMDD(d: Date): string {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
}

function jsDownToWeekday(jsDay: number): number {
  return jsDay === 0 ? 6 : jsDay - 1;
}

export function populateServiceDates(db: DatabaseSync): number {
  const calRows = db.prepare("SELECT * FROM calendar").all() as CalendarRow[];
  const calDateRows = db.prepare("SELECT * FROM calendar_dates").all() as CalendarDateRow[];

  const removed = new Map<number, Set<string>>();
  const added = new Map<number, Set<string>>();
  for (const r of calDateRows) {
    const target = r.exception_type === 2 ? removed : added;
    if (!target.has(r.service_id)) target.set(r.service_id, new Set());
    target.get(r.service_id)!.add(r.date);
  }

  const stmt = db.prepare("INSERT OR IGNORE INTO service_dates (service_id, date, weekday) VALUES (?, ?, ?)");
  const begin = db.prepare("BEGIN");
  const commit = db.prepare("COMMIT");

  let total = 0;
  begin.run();

  for (const cal of calRows) {
    const removedDates = removed.get(cal.service_id) ?? new Set<string>();
    const addedDates = added.get(cal.service_id) ?? new Set<string>();
    const inserted = new Set<string>();

    const start = parseYYYYMMDD(cal.start_date);
    const end = parseYYYYMMDD(cal.end_date);

    for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = toYYYYMMDD(d);
      if (removedDates.has(dateStr)) continue;
      const weekday = jsDownToWeekday(d.getDay());
      if (cal[DAY_FLAGS[weekday]] === 1) {
        stmt.run(cal.service_id, dateStr, weekday);
        inserted.add(dateStr);
        total++;
      }
    }

    for (const dateStr of addedDates) {
      if (inserted.has(dateStr)) continue;
      const d = parseYYYYMMDD(dateStr);
      const weekday = jsDownToWeekday(d.getDay());
      stmt.run(cal.service_id, dateStr, weekday);
      total++;
    }
  }

  commit.run();
  return total;
}
