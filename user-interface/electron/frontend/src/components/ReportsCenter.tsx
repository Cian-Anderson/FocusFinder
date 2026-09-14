import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, RefreshCw, ExternalLink, FolderOpen, Trash2 } from "lucide-react";
import { useDashboardData } from "../hooks/useDashboardData";

type DataProfile = "live" | "baseline" | "adhd";

const API_BASE = "http://127.0.0.1:5001/api";

type StoredReport = {
  fileName: string;
  filePath: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

type Past7DayReportPayload = {
  generatedAt: string;
  profile: DataProfile;
  adhdSummary: {
    hyperfocus_sessions: number;
    longest_focus_minutes: number;
    task_switches_today: number;
    switches_per_hour: number;
    most_distracting_app: string;
  };
  dashboardSummary: {
    total_active_seconds: number;
    focus_percentage: number;
    neutral_percentage: number;
    distracted_percentage: number;
  };
  focusByPeriod: Array<{ label: string; value: number }>;
  switchByHour: Array<{ label: string; value: number }>;
  distractingApps: Array<{ label: string; value: number }>;
  trend: Array<{ date: string; focus_score: number; has_data?: boolean }>;
};

type ElectronReportApi = {
  generatePast7DayReport?: (payload: Past7DayReportPayload) => Promise<{
    success: boolean;
    data?: { fileName: string; filePath: string; createdAt: string };
    error?: string;
  }>;
  generateWeeklyReport?: (payload: Past7DayReportPayload) => Promise<{
    success: boolean;
    data?: { fileName: string; filePath: string; createdAt: string };
    error?: string;
  }>;
  listReports?: () => Promise<{ success: boolean; data?: StoredReport[]; error?: string }>;
  openReport?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  showReportLocation?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
  deleteReport?: (filePath: string) => Promise<{ success: boolean; error?: string }>;
};

type AdhdSummaryApi = {
  hyperfocus_sessions?: number;
  longest_focus_minutes?: number;
  task_switches_today?: number;
  switches_per_hour?: number;
  most_distracting_app?: string;
  morning_focus?: number;
  midday_focus?: number;
  afternoon_focus?: number;
  evening_focus?: number;
};

type DistractionPatternsApi = {
  by_app?: Array<{ app_name?: string; episodes?: number }>;
};

type TaskSwitchingApi = Array<{ hour?: number; switches?: number; activity_count?: number }>;

function safeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function deriveMostDistractingAppFromDashboard(
  apps: Array<{ name?: string; distracted_seconds?: number; total_seconds?: number }> | null | undefined,
): string {
  const top = (apps || [])
    .slice()
    .sort(
      (left, right) =>
        safeNumber(right?.distracted_seconds) - safeNumber(left?.distracted_seconds) ||
        safeNumber(right?.total_seconds) - safeNumber(left?.total_seconds),
    )[0];

  return top?.name || "N/A";
}

function isoDateOnly(input: Date | string): string {
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildRollingSevenDayTrend(
  trend: Array<{
    date: string;
    focus_score: number;
    focused_seconds?: number;
    neutral_seconds?: number;
    distracted_seconds?: number;
    has_data?: boolean;
  }> | null | undefined,
): Array<{ date: string; focus_score: number; has_data?: boolean }> {
  const byDate = new Map<string, { focus_score: number; has_data?: boolean }>();
  for (const item of trend || []) {
    const key = isoDateOnly(item.date);
    if (!key) continue;
    const hasData =
      item.has_data !== undefined
        ? item.has_data
        : (item.focused_seconds || 0) > 0 ||
          (item.neutral_seconds || 0) > 0 ||
          (item.distracted_seconds || 0) > 0;
    byDate.set(key, {
      focus_score: item.focus_score || 0,
      has_data: hasData,
    });
  }

  const out: Array<{ date: string; focus_score: number; has_data?: boolean }> = [];
  const today = new Date();
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(today);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = isoDateOnly(d);
    const existing = byDate.get(key);
    out.push({
      date: key,
      focus_score: existing?.focus_score || 0,
      has_data: existing?.has_data ?? false,
    });
  }
  return out;
}

function getElectronReportApi(): ElectronReportApi {
  const maybeWindow = window as unknown as { electron?: ElectronReportApi };
  return maybeWindow.electron || {};
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateTime(input: string): string {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function normalizeReportError(message: string | undefined): string {
  const raw = message || "Failed to generate report";
  return raw.toLowerCase().includes("margins must be less than or equal to pagesize")
    ? "PDF generation failed due to print settings. Please restart Electron and try again."
    : raw;
}

export function ReportsCenter({ profile = "live" }: { profile?: DataProfile }) {
  const dashboard = useDashboardData(60000, profile);
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportStatus, setReportStatus] = useState<string | null>(null);
  const [deletingPath, setDeletingPath] = useState<string | null>(null);

  const profileLabel =
    profile === "live" ? "Live Data" : profile === "baseline" ? "Baseline Demo" : "ADHD Demo";

  const fallbackPayload = useMemo(() => {
    return {
      generatedAt: new Date().toISOString(),
      profile,
      adhdSummary: {
        hyperfocus_sessions: 0,
        longest_focus_minutes: 0,
        task_switches_today: 0,
        switches_per_hour: 0,
        most_distracting_app: deriveMostDistractingAppFromDashboard(dashboard.apps),
      },
      dashboardSummary: {
        total_active_seconds: dashboard.summary?.total_active_seconds || 0,
        focus_percentage: dashboard.summary?.focus_percentage || 0,
        neutral_percentage: dashboard.summary?.neutral_percentage || 0,
        distracted_percentage: dashboard.summary?.distracted_percentage || 0,
      },
      focusByPeriod: [
        { label: "Morning", value: 0 },
        { label: "Midday", value: 0 },
        { label: "Afternoon", value: 0 },
        { label: "Evening", value: 0 },
      ],
      switchByHour: [],
      distractingApps: (dashboard.apps || []).slice(0, 8).map((item) => ({
        label: item.name || "Unknown",
        value: item.distracted_seconds ?? item.total_seconds ?? 0,
      })),
      trend: buildRollingSevenDayTrend(dashboard.trend),
    } as Past7DayReportPayload;
  }, [dashboard.summary, dashboard.hourly, dashboard.apps, dashboard.trend, profile]);

  const loadReports = useCallback(async () => {
    const electron = getElectronReportApi();
    if (!electron.listReports) {
      setReportsError("Report listing is only available in Electron desktop mode.");
      return;
    }

    setReportsLoading(true);
    setReportsError(null);
    try {
      const result = await electron.listReports();
      if (!result?.success) {
        setReportsError(result?.error || "Failed to load reports");
        return;
      }
      setReports(result.data || []);
    } catch (error) {
      setReportsError(error instanceof Error ? error.message : "Failed to load reports");
    } finally {
      setReportsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const buildLivePayload = useCallback(async (): Promise<Past7DayReportPayload> => {
    try {
      const [summaryRes, distractionRes, switchingRes] = await Promise.all([
        fetch(`${API_BASE}/adhd/summary?profile=${profile}`),
        fetch(`${API_BASE}/adhd/distraction-patterns?profile=${profile}`),
        fetch(`${API_BASE}/adhd/task-switching?profile=${profile}`),
      ]);

      const summaryJson = summaryRes.ok ? await summaryRes.json() : null;
      const distractionJson = distractionRes.ok ? await distractionRes.json() : null;
      const switchingJson = switchingRes.ok ? await switchingRes.json() : null;

      const adhdSummary = (summaryJson?.data || {}) as AdhdSummaryApi;
      const distraction = (distractionJson?.data || {}) as DistractionPatternsApi;
      const switching = (switchingJson?.data || []) as TaskSwitchingApi;

      const distractingAppsFromApi = (distraction.by_app || []).slice(0, 8).map((item) => ({
        label: item.app_name || "Unknown",
        value: safeNumber(item.episodes),
      }));

      const switchingWithActivity = switching.filter(
        (item) => safeNumber(item.activity_count) > 0 || safeNumber(item.switches) > 0,
      );

      const switchingRows =
        switchingWithActivity.length > 0
          ? switchingWithActivity.slice(-12)
          : switching.slice(-12);

      const switchByHour = switchingRows.map((item) => ({
        label: `${String(Math.max(0, Math.floor(safeNumber(item.hour)))).padStart(2, "0")}:00`,
        value: safeNumber(item.switches),
      }));

      const mostDistractingApp =
        adhdSummary.most_distracting_app ||
        distractingAppsFromApi[0]?.label ||
        fallbackPayload.adhdSummary.most_distracting_app;

      return {
        ...fallbackPayload,
        adhdSummary: {
          hyperfocus_sessions: safeNumber(adhdSummary.hyperfocus_sessions) || fallbackPayload.adhdSummary.hyperfocus_sessions,
          longest_focus_minutes: safeNumber(adhdSummary.longest_focus_minutes) || fallbackPayload.adhdSummary.longest_focus_minutes,
          task_switches_today:
            safeNumber(adhdSummary.task_switches_today) ||
            switchByHour.reduce((sum, row) => sum + safeNumber(row.value), 0) ||
            fallbackPayload.adhdSummary.task_switches_today,
          switches_per_hour:
            safeNumber(adhdSummary.switches_per_hour) ||
            (switchByHour.length > 0
              ? Number(
                  (
                    switchByHour.reduce((sum, row) => sum + safeNumber(row.value), 0) /
                    switchByHour.length
                  ).toFixed(1),
                )
              : fallbackPayload.adhdSummary.switches_per_hour),
          most_distracting_app: mostDistractingApp,
        },
        focusByPeriod: [
          { label: "Morning", value: safeNumber(adhdSummary.morning_focus) },
          { label: "Midday", value: safeNumber(adhdSummary.midday_focus) },
          { label: "Afternoon", value: safeNumber(adhdSummary.afternoon_focus) },
          { label: "Evening", value: safeNumber(adhdSummary.evening_focus) },
        ],
        switchByHour: switchByHour.length > 0 ? switchByHour : fallbackPayload.switchByHour,
        distractingApps:
          distractingAppsFromApi.length > 0 ? distractingAppsFromApi : fallbackPayload.distractingApps,
      };
    } catch {
      return fallbackPayload;
    }
  }, [fallbackPayload, profile]);

  const generateReport = useCallback(async () => {
    const electron = getElectronReportApi();
    const generateFn = electron.generatePast7DayReport || electron.generateWeeklyReport;
    if (!generateFn) {
      setReportStatus("PDF export is only available in Electron desktop mode.");
      return;
    }

    setIsGenerating(true);
    setReportStatus(null);
    try {
      const payload = await buildLivePayload();
      const result = await generateFn(payload);
      if (!result?.success) {
        setReportStatus(normalizeReportError(result?.error));
        return;
      }

      setReportStatus(`Report created: ${result.data?.fileName || "7-day-report.pdf"}`);
      await loadReports();
    } catch (error) {
      setReportStatus(
        normalizeReportError(error instanceof Error ? error.message : "Failed to generate report"),
      );
    } finally {
      setIsGenerating(false);
    }
  }, [buildLivePayload, loadReports]);

  const openReport = useCallback(async (filePath: string) => {
    const electron = getElectronReportApi();
    if (!electron.openReport) {
      setReportStatus("Opening reports is only available in Electron desktop mode.");
      return;
    }

    const result = await electron.openReport(filePath);
    if (!result?.success) {
      setReportStatus(result?.error || "Failed to open report");
    }
  }, []);

  const showReportLocation = useCallback(async (filePath: string) => {
    const electron = getElectronReportApi();
    if (!electron.showReportLocation) {
      setReportStatus("Show location is only available in Electron desktop mode.");
      return;
    }

    const result = await electron.showReportLocation(filePath);
    if (!result?.success) {
      setReportStatus(result?.error || "Failed to show report location");
    }
  }, []);

  const deleteReport = useCallback(async (report: StoredReport) => {
    const electron = getElectronReportApi();
    if (!electron.deleteReport) {
      setReportStatus("Deleting reports is only available in Electron desktop mode.");
      return;
    }

    const confirmed = window.confirm(
      `Delete report \"${report.fileName}\"? This removes the PDF from disk and cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setDeletingPath(report.filePath);
    try {
      const result = await electron.deleteReport(report.filePath);
      if (!result?.success) {
        setReportStatus(result?.error || "Failed to delete report");
        return;
      }

      setReportStatus(`Deleted report: ${report.fileName}`);
      await loadReports();
    } finally {
      setDeletingPath(null);
    }
  }, [loadReports]);

  return (
    <div className="w-full min-h-screen flex flex-col bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-blue-600" />
          <h1 className="text-slate-900">Reports</h1>
          <span className="report-badge">
            Profile: {profileLabel}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-6 pt-6" style={{ paddingBottom: "36px" }}>
        <div className="max-w-[1800px] mx-auto space-y-6">
          <div role="region" aria-label="Reports center" className="bg-white rounded-lg p-5 border border-slate-200 shadow-sm" style={{ marginBottom: 8 }}>
            <div className="flex items-center justify-between gap-3" style={{ marginBottom: 12, flexWrap: "wrap" }}>
              <div style={{ minWidth: 280 }}>
                <h3 className="text-lg text-slate-900" style={{ margin: 0 }}>
                  Past 7-Day Report Center
                </h3>
                <p className="text-sm text-slate-600" style={{ margin: "6px 0 0" }}>
                  Generate and open past 7-day PDF reports (including today and the previous 6 days) for the selected dataset.
                </p>
              </div>
              <div className="flex gap-2" style={{ alignItems: "center" }}>
                <button
                  type="button"
                  onClick={loadReports}
                  disabled={reportsLoading}
                  className="report-action report-action--secondary"
                >
                  <RefreshCw size={16} />
                  Refresh
                </button>
                <button
                  type="button"
                  onClick={generateReport}
                  disabled={isGenerating || dashboard.loading}
                  className="report-action report-action--primary"
                >
                  {isGenerating ? "Generating..." : "Generate Past 7-Day PDF"}
                </button>
              </div>
            </div>

            {reportStatus && (
              <div className="report-status text-sm" style={{ marginBottom: 10 }}>
                {reportStatus}
              </div>
            )}

            {reportsError && (
              <div className="report-status report-status--error text-sm" style={{ marginBottom: 10 }}>
                {reportsError}
              </div>
            )}

            <div className="report-table-shell">
              <div
                className="report-table-note text-xs"
                style={{ padding: "8px 10px" }}
              >
                Report list includes file name, generation timestamp, and PDF file size.
              </div>
              <table className="report-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 12 }}>Report File Name</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 12 }}>Generated At (Local Time)</th>
                    <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 12 }}>File Size (KB/MB)</th>
                    <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 12 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reportsLoading ? (
                    <tr>
                      <td colSpan={4} className="report-table__empty" style={{ padding: "10px", fontSize: 13 }}>
                        Loading reports...
                      </td>
                    </tr>
                  ) : reports.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="report-table__empty" style={{ padding: "10px", fontSize: 13 }}>
                        No reports yet. Generate your first past 7-day PDF.
                      </td>
                    </tr>
                  ) : (
                    reports.map((report) => (
                      <tr key={report.filePath}>
                        <td
                          className="report-table__file"
                          style={{
                            padding: "9px 10px",
                            fontSize: 13,
                            maxWidth: 420,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={report.fileName}
                        >
                          {report.fileName}
                        </td>
                        <td className="report-table__meta" style={{ padding: "9px 10px", fontSize: 13 }}>
                          {formatDateTime(report.createdAt)}
                        </td>
                        <td className="report-table__meta" style={{ padding: "9px 10px", fontSize: 13 }}>
                          {formatBytes(report.sizeBytes)}
                        </td>
                        <td style={{ padding: "9px 10px", textAlign: "right" }}>
                          <div className="report-row-actions">
                            <button
                              type="button"
                              onClick={() => showReportLocation(report.filePath)}
                              className="report-open-btn"
                              title="Show file in folder"
                            >
                              <FolderOpen size={14} />
                              Show Location
                            </button>
                            <button
                              type="button"
                              onClick={() => openReport(report.filePath)}
                              className="report-open-btn"
                            >
                              <ExternalLink size={14} />
                              Open
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteReport(report)}
                              className="report-delete-btn"
                              disabled={deletingPath === report.filePath}
                            >
                              <Trash2 size={14} />
                              {deletingPath === report.filePath ? "Deleting..." : "Delete"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
