import React from "react";
import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import type { RecentActivity } from "../hooks/useDashboardData";
import { useChartColors } from "../theme/ThemeContext";

function normalizeRecentAppLabel(appName: string) {
  const name = (appName || "").trim();
  if (!name) return "Unknown";
  if (name === "Activity") return "Activity Monitor";
  if (name.toLowerCase().includes("python") && name.toLowerCase().includes(".exe")) return "Python Runtime";
  return name;
}

function shouldIncludeRecentApp(appName: string) {
  const value = (appName || "").trim().toLowerCase();
  if (!value) return false;
  if (value === "unknown" || value === "noactivewindow") return false;
  return true;
}

export function RecentActivityList({
  items,
}: {
  items: RecentActivity[] | null | undefined;
}) {
  const chartColors = useChartColors();

  // Filter to last 3 hours
  const now = Date.now();
  const threeHoursAgo = now - (3 * 60 * 60 * 1000);
  const recentItems = (items || []).filter(
    (a) => new Date(a.timestamp).getTime() >= threeHoursAgo
  );

  // Group by app and aggregate stats
  const appStats: Record<string, {
    app: string;
    sessions: number;
    totalMinutes: number;
    typeCounts: {
      focused: number;
      neutral: number;
      distracting: number;
    };
  }> = {};

  const sorted = [...recentItems].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  // Count sessions (blocks separated by different app or >60s gap)
  let currentApp = "";
  let currentSession: Date | null = null;
  const countedMinuteSlots = new Set<string>();

  for (const activity of sorted) {
    let app = normalizeRecentAppLabel(activity.app_name);
    const windowTitle = activity.window_title || "";
    const ts = new Date(activity.timestamp);
    const rawType = activity.classification?.toLowerCase() || "neutral";
    const normalizedType =
      rawType === "focused" || rawType === "productive"
        ? "focused"
        : rawType === "distracting" || rawType === "distracted"
        ? "distracting"
        : "neutral";
    const minuteSlot = Number.isNaN(ts.getTime())
      ? ""
      : `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, "0")}-${String(ts.getDate()).padStart(2, "0")} ${String(ts.getHours()).padStart(2, "0")}:${String(ts.getMinutes()).padStart(2, "0")}`;

    // Keep one record per minute to match other dashboard cards.
    if (!minuteSlot || countedMinuteSlots.has(minuteSlot)) {
      continue;
    }
    countedMinuteSlots.add(minuteSlot);

    // For Chrome, extract site name from window title
    if (app === "Chrome" && windowTitle) {
      // Try to extract site from common patterns like "YouTube", "Reddit - ...", etc.
      const site = windowTitle.split(" - ")[0].split(" | ")[0].trim();
      if (site && site.length > 0 && site.length < 30) {
        app = `Chrome: ${site}`;
      }
    }

    if (!shouldIncludeRecentApp(app)) {
      continue;
    }

    if (!appStats[app]) {
      appStats[app] = {
        app,
        sessions: 0,
        totalMinutes: 0,
        typeCounts: { focused: 0, neutral: 0, distracting: 0 },
      };
    }

    // Add duration as one sampled active minute per deduped row.
    appStats[app].totalMinutes += 1;
    appStats[app].typeCounts[normalizedType] += 1;

    // Count session if new app or gap > 60s
    if (app !== currentApp || (currentSession && (ts.getTime() - currentSession.getTime()) > 60000)) {
      appStats[app].sessions += 1;
      currentApp = app;
    }
    currentSession = ts;
  }

  // Convert to array and sort by total time descending
  const topApps = Object.values(appStats)
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5)
    .map((stat) => ({
      ...stat,
      totalMinutes: Math.round(stat.totalMinutes),
      type:
        stat.typeCounts.focused >= stat.typeCounts.neutral && stat.typeCounts.focused >= stat.typeCounts.distracting
          ? "focused"
          : stat.typeCounts.distracting >= stat.typeCounts.neutral
          ? "distracting"
          : "neutral",
    }));

  const totalSampledMinutes = Object.values(appStats).reduce(
    (sum, stat) => sum + Math.round(stat.totalMinutes),
    0,
  );

  // Use the same 3 classification colors as the rest of the dashboard.
  const categoryBaseColor: Record<"focused" | "neutral" | "distracting", string> = {
    focused: chartColors.productive,
    neutral: chartColors.neutral,
    distracting: chartColors.distracting,
  };

  const treemapData = topApps.map((stat) => {
    const share = totalSampledMinutes > 0 ? Math.round((stat.totalMinutes / totalSampledMinutes) * 100) : 0;
    const category = stat.type as "focused" | "neutral" | "distracting";
    const fill = categoryBaseColor[category];

    return {
      name: stat.app,
      value: stat.totalMinutes,
      sessions: stat.sessions,
      type: stat.type,
      share,
      fill,
    };
  });

  const treemapLookup = new Map(treemapData.map((item) => [item.name, item]));

  const renderTreemapNode = (props: any) => {
    const { x, y, width, height, payload, name, depth } = props;
    if (depth !== 1) return null;

    const nodeName = String(name || payload?.name || "");
    const nodeData = treemapLookup.get(nodeName);
    const value = Number(nodeData?.value ?? props?.value ?? payload?.value ?? 0);
    const share = Number(nodeData?.share ?? 0);
    const fill = nodeData?.fill || payload?.fill || "#64748b";

    if (width <= 0 || height <= 0) return null;

    const canShowFullText = width > 150 && height > 90;
    const canShowValue = width > 95 && height > 52;
    const canShowShare = width > 120 && height > 74;
    const canShowNameOnly = width > 40 && height > 20;
    const canShowTitleStrip = width > 130 && height > 46;

    const titleFontSize = Math.max(9, Math.min(15, Math.floor(Math.min(width * 0.085, height * 0.24))));
    const valueFontSize = Math.max(13, Math.min(24, Math.floor(Math.min(width * 0.12, height * 0.34))));
    const metaFontSize = Math.max(10, Math.min(12, Math.floor(Math.min(width * 0.06, height * 0.16))));
    const titleMaxChars = Math.max(7, Math.floor((width - 16) / Math.max(5.8, titleFontSize * 0.55)));
    const shortTitle = String(name).length > titleMaxChars ? `${String(name).slice(0, Math.max(5, titleMaxChars - 2))}..` : String(name);
    const titlePadX = 8;
    const titleStripHeight = Math.max(14, Math.min(28, titleFontSize + 10));
    const estimatedTitleWidth = Math.ceil(shortTitle.length * Math.max(5.6, titleFontSize * 0.58)) + (titlePadX * 2);
    const titleStripWidth = Math.max(48, Math.min(width - 12, estimatedTitleWidth));
    const titleY = y + 6 + Math.max(10, titleFontSize);
    const valueY = y + 6 + titleStripHeight + Math.max(18, valueFontSize + 4);
    const shareY = valueY + Math.max(15, metaFontSize + 4);
    const showValueWithinTile = canShowValue && valueY <= y + height - 8;
    const showShareWithinTile = canShowShare && shareY <= y + height - 6;

    return (
      <g>
        <rect
          x={x + 1}
          y={y + 1}
          width={Math.max(0, width - 2)}
          height={Math.max(0, height - 2)}
          rx={8}
          ry={8}
          fill={fill}
          stroke="#0b1220"
          strokeWidth={2.6}
        />
        {canShowTitleStrip ? (
          <rect
            x={x + 6}
            y={y + 6}
            width={titleStripWidth}
            height={titleStripHeight}
            rx={6}
            ry={6}
            fill="rgba(2, 6, 23, 0.28)"
          />
        ) : null}
        {canShowNameOnly ? (
          <>
            <text
              x={x + 6 + titlePadX}
              y={titleY}
              fill="#ffffff"
              fontSize={titleFontSize}
              fontWeight={700}
              stroke="none"
            >
              {shortTitle}
            </text>
            {showValueWithinTile ? (
              <text x={x + 10} y={valueY} fill="#ffffff" fontSize={valueFontSize} fontWeight={800} stroke="none">
              {value} min
              </text>
            ) : null}
            {showShareWithinTile ? (
              <text x={x + 10} y={shareY} fill="#f1f5f9" fontSize={metaFontSize} stroke="none">
                {share}% of last 3h
              </text>
            ) : null}
          </>
        ) : null}
      </g>
    );
  };

  const tooltipContent = ({ active, payload }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    return (
      <div
        style={{
          backgroundColor: "#020617",
          border: "1px solid #334155",
          borderRadius: "8px",
          padding: "8px 10px",
          boxShadow: "0 8px 24px rgba(2, 6, 23, 0.55)",
          color: "#f8fafc",
          fontSize: "12px",
          lineHeight: 1.35,
          minWidth: "170px",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: "4px", color: "#f8fafc" }}>{p.name}</div>
        <div style={{ color: "#e2e8f0" }}>{p.value} min</div>
        <div style={{ color: "#cbd5e1", textTransform: "capitalize" }}>{p.type} category</div>
        <div style={{ color: "#cbd5e1" }}>{p.share}% of recent sampled time</div>
      </div>
    );
  };

  return (
    <div
      className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm h-full flex flex-col"
      role="region"
      aria-label="Recent activity summary"
    >
      <h2 className="text-slate-900 mb-1 text-lg">Recent Activity Summary (Last 3 Hours)</h2>
      <p className="text-xs text-slate-500 mb-3 max-w-3xl leading-relaxed">
        Snapshot of where your attention has gone in the most recent work window.
      </p>

      <div className="rounded-xl bg-slate-950/45 p-3 flex-1">
        {topApps.length > 0 ? (
          <div className="rounded-xl bg-gradient-to-br from-slate-950/95 via-slate-900/75 to-slate-950/95 p-2.5 min-h-[300px]">
            <div className="h-full w-full rounded-lg bg-slate-950/35 p-1.5">
              <ResponsiveContainer width="100%" height={300}>
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  stroke="#0f172a"
                  fill="#475569"
                  content={renderTreemapNode}
                  aspectRatio={2.1}
                  isAnimationActive={false}
                >
                  <Tooltip content={tooltipContent} />
                </Treemap>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-lg bg-slate-950/45 px-3 py-6 text-center text-slate-500 text-sm">
            No recent app activity detected in the last 3 hours.
          </div>
        )}
      </div>
    </div>
  );
}
