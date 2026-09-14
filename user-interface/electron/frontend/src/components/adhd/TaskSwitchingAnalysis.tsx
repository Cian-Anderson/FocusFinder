import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Shuffle, TrendingUp } from "lucide-react";
import type { TaskSwitchingHour } from "../../hooks/useADHDData";
import { useChartColors } from "../../theme/ThemeContext";

export function TaskSwitchingAnalysis({ data }: { data: TaskSwitchingHour[] }) {
  const chartColors = useChartColors();
  const allChartData = data.map((h) => ({
    hour: `${h.hour.toString().padStart(2, "0")}:00`,
    switches: Number.isFinite(h.switches) ? h.switches : null,
    hourNum: h.hour,
  }));

  const firstActiveIndex = allChartData.findIndex((row) => (row.switches ?? 0) > 0);
  const lastActiveIndex = (() => {
    for (let i = allChartData.length - 1; i >= 0; i--) {
      if ((allChartData[i].switches ?? 0) > 0) return i;
    }
    return -1;
  })();

  const chartData =
    firstActiveIndex >= 0 && lastActiveIndex >= 0
      ? allChartData.filter((row) => {
          const firstHour = allChartData[firstActiveIndex].hourNum;
          const lastHour = allChartData[lastActiveIndex].hourNum;
          const maxShownHour = Math.min(lastHour + 1, allChartData[allChartData.length - 1].hourNum);
          return row.hourNum >= firstHour && row.hourNum <= maxShownHour;
        })
      : allChartData;

  const totalSwitches = data.reduce((sum, h) => sum + (Number.isFinite(h.switches) ? h.switches : 0), 0);
  const avgSwitches =
    data.length > 0 ? (totalSwitches / data.length).toFixed(1) : "0";
  const peakHour = data.reduce(
    (max, h) => (h.switches > max.switches ? h : max),
    data[0] || { hour: 0, switches: 0, activity_count: 0 },
  );

  return (
    <div
      className="bg-white rounded-lg p-5 border border-slate-200 h-full flex flex-col"
      role="region"
      aria-label="Task switching analysis chart"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-slate-900 flex items-center gap-2">
            <Shuffle size={20} color={chartColors.neutral} />
            Hourly Task Switching Pattern
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Line chart shows how many app/window switches occurred in each hour.
          </p>
        </div>
        <div className="text-sm text-slate-600">
          Peak: {peakHour.hour}:00 ({peakHour.switches} switches)
        </div>
      </div>

      {totalSwitches === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">
          No task switching data available
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis dataKey="hour" stroke={chartColors.axis} />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)" }}
                label={{
                  value: "Switches",
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
                formatter={(value: number) => [`${value} switches`, "Task switches"]}
              />
              <Line
                type="monotone"
                dataKey="switches"
                stroke={chartColors.neutral}
                strokeWidth={2}
                dot={{ r: 3, fill: chartColors.neutral }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="p-3 bg-slate-100 rounded">
              <div className="text-xs text-slate-600">Total Today</div>
              <div className="text-xl text-slate-900">{totalSwitches}</div>
              <div className="text-xs text-slate-500">app switches</div>
            </div>
            <div className="p-3 bg-slate-100 rounded">
              <div className="text-xs text-slate-600">Hourly Average</div>
              <div className="text-xl text-slate-900">{avgSwitches}</div>
              <div className="text-xs text-slate-500">switches/hour</div>
            </div>
          </div>

          <div className="info-note mt-6 p-3 rounded text-sm text-slate-700 border">
            <div className="font-medium text-slate-900 mb-1">
              💡 Context Switching: Distractibility, Not Multitasking
            </div>
            <p>
              {totalSwitches > 100
                ? "⚠️ High switching detected ({totalSwitches} today). For ADHD brains, this often reflects difficulty sustaining attention not efficiency. Frequent unplanned switches drain mental energy. Try: (1) Batch similar tasks together, (2) Use Pomodoro (25 min focus blocks), (3) Turn off notifications during deep work.".replace(
                    "{totalSwitches}",
                    totalSwitches.toString(),
                  )
                : totalSwitches > 50
                  ? "🔄 Moderate switching pattern. Some task changes are healthy, but ensure they're intentional. Ask: 'Did I plan this switch or was I pulled away?' Voluntary task changes > impulsive distractions."
                  : "✅ Excellent task continuity! You're maintaining focus and making deliberate task changes. This minimizes the cognitive cost of context-switching."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
