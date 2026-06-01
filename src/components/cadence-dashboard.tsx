"use client";

import * as React from "react";
import { StopSelector } from "@/components/stop-selector";
import { WeekdayChart } from "@/components/weekday-chart";
import { ChartLegend } from "@/components/chart-legend";
import { ArrowLeftRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { queryTripCadence } from "@/app/actions/query-trips";
import { addRecentStop } from "@/lib/recent-stops";
import type { CadenceQueryResult, Weekday } from "@/lib/types";

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
  const [data, setData] = React.useState<CadenceQueryResult | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!stopA || !stopB) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    queryTripCadence(stopA, stopB)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError("Noget gik galt. Prøv igen.");
          console.error(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [stopA, stopB]);

  function handleSwap() {
    const prevA = stopA;
    const prevB = stopB;
    setStopA(prevB);
    setStopB(prevA);
    addRecentStop("fra", prevB);
    addRecentStop("til", prevA);
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end gap-4">
        <StopSelector label="Fra" value={stopA} onChange={setStopA} storageKey="fra" />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleSwap}
          disabled={!stopA || !stopB}
          className="self-end mb-0.5"
        >
          <ArrowLeftRight className="h-4 w-4" />
        </Button>
        <StopSelector label="Til" value={stopB} onChange={setStopB} storageKey="til" />
        {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground self-end mb-2" />}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {data && (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-sm text-muted-foreground">
                Gennemsnitlige afgange pr. time fra{" "}
                <span className="font-medium text-foreground">{stopA}</span> mod{" "}
                <span className="font-medium text-foreground">{stopB}</span>
              </p>
              <Popover>
                <PopoverTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 text-sm space-y-3">
                  <div>
                    <p className="font-medium mb-1">Fra-stoppesteder</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {data.meta.fromStops.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Til-stoppesteder</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {data.meta.toStops.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <ChartLegend cadence={data.cadence} />
          </div>
          <div className="flex flex-col gap-4">
            {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((wd) => (
              <WeekdayChart key={wd} day={WEEKDAY_NAMES[wd]} data={data.cadence[wd]} />
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
