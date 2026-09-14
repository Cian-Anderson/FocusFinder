import { useState, useEffect } from "react";

const API_BASE = "http://127.0.0.1:5001/api";
type DataProfile = "live" | "baseline" | "adhd";

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

export type ADHDSummary = {
  hyperfocus_sessions: number;
  longest_focus_minutes: number;
  task_switches_today: number;
  switches_per_hour: number;
  most_distracting_app: string;
  distraction_episodes: number;
  morning_focus: number;
  midday_focus: number;
  afternoon_focus: number;
  evening_focus: number;
};

export type HyperfocusSession = {
  start_time: string;
  end_time: string;
  duration_minutes: number;
  intensity: number;
  primary_activity?: string;
};

export type TaskSwitchingHour = {
  hour: number;
  switches: number;
  activity_count: number;
};

export type DistractionApp = {
  app_name: string;
  episodes: number;
  total_seconds: number;
};

export type DistractionPatterns = {
  by_app: DistractionApp[];
  severity_breakdown: {
    micro_breaks: number;
    minor_distractions: number;
    major_distractions: number;
  };
};

export type TimeOfDayPeriod = {
  period: string;
  focus_score: number;
  activity_count: number;
};

const EXAMPLE_ADHD_DATA: Record<
  Exclude<DataProfile, "live">,
  {
    summary: ADHDSummary;
    hyperfocusSessions: HyperfocusSession[];
    taskSwitching: TaskSwitchingHour[];
    distractionPatterns: DistractionPatterns;
    timeOfDay: TimeOfDayPeriod[];
  }
> = {
  baseline: {
    summary: {
      hyperfocus_sessions: 3,
      longest_focus_minutes: 94,
      task_switches_today: 17,
      switches_per_hour: 1.9,
      most_distracting_app: "YouTube",
      distraction_episodes: 6,
      morning_focus: 72,
      midday_focus: 66,
      afternoon_focus: 69,
      evening_focus: 61,
    },
    hyperfocusSessions: [
      { start_time: "2026-04-12T09:05:00", end_time: "2026-04-12T10:21:00", duration_minutes: 76, intensity: 0.81, primary_activity: "Coding" },
      { start_time: "2026-04-12T11:12:00", end_time: "2026-04-12T12:46:00", duration_minutes: 94, intensity: 0.88, primary_activity: "Deep work" },
      { start_time: "2026-04-12T14:04:00", end_time: "2026-04-12T15:01:00", duration_minutes: 57, intensity: 0.74, primary_activity: "Writing" },
    ],
    taskSwitching: [
      { hour: 9, switches: 2, activity_count: 11 },
      { hour: 10, switches: 1, activity_count: 9 },
      { hour: 11, switches: 2, activity_count: 10 },
      { hour: 12, switches: 3, activity_count: 12 },
      { hour: 13, switches: 2, activity_count: 9 },
      { hour: 14, switches: 3, activity_count: 11 },
      { hour: 15, switches: 4, activity_count: 13 },
    ],
    distractionPatterns: {
      by_app: [
        { app_name: "YouTube", episodes: 3, total_seconds: 1080 },
        { app_name: "Chrome", episodes: 2, total_seconds: 720 },
        { app_name: "Discord", episodes: 1, total_seconds: 300 },
      ],
      severity_breakdown: {
        micro_breaks: 5,
        minor_distractions: 1,
        major_distractions: 0,
      },
    },
    timeOfDay: [
      { period: "Morning", focus_score: 72, activity_count: 38 },
      { period: "Midday", focus_score: 66, activity_count: 31 },
      { period: "Afternoon", focus_score: 69, activity_count: 34 },
      { period: "Evening", focus_score: 61, activity_count: 19 },
    ],
  },
  adhd: {
    summary: {
      hyperfocus_sessions: 2,
      longest_focus_minutes: 63,
      task_switches_today: 34,
      switches_per_hour: 3.8,
      most_distracting_app: "Discord",
      distraction_episodes: 14,
      morning_focus: 57,
      midday_focus: 44,
      afternoon_focus: 51,
      evening_focus: 39,
    },
    hyperfocusSessions: [
      { start_time: "2026-04-12T10:18:00", end_time: "2026-04-12T11:05:00", duration_minutes: 47, intensity: 0.69, primary_activity: "Debugging" },
      { start_time: "2026-04-12T14:37:00", end_time: "2026-04-12T15:40:00", duration_minutes: 63, intensity: 0.77, primary_activity: "Feature build" },
    ],
    taskSwitching: [
      { hour: 9, switches: 4, activity_count: 12 },
      { hour: 10, switches: 3, activity_count: 11 },
      { hour: 11, switches: 6, activity_count: 14 },
      { hour: 12, switches: 5, activity_count: 13 },
      { hour: 13, switches: 4, activity_count: 12 },
      { hour: 14, switches: 6, activity_count: 15 },
      { hour: 15, switches: 6, activity_count: 16 },
    ],
    distractionPatterns: {
      by_app: [
        { app_name: "Discord", episodes: 5, total_seconds: 1920 },
        { app_name: "Chrome", episodes: 4, total_seconds: 1680 },
        { app_name: "YouTube", episodes: 3, total_seconds: 1260 },
        { app_name: "WhatsApp", episodes: 2, total_seconds: 660 },
      ],
      severity_breakdown: {
        micro_breaks: 6,
        minor_distractions: 6,
        major_distractions: 2,
      },
    },
    timeOfDay: [
      { period: "Morning", focus_score: 57, activity_count: 29 },
      { period: "Midday", focus_score: 44, activity_count: 27 },
      { period: "Afternoon", focus_score: 51, activity_count: 30 },
      { period: "Evening", focus_score: 39, activity_count: 23 },
    ],
  },
};

function hasMeaningfulAdhdData(
  summary: ADHDSummary | null,
  sessions: HyperfocusSession[],
  switching: TaskSwitchingHour[],
  patterns: DistractionPatterns | null,
) {
  const summarySignal =
    (summary?.hyperfocus_sessions || 0) +
    (summary?.task_switches_today || 0) +
    (summary?.distraction_episodes || 0);
  const switchingSignal = switching.reduce((sum, row) => sum + (row.switches || 0), 0);
  const distractionSignal = (patterns?.by_app || []).reduce((sum, row) => sum + (row.episodes || 0), 0);
  return summarySignal > 0 || sessions.length > 0 || switchingSignal > 0 || distractionSignal > 0;
}

export function useADHDData(
  pollInterval?: number,
  profile: DataProfile = "live",
) {
  const [summary, setSummary] = useState<ADHDSummary | null>(null);
  const [hyperfocusSessions, setHyperfocusSessions] = useState<
    HyperfocusSession[]
  >([]);
  const [taskSwitching, setTaskSwitching] = useState<TaskSwitchingHour[]>([]);
  const [distractionPatterns, setDistractionPatterns] =
    useState<DistractionPatterns | null>(null);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyExampleData = (exampleProfile: Exclude<DataProfile, "live">) => {
    const example = EXAMPLE_ADHD_DATA[exampleProfile];
    setSummary(example.summary);
    setHyperfocusSessions(example.hyperfocusSessions);
    setTaskSwitching(example.taskSwitching);
    setDistractionPatterns(example.distractionPatterns);
    setTimeOfDay(example.timeOfDay);
  };

  const fetchData = async () => {
    try {
      if (profile !== "live") {
        // Example profiles are local fixtures and should render instantly.
        applyExampleData(profile);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      const [summaryData, hyperfocusData, switchingData, distractionData, todData] =
        await Promise.all([
          fetchJsonWithRetry(`${API_BASE}/adhd/summary?profile=${profile}`),
          fetchJsonWithRetry(`${API_BASE}/adhd/hyperfocus-sessions?profile=${profile}&window_days=3`),
          fetchJsonWithRetry(`${API_BASE}/adhd/task-switching?profile=${profile}`),
          fetchJsonWithRetry(`${API_BASE}/adhd/distraction-patterns?profile=${profile}`),
          fetchJsonWithRetry(`${API_BASE}/adhd/time-of-day-analysis?profile=${profile}`),
        ]);

      const nextSummary = summaryData.data || null;
      const nextSessions = hyperfocusData.data || [];
      const nextSwitching = switchingData.data || [];
      const nextPatterns = distractionData.data || null;
      const nextTimeOfDay = todData.data || [];

      setSummary(nextSummary);
      setHyperfocusSessions(nextSessions);
      setTaskSwitching(nextSwitching);
      setDistractionPatterns(nextPatterns);
      setTimeOfDay(nextTimeOfDay);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("ADHD data fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    if (profile === "live" && pollInterval && pollInterval > 0) {
      const interval = setInterval(fetchData, pollInterval);
      return () => clearInterval(interval);
    }
  }, [pollInterval, profile]);

  return {
    summary,
    hyperfocusSessions,
    taskSwitching,
    distractionPatterns,
    timeOfDay,
    loading,
    error,
  };
}
