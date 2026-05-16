"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  LabelList,
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

  const totalsPerHour = data.map((b) => MODE_KEYS.reduce((sum, k) => sum + b[k], 0));
  const maxTrips = Math.max(...totalsPerHour, 0);
  const domainMax = Math.ceil(maxTrips / 5) * 5 || 5;
  const tickInterval = domainMax < 10 ? 1 : domainMax < 30 ? 2 : 5;
  const leftTicks = Array.from({ length: Math.floor(domainMax / tickInterval) + 1 }, (_, i) => i * tickInterval);
  const avgTripsPerHour = totalsPerHour.reduce((a, b) => a + b, 0) / 24;
  const showHeadway = avgTripsPerHour > 2;

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="mb-3 text-sm font-semibold text-card-foreground">{day}</h3>
      {hasData ? (
        <>
        <div
          className="flex justify-between text-xs text-muted-foreground mb-1"
        >
          <span>Afgange/time</span>
          {showHeadway && <span>Ventetid (min)</span>}
        </div>
        <ResponsiveContainer width="100%" height={150}>
          <ComposedChart
            data={data}
            margin={{ top: 15, right: 0, bottom: 20, left: 0 }}
            barCategoryGap="2%"
            barGap={0}
          >
            <CartesianGrid
              horizontal={true}
              vertical={false}
              strokeDasharray="3 3"
              stroke="hsl(var(--muted-foreground))"
              strokeOpacity={0.2}
            />
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
              domain={[0, domainMax]}
              ticks={leftTicks}
              interval={0}
              width={30}
            />
            {showHeadway && (
              <YAxis
                yAxisId="right"
                orientation="right"
                tickLine={false}
                axisLine={false}
                tick={{ fontSize: 12, fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
                width={30}
              />
            )}
            {MODE_KEYS.map((key, idx) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={MODE_CONFIG[key].color}
                yAxisId="left"
                isAnimationActive={false}
              >
                {idx === MODE_KEYS.length - 1 && (
                  <LabelList
                    dataKey="hour"
                    position="top"
                    content={({ x, y, width, index }) => {
                      const total = totalsPerHour[index as number];
                      if (!total) return null;
                      const barWidth = width as number;
                      const fontSize = Math.min(13, Math.max(6, barWidth * 0.7));
                      return (
                        <text
                          x={(x as number) + barWidth / 2}
                          y={(y as number) - 3}
                          textAnchor="middle"
                          fontSize={fontSize}
                          fill="hsl(var(--muted-foreground))"
                        >
                          {total}
                        </text>
                      );
                    }}
                  />
                )}
              </Bar>
            ))}
            {showHeadway && (
              <Line
                yAxisId="right"
                type="linear"
                dataKey="medianHeadway"
                isAnimationActive={false}
                stroke="hsl(var(--foreground))"
                
                strokeWidth={1}
                dot={{ r: 2, fill: "hsl(var(--foreground))", strokeWidth: 0 }}
                connectNulls={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
        </>
      ) : (
        <div className="flex h-[120px] items-center justify-center">
          <p className="text-xs text-muted-foreground">Ingen afgange denne dag</p>
        </div>
      )}
    </div>
  );
}
