"use client";

import * as React from "react";
import { StopSelector } from "@/components/stop-selector";
import { WeekdayChart } from "@/components/weekday-chart";
import { ChartLegend } from "@/components/chart-legend";
import { Button } from "@/components/ui/button";
import { queryTripCadence } from "@/app/actions/query-trips";
import type { CadenceResult, Weekday } from "@/lib/types";

const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Mandag",
  1: "Tirsdag",
  2: "Onsdag",
  3: "Torsdag",
  4: "Fredag",
  5: "Lørdag",
  6: "Søndag",
};

export function CadenceDashboard() {
  const [stopA, setStopA] = React.useState("");
  const [stopB, setStopB] = React.useState("");
  const [data, setData] = React.useState<CadenceResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSearch() {
    if (!stopA || !stopB) return;
    setLoading(true);
    setError(null);
    try {
      const result = await queryTripCadence(stopA, stopB);
      setData(result);
    } catch (e) {
      setError("Noget gik galt. Prøv igen.");
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const canSearch = stopA && stopB && !loading;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <StopSelector label="Fra" value={stopA} onChange={setStopA} />
        <StopSelector label="Til" value={stopB} onChange={setStopB} />
        <Button onClick={handleSearch} disabled={!canSearch} className="self-end">
          {loading ? "Søger..." : "Vis kadence"}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-4">
          <div className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Gennemsnitlige afgange pr. time fra{" "}
              <span className="font-medium text-foreground">{stopA}</span> mod{" "}
              <span className="font-medium text-foreground">{stopB}</span>
            </p>
            <ChartLegend />
          </div>
          <div className="flex flex-col gap-4">
            {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((wd) => (
              <WeekdayChart key={wd} day={WEEKDAY_NAMES[wd]} data={data[wd]} />
            ))}
          </div>
        </div>
      )}

      {!data && !loading && (
        <p className="text-sm text-muted-foreground">
          Vælg to stoppesteder for at se transportkadencen.
        </p>
      )}
    </div>
  );
}
