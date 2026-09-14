import { useEffect, useState } from "react";

export type HourlyItem = {
  hour: number;
  productive: number;
  neutral: number;
  distracting: number;
};

export type TopApp = {
  name: string;
  total_seconds: number;
  focused_seconds?: number;
  neutral_seconds?: number;
  distracted_seconds?: number;
};

export type RecentActivity = {
  id: number;
  timestamp: string;
  app_name: string;
  window_title: string;
  idle_time: number;
  classification: string;
};

export type Summary = {
  total_active_seconds: number;
  focus_percentage: number;
  neutral_percentage: number;
  distracted_percentage: number;
};

export interface DashboardData {
  loading: boolean;
  error?: string;
  summary: Summary | null;
  hourly: HourlyItem[] | null;
  apps: TopApp[] | null;
  recent: RecentActivity[] | null;
  trend: Array<{ date: string; focus_score: number; focused_seconds?: number; neutral_seconds?: number; distracted_seconds?: number }> | null;
}

const EXAMPLE_DASHBOARD_DATA: Record<"baseline" | "adhd", Omit<DashboardData, "loading" | "error">> = {
  baseline: {
    summary: {
      total_active_seconds: 23880,
      focus_percentage: 68,
      neutral_percentage: 21,
      distracted_percentage: 11,
    },
    hourly: [
      { hour: 9, productive: 34, neutral: 10, distracting: 4 },
      { hour: 10, productive: 41, neutral: 9, distracting: 5 },
      { hour: 11, productive: 36, neutral: 12, distracting: 5 },
      { hour: 12, productive: 20, neutral: 18, distracting: 8 },
      { hour: 13, productive: 29, neutral: 11, distracting: 6 },
      { hour: 14, productive: 33, neutral: 10, distracting: 7 },
      { hour: 15, productive: 32, neutral: 12, distracting: 9 },
      { hour: 16, productive: 25, neutral: 11, distracting: 10 },
    ],
    apps: [
      { name: "Visual Studio Code", total_seconds: 7200, focused_seconds: 5300, neutral_seconds: 1400, distracted_seconds: 500 },
      { name: "Chrome", total_seconds: 5400, focused_seconds: 2800, neutral_seconds: 1300, distracted_seconds: 1300 },
      { name: "Notion", total_seconds: 3200, focused_seconds: 2300, neutral_seconds: 700, distracted_seconds: 200 },
      { name: "YouTube", total_seconds: 2400, focused_seconds: 500, neutral_seconds: 600, distracted_seconds: 1300 },
    ],
    recent: [
      { id: 9001, timestamp: "2026-04-12T15:42:00", app_name: "Visual Studio Code", window_title: "App.tsx - VS Code", idle_time: 420, classification: "focused" },
      { id: 9002, timestamp: "2026-04-12T15:35:00", app_name: "Chrome", window_title: "Research tab", idle_time: 300, classification: "neutral" },
      { id: 9003, timestamp: "2026-04-12T15:28:00", app_name: "YouTube", window_title: "Recommended video", idle_time: 260, classification: "distracted" },
      { id: 9004, timestamp: "2026-04-12T15:21:00", app_name: "Notion", window_title: "Sprint notes", idle_time: 390, classification: "focused" },
    ],
    trend: [
      { date: "2026-04-06", focus_score: 62, focused_seconds: 18200, neutral_seconds: 6400, distracted_seconds: 5200 },
      { date: "2026-04-07", focus_score: 65, focused_seconds: 19600, neutral_seconds: 6000, distracted_seconds: 5000 },
      { date: "2026-04-08", focus_score: 66, focused_seconds: 20100, neutral_seconds: 5900, distracted_seconds: 4700 },
      { date: "2026-04-09", focus_score: 67, focused_seconds: 20800, neutral_seconds: 5600, distracted_seconds: 4600 },
      { date: "2026-04-10", focus_score: 68, focused_seconds: 21400, neutral_seconds: 5400, distracted_seconds: 4500 },
      { date: "2026-04-11", focus_score: 69, focused_seconds: 22000, neutral_seconds: 5200, distracted_seconds: 4400 },
      { date: "2026-04-12", focus_score: 68, focused_seconds: 16200, neutral_seconds: 5100, distracted_seconds: 2580 },
    ],
  },
  adhd: {
    summary: {
      total_active_seconds: 22440,
      focus_percentage: 49,
      neutral_percentage: 24,
      distracted_percentage: 27,
    },
    hourly: [
      { hour: 9, productive: 20, neutral: 11, distracting: 13 },
      { hour: 10, productive: 28, neutral: 10, distracting: 15 },
      { hour: 11, productive: 18, neutral: 12, distracting: 20 },
      { hour: 12, productive: 16, neutral: 13, distracting: 18 },
      { hour: 13, productive: 31, neutral: 10, distracting: 12 },
      { hour: 14, productive: 27, neutral: 11, distracting: 16 },
      { hour: 15, productive: 24, neutral: 12, distracting: 17 },
      { hour: 16, productive: 14, neutral: 11, distracting: 20 },
    ],
    apps: [
      { name: "Visual Studio Code", total_seconds: 6600, focused_seconds: 3600, neutral_seconds: 1700, distracted_seconds: 1300 },
      { name: "Chrome", total_seconds: 7000, focused_seconds: 2600, neutral_seconds: 1300, distracted_seconds: 3100 },
      { name: "Discord", total_seconds: 2800, focused_seconds: 600, neutral_seconds: 500, distracted_seconds: 1700 },
      { name: "Spotify", total_seconds: 2200, focused_seconds: 1100, neutral_seconds: 500, distracted_seconds: 600 },
    ],
    recent: [
      { id: 9101, timestamp: "2026-04-12T15:44:00", app_name: "Chrome", window_title: "Open tabs overload", idle_time: 290, classification: "distracted" },
      { id: 9102, timestamp: "2026-04-12T15:36:00", app_name: "Visual Studio Code", window_title: "useDashboardData.ts", idle_time: 360, classification: "focused" },
      { id: 9103, timestamp: "2026-04-12T15:30:00", app_name: "Discord", window_title: "Team chat", idle_time: 240, classification: "distracted" },
      { id: 9104, timestamp: "2026-04-12T15:23:00", app_name: "Spotify", window_title: "Focus playlist", idle_time: 300, classification: "neutral" },
    ],
    trend: [
      { date: "2026-04-06", focus_score: 54, focused_seconds: 14500, neutral_seconds: 6200, distracted_seconds: 9800 },
      { date: "2026-04-07", focus_score: 52, focused_seconds: 13900, neutral_seconds: 6400, distracted_seconds: 10300 },
      { date: "2026-04-08", focus_score: 50, focused_seconds: 13200, neutral_seconds: 6100, distracted_seconds: 10800 },
      { date: "2026-04-09", focus_score: 48, focused_seconds: 12600, neutral_seconds: 5900, distracted_seconds: 11200 },
      { date: "2026-04-10", focus_score: 46, focused_seconds: 12100, neutral_seconds: 5600, distracted_seconds: 11700 },
      { date: "2026-04-11", focus_score: 47, focused_seconds: 12400, neutral_seconds: 5500, distracted_seconds: 11500 },
      { date: "2026-04-12", focus_score: 49, focused_seconds: 11000, neutral_seconds: 5400, distracted_seconds: 6040 },
    ],
  },
};

function hasMeaningfulOverviewData(data: Omit<DashboardData, "loading" | "error">) {
  const total = data.summary?.total_active_seconds || 0;
  const hourlyTotal = (data.hourly || []).reduce(
    (sum, row) => sum + row.productive + row.neutral + row.distracting,
    0,
  );
  const appTotal = (data.apps || []).reduce((sum, app) => sum + (app.total_seconds || 0), 0);
  return total > 0 || hourlyTotal > 0 || appTotal > 0;
}

const API = (path: string, profile: "live" | "baseline" | "adhd") => {
  const sep = path.includes("?") ? "&" : "?";
  return `http://127.0.0.1:5001${path}${sep}profile=${profile}`;
};

async function fetchJsonWithRetry(
  url: string,
  attempts = 6,
  initialDelayMs = 400,
) {
  let delayMs = initialDelayMs;
  let lastError: Error | null = null;

  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return await response.json();
      }
      lastError = new Error(`HTTP ${response.status} for ${url}`);
    } catch (error) {
      lastError = error as Error;
    }

    if (i < attempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      delayMs = Math.min(2500, Math.round(delayMs * 1.6));
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

export function useDashboardData(
  pollMs = 60000,
  profile: "live" | "baseline" | "adhd" = "live"
): DashboardData {
  const [data, setData] = useState<DashboardData>({
    loading: true,
    error: undefined,
    summary: null,
    hourly: null,
    apps: null,
    recent: null,
    trend: null,
  });

  async function fetchAll() {
    try {
      const [summaryJson, hourlyJson, appsJson, recentJson, trendJson] = await Promise.all([
        fetchJsonWithRetry(API("/api/dashboard/summary", profile)),
        fetchJsonWithRetry(API("/api/dashboard/hourly-breakdown", profile)),
        fetchJsonWithRetry(API("/api/dashboard/top-apps", profile)),
        fetchJsonWithRetry(API("/api/activities/recent?hours=3", profile)),
        fetchJsonWithRetry(API("/api/dashboard/productivity-trend?days=7", profile)),
      ]);

      const breakdown = summaryJson?.data?.breakdown || null;
      const total =
        (breakdown?.focused_seconds || 0) +
        (breakdown?.neutral_seconds || 0) +
        (breakdown?.distracted_seconds || 0);

      const summary: Summary | null = breakdown
        ? {
          total_active_seconds: total,
          focus_percentage: breakdown.focus_score ?? 0,
          neutral_percentage: total
            ? ((breakdown.neutral_seconds || 0) / total) * 100
            : 0,
          distracted_percentage: total
            ? ((breakdown.distracted_seconds || 0) / total) * 100
            : 0,
        }
        : null;

      // Normalize hourly data: ensure numeric hour and minutes units
      const rawHourly = Array.isArray(hourlyJson?.data) ? hourlyJson.data : [];
      const hourlyNormalized: HourlyItem[] = rawHourly.map((h: any) => {
        const rawHour = h?.hour;
        let hourNum = 0;
        if (typeof rawHour === "number") {
          hourNum = Math.max(0, Math.min(23, Math.round(rawHour)));
        } else if (typeof rawHour === "string") {
          const m = rawHour.match(/(\d{1,2})/);
          if (m) hourNum = Math.max(0, Math.min(23, parseInt(m[1], 10)));
          else {
            const d = new Date(rawHour);
            hourNum = isNaN(d.getTime()) ? 0 : d.getHours();
          }
        }

        const prod = Number(h?.productive ?? h?.focused ?? 0);
        const neu = Number(h?.neutral ?? 0);
        const dis = Number(h?.distracting ?? h?.distracted ?? 0);
        const anyOver180 = [prod, neu, dis].some((v) => v > 180);
        const toMin = (v: number) => Math.max(0, Math.round(anyOver180 ? v / 60 : v));

        return {
          hour: hourNum,
          productive: toMin(prod),
          neutral: toMin(neu),
          distracting: toMin(dis),
        };
      });

      const state: DashboardData = {
        loading: false,
        error: undefined,
        summary,
        hourly: hourlyNormalized,
        apps: appsJson?.data || [],
        recent: recentJson?.data || [],
        trend: trendJson?.data || [],
      };

      if (profile !== "live" && !hasMeaningfulOverviewData(state)) {
        setData({ loading: false, error: undefined, ...EXAMPLE_DASHBOARD_DATA[profile] });
        return;
      }

      setData(state);
    } catch (e: any) {
      if (profile !== "live") {
        setData({ loading: false, error: undefined, ...EXAMPLE_DASHBOARD_DATA[profile] });
        return;
      }

      setData((prev) => ({
        ...prev,
        loading: false,
        error: e?.message || "Failed to load data",
      }));
    }
  }

  useEffect(() => {
    fetchAll();
    const id = setInterval(fetchAll, pollMs);
    return () => clearInterval(id);
  }, [pollMs, profile]);

  return data;
}
