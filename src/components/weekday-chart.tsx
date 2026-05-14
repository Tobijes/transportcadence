"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { MODE_CONFIG, MODE_KEYS } from "@/lib/route-types";
import type { HourBucket } from "@/lib/types";

interface WeekdayChartProps {
  day: string;
  data: HourBucket[];
}

const HOUR_LABELS = Array.from({ length: 24 }, (_, i) =>
  i % 3 === 0 ? String(i).padStart(2, "0") : ""
);

export function WeekdayChart({ day, data }: WeekdayChartProps) {
  const hasData = data.some((b) => MODE_KEYS.some((k) => b[k] > 0));

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{day}</h3>
      {hasData ? (
        <ResponsiveContainer width="100%" height={120}>
          <BarChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: -20 }} barCategoryGap="10%">
            <XAxis
              dataKey="hour"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(v) => HOUR_LABELS[v] ?? ""}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              allowDecimals={false}
            />
            <Tooltip
              contentStyle={{
                background: "hsl(var(--popover))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "6px",
                fontSize: 12,
                color: "hsl(var(--popover-foreground))",
              }}
              formatter={(value: number, name: string) => [
                value.toFixed(1),
                MODE_CONFIG[name as keyof typeof MODE_CONFIG]?.label ?? name,
              ]}
              labelFormatter={(label) => `Kl. ${String(label).padStart(2, "0")}:00`}
            />
            {MODE_KEYS.map((key) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={MODE_CONFIG[key].color}
                maxBarSize={20}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[120px] items-center justify-center">
          <p className="text-xs text-muted-foreground">Ingen afgange denne dag</p>
        </div>
      )}
    </div>
  );
}
