import React, { useEffect, useState } from "react";
import {
  X,
  Brain,
  Coffee,
  Droplet,
  Clock,
  Zap,
  Award,
  Activity,
} from "lucide-react";
import type { Reminder } from "../utils/adhdReminders";

interface ReminderNotificationProps {
  reminder: Reminder;
  onDismiss: () => void;
}

const ICON_MAP = {
  break: Coffee,
  hydration: Droplet,
  posture: Activity,
  "task-switch": Zap,
  hyperfocus: Brain,
  "time-check": Clock,
  reward: Award,
  movement: Activity,
  "focus-prep": Brain,
};

const PRIORITY_STYLES = {
  high: "border-red-500 bg-red-50",
  medium: "border-amber-500 bg-amber-50",
  low: "border-blue-500 bg-blue-50",
};

export function ReminderNotification({
  reminder,
  onDismiss,
}: ReminderNotificationProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);

  const Icon = ICON_MAP[reminder.type];
  const priorityStyle = PRIORITY_STYLES[reminder.priority];

  useEffect(() => {
    // Entrance animation
    setTimeout(() => setIsVisible(true), 10);

    // Auto-dismiss after duration
    const dismissTimer = setTimeout(() => {
      handleDismiss();
    }, reminder.duration || 7000);

    return () => clearTimeout(dismissTimer);
  }, [reminder]);

  // Track when notification was shown for response timing
  const [shownAt] = useState(Date.now());

  // Helper to log response to backend
  const logReminderResponse = async (responseType: string) => {
    try {
      const normalizedResponse = String(responseType || "").toLowerCase();
      const responseScore =
        normalizedResponse === "dismissed" ||
        normalizedResponse === "ignored" ||
        normalizedResponse === "dismissed-close"
          ? -0.3
          : 0.3;

      await fetch("http://127.0.0.1:5001/api/reminder/response", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reminder_id: reminder.id,
          reminder_type: reminder.type,
          reminder_title: reminder.title,
          reminder_message: reminder.message,
          priority: reminder.priority,
          response_type: responseType,
          response_score: responseScore,
          response_time_seconds: Math.round((Date.now() - shownAt) / 1000),
          current_app: reminder.currentApp || null,
          current_activity: reminder.currentActivity || null,
        }),
      });
    } catch (err) {
      // Optionally handle/log error
      // console.error("Failed to log reminder response", err);
    }
  };

  const handleDismiss = async () => {
    setIsLeaving(true);
    await logReminderResponse("dismissed");
    setTimeout(() => {
      onDismiss();
    }, 300);
  };

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 w-96 border-l-4 rounded-lg shadow-2xl transition-all duration-300 ease-out ${priorityStyle} ${
        isVisible && !isLeaving
          ? "translate-x-0 opacity-100"
          : "translate-x-full opacity-0"
      }`}
      role="alert"
      aria-live="polite"
    >
      <div className="relative p-4 bg-white rounded-r-lg">
        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Dismiss notification"
        >
          <X size={18} />
        </button>

        {/* Content */}
        <div className="flex items-start gap-3 pr-6">
          {/* Icon */}
          <div
            className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
              reminder.priority === "high"
                ? "bg-red-100 text-red-600"
                : reminder.priority === "medium"
                  ? "bg-amber-100 text-amber-600"
                  : "bg-blue-100 text-blue-600"
            }`}
          >
            <Icon size={20} />
          </div>

          {/* Text */}
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 mb-1">
              {reminder.title}
            </h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              {reminder.message}
            </p>
          </div>
        </div>

        {/* Action buttons (optional) */}
        <div className="mt-3 flex gap-2">
          <button
            onClick={async () => {
              await logReminderResponse("acknowledged");
              handleDismiss();
            }}
            className="text-xs px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors"
          >
            Got it!
          </button>
          {reminder.type === "break" && (
            <button
              onClick={async () => {
                // TODO: Start a 5-min timer
                await logReminderResponse("break_started");
                handleDismiss();
              }}
              className="text-xs px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-medium transition-colors"
            >
              Start 5-min break
            </button>
          )}
          {reminder.type === "focus-prep" && (
            <button
              onClick={async () => {
                // TODO: Start Pomodoro timer
                await logReminderResponse("pomodoro_started");
                handleDismiss();
              }}
              className="text-xs px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
            >
              Start Pomodoro
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-slate-200 rounded-b-lg overflow-hidden">
        <div
          className={`h-full ${
            reminder.priority === "high"
              ? "bg-red-500"
              : reminder.priority === "medium"
                ? "bg-amber-500"
                : "bg-blue-500"
          }`}
          style={{
            animation: `shrink ${reminder.duration || 7000}ms linear`,
          }}
        />
      </div>

      <style>{`
        @keyframes shrink {
          from {
            width: 100%;
          }
          to {
            width: 0%;
          }
        }
      `}</style>
    </div>
  );
}
