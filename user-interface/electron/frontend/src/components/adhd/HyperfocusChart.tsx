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
import { AlertTriangle, Zap } from "lucide-react";
import type { HyperfocusSession } from "../../hooks/useADHDData";
import { useChartColors } from "../../theme/ThemeContext";

export function HyperfocusChart({
  sessions,
}: {
  sessions: HyperfocusSession[];
}) {
  const chartColors = useChartColors();
  const chartHeight = 380;
  const data = sessions.map((s, i) => ({
    session: `Session ${i + 1}`,
    duration: s.duration_minutes,
    intensity: s.intensity,
    activity: s.primary_activity || "Unknown",
    dateLabel: new Date(s.start_time).toLocaleDateString([], {
      month: "short",
      day: "numeric",
    }),
    start: new Date(s.start_time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    end: new Date(s.end_time).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  }));

  const hasWarning = sessions.some((s) => s.duration_minutes >= 120); // 2+ hours without break

  return (
    <div
      className="bg-white rounded-lg p-5 border border-slate-200 h-full flex flex-col"
      role="region"
      aria-label="Hyperfocus sessions chart"
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-slate-900 flex items-center gap-2">
            <Zap size={20} color={chartColors.productive} />
            Hyperfocus Sessions (Last 3 Days)
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Bars show unbroken same-app sessions lasting at least 30 minutes over the last 3 days.
          </p>
        </div>
        {hasWarning && (
          <div className="flex items-center gap-2 text-amber-600 text-sm">
            <AlertTriangle size={16} />
            <span>Extended focus detected</span>
          </div>
        )}
      </div>

      {data.length === 0 ? (
        <>
        <div style={{ position: "relative", height: chartHeight }}>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={[
              { session: "Session 1", duration: 0 },
              { session: "Session 2", duration: 0 },
              { session: "Session 3", duration: 0 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="session"
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)", opacity: 0.4 }}
              />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)", opacity: 0.4 }}
                tickFormatter={(v: number) => `${v}`}
                domain={[0, 80]}
                label={{
                  value: "Duration (min)",
                  angle: -90,
                  position: "insideLeft",
                  fill: "var(--text-primary)",
                  opacity: 0.4,
                }}
              />
            </BarChart>
          </ResponsiveContainer>
          <div style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}>
            <div style={{
              background: "rgba(15, 23, 42, 0.92)",
              border: "1px solid rgba(148, 163, 184, 0.4)",
              borderRadius: 16,
              padding: "12px 24px",
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
              textAlign: "center",
            }}>
              <p style={{ color: "#f1f5f9", fontWeight: 600, fontSize: 14, margin: 0 }}>
                No hyperfocus sessions found in the last 3 days
              </p>
              <p style={{ color: "#94a3b8", fontSize: 12, marginTop: 4, marginBottom: 0 }}>
                Unbroken same-app sessions lasting 30+ minutes will appear here
              </p>
            </div>
          </div>
        </div>
        <div className="info-note mt-4 p-3 rounded text-sm text-slate-700 border">
          <div className="font-medium text-slate-900 mb-1">
            💡 Hyperfocus: Your Double-Edged Superpower
          </div>
          <p>
            ✅ Excellent focus rhythm! You're working in manageable intervals that harness hyperfocus without the downsides.
          </p>
        </div>
        </>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} />
              <XAxis
                dataKey="session"
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)" }}
              />
              <YAxis
                stroke={chartColors.axis}
                tick={{ fill: "var(--text-primary)" }}
                tickFormatter={(v: number) => `${v}m`}
                domain={[0, "dataMax + 10"]}
                label={{
                  value: "Duration (min)",
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
                labelFormatter={(label: string, payload: any[]) => {
                  const date = payload?.[0]?.payload?.dateLabel || "Unknown date";
                  const activity = payload?.[0]?.payload?.activity || "Unknown";
                  return `${label} • ${activity} • ${date}`;
                }}
                formatter={(value: any, name: string) => {
                  if (name === "duration") return [`${value} min`, "Duration"];
                  if (name === "intensity") return [`${value}%`, "Intensity"];
                  if (name === "start") return [value, "Start"];
                  if (name === "end") return [value, "End"];
                  return [value, name];
                }}
              />
              <Bar
                dataKey="duration"
                name="Duration (min)"
                radius={[8, 8, 0, 0]}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.duration >= 60 ? "#3fb1ff" : chartColors.productive}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="info-note mt-4 p-3 rounded text-sm text-slate-700 border">
            <div className="font-medium text-slate-900 mb-1">
              💡 Hyperfocus: Your Double-Edged Superpower
            </div>
            <p>
              {hasWarning
                ? "⚠️ You've been in deep flow for 2+ hours! While hyperfocus boosts productivity, it can lead to missed deadlines elsewhere and neglecting basic needs (meals, hydration, bathroom). Set a timer for a 10-minute break now your brain will thank you."
                : data.some((s) => s.duration >= 30)
                  ? "⚡ Sustained deep work detected! Hyperfocus is a strength, but remember: work in 30-45 min bursts with breaks to maintain quality and prevent burnout. Time can disappear when you're locked in."
                  : "✅ Excellent focus rhythm! You're working in manageable intervals that harness hyperfocus without the downsides."}
            </p>
          </div>
        </>
      )}
    </div>
  );
}
