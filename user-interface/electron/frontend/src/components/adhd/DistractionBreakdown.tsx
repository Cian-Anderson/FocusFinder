import React from "react";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { Target, AlertCircle } from "lucide-react";
import type { DistractionPatterns } from "../../hooks/useADHDData";
import { useChartColors } from "../../theme/ThemeContext";

export function DistractionBreakdown({
  patterns,
}: {
  patterns: DistractionPatterns | null;
}) {
  const chartColors = useChartColors();

  if (!patterns) {
    return (
      <div className="bg-white rounded-lg p-5 border border-slate-200">
        <h2 className="text-slate-900 mb-4">Distraction Breakdown</h2>
        <div className="text-sm text-slate-500">
          No distraction data available
        </div>
      </div>
    );
  }

  const { by_app, severity_breakdown } = patterns;
  const topDistractors = by_app.slice(0, 5);

  const appPalette = [
    chartColors.distracting,
    `${chartColors.distracting}CC`,
    `${chartColors.distracting}AA`,
    `${chartColors.distracting}88`,
    `${chartColors.distracting}66`,
  ];

  const appPieData = topDistractors.map((app, idx) => ({
    name: app.app_name,
    value: app.episodes,
    color: appPalette[idx % appPalette.length],
  }));

  const totalDistractions =
    severity_breakdown.micro_breaks +
    severity_breakdown.minor_distractions +
    severity_breakdown.major_distractions;

  return (
    <div
      className="bg-white rounded-lg p-5 border border-slate-200"
      role="region"
      aria-label="Distraction patterns breakdown"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-slate-900 flex items-center gap-2">
            <AlertCircle size={20} color={chartColors.distracting} />
            Distraction Pattern Breakdown
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Pie chart and ranked list show which apps interrupted your focus the most.
          </p>
        </div>
      </div>

      {totalDistractions === 0 ? (
        <div className="text-sm text-slate-500 text-center py-8">
          No distractions recorded today!
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-5 items-start">
          {/* Distracting Apps Pie Chart */}
          <div>
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={appPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={116}
                >
                  {appPieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: 6,
                    color: "var(--text-primary)",
                  }}
                  labelStyle={{ color: "var(--text-primary)" }}
                  itemStyle={{ color: "var(--text-primary)" }}
                  formatter={(value: number) => [`${value} interruptions`, "Interruptions"]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Top Distractors */}
          <div>
            <h3 className="text-sm text-slate-600 mb-2">
              Top Distraction Apps
            </h3>
            {topDistractors.length === 0 ? (
              <div className="text-xs text-slate-500">
                No specific apps identified
              </div>
            ) : (
              <div className="distraction-ranked__stack">
                {topDistractors.map((app, i) => (
                  <div
                    key={app.app_name}
                    className={`distraction-ranked__item distraction-ranked__item--${i === 0 ? "high" : i === 1 ? "mid" : "low"}`}
                  >
                    <div className="distraction-ranked__label">
                      {i === 0 ? "Highest impact" : i === 1 ? "Next highest" : "Also distracting"}
                    </div>
                    <div className="distraction-ranked__row">
                      <div className="distraction-ranked__title" title={app.app_name}>
                        {app.app_name}
                      </div>
                      <div className="distraction-ranked__count">
                        {app.episodes} interruptions
                      </div>
                    </div>
                    <div className="distraction-ranked__meta">
                      {Math.round(app.total_seconds / 60)} min lost to distractions
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="info-note mt-6 p-3 rounded text-sm text-slate-700 border">
        <div className="font-medium text-slate-900 mb-1">
          💡 Understanding Your Distraction Triggers
        </div>
        <p>
          {severity_breakdown.micro_breaks >
          severity_breakdown.major_distractions
            ? "✅ Most interruptions are healthy micro-breaks (<2 min)! Your ADHD brain needs these dopamine hits just keep them short."
            : severity_breakdown.major_distractions > 5
              ? topDistractors.length > 0
                ? `⚠️ Apps like "${
                    topDistractors[0].app_name
                  }" cost you ${Math.round(
                    topDistractors[0].total_seconds / 60,
                  )} minutes of focus today. ADHD brains crave high-stimulation content. Try: (1) Turn off notifications for these apps, (2) Use app timers/blockers during work, (3) Schedule dedicated "reward time" for social media/games.`
                : "⚠️ Several major distractions detected. Consider identifying patterns and using app blockers during focus time."
              : "You're managing distractions well today. Small interruptions are normal what matters is getting back on track."}
        </p>
      </div>
    </div>
  );
}
