import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { useChartColors } from "../theme/ThemeContext";

type TrendPoint = {
  date: string;
  focus_score: number;
  focused_seconds?: number;
  neutral_seconds?: number;
  distracted_seconds?: number;
};

export function ProductivityTrend({
  trend,
}: {
  trend: TrendPoint[] | null | undefined;
}) {
  const chartColors = useChartColors();
  const formatDate = (isoDate: string) => {
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return isoDate;
    return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  };

  const data = (trend || []).map((t) => {
    const focusedSec = Number(t.focused_seconds || 0);
    const neutralSec = Number(t.neutral_seconds || 0);
    const distractedSec = Number(t.distracted_seconds || 0);
    const totalActiveSec = Math.max(0, focusedSec + neutralSec + distractedSec);

    const focusPct = totalActiveSec > 0
      ? Math.round((focusedSec / totalActiveSec) * 100)
      : 0;
    const distractedPct = totalActiveSec > 0
      ? Math.round((distractedSec / totalActiveSec) * 100)
      : 0;

    return {
      date: formatDate(t.date),
      focusPct,
      distractedPct,
    };
  });

  const peakShare = data.reduce(
    (max, row) => Math.max(max, row.focusPct, row.distractedPct),
    0,
  );
  const yAxisMax = peakShare <= 0
    ? 10
    : Math.min(100, Math.max(20, Math.ceil((peakShare * 1.2) / 5) * 5));

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm"
      role="region"
      aria-label="Weekly productivity trend chart"
    >
      <h2 className="text-slate-900 mb-1 text-lg">Daily Focus vs Non-Focus Share (Last 7 Days)</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-3xl leading-relaxed">
        Compare daily attention mix as a percentage of active time, independent of total usage volume.
      </p>
      {data.length === 0 ? (
        <div className="text-sm text-slate-500">No trend data available.</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 8, right: 12, left: 26, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
            <XAxis dataKey="date" stroke={chartColors.axis} />
            <YAxis
              stroke={chartColors.axis}
              domain={[0, yAxisMax]}
              tickCount={6}
              tickFormatter={(value: number) => `${value}%`}
              label={{ value: "Share of Active Time (%)", angle: -90, position: "left", offset: 2 }}
            />
            <Tooltip
              contentStyle={{
                background: chartColors.tooltipBg,
                border: `1px solid ${chartColors.tooltipBorder}`,
                borderRadius: 6,
              }}
              formatter={(value: number, name: string) => {
                const label =
                  name.includes("Focus")
                    ? "Focus share"
                    : "Distracted share";
                return [`${value}%`, label];
              }}
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="focusPct"
              name="Focus share (%)"
              stroke={chartColors.productive}
              strokeWidth={2}
              dot={{
                r: 3,
                stroke: chartColors.tooltipBorder,
                fill: chartColors.productive,
              }}
              activeDot={{ r: 5, stroke: chartColors.tooltipBorder }}
            />
            <Line
              type="monotone"
              dataKey="distractedPct"
              name="Distracted share (%)"
              stroke={chartColors.distracting}
              strokeWidth={2}
              dot={{
                r: 3,
                stroke: chartColors.tooltipBorder,
                fill: chartColors.distracting,
              }}
              activeDot={{ r: 5, stroke: chartColors.tooltipBorder }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
