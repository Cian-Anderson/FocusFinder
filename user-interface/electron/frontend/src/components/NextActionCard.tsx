import React from "react";
import { ArrowRight, Gauge, ShieldAlert, Sparkles } from "lucide-react";
import type { HourlyItem, RecentActivity, Summary, TopApp } from "../hooks/useDashboardData";

function normalizeClass(value: string | undefined) {
  const raw = (value || "").toLowerCase();
  if (raw === "focused" || raw === "productive") return "focused";
  if (raw === "distracted" || raw === "distracting") return "distracting";
  return "neutral";
}

function findTopDistractor(apps: TopApp[] | null | undefined) {
  return (apps || [])
    .map((app) => ({
      ...app,
      distracted: Number(app.distracted_seconds || 0),
      total: Number(app.total_seconds || 0),
    }))
    .filter((app) => app.distracted > 0)
    .sort((a, b) => b.distracted - a.distracted || b.total - a.total)[0] || null;
}

function findCurrentHourRow(hourly: HourlyItem[] | null | undefined) {
  const nowHour = new Date().getHours();
  const rows = hourly || [];
  return rows.find((row) => row.hour === nowHour) || rows[rows.length - 1] || null;
}

function buildActionPlan({
  summary,
  recent,
  apps,
  hourly,
}: {
  summary: Summary | null | undefined;
  recent: RecentActivity[] | null | undefined;
  apps: TopApp[] | null | undefined;
  hourly: HourlyItem[] | null | undefined;
}) {
  const now = Date.now();
  const last15Ms = 15 * 60 * 1000;
  const recentWindow = (recent || []).filter((item) => {
    const ts = new Date(item.timestamp).getTime();
    return Number.isFinite(ts) && now - ts <= last15Ms;
  });

  let focusedCount = 0;
  let neutralCount = 0;
  let distractingCount = 0;

  for (const item of recentWindow) {
    const c = normalizeClass(item.classification);
    if (c === "focused") focusedCount += 1;
    else if (c === "distracting") distractingCount += 1;
    else neutralCount += 1;
  }

  const samples = focusedCount + neutralCount + distractingCount;
  const useRecentWindow = samples >= 4;
  const basisLabel = useRecentWindow ? "last 15 min" : "today summary";

  const focusPct = useRecentWindow
    ? Math.round((focusedCount / samples) * 100)
    : Math.round(summary?.focus_percentage || 0);
  const distractPct = useRecentWindow
    ? Math.round((distractingCount / samples) * 100)
    : Math.round(summary?.distracted_percentage || 0);
  const neutralPct = useRecentWindow
    ? Math.max(0, 100 - focusPct - distractPct)
    : Math.round(summary?.neutral_percentage || 0);

  const topDistractor = findTopDistractor(apps);
  const currentHour = findCurrentHourRow(hourly);
  const currentHourTotal = currentHour
    ? Math.max(0, currentHour.productive + currentHour.neutral + currentHour.distracting)
    : 0;
  const currentHourFocusShare = currentHourTotal > 0
    ? Math.round((currentHour.productive / currentHourTotal) * 100)
    : focusPct;

  let stateLabel = "Balanced window with moderate focus.";
  let topAction = "Run a 15-minute single-task sprint now.";
  let secondaryAction = "Silence non-essential notifications for this sprint.";

  if (distractPct >= 45) {
    stateLabel = "Distraction-heavy window.";
    topAction = "Reset for 2 minutes, then run a 15-minute focus sprint.";
    secondaryAction = topDistractor
      ? `Close ${topDistractor.name} for the next work block.`
      : "Silence non-work tabs and notifications for 15 min.";
  } else if (focusPct >= 60 && distractPct <= 25) {
    stateLabel = "Stable focus window.";
    topAction = "Extend this into a 25-min deep-focus block.";
    secondaryAction = "Queue distractions to review after this block ends.";
  } else if (neutralPct >= 40) {
    stateLabel = "Mixed/transition window.";
    topAction = "Pick one task target and run a 15-min single-task sprint.";
    secondaryAction = topDistractor
      ? `Pin your work app and hide ${topDistractor.name} temporarily.`
      : "Close extra tabs and keep only one active task window.";
  }

  const confidence = useRecentWindow
    ? samples >= 10
      ? "High"
      : "Medium"
    : "Low";
  const confidenceNote = useRecentWindow
    ? `${samples} recent samples in last 15 min`
    : "Low recent signal, using today summary";

  const gainFloor = Math.max(4, Math.round((distractPct - focusPct) / 4 + 6));
  const gainCeil = Math.max(gainFloor + 3, gainFloor + Math.round((100 - currentHourFocusShare) / 10));
  const expectedGain = confidence === "Low"
    ? "Estimate paused until more recent samples arrive."
    : `Likely +${gainFloor} to +${gainCeil} focus points if applied now.`;

  return {
    stateLabel,
    topAction,
    secondaryAction,
    confidence,
    confidenceNote,
    expectedGain,
    basisLabel,
    focusPct,
    neutralPct,
    distractPct,
  };
}

export function NextActionCard({
  summary,
  recent,
  apps,
  hourly,
}: {
  summary: Summary | null | undefined;
  recent: RecentActivity[] | null | undefined;
  apps: TopApp[] | null | undefined;
  hourly: HourlyItem[] | null | undefined;
}) {
  const plan = buildActionPlan({ summary, recent, apps, hourly });

  return (
    <div
      className="next-action-card bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-full flex flex-col"
      role="region"
      aria-label="Recommended next action"
    >
      <h2 className="text-slate-900 mb-1 text-lg">What To Do Next</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-xs leading-relaxed">
        Real-time recommendation based on your current pattern.
      </p>
      <div className="next-action-card__legend" aria-label="Color meaning">
        <span className="next-action-card__legend-item">
          <span className="next-action-card__legend-dot next-action-card__legend-dot--state" />
          Context state
        </span>
        <span className="next-action-card__legend-item">
          <span className="next-action-card__legend-dot next-action-card__legend-dot--primary" />
          Priority action
        </span>
        <span className="next-action-card__legend-item">
          <span className="next-action-card__legend-dot next-action-card__legend-dot--secondary" />
          Backup action
        </span>
      </div>
      <p className="next-action-card__legend-note">
        Rule input ({plan.basisLabel}): Focus {plan.focusPct}% | Neutral {plan.neutralPct}% | Distracting {plan.distractPct}%.
      </p>

      <div className="next-action-card__surface">
        <div className="next-action-card__hero">
          <div className="next-action-card__hero-icon">
            <Sparkles size={18} className="text-amber-200" />
          </div>
          <div className="next-action-card__hero-text">Action priority</div>
        </div>

        <div className="next-action-card__stack">
          <div className="next-action-card__block next-action-card__block--state">
            <div className="next-action-card__label">Current state</div>
            <div className="next-action-card__text">{plan.stateLabel}</div>
          </div>

          <div className="next-action-card__block next-action-card__block--primary">
            <div className="next-action-card__label next-action-card__label--with-icon">
              <Sparkles size={13} />
              <span>Top action</span>
            </div>
            <div className="next-action-card__text">{plan.topAction}</div>
          </div>

          <div className="next-action-card__block next-action-card__block--secondary">
            <div className="next-action-card__label next-action-card__label--with-icon">
              <ArrowRight size={13} />
              <span>Secondary action</span>
            </div>
            <div className="next-action-card__text">{plan.secondaryAction}</div>
          </div>
        </div>

        <div className="next-action-card__footer">
          <div className="next-action-card__confidence-row">
            <span className="next-action-card__confidence-label">
              <ShieldAlert size={13} />
              <span>Confidence</span>
            </span>
            <span className={`next-action-card__confidence-value ${plan.confidence === "High" ? "next-action-card__confidence-value--high" : "next-action-card__confidence-value--medium"}`}>
                {plan.confidence}
            </span>
          </div>
          <div className="next-action-card__confidence-note">{plan.confidenceNote}</div>
          <div className="next-action-card__gain-row">
            <Gauge size={14} />
            <span>{plan.expectedGain}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
