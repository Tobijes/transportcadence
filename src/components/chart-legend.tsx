import { MODE_CONFIG, MODE_KEYS } from "@/lib/route-types";

export function ChartLegend() {
  return (
    <div className="flex flex-wrap gap-4">
      {MODE_KEYS.map((key) => (
        <div key={key} className="flex items-center gap-1.5">
          <span
            className="inline-block h-3 w-3 rounded-sm"
            style={{ background: MODE_CONFIG[key].color }}
          />
          <span className="text-xs text-muted-foreground">{MODE_CONFIG[key].label}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm opacity-30" style={{ background: "hsl(var(--foreground))" }} />
        <span className="text-xs text-muted-foreground">Median ventetid (min)</span>
      </div>
    </div>
  );
}
