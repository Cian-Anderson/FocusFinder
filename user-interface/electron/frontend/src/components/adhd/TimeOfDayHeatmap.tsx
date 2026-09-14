import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { Sun, Sunrise, Sunset, Moon } from "lucide-react";
import type { TimeOfDayPeriod } from "../../hooks/useADHDData";
import { useChartColors } from "../../theme/ThemeContext";

const PERIOD_ICONS: Record<string, React.ReactNode> = {
  "Morning (6-10am)": <Sunrise size={16} />,
  "Midday (10am-2pm)": <Sun size={16} />,
  "Afternoon (2-6pm)": <Sunset size={16} />,
  "Evening+Night (6pm-6am)": <Moon size={16} />,
};

export function TimeOfDayHeatmap({ data }: { data: TimeOfDayPeriod[] }) {
  const chartColors = useChartColors();
  const getColorForScore = (score: number): string => {
    if (score >= 70) return chartColors.productive;
    if (score >= 40) return chartColors.neutral;
    return chartColors.distracting;
  };

  const chartData = data.map((p) => ({
    period: p.period.replace(/\s*\(.*?\)\s*/g, ""), // Remove time range for cleaner display
    score: p.focus_score,
    fullPeriod: p.period,
  }));

  const bestPeriod = data.reduce(
    (max, p) => (p.focus_score > max.focus_score ? p : max),
    data[0] || { period: "N/A", focus_score: 0, activity_count: 0 },
  );

  const worstPeriod = data.reduce(
    (min, p) => (p.focus_score < min.focus_score ? p : min),
    data[0] || { period: "N/A", focus_score: 100, activity_count: 0 },
  );

  return (
    <div
      className="bg-white rounded-lg p-5 border border-slate-200"
      role="region"
      aria-label="Time of day performance analysis"
    >
      <h2 className="text-slate-900 mb-4">Peak Performance Times</h2>

      {data.length === 0 || data.every((p) => p.activity_count === 0) ? (
        <div className="text-sm text-slate-500 text-center py-8">
          Not enough data to analyze time-of-day patterns yet
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="period" stroke={chartColors.axis} />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)" }}
                domain={[0, 100]}
                label={{
                  value: "Focus Score (%)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-primary)",
                }}
              />
              <Tooltip
                contentStyle={{
                  background: chartColors.tooltipBg,
                  border: `1px solid ${chartColors.tooltipBorder}`,
                  borderRadius: 6,
                  color: "var(--text-primary)",
                }}
                labelStyle={{ color: "var(--text-primary)" }}
                itemStyle={{ color: "var(--text-primary)" }}
                formatter={(value: any) => [`${value}%`, "Focus Score"]}
              />
              <Bar dataKey="score" radius={[8, 8, 0, 0]}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={getColorForScore(entry.score)}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          {/* Period Cards */}
          <div className="mt-4 grid grid-cols-4 gap-2">
            {data.map((period) => (
              <div
                key={period.period}
                className="p-3 rounded border border-slate-100 text-center"
              >
                <div className="flex justify-center mb-1 text-slate-600">
                  {PERIOD_ICONS[period.period]}
                </div>
                <div className="text-xs text-slate-600 mb-1">
                  {period.period.split(" ")[0]}
                </div>
                <div
                  className="text-lg font-medium"
                  style={{ color: getColorForScore(period.focus_score) }}
                >
                  {period.focus_score.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>

          <div className="info-note mt-6 p-3 rounded text-sm text-slate-700 border">
            <div className="font-medium text-slate-900 mb-1">
              💡 Peak Performance: Use Your Best Window on Purpose
            </div>
            <p>
              {bestPeriod.focus_score > 0
                ? `Your strongest period is ${bestPeriod.period} at ${bestPeriod.focus_score.toFixed(0)}% focus. ${worstPeriod.focus_score < bestPeriod.focus_score ? `Your lowest period is ${worstPeriod.period} at ${worstPeriod.focus_score.toFixed(0)}%, so that is a better time for admin or lighter tasks.` : "Try to place your most demanding work in the window where your focus is naturally strongest."}`
                : "Use this card to spot when your focus naturally rises during the day, then schedule demanding work in those stronger windows and keep lighter tasks for lower-energy periods."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
