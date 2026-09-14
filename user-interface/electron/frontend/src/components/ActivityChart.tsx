import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

import type { HourlyItem } from "../hooks/useDashboardData";
import { useChartColors } from "../theme/ThemeContext";

const SERIES_LABELS = {
  productive: "Productive",
  neutral: "Neutral",
  distracting: "Distracting",
} as const;

type SeriesKey = keyof typeof SERIES_LABELS;

const SERIES_ORDER: Record<SeriesKey, number> = {
  distracting: 0,
  neutral: 1,
  productive: 2,
};

function resolveSeriesKey(raw: unknown): SeriesKey | null {
  const value = String(raw || "").toLowerCase();
  if (value === "productive" || value === "neutral" || value === "distracting") {
    return value;
  }
  return null;
}

function hourLabel(hour: number) {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  return `${h.toString().padStart(2, "0")}:00`;
}

export function ActivityChart({
  items,
}: {
  items: HourlyItem[] | null | undefined;
}) {
  const chartColors = useChartColors();
  const data = (items || []).map((it) => ({
    time: hourLabel(it.hour),
    productive: it.productive,
    neutral: it.neutral,
    distracting: it.distracting,
  }));

  const totalMinutes = data.reduce(
    (sum, row) => sum + row.productive + row.neutral + row.distracting,
    0,
  );

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-full flex flex-col"
      role="region"
      aria-label="Activity timeline chart"
    >
      <h2 className="text-slate-900 mb-1 text-lg">Focus Pattern by Hour</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-3xl leading-relaxed">
        Each bar shows how your hour was split between focused, neutral, and distracting activity.
        Total plotted time: {totalMinutes} min.
      </p>
      <div className="flex flex-1 items-center">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 28 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="time" stroke={chartColors.axis} label={{ value: "Hour of Day", position: "insideBottom", offset: -2 }} />
            <YAxis
              stroke={chartColors.axis}
              label={{ value: "Minutes per Hour", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: chartColors.tooltipBg,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: "6px",
              }}
              itemSorter={(entry: { dataKey?: string; name?: string }) => {
                const key = resolveSeriesKey(entry?.dataKey) || resolveSeriesKey(entry?.name);
                return key ? SERIES_ORDER[key] : 99;
              }}
              formatter={(value: number, name: string, entry: { dataKey?: string; name?: string }) => {
                const key = resolveSeriesKey(entry?.dataKey) || resolveSeriesKey(name) || resolveSeriesKey(entry?.name);
                const label = key ? SERIES_LABELS[key] : "Activity";
                return [`${value} min`, label];
              }}
            />
            <Legend wrapperStyle={{ paddingTop: 10 }} />
            <Bar
              dataKey="productive"
              name="Productive"
              fill={chartColors.productive}
              stackId="a"
            />
            <Bar
              dataKey="neutral"
              name="Neutral"
              fill={chartColors.neutral}
              stackId="a"
            />
            <Bar
              dataKey="distracting"
              name="Distracting"
              fill={chartColors.distracting}
              stackId="a"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
