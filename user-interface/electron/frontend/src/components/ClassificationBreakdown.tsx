import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import type { Summary } from "../hooks/useDashboardData";
import { useChartColors } from "../theme/ThemeContext";

export function ClassificationBreakdown({
  summary,
}: {
  summary: Summary | null | undefined;
}) {
  const chartColors = useChartColors();
  const COLORS = [
    chartColors.productive,
    chartColors.neutral,
    chartColors.distracting,
  ];
  const totalMin = (summary?.total_active_seconds || 0) / 60;
  const data = [
    {
      name: "Productive",
      value: Math.max(
        0,
        Math.round((totalMin * (summary?.focus_percentage || 0)) / 100)
      ),
    },
    {
      name: "Neutral",
      value: Math.max(
        0,
        Math.round((totalMin * (summary?.neutral_percentage || 0)) / 100)
      ),
    },
    {
      name: "Distracting",
      value: Math.max(
        0,
        Math.round((totalMin * (summary?.distracted_percentage || 0)) / 100)
      ),
    },
  ];
  const ranked = [...data].sort((a, b) => b.value - a.value);
  const dominantSlice = data.reduce(
    (max, curr) => (curr.value > max.value ? curr : max),
    data[0] || { name: "Productive", value: 0 }
  );
  const secondSlice = ranked[1] || { name: "Neutral", value: 0 };
  const leadMinutes = Math.max(0, dominantSlice.value - secondSlice.value);
  const spreadMinutes = Math.max(0, ranked[0]?.value - ranked[ranked.length - 1]?.value);

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-full flex flex-col"
      role="region"
      aria-label="Classification breakdown chart"
    >
      <h2 className="text-slate-900 mb-1 text-lg">Activity Classification Share (Today)</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-xs leading-relaxed">
        Quick state snapshot to show which attention mode is currently dominant.
      </p>
      {totalMin === 0 ? (
        <div className="text-sm text-slate-500 flex-1">No active-time data available for this period.</div>
      ) : (
        <div className="flex-1">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                innerRadius={56}
                outerRadius={92}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: 6,
                  color: "#fff",
                }}
                labelStyle={{ color: "#fff" }}
                itemStyle={{ color: "#fff" }}
                formatter={(value: number, name: string) => {
                  const pct = totalMin > 0 ? Math.round((value / totalMin) * 100) : 0;
                  return [`${value} min (${pct}%)`, name];
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="mt-2 grid grid-cols-1 gap-1 text-sm text-slate-600">
        <div className="flex justify-between">
          <span>Dominant mode today</span>
          <span>{dominantSlice.name} ({dominantSlice.value} min)</span>
        </div>
        <div className="flex justify-between">
          <span>Lead over next mode</span>
          <span>{leadMinutes} min</span>
        </div>
        <div className="flex justify-between">
          <span>Spread across states</span>
          <span>{spreadMinutes} min</span>
        </div>
      </div>
    </div>
  );
}
