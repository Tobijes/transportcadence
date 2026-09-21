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

export interface QueryMeta {
  fromStops: string[];
  toStops: string[];
}

export type CadenceQueryResult = {
  cadence: CadenceResult;
  meta: QueryMeta;
};

export interface LegRoute {
  shortName: string;
  routeType: number;
  meanTravelTime?: number; // fractional minutes; UI rounds up (ceiling) before display
}

export interface Leg {
  fromStopId: string;
  toStopId: string;
  fromName: string;
  toName: string;
  routes: LegRoute[];
  tripCount?: number;
}

export interface Route {
  legs: Leg[];
}

export interface FindRoutesResult {
  routes: Route[];
  originName: string;
  destName: string;
  truncated: boolean;
}
