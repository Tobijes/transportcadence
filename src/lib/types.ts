export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Mon, 6=Sun

export interface HourBucket {
  hour: number; // 0-23
  bus: number;
  rail: number;
  stog: number; // S-train (109)
  metro: number;
  tram: number;
  ferry: number;
  medianHeadway: number | null; // median minutes between consecutive departures, null if < 2 trips
}

export type WeekdayData = HourBucket[];

export type CadenceResult = {
  [K in Weekday]: WeekdayData;
};

export interface RawTripRow {
  hour_bucket: number;
  route_type: number;
  service_id: number;
  trip_count: number;
}
