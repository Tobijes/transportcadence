import { MODE_CONFIG, MODE_KEYS, type ModeKey } from "@/lib/route-types";
import type { CadenceResult } from "@/lib/types";

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

function getUsedModes(cadence: CadenceResult): Set<ModeKey> {
  const used = new Set<ModeKey>();
  for (const wd of WEEKDAYS) {
    for (const bucket of cadence[wd]) {
      for (const key of MODE_KEYS) {
        if (bucket[key] > 0) used.add(key);
      }
    }
  }
  return used;
}

export function ChartLegend({ cadence }: { cadence: CadenceResult }) {
  const usedModes = getUsedModes(cadence);
  const showHeadway = WEEKDAYS.some(
    (wd) => cadence[wd].some((b) => b.medianHeadway !== null),
  );

  return (
    <div className="flex flex-wrap gap-4">
      {MODE_KEYS.filter((key) => usedModes.has(key)).map((key) => (
        <div key={key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: MODE_CONFIG[key].color }}
          />
          <span className="text-xs text-muted-foreground">{MODE_CONFIG[key].label}</span>
        </div>
      ))}
      {showHeadway && (
        <div className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm opacity-30" style={{ background: "hsl(var(--foreground))" }} />
          <span className="text-xs text-muted-foreground">Median ventetid (min)</span>
        </div>
      )}
    </div>
  );
}
