import AdmZip from "adm-zip";
import { parse } from "csv-parse/sync";
import { DatabaseSync } from "node:sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { fileURLToPath } from "node:url";
import { populateServiceDates } from "../src/sql/derived_tables/service_dates";

const GTFS_ZIP = path.resolve(process.cwd(), "GTFS.zip");
const DB_PATH = path.resolve(process.cwd(), "gtfs.db");
const BATCH_SIZE = 10_000;

// Tables to ingest, in dependency order
const TABLES = [
  "agency",
  "calendar",
  "calendar_dates",
  "routes",
  "stops",
  "trips",
  "stop_times",
  "transfers",
] as const;

const SQL_DIR = path.resolve(fileURLToPath(import.meta.url), "../../src/sql");
const SQL_TABLES_DIR = path.join(SQL_DIR, "tables");

const TABLE_ORDER: (typeof TABLES)[number][] = [
  "agency", "calendar", "calendar_dates", "routes", "stops", "trips", "stop_times", "transfers",
];

const SCHEMA =
  `PRAGMA journal_mode = WAL;\nPRAGMA synchronous = OFF;\nPRAGMA foreign_keys = OFF;\n\n` +
  TABLE_ORDER.map((t) => fs.readFileSync(path.join(SQL_TABLES_DIR, `${t}.sql`), "utf8")).join("\n");

const INDEXES = fs.readFileSync(path.join(SQL_DIR, "indexes.sql"), "utf8");

// Per-table column definitions: maps CSV column name -> DB column name (and type hint)
type ColDef = { csv: string; db: string; type?: "int" | "real" | "text" };

const COLUMN_DEFS: Record<(typeof TABLES)[number], ColDef[]> = {
  agency: [
    { csv: "agency_id", db: "agency_id", type: "int" },
    { csv: "agency_name", db: "agency_name" },
    { csv: "agency_url", db: "agency_url" },
    { csv: "agency_timezone", db: "agency_timezone" },
    { csv: "agency_lang", db: "agency_lang" },
    { csv: "agency_phone", db: "agency_phone" },
  ],
  calendar: [
    { csv: "service_id", db: "service_id", type: "int" },
    { csv: "monday", db: "monday", type: "int" },
    { csv: "tuesday", db: "tuesday", type: "int" },
    { csv: "wednesday", db: "wednesday", type: "int" },
    { csv: "thursday", db: "thursday", type: "int" },
    { csv: "friday", db: "friday", type: "int" },
    { csv: "saturday", db: "saturday", type: "int" },
    { csv: "sunday", db: "sunday", type: "int" },
    { csv: "start_date", db: "start_date" },
    { csv: "end_date", db: "end_date" },
  ],
  calendar_dates: [
    { csv: "service_id", db: "service_id", type: "int" },
    { csv: "date", db: "date" },
    { csv: "exception_type", db: "exception_type", type: "int" },
  ],
  routes: [
    { csv: "route_id", db: "route_id" },
    { csv: "agency_id", db: "agency_id", type: "int" },
    { csv: "route_short_name", db: "route_short_name" },
    { csv: "route_long_name", db: "route_long_name" },
    { csv: "route_type", db: "route_type", type: "int" },
    { csv: "route_color", db: "route_color" },
    { csv: "route_text_color", db: "route_text_color" },
    { csv: "route_desc", db: "route_desc" },
  ],
  stops: [
    { csv: "stop_id", db: "stop_id" },
    { csv: "stop_code", db: "stop_code" },
    { csv: "stop_name", db: "stop_name" },
    { csv: "stop_desc", db: "stop_desc" },
    { csv: "stop_lat", db: "stop_lat", type: "real" },
    { csv: "stop_lon", db: "stop_lon", type: "real" },
    { csv: "location_type", db: "location_type", type: "int" },
    { csv: "parent_station", db: "parent_station" },
    { csv: "wheelchair_boarding", db: "wheelchair_boarding", type: "int" },
    { csv: "platform_code", db: "platform_code" },
    { csv: "stop_timezone", db: "stop_timezone" },
  ],
  trips: [
    { csv: "trip_id", db: "trip_id", type: "int" },
    { csv: "route_id", db: "route_id" },
    { csv: "service_id", db: "service_id", type: "int" },
    { csv: "trip_headsign", db: "trip_headsign" },
    { csv: "trip_short_name", db: "trip_short_name" },
    { csv: "direction_id", db: "direction_id", type: "int" },
    { csv: "block_id", db: "block_id" },
    { csv: "shape_id", db: "shape_id" },
    { csv: "wheelchair_accessible", db: "wheelchair_accessible", type: "int" },
    { csv: "bikes_allowed", db: "bikes_allowed", type: "int" },
  ],
  stop_times: [
    { csv: "trip_id", db: "trip_id", type: "int" },
    { csv: "stop_sequence", db: "stop_sequence", type: "int" },
    { csv: "stop_id", db: "stop_id" },
    { csv: "arrival_time", db: "arrival_time" },
    { csv: "departure_time", db: "departure_time" },
    { csv: "pickup_type", db: "pickup_type", type: "int" },
    { csv: "drop_off_type", db: "drop_off_type", type: "int" },
    { csv: "stop_headsign", db: "stop_headsign" },
  ],
  transfers: [
    { csv: "from_stop_id", db: "from_stop_id" },
    { csv: "to_stop_id", db: "to_stop_id" },
    { csv: "transfer_type", db: "transfer_type", type: "int" },
    { csv: "min_transfer_time", db: "min_transfer_time", type: "int" },
    { csv: "from_route_id", db: "from_route_id" },
    { csv: "to_route_id", db: "to_route_id" },
    { csv: "from_trip_id", db: "from_trip_id", type: "int" },
    { csv: "to_trip_id", db: "to_trip_id", type: "int" },
  ],
};

function coerce(value: string, type?: "int" | "real" | "text"): number | string | null {
  if (value === "" || value === null || value === undefined) return null;
  if (type === "int") {
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
  }
  if (type === "real") {
    const n = parseFloat(value);
    return isNaN(n) ? null : n;
  }
  return value;
}

function ingestTable(
  db: DatabaseSync,
  tableName: (typeof TABLES)[number],
  csvContent: string
): number {
  const cols = COLUMN_DEFS[tableName];
  const dbCols = cols.map((c) => c.db).join(", ");
  const placeholders = cols.map(() => "?").join(", ");
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO ${tableName} (${dbCols}) VALUES (${placeholders})`
  );

  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    bom: true,
  }) as Record<string, string>[];

  let count = 0;
  let batch: (() => void)[] = [];

  const flushBatch = () => {
    const txn = db.prepare("BEGIN");
    const commit = db.prepare("COMMIT");
    txn.run();
    for (const fn of batch) fn();
    commit.run();
    batch = [];
  };

  for (const record of records) {
    const values = cols.map((c) => coerce(record[c.csv] ?? "", c.type));
    batch.push(() => stmt.run(...values));
    count++;

    if (batch.length >= BATCH_SIZE) {
      flushBatch();
      process.stdout.write(`  ${count.toLocaleString()} rows...\r`);
    }
  }

  if (batch.length > 0) flushBatch();

  return count;
}


async function main() {
  console.log(`Reading ${GTFS_ZIP}...`);
  if (!fs.existsSync(GTFS_ZIP)) {
    console.error(`GTFS.zip not found at ${GTFS_ZIP}`);
    process.exit(1);
  }

  // Delete existing DB and any leftover WAL files
  for (const suffix of ["", "-shm", "-wal"]) {
    const p = DB_PATH + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log("Deleted existing gtfs.db");

  console.log("Extracting zip...");
  const zip = new AdmZip(GTFS_ZIP);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gtfs-"));
  zip.extractAllTo(tmpDir, true);
  console.log(`Extracted to ${tmpDir}`);

  console.log("Creating database...");
  const db = new DatabaseSync(DB_PATH);

  // Create schema
  for (const stmt of SCHEMA.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt + ";");
  }

  // Ingest each table
  for (const table of TABLES) {
    const filePath = path.join(tmpDir, `${table}.txt`);
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping ${table}.txt (not found)`);
      continue;
    }

    console.log(`Ingesting ${table}...`);
    const t0 = Date.now();
    const content = fs.readFileSync(filePath, "utf8");
    const count = ingestTable(db, table, content);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`  ${count.toLocaleString()} rows in ${elapsed}s`);
  }

  console.log("Creating indexes...");
  const t0 = Date.now();
  for (const stmt of INDEXES.split(";").map((s) => s.trim()).filter(Boolean)) {
    db.exec(stmt + ";");
  }
  console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  const SQL_DERIVED_DIR = path.join(SQL_DIR, "derived_tables");
  console.log("Creating derived tables...");
  const derivedT0 = Date.now();
  if (fs.existsSync(SQL_DERIVED_DIR)) {
    const derivedFiles = fs.readdirSync(SQL_DERIVED_DIR).filter((f) => f.endsWith(".sql")).sort();
    for (const file of derivedFiles) {
      const sql = fs.readFileSync(path.join(SQL_DERIVED_DIR, file), "utf8");
      for (const stmt of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        db.exec(stmt + ";");
      }
      console.log(`  ${file}`);
    }
  }
  const count = populateServiceDates(db);
  console.log(`  service_dates: ${count.toLocaleString()} rows`);
  console.log(`  Done in ${((Date.now() - derivedT0) / 1000).toFixed(1)}s`);

  db.exec("PRAGMA foreign_keys = ON; ANALYZE;");
  db.close();

  // Cleanup temp dir
  fs.rmSync(tmpDir, { recursive: true });

  const sizeMB = (fs.statSync(DB_PATH).size / 1024 / 1024).toFixed(1);
  console.log(`\nDone! gtfs.db is ${sizeMB} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
