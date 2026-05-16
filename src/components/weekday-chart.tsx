"use client";

import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { MODE_CONFIG, MODE_KEYS } from "@/lib/route-types";
import type { HourBucket } from "@/lib/types";

interface WeekdayChartProps {
  day: string;
  data: HourBucket[];
}

const ALL_HOURS = Array.from({ length: 24 }, (_, i) => i);

export function WeekdayChart({ day, data }: WeekdayChartProps) {
  const hasData = data.some((b) => MODE_KEYS.some((k) => b[k] > 0));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{day}</h3>
      {hasData ? (
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart data={data} margin={{ top: 0, right: 40, bottom: 20, left: 0 }} barCategoryGap="2%" barGap={-4}>
            <XAxis
              dataKey="hour"
              ticks={ALL_HOURS}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => String(v)}
              label={{ value: "Time", position: "insideBottom", offset: -10, style: { fontSize: 13, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" } }}
            />
            <YAxis
              yAxisId="left"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              allowDecimals={false}
              label={{ value: "Afgange/time", angle: -90, position: "insideLeft", offset: 15, style: { fontSize: 12, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" } }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
              allowDecimals={false}
              label={{ value: "Ventetid (min)", angle: 90, position: "insideRight", offset: -5, style: { fontSize: 12, fill: "hsl(var(--muted-foreground))", textAnchor: "middle" } }}
            />
            {MODE_KEYS.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={MODE_CONFIG[key].color}
                yAxisId="left"
              />
            ))}
            <Bar
              yAxisId="right"
              dataKey="medianHeadway"
              fill="hsl(var(--foreground))"
              maxBarSize={6}
              opacity={0.3}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[120px] items-center justify-center">
          <p className="text-xs text-muted-foreground">Ingen afgange denne dag</p>
        </div>
      )}
    </div>
  );
}
