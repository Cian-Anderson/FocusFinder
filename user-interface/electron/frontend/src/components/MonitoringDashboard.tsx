import React, { useState } from "react";
import { Activity, Clock, TrendingUp, Zap, AlertTriangle, Sparkles, Target } from "lucide-react";
import { ActivityChart } from "./ActivityChart";
import { NextActionCard } from "./NextActionCard";
import { RecentActivityList } from "./RecentActivityList";
import { TopApplications } from "./TopApplications";
import { ProductivityTrend } from "./ProductivityTrend";
import { useDashboardData } from "../hooks/useDashboardData";

function fmtSeconds(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function fmtMinutes(min: number) {
  const m = Math.max(0, Math.round(min));
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return h > 0 ? `${h}h ${rem}m` : `${rem}m`;
}

function getBestAndWorstHours(
  items: Array<{ hour: number; productive: number; neutral: number; distracting: number }> | null | undefined,
) {
  const MIN_MINUTES = 30; // 30 minutes minimum (backend returns values in minutes)
  const rows = (items || []).map((item) => {
    const total = Math.max(0, item.productive + item.neutral + item.distracting);
    const focusShare = total > 0 ? (item.productive / total) * 100 : 0;
    return { ...item, total, focusShare };
  });

  // Filter rows with sufficient data (at least 30 minutes)
  const validRows = rows.filter((row) => row.total >= MIN_MINUTES);

  const best = validRows.reduce(
    (acc, row) => (row.focusShare > acc.focusShare ? row : acc),
    validRows[0] || { hour: 0, productive: 0, neutral: 0, distracting: 0, total: 0, focusShare: 0 },
  );
  const worst = validRows.reduce(
    (acc, row) => {
      if (row.total === 0 && acc.total === 0) return row;
      if (row.total === 0) return acc;
      if (acc.total === 0) return row;
      return row.focusShare < acc.focusShare ? row : acc;
    },
    validRows[0] || { hour: 0, productive: 0, neutral: 0, distracting: 0, total: 0, focusShare: 0 },
  );

  return { best, worst };
}

function getTopDistractorName(
  apps: Array<{ name: string; focused_seconds?: number; neutral_seconds?: number; distracted_seconds?: number; total_seconds?: number }> | null | undefined,
) {
  const rows = (apps || []).map((app) => ({
    ...app,
    distracted: app.distracted_seconds || 0,
    total: app.total_seconds || 0,
  }));
  const top = rows
    .filter((app) => app.distracted > 0)
    .sort((a, b) => b.distracted - a.distracted || b.total - a.total)[0];
  return top || null;
}

function getMostUsedAppName(
  apps: Array<{ name: string; focused_seconds?: number; neutral_seconds?: number; distracted_seconds?: number; total_seconds?: number }> | null | undefined,
) {
  const rows = (apps || []).map((app) => ({
    ...app,
    total: app.total_seconds || 0,
  }));
  const top = rows
    .filter((app) => app.total > 0)
    .sort((a, b) => b.total - a.total)[0];
  return top || null;
}

function getTrendDirection(
  trend: Array<{ date: string; focus_score: number; focused_seconds?: number; neutral_seconds?: number; distracted_seconds?: number }> | null | undefined,
) {
  const points = (trend || []).filter((item) => Number.isFinite(item.focus_score));
  if (points.length < 2) return "flat";
  const recent = points[points.length - 1].focus_score;
  const prior = points[0].focus_score;
  const delta = recent - prior;
  if (delta >= 8) return "up";
  if (delta <= -8) return "down";
  return "flat";
}

export function MonitoringDashboard({ profile = "live" }: { profile?: "live" | "baseline" | "adhd" }) {
  const [isMonitoring] = useState(true);
  const data = useDashboardData(60000, profile);
  const profileLabel =
    profile === "live"
      ? "Live Data"
      : profile === "baseline"
      ? "Baseline Demo"
      : "ADHD Demo";

  const totalActive = data.summary?.total_active_seconds || 0;
  const productiveSec = Math.round(
    totalActive * ((data.summary?.focus_percentage || 0) / 100)
  );
  const appsTracked = data.apps?.length || 0;
  const focusScore = Math.round(data.summary?.focus_percentage || 0);
  const distractedPct = Math.round(data.summary?.distracted_percentage || 0);
  const neutralPct = Math.round(data.summary?.neutral_percentage || 0);
  const { best, worst } = getBestAndWorstHours(data.hourly);
  const topDistractor = getTopDistractorName(data.apps);
  const mostUsedApp = getMostUsedAppName(data.apps);
  const trendDirection = getTrendDirection(data.trend);
  const trendPoints = (data.trend || []).filter((item) => Number.isFinite(item.focus_score));
  const recentFocusDelta = trendPoints.length >= 2
    ? trendPoints[trendPoints.length - 1].focus_score - trendPoints[trendPoints.length - 2].focus_score
    : 0;
  const yesterdayFocus = trendPoints.length >= 2 ? trendPoints[trendPoints.length - 2].focus_score : null;

  const currentStateHeadline =
    focusScore >= 70
      ? "Focus is stable today."
      : focusScore >= 40
      ? "Focus is mixed today."
      : "Focus is fragmented today.";

  const pressureCopy =
    worst.total > 0
      ? `Your lowest-focus window is ${String(worst.hour).padStart(2, "0")}:00, where productive time dropped to ${Math.round(worst.focusShare)}%.`
      : "No hourly pressure pattern is available yet.";

  const nextActionCopy =
    focusScore >= 70
      ? `Protect the next deep-work block and keep the top distractor "${topDistractor?.name || "unknown"}" out of reach.`
      : focusScore >= 40
      ? `Move demanding work into ${String(best.hour).padStart(2, "0")}:00 and treat ${topDistractor?.name || "your main distractor"} as a blocker.`
      : `Use the next 25 minutes for one task only, starting in your best window and cutting off ${topDistractor?.name || "Chrome"}.`;

  const focusStoryDetails = [
    {
      label: "Pressure point",
      text:
        worst.total > 0
          ? `${String(worst.hour).padStart(2, "0")}:00 fell to ${Math.round(worst.focusShare)}% productive time.`
          : "No hourly pressure pattern is available yet.",
    },
    {
      label: "Trend",
      text:
        trendDirection === "up"
          ? "Improving, which suggests the changes you make are starting to help."
          : trendDirection === "down"
          ? "Slipping, so focus protection needs to tighten up."
          : "Flat, which means small habit changes are likely to matter most.",
    },
  ] as const;

  const storyFrames = [
    {
      title: "What changed",
      icon: <Clock className="w-5 h-5 text-sky-300" />,
      tone: "sky",
      body:
        trendPoints.length >= 2 && yesterdayFocus !== null
          ? `Focus score (productive share of active time) is ${focusScore}% today, ${recentFocusDelta >= 0 ? "up" : "down"} ${Math.abs(recentFocusDelta)} points from ${yesterdayFocus}% yesterday.`
          : `Focus score is ${focusScore}% today, meaning ${focusScore}% of active minutes are currently productive.`,
      footer:
        trendDirection === "up"
          ? "Momentum is positive so protect what is working."
          : trendDirection === "down"
          ? "Momentum is slipping, so tighten the next block."
          : "Momentum is flat, so small changes should be tested quickly.",
    },
    {
      title: "What is getting in the way",
      icon: <AlertTriangle className="w-5 h-5 text-rose-300" />,
      tone: "rose",
      body:
        neutralPct >= 35
          ? `Neutral time is elevated at ${neutralPct}%, which often signals task-switching or unclear task boundaries.`
          : distractedPct >= 25
          ? `Distracting time is elevated at ${distractedPct}%, creating drag during focus windows.`
          : "No dominant blocker pattern is standing out yet.",
      footer:
        neutralPct >= 35
          ? "Clarify one priority before the next block to reduce drift."
          : distractedPct >= 25
          ? "Reduce obvious interrupts in the next focus block."
          : "Keep the current structure and reassess after the next session.",
    },
    {
      title: "What to do next",
      icon: <Sparkles className="w-5 h-5 text-amber-300" />,
      tone: "amber",
      body: nextActionCopy,
      footer: trendDirection === "up" ? "Keep the loop simple and repeatable." : "Protect the next block before adding complexity.",
    },
  ] as const;

  return (
    <div className="w-full min-h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-blue-600" />
          <h1 className="text-slate-900">Activity Monitor Dashboard</h1>
          <span className={`status-pill ml-3 ${isMonitoring ? "status-pill--success" : "status-pill--muted"}`}>
            {isMonitoring ? "Status: Monitoring Active" : "Status: Monitoring Paused"}
          </span>
          <span className="status-pill status-pill--info">
            Profile: {profileLabel}
          </span>
        </div>
        <div className="flex items-center gap-4 text-slate-600 text-sm">
          <Clock className="w-4 h-4" />
          <span>
            {data.loading
              ? "Loading…"
              : data.error
              ? "Failed to load"
              : "Updated now"}
          </span>
        </div>
      </header>

      {/* Main Content */}
      <div
        className="flex-1 overflow-auto px-6 pt-6"
        style={{ paddingBottom: "36px" }}
      >
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* Story Banner */}
          <section className="focus-story-hero">
            <div className="focus-story-hero__glow focus-story-hero__glow--sky" />
            <div className="focus-story-hero__glow focus-story-hero__glow--amber" />
            <div className="focus-story-hero__glow focus-story-hero__glow--rose" />
            <div className="focus-story-hero__grid">
              <div className="focus-story-hero__main">
                <div className="focus-story-hero__eyebrow">
                  <Sparkles size={14} className="text-sky-300" />
                  <span>Today&apos;s focus story</span>
                </div>
                <h2 className="focus-story-hero__headline">{currentStateHeadline}</h2>
                <div className="focus-story-hero__summary-list">
                  {focusStoryDetails.map((detail) => (
                    <div key={detail.label} className="focus-story-hero__summary-item">
                      <span className="focus-story-hero__summary-label">{detail.label}</span>
                      <span className="focus-story-hero__summary-text">{detail.text}</span>
                    </div>
                  ))}
                </div>
                <div className="focus-story-hero__chips">
                  <StoryChip label="Focus" value={`${focusScore}%`} tone="focus" />
                  <StoryChip label="Neutral" value={`${neutralPct}%`} tone="neutral" />
                  <StoryChip label="Distracted" value={`${distractedPct}%`} tone="distracted" />
                </div>
              </div>

              <div className="focus-story-hero__aside">
                <MiniInsight
                  icon={<Target size={16} className="text-emerald-300" />}
                  label="Best window"
                  value={best.total > 0 ? `${String(best.hour).padStart(2, "0")}:00` : "N/A"}
                  note={best.total > 0 ? `${Math.round(best.focusShare)}% productive` : "Needs more data"}
                />
                <MiniInsight
                  icon={<AlertTriangle size={16} className="text-rose-300" />}
                  label="Main friction"
                  value={topDistractor?.name || "N/A"}
                  note={topDistractor ? `${fmtMinutes((topDistractor.distracted_seconds || 0) / 60)} distracted` : "No distractor yet"}
                />
              </div>
            </div>
          </section>

          {/* Narrative Summary Row */}
          <div className="story-section">
            <div className="story-section__backdrop" />
            <div className="relative mb-4 flex items-center gap-3 text-[0.72rem] uppercase tracking-[0.28em] text-slate-500">
              <span className="h-px flex-1 bg-slate-800" />
              <span>Three-act focus cards</span>
              <span className="h-px flex-1 bg-slate-800" />
            </div>
            <div className="story-cards">
              {storyFrames.map((frame) => (
                <div
                  key={frame.title}
                  className={`story-card story-card--${frame.tone}`}
                >
                  <div className="story-card__topline" />
                  <div className="story-card__content">
                    <div className="story-card__header">
                      <div className="story-card__icon">
                        {frame.icon}
                      </div>
                      <div className="story-card__copy">
                        <h3 className="story-card__title">{frame.title}</h3>
                        <p className="story-card__body">{frame.body}</p>
                      </div>
                    </div>
                  </div>
                  <div className="story-card__footer">
                    <span>{frame.footer}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Stats Row */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard
              icon={<Clock className="w-5 h-5 text-blue-600" />}
              label="Active Time Today"
              value={fmtSeconds(totalActive)}
              change={"Today"}
              changeType="positive"
              tone="sky"
            />
            <StatCard
              icon={<TrendingUp className="w-5 h-5 text-green-600" />}
              label="Productive Time"
              value={fmtSeconds(productiveSec)}
              change={best.total > 0 ? `Best ${String(best.hour).padStart(2, "0")}:00` : "No hourly peak"}
              changeType="positive"
              tone="mint"
            />
            <StatCard
              icon={<Zap className="w-5 h-5 text-amber-600" />}
              label="Focus Score"
              value={`${Math.round(data.summary?.focus_percentage || 0)}%`}
              change={trendDirection === "up" ? "Improving" : trendDirection === "down" ? "Slipping" : "Flat"}
              changeType={focusScore >= 70 ? "positive" : focusScore >= 40 ? "neutral" : "negative"}
              tone="butter"
            />
            <StatCard
              icon={<Activity className="w-5 h-5 text-purple-600" />}
              label="Tracked Apps (count)"
              value={`${appsTracked}`}
              change={mostUsedApp ? `Most used: ${mostUsedApp.name}` : "No app leader"}
              changeType="neutral"
              tone="coral"
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 gap-4">
            <ActivityChart items={data.hourly} />
          </div>

          {/* Middle Row */}
          <div className="grid grid-cols-2 gap-4">
            <TopApplications apps={data.apps} />
            <ProductivityTrend trend={data.trend} />
          </div>

          {/* Bottom Row */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <RecentActivityList items={data.recent} />
            </div>
            <NextActionCard
              summary={data.summary}
              recent={data.recent}
              apps={data.apps}
              hourly={data.hourly}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  change,
  changeType,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  change: string;
  changeType: "positive" | "negative" | "neutral";
  tone: "sky" | "mint" | "butter" | "coral";
}) {
  const color =
    changeType === "positive"
      ? "text-green-600"
      : changeType === "negative"
      ? "text-red-600"
      : "text-slate-600";
  return (
    <div className={`dashboard-stat dashboard-stat--${tone} bg-white rounded-lg p-4 border border-slate-200 shadow-sm`}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex-1">
          <div className="dashboard-stat__label text-slate-600 text-sm">{label}</div>
          <div className="dashboard-stat__value text-slate-900 text-xl">{value}</div>
        </div>
        <div className={`dashboard-stat__change text-xs ${color}`}>{change}</div>
      </div>
    </div>
  );
}

function MiniInsight({
  icon,
  label,
  value,
  note,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="focus-insight-card">
      <div className="focus-insight-card__label">
        {icon}
        {label}
      </div>
      <div className="focus-insight-card__value">{value}</div>
      <div className="focus-insight-card__note">{note}</div>
    </div>
  );
}

function StoryChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "focus" | "neutral" | "distracted";
}) {
  return (
    <div className={`focus-chip focus-chip--${tone}`}>
      <div className="focus-chip__label">{label}</div>
      <div className="focus-chip__value">{value}</div>
    </div>
  );
}
