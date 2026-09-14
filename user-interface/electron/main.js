const { app, BrowserWindow, ipcMain, screen, shell } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");

let mainWindow = null;
let notificationWindow = null;
let pythonProcess = null;
let isQuitting = false;

function logElectron(message, meta) {
  const timestamp = new Date().toISOString();
  const details = meta ? ` ${JSON.stringify(meta)}` : "";
  const line = `[${timestamp}] [Electron][PID:${process.pid}] ${message}${details}`;
  console.log(line);
  try {
    const logDir = app.isReady()
      ? app.getPath("userData")
      : path.join(__dirname, "logs");
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(path.join(logDir, "electron-debug.log"), `${line}\n`);
  } catch (err) {
    console.error("[Electron] Failed to write debug log:", err);
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function getDisplayForWindow(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null;
  }

  return screen.getDisplayMatching(targetWindow.getBounds());
}

function getNotificationAnchorDisplay() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch (err) {
    logElectron("Failed to resolve cursor display for notification display", {
      error: err?.message,
    });
  }

  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      return getDisplayForWindow(focusedWindow);
    }
  } catch (err) {
    logElectron("Failed to resolve focused window fallback for notification display", {
      error: err?.message,
    });
  }

  return screen.getPrimaryDisplay();
}

function getNotificationMargin(display, baseMargin = 64) {
  const scaleFactor = Number(display?.scaleFactor) || 1;
  return Math.max(baseMargin, Math.round(baseMargin * scaleFactor));
}

function getNotificationPosition(display, bounds, margin = getNotificationMargin(display)) {
  const workArea = display?.workArea || display?.bounds || {
    x: 0,
    y: 0,
    width: bounds.width,
    height: bounds.height,
  };

  const maxX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);
  const preferredX = workArea.x + workArea.width - bounds.width - margin;
  const preferredY = workArea.y + workArea.height - bounds.height - margin;

  return {
    x: clamp(preferredX, workArea.x, maxX),
    y: clamp(preferredY, workArea.y, maxY),
    workArea,
  };
}

function getNotificationDebugContext() {
  let focusedWindowBounds = null;

  try {
    const focusedWindow = BrowserWindow.getFocusedWindow();
    if (focusedWindow && !focusedWindow.isDestroyed()) {
      focusedWindowBounds = focusedWindow.getBounds();
    }
  } catch {
    focusedWindowBounds = null;
  }

  return {
    cursorPoint: screen.getCursorScreenPoint(),
    focusedWindowBounds,
  };
}

function repositionNotificationWindow(targetWindow, preferredDisplay, margin = 64) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null;
  }

  const currentBounds = targetWindow.getBounds();
  const resolvedDisplay =
    preferredDisplay ||
    screen.getDisplayMatching(currentBounds) ||
    screen.getPrimaryDisplay();
  const safeMargin = getNotificationMargin(resolvedDisplay, margin);
  const { x: rawX, y: rawY, workArea } = getNotificationPosition(
    resolvedDisplay,
    currentBounds,
    safeMargin,
  );
  const finalInset = Math.max(12, Math.round((Number(resolvedDisplay?.scaleFactor) || 1) * 12));
  const maxX = workArea.x + Math.max(0, workArea.width - currentBounds.width);
  const maxY = workArea.y + Math.max(0, workArea.height - currentBounds.height);
  const x = clamp(rawX - finalInset, workArea.x, maxX);
  const y = clamp(rawY - finalInset, workArea.y, maxY);

  targetWindow.setBounds({
    ...currentBounds,
    x,
    y,
  });

  return {
    x,
    y,
    rawX,
    rawY,
    bounds: currentBounds,
    safeMargin,
    finalInset,
    workArea,
    displayId: resolvedDisplay?.id,
    displayBounds: resolvedDisplay?.bounds,
    scaleFactor: resolvedDisplay?.scaleFactor,
    debugContext: getNotificationDebugContext(),
  };
}

function resizeNotificationWindowToFitContent(targetWindow, requestedSize) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return null;
  }

  const currentBounds = targetWindow.getBounds();
  const targetDisplay =
    screen.getDisplayMatching(currentBounds) ||
    getNotificationAnchorDisplay() ||
    screen.getPrimaryDisplay();
  const safeMargin = getNotificationMargin(targetDisplay);
  const workArea = targetDisplay?.workArea || targetDisplay?.bounds || {
    x: 0,
    y: 0,
    width: currentBounds.width,
    height: currentBounds.height,
  };

  const requestedWidth = Math.round(Number(requestedSize?.width) || currentBounds.width);
  const requestedHeight = Math.round(Number(requestedSize?.height) || currentBounds.height);
  const maxWidth = Math.max(320, workArea.width - safeMargin);
  const maxHeight = Math.max(240, workArea.height - safeMargin);
  const nextWidth = Math.max(currentBounds.width, requestedWidth);
  const nextHeight = Math.max(currentBounds.height, requestedHeight);
  const nextBounds = {
    ...currentBounds,
    width: clamp(nextWidth, currentBounds.width, maxWidth),
    height: clamp(nextHeight, currentBounds.height, maxHeight),
  };

  targetWindow.setBounds(nextBounds);

  const placement = repositionNotificationWindow(targetWindow, targetDisplay);

  return {
    requestedSize,
    appliedBounds: targetWindow.getBounds(),
    placement,
  };
}

function getReportsDir() {
  const configuredReportsDir = (process.env.REPORTS_DIR || "").trim();
  const reportsDir = configuredReportsDir || path.join(app.getPath("documents"), "ADHD-Activity-Reports");
  fs.mkdirSync(reportsDir, { recursive: true });
  return reportsDir;
}

function formatDateDisplay(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return "Unknown";
  return d.toLocaleString();
}

function safeNum(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toTitleProfile(profile) {
  const p = String(profile || "live").toLowerCase();
  if (p === "baseline") return "Baseline Demo";
  if (p === "adhd") return "ADHD Demo";
  return "Live Data";
}

function shortDateLabel(input) {
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return String(input || "-");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}`;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(safeNum(seconds)));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${m}m`;
}

function renderBarList(items, labelKey, valueKey, suffix = "", limit = 6) {
  const clean = Array.isArray(items) ? items.slice(0, limit) : [];
  const max = Math.max(1, ...clean.map((item) => safeNum(item?.[valueKey])));
  return clean
    .map((item) => {
      const label = String(item?.[labelKey] ?? "Unknown");
      const value = safeNum(item?.[valueKey]);
      const pct = Math.max(0, Math.min(100, (value / max) * 100));
      return `
        <div class="bar-row">
          <div class="bar-label">${label}</div>
          <div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div>
          <div class="bar-value">${value}${suffix}</div>
        </div>
      `;
    })
    .join("");
}

function renderTrendDots(items) {
  const clean = Array.isArray(items) ? items.slice(-7) : [];
  if (clean.length === 0) {
    return "<div class=\"empty\">No trend data available</div>";
  }
  return clean
    .map((item) => {
      const date = shortDateLabel(item?.date || "-");
      const score = Math.round(safeNum(item?.focus_score));
      const hasData = item?.has_data !== false;
      if (!hasData) {
        return `<div class="trend-dot na"><span>${date}</span><strong>N/A</strong></div>`;
      }
      const tone = score >= 70 ? "good" : score >= 40 ? "ok" : "low";
      return `<div class="trend-dot ${tone}"><span>${date}</span><strong>${score}%</strong></div>`;
    })
    .join("");
}

function createSevenDayReportHtml(payload) {
  const generatedAt = payload?.generatedAt || new Date().toISOString();
  const profile = payload?.profile || "live";
  const profileLabel = toTitleProfile(profile);
  const adhd = payload?.adhdSummary || {};
  const dashboard = payload?.dashboardSummary || {};
  const focusByPeriod = payload?.focusByPeriod || [];
  const switchByHour = payload?.switchByHour || [];
  const distractingApps = payload?.distractingApps || [];
  const trend = payload?.trend || [];
  const trendWithData = (trend || []).filter((item) => item?.has_data !== false);

  const focusPct = Math.round(safeNum(dashboard.focus_percentage));
  const neutralPct = Math.round(safeNum(dashboard.neutral_percentage));
  const distractedPct = Math.round(safeNum(dashboard.distracted_percentage));
  const activeSeconds = safeNum(dashboard.total_active_seconds);

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>7-Day Focus Report</title>
    <style>
      @page {
        size: A4;
        margin: 8mm;
      }
      :root {
        --bg: #f5f7fb;
        --text: #0f172a;
        --muted: #5b6b84;
        --line: #d7deea;
        --panel: #ffffff;
        --brand: #2963d6;
        --brand-soft: #eaf0ff;
        --good: #1d9f57;
        --ok: #c2891d;
        --low: #d34b4b;
      }
      * { box-sizing: border-box; }
      body {
        font-family: "Segoe UI", "Inter", Arial, sans-serif;
        margin: 0;
        background: var(--bg);
        color: var(--text);
        padding: 0;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .sheet {
        width: 100%;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 10px;
        padding: 12px;
      }
      .hero {
        background: linear-gradient(135deg, #2459c6, #3d7bf2 70%, #7ba6ff);
        color: #fff;
        border-radius: 10px;
        padding: 10px 12px;
        margin-bottom: 8px;
      }
      .hero h1 { margin: 0; font-size: 16px; letter-spacing: 0.15px; }
      .hero-meta { margin-top: 2px; font-size: 10px; opacity: 0.95; }
      .badge-row {
        margin-top: 6px;
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
      }
      .badge {
        background: rgba(255,255,255,0.2);
        border: 1px solid rgba(255,255,255,0.35);
        color: #fff;
        border-radius: 999px;
        padding: 2px 8px;
        font-size: 10px;
      }
      .kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 8px;
        margin: 8px 0 10px;
      }
      .kpi {
        background: #f9fbff;
        border: 1px solid #dfe6f4;
        border-radius: 8px;
        padding: 8px;
      }
      .kpi .label { font-size: 10px; color: var(--muted); }
      .kpi .value { margin-top: 3px; font-size: 15px; font-weight: 700; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      .card {
        border: 1px solid var(--line);
        border-radius: 8px;
        padding: 8px;
        background: var(--panel);
      }
      .card-sub {
        margin: 2px 0 6px;
        color: var(--muted);
        font-size: 9px;
      }
      h2 {
        margin: 0 0 6px;
        font-size: 12px;
        color: #0b1b38;
      }
      .stat {
        display: flex;
        justify-content: space-between;
        margin: 4px 0;
        font-size: 10px;
      }
      .stat span { color: var(--muted); }
      .bar-row {
        display: grid;
        grid-template-columns: 128px 1fr 68px;
        align-items: center;
        gap: 6px;
        margin: 4px 0;
      }
      .bar-label {
        font-size: 10px;
        color: #2f3f5c;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .bar-track {
        height: 8px;
        border-radius: 99px;
        background: #e5ebf5;
        overflow: hidden;
      }
      .bar-fill {
        height: 8px;
        background: linear-gradient(90deg, #2963d6, #54a5ff);
      }
      .bar-value { text-align: right; font-size: 10px; color: #1f2d45; font-weight: 600; }
      .trend { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 8px; }
      .trend-dot {
        border: 1px solid var(--line);
        border-radius: 6px;
        padding: 5px 4px;
        text-align: center;
        background: #fbfcff;
      }
      .trend-dot span { display: block; color: var(--muted); font-size: 9px; margin-bottom: 2px; }
      .trend-dot strong { font-size: 11px; }
      .trend-dot.good strong { color: var(--good); }
      .trend-dot.ok strong { color: var(--ok); }
      .trend-dot.low strong { color: var(--low); }
      .trend-dot.na { background: #f3f6fb; }
      .trend-dot.na strong { color: #70809a; }
      .empty { color: #6b7c97; font-style: italic; font-size: 12px; }
      .viz-note {
        margin-top: 5px;
        color: var(--muted);
        font-size: 9px;
      }
      .foot {
        margin-top: 6px;
        color: #70809a;
        font-size: 9px;
        text-align: right;
        line-height: 1.2;
      }
    </style>
  </head>
  <body>
    <div class="sheet">
      <header class="hero">
        <h1>7-Day Focus Report</h1>
        <div class="hero-meta">Generated ${formatDateDisplay(generatedAt)} | Profile: ${profileLabel}</div>
        <div class="hero-meta">Window: ${trendWithData.length > 0 ? `${shortDateLabel(trendWithData[0]?.date)} - ${shortDateLabel(trendWithData[trendWithData.length - 1]?.date)}` : "No dated samples"}</div>
        <div class="badge-row">
          <span class="badge">Focus ${focusPct}%</span>
          <span class="badge">Neutral ${neutralPct}%</span>
          <span class="badge">Distracted ${distractedPct}%</span>
          <span class="badge">Active ${formatDuration(activeSeconds)}</span>
        </div>
      </header>

      <section class="kpi-grid">
        <div class="kpi"><div class="label">Hyperfocus Sessions</div><div class="value">${safeNum(adhd.hyperfocus_sessions)}</div></div>
        <div class="kpi"><div class="label">Longest Focus</div><div class="value">${safeNum(adhd.longest_focus_minutes)} min</div></div>
        <div class="kpi"><div class="label">Task Switches Today</div><div class="value">${safeNum(adhd.task_switches_today)}</div></div>
        <div class="kpi"><div class="label">Switches / Hour</div><div class="value">${safeNum(adhd.switches_per_hour)}</div></div>
      </section>

      <div class="grid">
        <section class="card">
          <h2>Dashboard Summary</h2>
          <div class="card-sub">Core totals and percentages for the selected dataset</div>
          <div class="stat"><span>Total Active Time</span><strong>${formatDuration(activeSeconds)}</strong></div>
          <div class="stat"><span>Focus</span><strong>${focusPct}%</strong></div>
          <div class="stat"><span>Neutral</span><strong>${neutralPct}%</strong></div>
          <div class="stat"><span>Distracted</span><strong>${distractedPct}%</strong></div>
          <div class="stat"><span>Top Distracting App</span><strong>${String(adhd.most_distracting_app || "N/A")}</strong></div>
        </section>
        <section class="card">
          <h2>Focus by Time of Day</h2>
          <div class="card-sub">Percentage focused in each period (Morning, Midday, Afternoon, Evening)</div>
          ${renderBarList(focusByPeriod, "label", "value", "%", 4) || "<div class=\"empty\">No period data available</div>"}
          <div class="viz-note">Bars are normalized for readability; values on the right are exact percentages.</div>
        </section>
      </div>

      <div class="grid">
        <section class="card">
          <h2>Hourly Task Switching</h2>
          <div class="card-sub">Number of app/window switches per hour</div>
          ${renderBarList(switchByHour, "label", "value", "", 12) || "<div class=\"empty\">No switching data available</div>"}
          <div class="viz-note">Higher values indicate more context switching.</div>
        </section>
        <section class="card">
          <h2>Top Distracting Apps</h2>
          <div class="card-sub">Interruption episodes attributed to each app</div>
          ${renderBarList(distractingApps, "label", "value", "", 6) || "<div class=\"empty\">No distraction data available</div>"}
          <div class="viz-note">Counts represent detected distraction episodes, not total usage time.</div>
        </section>
      </div>

      <section class="card">
        <h2>7-Day Focus Trend</h2>
        <div class="card-sub">Daily focus percentage over the latest seven dates</div>
        <div class="trend">${renderTrendDots(trend)}</div>
        <div class="viz-note">N/A means no recorded activity for that date.</div>
      </section>

      <div class="foot">Generated by ADHD Activity Monitor Electron client.</div>
    </div>
  </body>
</html>`;
}

const generatePast7DayReportHandler = async (_event, payload = {}) => {
  let pdfWindow = null;
  try {
    const reportsDir = getReportsDir();
    const html = createSevenDayReportHtml(payload);
    const ts = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+$/, "")
      .replace("T", "_");
    const fileName = `7-day-report-${ts}.pdf`;
    const filePath = path.join(reportsDir, fileName);

    pdfWindow = new BrowserWindow({
      width: 1240,
      height: 1754,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

    const pdfOptionAttempts = [
      {
        printBackground: true,
        landscape: false,
        pageSize: "A4",
        preferCSSPageSize: true,
      },
      {
        printBackground: true,
        landscape: false,
        pageSize: "A4",
        preferCSSPageSize: false,
      },
      {
        printBackground: true,
        landscape: false,
        pageSize: "Letter",
        preferCSSPageSize: false,
      },
      {
        printBackground: true,
        landscape: false,
        pageSize: { width: 210000, height: 297000 },
      },
      {
        printBackground: true,
        pageSize: "A4",
        preferCSSPageSize: true,
      },
    ];

    let pdfBuffer = null;
    let lastPrintError = null;
    for (const options of pdfOptionAttempts) {
      try {
        pdfBuffer = await pdfWindow.webContents.printToPDF(options);
        lastPrintError = null;
        break;
      } catch (printError) {
        lastPrintError = printError;
        logElectron("printToPDF attempt failed", {
          error: printError?.message,
          options,
        });
      }
    }

    if (!pdfBuffer) {
      throw lastPrintError || new Error("Failed to generate PDF output");
    }

    fs.writeFileSync(filePath, pdfBuffer);
    logElectron("7-day report generated", { filePath });

    return {
      success: true,
      data: {
        fileName,
        filePath,
        createdAt: new Date().toISOString(),
      },
    };
  } catch (error) {
    const rawMessage = error?.message || "Failed to generate report";
    const userMessage = String(rawMessage).toLowerCase().includes("margins")
      ? "PDF generation failed due to invalid page margins. Please try again."
      : rawMessage;
    logElectron("Failed to generate past 7-day report", {
      error: rawMessage,
      stack: error?.stack,
    });
    return {
      success: false,
      error: userMessage,
    };
  } finally {
    try {
      if (pdfWindow && !pdfWindow.isDestroyed()) {
        pdfWindow.destroy();
      }
    } catch { }
  }
};

ipcMain.handle("reports:generate-past-7-days", generatePast7DayReportHandler);
ipcMain.handle("reports:generate-weekly", generatePast7DayReportHandler);

ipcMain.handle("reports:list", async () => {
  try {
    const reportsDir = getReportsDir();
    const entries = fs
      .readdirSync(reportsDir)
      .filter((name) => name.toLowerCase().endsWith(".pdf"))
      .map((name) => {
        const filePath = path.join(reportsDir, name);
        const stats = fs.statSync(filePath);
        return {
          fileName: name,
          filePath,
          sizeBytes: stats.size,
          createdAt: stats.birthtime.toISOString(),
          updatedAt: stats.mtime.toISOString(),
        };
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return { success: true, data: entries };
  } catch (error) {
    logElectron("Failed to list reports", { error: error?.message });
    return { success: false, error: error?.message || "Failed to list reports" };
  }
});

function resolveReportPath(filePath) {
  if (!filePath || typeof filePath !== "string") {
    return { success: false, error: "Invalid report path" };
  }

  const reportsDirResolved = path.resolve(getReportsDir());
  const resolved = path.resolve(filePath);
  const isInsideReportsDir =
    resolved === reportsDirResolved ||
    resolved.startsWith(`${reportsDirResolved}${path.sep}`);

  if (!isInsideReportsDir) {
    return { success: false, error: "Access denied" };
  }

  if (!resolved.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "Invalid report file" };
  }

  return { success: true, resolved };
}

ipcMain.handle("reports:open", async (_event, filePath) => {
  try {
    const validated = resolveReportPath(filePath);
    if (!validated.success) {
      return validated;
    }
    const { resolved } = validated;
    if (!fs.existsSync(resolved)) {
      return { success: false, error: "Report file not found" };
    }

    const openResult = await shell.openPath(resolved);
    if (openResult) {
      return { success: false, error: openResult };
    }
    return { success: true };
  } catch (error) {
    logElectron("Failed to open report", { error: error?.message, filePath });
    return { success: false, error: error?.message || "Failed to open report" };
  }
});

ipcMain.handle("reports:show-location", async (_event, filePath) => {
  try {
    const validated = resolveReportPath(filePath);
    if (!validated.success) {
      return validated;
    }
    const { resolved } = validated;
    if (!fs.existsSync(resolved)) {
      return { success: false, error: "Report file not found" };
    }

    shell.showItemInFolder(resolved);
    return { success: true };
  } catch (error) {
    logElectron("Failed to show report location", { error: error?.message, filePath });
    return { success: false, error: error?.message || "Failed to show report location" };
  }
});

ipcMain.handle("reports:delete", async (_event, filePath) => {
  try {
    const validated = resolveReportPath(filePath);
    if (!validated.success) {
      return validated;
    }
    const { resolved } = validated;
    if (!fs.existsSync(resolved)) {
      return { success: false, error: "Report file not found" };
    }

    fs.unlinkSync(resolved);
    logElectron("Report deleted", { filePath: resolved });
    return { success: true };
  } catch (error) {
    logElectron("Failed to delete report", { error: error?.message, filePath });
    return { success: false, error: error?.message || "Failed to delete report" };
  }
});

// IPC handler for custom notification window
ipcMain.on("show-reminder-notification", (event, reminder) => {
  const apiPort = (process.env.API_PORT || "5001").trim() || "5001";
  const reminderPayload = {
    ...(reminder || {}),
    apiBaseUrl: `http://127.0.0.1:${apiPort}`,
  };

  logElectron("IPC show-reminder-notification received", {
    hasMainWindow: !!mainWindow,
    hasNotificationWindow: !!notificationWindow,
    reminderType: reminderPayload?.type,
    reminderId: reminderPayload?.id,
    duration: reminderPayload?.duration,
    mode: reminderPayload?.windowMode,
    apiBaseUrl: reminderPayload?.apiBaseUrl,
  });

  if (notificationWindow && !notificationWindow.isDestroyed()) {
    try {
      logElectron(
        "Closing previous notification window before creating new one",
      );
      notificationWindow.close();
    } catch { }
  }

  const mode = reminderPayload?.windowMode || "standard";
  const modeToBounds = {
    subtle: { width: 420, height: 280 },
    standard: { width: 420, height: 350 },
    assertive: { width: 470, height: 390 },
  };
  const bounds = modeToBounds[mode] || modeToBounds.standard;
  const targetDisplay = getNotificationAnchorDisplay();
  const safeMargin = getNotificationMargin(targetDisplay);
  const { x: rawX, y: rawY, workArea } = getNotificationPosition(
    targetDisplay,
    bounds,
    safeMargin,
  );
  const finalInset = Math.max(12, Math.round((Number(targetDisplay?.scaleFactor) || 1) * 12));
  const maxX = workArea.x + Math.max(0, workArea.width - bounds.width);
  const maxY = workArea.y + Math.max(0, workArea.height - bounds.height);
  const x = clamp(rawX - finalInset, workArea.x, maxX);
  const y = clamp(rawY - finalInset, workArea.y, maxY);

  logElectron("Creating notification window with computed placement", {
    reminderType: reminder?.type,
    reminderId: reminderPayload?.id,
    mode,
    bounds,
    displayId: targetDisplay?.id,
    displayBounds: targetDisplay?.bounds,
    scaleFactor: targetDisplay?.scaleFactor,
    safeMargin,
    finalInset,
    workArea,
    rawX,
    rawY,
    x,
    y,
    debugContext: getNotificationDebugContext(),
  });

  notificationWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  notificationWindow.setAlwaysOnTop(true, "screen-saver");
  notificationWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  notificationWindow.on("unresponsive", () => {
    logElectron("Notification window became unresponsive");
  });
  notificationWindow.webContents.on(
    "render-process-gone",
    (_event, details) => {
      logElectron("Notification renderer process gone", details);
    },
  );
  notificationWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      logElectron("Notification window failed to load", {
        errorCode,
        errorDescription,
      });
    },
  );
  notificationWindow.webContents.on(
    "console-message",
    (_event, level, message) => {
      logElectron("Notification console message", { level, message });
    },
  );
  notificationWindow.on("close", () => {
    logElectron("Notification window close event fired");
  });
  notificationWindow.on("closed", () => {
    logElectron("Notification window closed event fired");
    notificationWindow = null;
  });

  // Load notification HTML
  const notificationPath = path.join(__dirname, "notification.html");
  notificationWindow.loadFile(notificationPath);

  notificationWindow.once("ready-to-show", () => {
    const finalPlacement = repositionNotificationWindow(
      notificationWindow,
      targetDisplay,
    );

    logElectron("Notification window ready-to-show; sending reminder payload", {
      reminderType: reminder?.type,
      reminderId: reminderPayload?.id,
      finalPlacement,
      actualBounds: notificationWindow.getBounds(),
      actualContentBounds: notificationWindow.getContentBounds(),
      matchedDisplay: screen.getDisplayMatching(notificationWindow.getBounds()),
    });
    notificationWindow.webContents.send("set-reminder-data", reminderPayload);
    notificationWindow.show();

    setTimeout(() => {
      if (!notificationWindow || notificationWindow.isDestroyed()) {
        return;
      }

      logElectron("Notification window post-show bounds", {
        reminderType: reminderPayload?.type,
        reminderId: reminderPayload?.id,
        actualBounds: notificationWindow.getBounds(),
        actualContentBounds: notificationWindow.getContentBounds(),
        matchedDisplay: screen.getDisplayMatching(notificationWindow.getBounds()),
      });
    }, 150);
  });

  // Auto-close after duration (default 2 minutes)
  setTimeout(() => {
    if (notificationWindow && !notificationWindow.isDestroyed()) {
      try {
        logElectron("Notification auto-close timeout reached", {
          reminderType: reminderPayload?.type,
          reminderId: reminderPayload?.id,
        });
        notificationWindow.close();
      } catch { }
    }
  }, reminderPayload.duration || 120000);
});

ipcMain.on("close-notification", () => {
  logElectron("IPC close-notification received", {
    hasNotificationWindow: !!notificationWindow,
  });
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    try {
      notificationWindow.close();
    } catch { }
  }
});

ipcMain.on("resize-notification-window", (_event, dimensions) => {
  if (!notificationWindow || notificationWindow.isDestroyed()) {
    return;
  }

  try {
    const resizeResult = resizeNotificationWindowToFitContent(
      notificationWindow,
      dimensions,
    );
    logElectron("Notification window resized to fit content", resizeResult);
  } catch (err) {
    logElectron("Failed to resize notification window to fit content", {
      error: err?.message,
      dimensions,
    });
  }
});

ipcMain.on("notification-action", (event, action) => {
  logElectron("IPC notification-action received", {
    action,
    hasMainWindow: !!mainWindow,
    mainWindowDestroyed: mainWindow ? mainWindow.isDestroyed() : null,
    hasNotificationWindow: !!notificationWindow,
  });
  // Handle action buttons (break, pomodoro, etc.)
  if (
    mainWindow &&
    !mainWindow.isDestroyed() &&
    !mainWindow.webContents.isDestroyed()
  ) {
    try {
      logElectron("Forwarding reminder-action to main window", { action });
      mainWindow.webContents.send("reminder-action", action);
    } catch (err) {
      logElectron("Failed to forward reminder action to main window", {
        error: err?.message,
        stack: err?.stack,
      });
    }
  }
  if (notificationWindow && !notificationWindow.isDestroyed()) {
    try {
      logElectron("Hiding notification window after action", { action });
      notificationWindow.hide();
      setTimeout(() => {
        try {
          if (notificationWindow && !notificationWindow.isDestroyed()) {
            logElectron("Destroying notification window after action", {
              action,
            });
            notificationWindow.destroy();
          }
        } catch (err) {
          logElectron("Failed to destroy notification window after action", {
            action,
            error: err?.message,
          });
        }
      }, 75);
    } catch { }
  }
});

ipcMain.on("reminder-debug", (_event, payload) => {
  logElectron("IPC reminder-debug received", payload || {});
});

function startPythonBackend() {
  try {
    const configuredBackendCwd = (process.env.BACKEND_CWD || "").trim();
    const candidateBackendCwds = [
      configuredBackendCwd,
      path.join(process.resourcesPath || "", "backend"),
      path.join(__dirname, "..", "..", "activity-monitoring", "python_backend"),
    ].filter(Boolean);

    const backendCwd = candidateBackendCwds.find((candidate) => {
      try {
        return fs.existsSync(candidate) && fs.statSync(candidate).isDirectory();
      } catch {
        return false;
      }
    });

    if (!backendCwd) {
      throw new Error(`Unable to resolve backend working directory from: ${candidateBackendCwds.join(", ")}`);
    }

    const configuredPython = (process.env.PYTHON_EXECUTABLE || "").trim();
    const bundledPythonWindows = path.join(backendCwd, "python", "python.exe");
    const bundledPythonUnix = path.join(backendCwd, "python", "bin", "python3");
    const pythonCmd =
      configuredPython ||
      (process.platform === "win32" && fs.existsSync(bundledPythonWindows)
        ? bundledPythonWindows
        : process.platform !== "win32" && fs.existsSync(bundledPythonUnix)
          ? bundledPythonUnix
          : process.platform === "win32"
            ? "python"
            : "python3");

    const configuredApiPort = (process.env.API_PORT || "").trim();
    const apiPort = configuredApiPort || "5001";

    // Start full runtime (monitoring + API) via main entrypoint.
    pythonProcess = spawn(pythonCmd, ["-m", "src.main"], {
      cwd: backendCwd,
      env: {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        API_PORT: apiPort,
        MONITORING_PORT: apiPort,
        MONITORING_HOST: process.env.API_HOST || "127.0.0.1",
        MONITORING_DEBUG: process.env.API_DEBUG || "false",
      },
      stdio: "pipe",
    });

    pythonProcess.stdout.on("data", (d) =>
      process.stdout.write(`[Python] ${d}`),
    );
    pythonProcess.stderr.on("data", (d) =>
      process.stderr.write(`[Python Error] ${d}`),
    );
    pythonProcess.on("exit", (code, signal) => {
      logElectron("Python backend exited", { code, signal });
    });
    logElectron("Python backend start requested", {
      backendCwd,
      pythonCmd,
      apiPort,
      pid: pythonProcess?.pid,
    });
  } catch (e) {
    logElectron("Failed to start Python backend", {
      error: e?.message,
      stack: e?.stack,
    });
  }
}

function probeBackendHealth(port, timeoutMs = 900) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: "127.0.0.1",
        port,
        path: "/api/health",
        timeout: timeoutMs,
      },
      (res) => {
        // Consume response data to free socket.
        res.resume();
        resolve(res.statusCode && res.statusCode >= 200 && res.statusCode < 300);
      },
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitForBackendReady(maxWaitMs = 9000) {
  const configuredApiPort = (process.env.API_PORT || "").trim();
  const port = Number.parseInt(configuredApiPort || "5001", 10) || 5001;
  const startedAt = Date.now();

  while (Date.now() - startedAt < maxWaitMs) {
    // If Python process crashed, stop waiting and let UI load; retries in renderer still apply.
    if (!pythonProcess || pythonProcess.killed) {
      break;
    }

    const healthy = await probeBackendHealth(port);
    if (healthy) {
      logElectron("Backend health check passed before main window load", { port });
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 350));
  }

  logElectron("Backend health check timed out before main window load", { port, maxWaitMs });
}

function createWindow() {
  logElectron("Creating main window");
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const distIndex = path.join(__dirname, "frontend", "dist", "index.html");
  logElectron("Loading main window file", { distIndex });
  mainWindow.loadFile(distIndex);

  // Open DevTools if DEVTOOLS environment variable is set
  if (process.env.DEVTOOLS) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.webContents.on("render-process-gone", (_event, details) => {
    logElectron("Main renderer process gone", details);
    try {
      if (!isQuitting && (!mainWindow || mainWindow.isDestroyed())) {
        createWindow();
      }
    } catch (err) {
      logElectron("Failed to recover main window after renderer exit", {
        error: err?.message,
        stack: err?.stack,
      });
    }
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      logElectron("Main window failed to load", {
        errorCode,
        errorDescription,
      });
    },
  );

  mainWindow.webContents.on("console-message", (_event, level, message) => {
    logElectron("Main renderer console message", { level, message });
  });

  mainWindow.on("close", () => {
    // On Windows/Linux, clicking X should fully quit the app.
    if (process.platform !== "darwin") {
      isQuitting = true;
    }
    logElectron("Main window close event fired", {
      isQuitting,
      totalWindows: BrowserWindow.getAllWindows().length,
    });
  });

  mainWindow.on("closed", () => {
    logElectron("Main window closed event fired");
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  logElectron("App whenReady fired");
  startPythonBackend();
  await waitForBackendReady();
  createWindow();

  app.on("activate", () => {
    logElectron("App activate event fired", {
      windowCount: BrowserWindow.getAllWindows().length,
    });
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", (event) => {
  logElectron("App window-all-closed event fired", {
    platform: process.platform,
    isQuitting,
  });
  if (process.platform !== "darwin") {
    event.preventDefault();
    logElectron("Quitting app after all windows closed on non-macOS");
    app.quit();
  }
});

process.on("uncaughtException", (err) => {
  logElectron("Uncaught exception", {
    error: err?.message,
    stack: err?.stack,
  });
});

process.on("unhandledRejection", (reason) => {
  logElectron("Unhandled rejection", {
    reason: typeof reason === "string" ? reason : JSON.stringify(reason),
  });
});

app.on("before-quit", () => {
  logElectron("App before-quit event fired");
  isQuitting = true;
  try {
    if (pythonProcess && !pythonProcess.killed) {
      logElectron("Sending SIGINT to Python backend", {
        pid: pythonProcess.pid,
      });
      pythonProcess.kill("SIGINT");
    }
  } catch { }
});
