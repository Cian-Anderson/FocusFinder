import React from "react";
import type { TopApp } from "../hooks/useDashboardData";
import { useChartColors } from "../theme/ThemeContext";
import { Trophy, ThumbsDown, Timer } from "lucide-react";

export function TopApplications({
  apps,
}: {
  apps: TopApp[] | null | undefined;
}) {
  const chartColors = useChartColors();
  const items = (apps || []).slice();
  const highlights = items
    .filter((a) => (a.focused_seconds || 0) > 0)
    .sort((a, b) => (b.focused_seconds || 0) - (a.focused_seconds || 0))
    .slice(0, 3);

  const lowlights = items
    .filter((a) => (a.distracted_seconds || 0) > 0)
    .sort((a, b) => (b.distracted_seconds || 0) - (a.distracted_seconds || 0))
    .slice(0, 3);

  const topDistractor = lowlights[0];
  const topDistractorMin = Math.round((topDistractor?.distracted_seconds || 0) / 60);
  const secondDistractorMin = Math.round((lowlights[1]?.distracted_seconds || 0) / 60);
  const similarDistractorCount = lowlights.filter(
    (a) => topDistractorMin > 0 && Math.round((a.distracted_seconds || 0) / 60) >= topDistractorMin * 0.7,
  ).length;

  const focusTip = (() => {
    if (!topDistractor || topDistractorMin === 0) {
      return "No major distraction source is standing out today. Keep using short focus blocks and protect your strongest hour.";
    }

    if (secondDistractorMin > 0 && topDistractorMin >= Math.ceil(secondDistractorMin * 1.5)) {
      return `${topDistractor.name} is your biggest distraction today (${topDistractorMin} min). Tip: close it during your next 25-minute focus block and check it only on planned breaks.`;
    }

    if (similarDistractorCount >= 2) {
      return `Distraction is spread across about ${similarDistractorCount} apps at similar levels. Tip: pick one work-only app set and mute/snooze the rest for your next focus session.`;
    }

    return `Your top distraction app right now is ${topDistractor.name} (${topDistractorMin} min). Tip: move it to a separate desktop/tab group so it is one step harder to open while working.`;
  })();

  function Card({
    rank,
    name,
    minutes,
    totalMinutes,
    metricLabel,
    color,
  }: {
    rank: number;
    name: string;
    minutes: number;
    totalMinutes: number;
    metricLabel: string;
    color: string;
  }) {
    return (
      <div
        className="top-app-row rounded-md border shadow-sm bg-white"
        style={{ borderColor: color }}
      >
        <div className="flex items-start gap-3">
          <div
            className="w-8 h-8 flex items-center justify-center rounded-md text-sm font-semibold"
            style={{ background: `${color}22`, color }}
          >
            #{rank}
          </div>
          <div className="flex-1 text-slate-900 text-base font-semibold leading-snug">{name}</div>
          <div className="flex items-center gap-1 text-slate-600 text-sm whitespace-nowrap pt-0.5">
            <Timer size={14} /> {Math.floor(minutes / 60)}h {minutes % 60}m
          </div>
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {metricLabel}: {minutes} min {totalMinutes > minutes ? `| Total app time: ${totalMinutes} min` : ""}
        </div>
        <div className="mt-2.5 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-1.5 rounded-full"
            style={{ width: "100%", background: color, opacity: 0.7 }}
          />
        </div>
      </div>
    );
  }

  function EmptySlot({
    rank,
  }: {
    rank: number;
  }) {
    return (
      <div className="top-app-row rounded-md border border-slate-200 bg-slate-50/40">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 flex items-center justify-center rounded-md text-sm font-semibold bg-slate-100 text-slate-500">
            #{rank}
          </div>
          <div className="flex-1 text-slate-500 text-base font-medium leading-snug">No app data yet</div>
          <div className="text-slate-500 text-sm whitespace-nowrap pt-0.5">0m</div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-full flex flex-col"
      role="region"
      aria-label="Top applications highlights and lowlights"
    >
      <h2 className="text-slate-900 mb-1 text-lg">Application Impact Summary (Today)</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-2xl leading-relaxed">
        Use this to see which apps drove productive minutes versus distracting minutes today (not total app-open time).
      </p>
      <div className="grid grid-cols-2 gap-3 flex-1">
        <div>
          <div className="flex items-center gap-2 mb-5 text-slate-600 text-base font-semibold">
            <Trophy size={16} color={chartColors.productive} />
            Top 3 Highlights (Productive Minutes)
          </div>
          <div className="grid grid-cols-1 gap-3 mt-3">
            {highlights.map((a, i) => (
              <Card
                key={`hi-${a.name}`}
                rank={i + 1}
                name={`${a.name} (productive)`}
                minutes={Math.round((a.focused_seconds || 0) / 60)}
                totalMinutes={Math.round((a.total_seconds || 0) / 60)}
                metricLabel="Productive"
                color={chartColors.productive}
              />
            ))}
            {Array.from({ length: Math.max(0, 3 - highlights.length) }).map((_, i) => (
              <EmptySlot
                key={`hi-empty-${i}`}
                rank={highlights.length + i + 1}
              />
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-5 text-slate-600 text-base font-semibold">
            <ThumbsDown size={16} color={chartColors.distracting} />
            Top 3 Lowlights (Distracting Minutes)
          </div>
          <div className="grid grid-cols-1 gap-3 mt-3">
            {lowlights.map((a, i) => (
              <Card
                key={`lo-${a.name}`}
                rank={i + 1}
                name={`${a.name} (distracting)`}
                minutes={Math.round((a.distracted_seconds || 0) / 60)}
                totalMinutes={Math.round((a.total_seconds || 0) / 60)}
                metricLabel="Distracting"
                color={chartColors.distracting}
              />
            ))}
            {Array.from({ length: Math.max(0, 3 - lowlights.length) }).map((_, i) => (
              <EmptySlot
                key={`lo-empty-${i}`}
                rank={lowlights.length + i + 1}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="mt-4 rounded-xl border border-slate-100 p-3 text-sm text-slate-600">
        <div className="text-slate-900 mb-1">Focus tip</div>
        <p>{focusTip}</p>
      </div>
    </div>
  );
}
