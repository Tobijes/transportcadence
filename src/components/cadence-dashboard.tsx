"use client";

import * as React from "react";
import { StopSelector } from "@/components/stop-selector";
import { WeekdayChart } from "@/components/weekday-chart";
import { ChartLegend } from "@/components/chart-legend";
import { RouteList } from "@/components/route-list";
import { TransfersSelector } from "@/components/transfers-selector";
import { ArrowLeftRight, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { findRoutes, queryLegCadence } from "@/app/actions/query-trips";
import { addRecentStop } from "@/lib/recent-stops";
import type { CadenceQueryResult, FindRoutesResult, Leg, Weekday } from "@/lib/types";

const WEEKDAY_NAMES: Record<Weekday, string> = {
  0: "Mandag",
  1: "Tirsdag",
  2: "Onsdag",
  3: "Torsdag",
  4: "Fredag",
  5: "Lørdag",
  6: "Søndag",
};

const DEFAULT_MAX_TRANSFERS = 1;

function legKey(leg: Leg | null): string {
  if (!leg) return "";
  return `${leg.fromStopId}>${leg.toStopId}`;
}

export function CadenceDashboard() {
  const [stopA, setStopA] = React.useState("");
  const [stopB, setStopB] = React.useState("");
  const [maxTransfers, setMaxTransfers] = React.useState(DEFAULT_MAX_TRANSFERS);

  const [routesResult, setRoutesResult] = React.useState<FindRoutesResult | null>(null);
  const [selectedLeg, setSelectedLeg] = React.useState<Leg | null>(null);
  const [legCadence, setLegCadence] = React.useState<CadenceQueryResult | null>(null);

  const [loadingRoutes, setLoadingRoutes] = React.useState(false);
  const [loadingCadence, setLoadingCadence] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Find routes when origin, destination, or transfer count changes.
  React.useEffect(() => {
    if (!stopA || !stopB) return;

    let cancelled = false;
    setLoadingRoutes(true);
    setError(null);
    setRoutesResult(null);
    setSelectedLeg(null);
    setLegCadence(null);

    findRoutes(stopA, stopB, maxTransfers)
      .then((result) => {
        if (!cancelled) setRoutesResult(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError("Noget gik galt. Prøv igen.");
          console.error(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingRoutes(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stopA, stopB, maxTransfers]);

  // Query per-leg cadence when a leg is selected.
  React.useEffect(() => {
    if (!selectedLeg) {
      setLegCadence(null);
      return;
    }

    let cancelled = false;
    setLoadingCadence(true);

    queryLegCadence(selectedLeg.fromStopId, selectedLeg.toStopId)
      .then((result) => {
        if (!cancelled) setLegCadence(result);
      })
      .catch((e) => {
        if (!cancelled) {
          setError("Noget gik galt. Prøv igen.");
          console.error(e);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingCadence(false);
      });

    return () => {
      cancelled = true;
    };
  }, [legKey(selectedLeg)]);

  function handleSwap() {
    const prevA = stopA;
    const prevB = stopB;
    setStopA(prevB);
    setStopB(prevA);
    addRecentStop("fra", prevB);
    addRecentStop("til", prevA);
  }

  function handleSelectLeg(leg: Leg) {
    setSelectedLeg(leg);
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
        <TransfersSelector
          value={maxTransfers}
          onChange={setMaxTransfers}
          disabled={loadingRoutes}
        />
        {loadingRoutes && (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground self-end mb-2" />
        )}
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {routesResult && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Ruter fra{" "}
            <span className="font-medium text-foreground">{routesResult.originName}</span> til{" "}
            <span className="font-medium text-foreground">{routesResult.destName}</span> med op til{" "}
            {maxTransfers} skift:
          </p>
          <RouteList
            routes={routesResult.routes}
            selectedLeg={selectedLeg}
            onSelectLeg={handleSelectLeg}
            truncated={routesResult.truncated}
          />
        </div>
      )}

      {selectedLeg && legCadence && (
        <div className="space-y-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1">
              <p className="text-sm text-muted-foreground">
                Gennemsnitlige afgange pr. time fra{" "}
                <span className="font-medium text-foreground">{selectedLeg.fromName}</span> mod{" "}
                <span className="font-medium text-foreground">{selectedLeg.toName}</span>
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
                      {legCadence.meta.fromStops.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="font-medium mb-1">Til-stoppesteder</p>
                    <ul className="space-y-0.5 text-muted-foreground">
                      {legCadence.meta.toStops.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                </PopoverContent>
              </Popover>
              {loadingCadence && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <ChartLegend cadence={legCadence.cadence} />
          </div>
          <div className="flex flex-col gap-4">
            {([0, 1, 2, 3, 4, 5, 6] as Weekday[]).map((wd) => (
              <WeekdayChart key={wd} day={WEEKDAY_NAMES[wd]} data={legCadence.cadence[wd]} />
            ))}
          </div>
        </div>
      )}

      {selectedLeg && !legCadence && loadingCadence && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Henter kadence for delrute...
        </div>
      )}

      {!selectedLeg && routesResult && !loadingRoutes && (
        <p className="text-sm text-muted-foreground">
          Klik på en delrute for at se kadencen.
        </p>
      )}

      {!routesResult && !loadingRoutes && (
        <p className="text-sm text-muted-foreground">
          Vælg to stoppesteder for at finde ruter.
        </p>
      )}
    </div>
  );
}
