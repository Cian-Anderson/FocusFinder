import React, { useEffect, useState } from "react";
import { MonitoringDashboard } from "./components/MonitoringDashboard";
import BanditPipeline from "./components/BanditPipeline";
import { ADHDMetrics } from "./components/ADHDMetrics";
import { ReportsCenter } from "./components/ReportsCenter";
import { ReminderSettings } from "./components/ReminderSettings";
import { useReminderManager } from "./hooks/useReminderManager";
import { useTheme } from "./theme/ThemeContext";
import { BarChart3, Brain, FileText, Settings, Sun, Moon } from "lucide-react";

type Tab = "overview" | "adhd" | "reports" | "ml" | "settings";

export default function App() {
  const { theme, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [dataProfile, setDataProfile] = useState<"live" | "baseline" | "adhd">(() => {
    const saved = localStorage.getItem("dataProfile");
    return saved === "baseline" || saved === "adhd" || saved === "live" ? saved : "live";
  });

  // ADHD Reminder System with configurable settings
  const [reminderSettings, setReminderSettings] = useState({
    enabled: true,
    minInterval: 1 * 60 * 1000, // 1 minute
    maxInterval: 1 * 60 * 1000, // 1 minute
    ttsEnabled: true, // Text-to-speech enabled by default
  });

  // Initialize reminder manager (system notifications handled internally)
  useReminderManager(reminderSettings);

  useEffect(() => {
    localStorage.setItem("dataProfile", dataProfile);
  }, [dataProfile]);

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Tab Navigation */}
      <nav className="app-nav px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex gap-3">
          <button
            onClick={() => setActiveTab("overview")}
            className={`app-nav__btn app-nav__btn--overview${activeTab === "overview" ? " active" : ""}`}
          >
            <BarChart3 size={20} />
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab("adhd")}
            className={`app-nav__btn app-nav__btn--adhd${activeTab === "adhd" ? " active" : ""}`}
          >
            <Brain size={20} />
            <span>ADHD Metrics</span>
          </button>
          {/* Optional ML tab button; uncomment if you want it in nav */}
          {/*
          <button
            onClick={() => setActiveTab("ml")}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-lg font-semibold transition-all ${
              activeTab === "ml"
                ? "bg-indigo-600 text-white shadow-lg"
                : "text-slate-300 hover:bg-slate-800 hover:text-white"
            }`}
          >
            <span>ML / Bandit</span>
          </button>
          */}
          <button
            onClick={() => setActiveTab("reports")}
            className={`app-nav__btn app-nav__btn--reports${activeTab === "reports" ? " active" : ""}`}
          >
            <FileText size={20} />
            <span>Reports</span>
          </button>
          <button
            onClick={() => setActiveTab("settings")}
            className={`app-nav__btn app-nav__btn--settings${activeTab === "settings" ? " active" : ""}`}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          </div>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </nav>

      {/* Content */}
      <main id="main" role="main">
        {activeTab === "ml" && (
          <div className="p-4">
            <h2 className="text-slate-100 mb-4">ML / Bandit Pipeline</h2>
            <BanditPipeline />
          </div>
        )}
        {activeTab === "overview" && <MonitoringDashboard profile={dataProfile} />}
        {activeTab === "adhd" && <ADHDMetrics profile={dataProfile} />}
        {activeTab === "reports" && <ReportsCenter profile={dataProfile} />}
        {activeTab === "settings" && (
          <ReminderSettings
            enabled={reminderSettings.enabled}
            minInterval={reminderSettings.minInterval}
            maxInterval={reminderSettings.maxInterval}
            ttsEnabled={reminderSettings.ttsEnabled}
            dataProfile={dataProfile}
            onUpdate={setReminderSettings}
            onDataProfileChange={setDataProfile}
          />
        )}
      </main>
    </div>
  );
}
