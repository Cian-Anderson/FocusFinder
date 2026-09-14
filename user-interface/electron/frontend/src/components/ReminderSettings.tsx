import React, { useEffect, useState } from "react";
import { Bell, Clock, Database, Settings, Volume2 } from "lucide-react";

interface ReminderSettingsProps {
  enabled: boolean;
  minInterval: number;
  maxInterval: number;
  ttsEnabled?: boolean;
  dataProfile: "live" | "baseline" | "adhd";
  onUpdate: (settings: {
    enabled: boolean;
    minInterval: number;
    maxInterval: number;
    ttsEnabled?: boolean;
  }) => void;
  onDataProfileChange: (profile: "live" | "baseline" | "adhd") => void;
}

export function ReminderSettings({
  enabled,
  minInterval,
  maxInterval,
  ttsEnabled = true,
  dataProfile,
  onUpdate,
  onDataProfileChange,
}: ReminderSettingsProps) {
  const [localEnabled, setLocalEnabled] = useState(enabled);
  const [localMin, setLocalMin] = useState(Math.floor(minInterval / 60000)); // Convert to minutes
  const [localMax, setLocalMax] = useState(Math.floor(maxInterval / 60000));
  const [localTtsEnabled, setLocalTtsEnabled] = useState(ttsEnabled);

  const timingSummary =
    localMin === localMax
      ? `about every ${localMin} min`
      : `between ${localMin} and ${localMax} min`;

  const sectionCardStyle: React.CSSProperties = {
    padding: "28px 32px",
  };

  const sectionStackStyle: React.CSSProperties = {
    gap: "24px",
  };

  const cardGridStyle: React.CSSProperties = {
    gap: "24px",
  };

  const headingRowStyle: React.CSSProperties = {
    gap: "24px",
    paddingRight: "4px",
  };

  useEffect(() => {
    const nextMin = Math.max(1, Math.floor(minInterval / 60000));
    const nextMax = Math.max(nextMin, Math.floor(maxInterval / 60000));
    setLocalEnabled(enabled);
    setLocalMin(nextMin);
    setLocalMax(nextMax);
    setLocalTtsEnabled(ttsEnabled);
  }, [enabled, minInterval, maxInterval, ttsEnabled]);

  const handleSave = () => {
    const safeMin = Math.max(1, localMin);
    const safeMax = Math.max(safeMin, localMax);
    onUpdate({
      enabled: localEnabled,
      minInterval: safeMin * 60000,
      maxInterval: safeMax * 60000,
      ttsEnabled: localTtsEnabled,
    });
  };

  return (
    <div
      className="h-full overflow-auto px-6 pt-6"
      style={{ paddingBottom: "48px", paddingLeft: "32px", paddingRight: "32px" }}
    >
      <div className="mx-auto" style={{ maxWidth: 1025 }}>
        <div className="insights-hero px-6 py-8 mb-6" style={{ paddingLeft: "32px", paddingRight: "32px" }}>
          <div className="flex items-center gap-3 mb-2">
            <Settings size={32} />
            <h1 className="text-3xl font-bold">Settings</h1>
          </div>
          <p className="insights-hero__subtitle">
            Configure reminder pop-ups, spoken alerts, timing, and the active demo profile.
          </p>
        </div>

        <div role="region" aria-label="Settings" className="space-y-5" style={sectionStackStyle}>
          <div className="grid lg:grid-cols-2" style={cardGridStyle}>
            <div className="settings-panel bg-white rounded-lg shadow-lg space-y-4 border border-slate-200" style={sectionCardStyle}>
              <div className="flex items-start justify-between" style={headingRowStyle}>
                <div>
                  <div className="flex items-center gap-2 mb-1 text-slate-900">
                    <Bell size={18} />
                    <h2 className="text-lg font-semibold">Reminder Pop-Ups</h2>
                  </div>
                  <p className="text-sm text-slate-600">
                    Turns reminder windows on or off.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`settings-toggle__state ${localEnabled ? "settings-toggle__state--on" : "settings-toggle__state--off"}`}>
                    {localEnabled ? "On" : "Off"}
                  </span>
                  <button
                    type="button"
                    aria-pressed={localEnabled}
                    aria-label={`Reminder pop-ups ${localEnabled ? "enabled" : "disabled"}`}
                    onClick={() => setLocalEnabled(!localEnabled)}
                    className={`toggle-switch settings-toggle relative rounded-full ${
                      localEnabled ? "toggle-switch--on" : ""
                    }`}
                  >
                    <div
                      className={`toggle-switch__thumb settings-toggle__thumb absolute top-1 left-1 bg-white rounded-full ${
                        localEnabled ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/25 px-4 py-3 text-sm text-slate-300">
                {localEnabled
                  ? `Reminders are active. The app currently schedules them ${timingSummary}.`
                  : "Reminders are currently off. You can still adjust timing and voice now, and those settings will apply when you turn pop-ups back on."}
              </div>
            </div>

            <div className="settings-panel bg-white rounded-lg shadow-lg space-y-4 border border-slate-200" style={sectionCardStyle}>
              <div className="flex items-start justify-between" style={headingRowStyle}>
                <div>
                  <div className="flex items-center gap-2 mb-1 text-slate-900">
                    <Volume2 size={18} />
                    <h2 className="text-lg font-semibold">Spoken Reminders</h2>
                  </div>
                  <p className="text-sm text-slate-600">
                    Reads the reminder title and message out loud when a pop-up appears.
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`settings-toggle__state ${localTtsEnabled ? "settings-toggle__state--on" : "settings-toggle__state--off"}`}>
                    {localTtsEnabled ? "On" : "Off"}
                  </span>
                  <button
                    type="button"
                    aria-pressed={localTtsEnabled}
                    aria-label={`Spoken reminders ${localTtsEnabled ? "enabled" : "disabled"}`}
                    onClick={() => setLocalTtsEnabled(!localTtsEnabled)}
                    className={`toggle-switch settings-toggle relative rounded-full ${
                      localTtsEnabled ? "toggle-switch--on" : ""
                    }`}
                  >
                    <div
                      className={`toggle-switch__thumb settings-toggle__thumb absolute top-1 left-1 bg-white rounded-full ${
                        localTtsEnabled ? "translate-x-6" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-700/60 bg-slate-900/25 px-4 py-3 text-sm text-slate-300">
                {localTtsEnabled
                  ? "Voice playback is enabled. It only speaks when reminder pop-ups are also turned on."
                  : "Voice playback is off. Reminder pop-ups can still appear visually without speech."}
              </div>
            </div>
          </div>

          <div className="settings-panel bg-white rounded-lg shadow-lg space-y-5 border border-slate-200" style={sectionCardStyle}>
            <div>
              <div className="flex items-center gap-2 mb-1 text-slate-900">
                <Clock size={18} />
                <h2 className="text-lg font-semibold">Reminder Timing</h2>
              </div>
              <p className="text-sm text-slate-600">
                Reminders are not sent on a fixed schedule. After each reminder, the app picks the next one at random within the time window below.
              </p>
            </div>

            <div className="rounded-xl border border-slate-700/60 bg-slate-900/25 px-4 py-3 text-sm text-slate-300">
              Current reminder window: <span className="font-semibold text-slate-100">{timingSummary}</span>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-900 flex items-center gap-2 mb-2">
                <Clock size={16} />
                Minimum delay
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="30"
                  step="1"
                  value={localMin}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setLocalMin(value);
                    if (value > localMax) {
                      setLocalMax(value);
                    }
                  }}
                  className="range-slider flex-1"
                />
                <span className="text-sm font-medium text-slate-700 w-16">
                  {localMin} min
                </span>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-900 flex items-center gap-2 mb-2">
                <Clock size={16} />
                Maximum delay
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max="90"
                  step="1"
                  value={localMax}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setLocalMax(value);
                    if (value < localMin) {
                      setLocalMin(value);
                    }
                  }}
                  className="range-slider flex-1"
                />
                <span className="text-sm font-medium text-slate-700 w-16">
                  {localMax} min
                </span>
              </div>
            </div>
          </div>

          <div className="settings-panel bg-white rounded-lg shadow-lg space-y-4 border border-slate-200" style={sectionCardStyle}>
            <div>
              <div className="flex items-center gap-2 mb-1 text-slate-900">
                <Database size={18} />
                <h2 className="text-lg font-semibold">Active Profile</h2>
              </div>
              <p className="text-sm text-slate-600">
                Choose whether the monitor uses your live data or one of the built-in demo profiles.
              </p>
            </div>

            <div className="profile-segments grid grid-cols-1 sm:grid-cols-3 gap-2">
              <button
                onClick={() => onDataProfileChange("live")}
                className={`segment-button px-3 py-2 rounded-lg text-sm font-medium border ${
                  dataProfile === "live"
                    ? "segment-button--active"
                    : ""
                }`}
              >
                Live Data
              </button>
              <button
                onClick={() => onDataProfileChange("baseline")}
                className={`segment-button px-3 py-2 rounded-lg text-sm font-medium border ${
                  dataProfile === "baseline"
                    ? "segment-button--active"
                    : ""
                }`}
              >
                Baseline Demo
              </button>
              <button
                onClick={() => onDataProfileChange("adhd")}
                className={`segment-button px-3 py-2 rounded-lg text-sm font-medium border ${
                  dataProfile === "adhd"
                    ? "segment-button--active"
                    : ""
                }`}
              >
                ADHD Demo
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Current profile: {dataProfile === "live" ? "Live Data" : dataProfile === "baseline" ? "Baseline Demo" : "ADHD Demo"}
            </p>
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              className="report-action report-action--primary"
            >
              Save Changes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
