"use client";

import * as React from "react";
import { ArrowRight, ArrowRightLeft, ChevronsDown, ChevronsUp, Footprints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MODE_CONFIG, normalizeRouteType } from "@/lib/route-types";
import type { Leg, LegRoute, Route } from "@/lib/types";

interface RouteListProps {
  routes: Route[];
  selectedLeg: Leg | null;
  onSelectLeg: (leg: Leg) => void;
  truncated?: boolean;
}

const COLLAPSED_ROUTE_COUNT = 5;

export function RouteList({ routes, selectedLeg, onSelectLeg, truncated }: RouteListProps) {
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    setExpanded(false);
  }, [routes]);

  if (routes.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Ingen ruter fundet. Prøv at øge antallet af skift.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {truncated && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Søgningen blev afbrudt (tidsgrænse). Viser delvise resultater.
        </p>
      )}
      <div className="space-y-1.5">
        {(expanded ? routes : routes.slice(0, COLLAPSED_ROUTE_COUNT)).map((route, routeIdx) => (
          <RouteRow
            key={routeIdx}
            route={route}
            selectedLeg={selectedLeg}
            onSelectLeg={onSelectLeg}
          />
        ))}
      </div>
      {routes.length > COLLAPSED_ROUTE_COUNT && (
        <div className="flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? (
              <>
                <ChevronsUp className="h-4 w-4" />
                Vis færre
              </>
            ) : (
              <>
                <ChevronsDown className="h-4 w-4" />
                Vis alle {routes.length} ruter
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

function RouteBadge({ route }: { route: LegRoute }) {
  const mode = normalizeRouteType(route.routeType);
  const { color, label } = MODE_CONFIG[mode];
  return (
    <span
      className="inline-flex flex-col items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white whitespace-nowrap"
      style={{ background: color }}
      title={label}
    >
      <span>{route.shortName}</span>
      {route.meanTravelTime !== undefined && (
        <span className="text-[9px] font-normal opacity-90">
          {Math.ceil(route.meanTravelTime)} min
        </span>
      )}
    </span>
  );
}

function RouteRow({
  route,
  selectedLeg,
  onSelectLeg,
}: {
  route: Route;
  selectedLeg: Leg | null;
  onSelectLeg: (leg: Leg) => void;
}) {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-1">
        {route.legs.map((leg, legIdx) => {
          const prevLeg = legIdx > 0 ? route.legs[legIdx - 1] : null;
          // Standstill = no walk between legs. Either the same stop_id, or
          // the same stop name (intra-station platform switches, e.g. Roskilde
          // St. platform A → Roskilde St. platform B — the passenger stays put).
          const isStandstill =
            prevLeg !== null &&
            (leg.fromStopId === prevLeg.toStopId || leg.fromName === prevLeg.toName);
          const isWalkTransfer = prevLeg !== null && !isStandstill;

          const isSelected =
            selectedLeg?.fromStopId === leg.fromStopId &&
            selectedLeg?.toStopId === leg.toStopId;

          return (
            <React.Fragment key={`${leg.fromStopId}-${leg.toStopId}-${legIdx}`}>
              {isWalkTransfer && (
                <span
                  className="inline-flex items-center text-muted-foreground"
                  title={`Gangskift: ${leg.fromName}`}
                >
                  <Footprints className="h-3.5 w-3.5" />
                </span>
              )}
              {isStandstill && (
                <span
                  className="inline-flex items-center text-muted-foreground"
                  title={`Skift på samme stop: ${leg.fromName}`}
                >
                  <ArrowRightLeft className="h-3.5 w-3.5" />
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelectLeg(leg)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors",
                  "hover:bg-accent hover:text-accent-foreground",
                  isSelected && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                )}
                title={`${leg.fromName} → ${leg.toName}`}
              >
                <span className="font-medium">{leg.fromName}</span>
                {leg.routes.length > 0 && (
                  <span className="inline-flex gap-0.5">
                    {leg.routes.map((r, i) => (
                      <RouteBadge key={`${r.shortName}-${r.routeType}-${i}`} route={r} />
                    ))}
                  </span>
                )}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 opacity-70" />
                <span className="font-medium">{leg.toName}</span>
              </button>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
