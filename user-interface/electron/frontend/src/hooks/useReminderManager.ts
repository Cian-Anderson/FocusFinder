import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  ADHD_REMINDERS,
  getRandomReminder,
  getContextualReminder,
  getRemindersForState,
  detectReminderState,
  getRemindersByType,
  type Reminder,
  type ReminderState,
} from "../utils/adhdReminders";
import { useDashboardData, type RecentActivity } from "./useDashboardData";

// Extend Window interface to include electron API
declare global {
  interface Window {
    electron?: {
      showReminderNotification: (reminder: Reminder) => void;
      closeNotification: () => void;
      sendNotificationAction: (action: string) => void;
      onReminderAction: (callback: (action: string) => void) => void;
      debugReminder?: (payload: unknown) => void;
    };
  }
}

interface ReminderManagerConfig {
  enabled: boolean;
  minInterval: number; // Minimum time between reminders (ms)
  maxInterval: number; // Maximum time between reminders (ms)
  useContextual: boolean; // Use activity data for contextual reminders
  ttsEnabled?: boolean; // Enable text-to-speech for reminders
}

interface BanditActionConfig {
  suppress?: boolean;
  window_mode?: "subtle" | "standard" | "assertive";
  priority_override?: "low" | "medium" | "high";
  duration_ms?: number;
  interval_min_ms?: number;
  interval_max_ms?: number;
  preferred_types?: Reminder["type"][];
}

interface RewardSession {
  eventId: number;
  startedAt: number;
  reminderId?: string;
  reminderState?: ReminderState;
  dismissed: boolean;
  initialReward: number;
  initialSubmitted: boolean;
  oneMinuteEvaluated: boolean;
  fiveMinuteEvaluated: boolean;
  productiveOutcomeResolved: boolean;
  lastSubmittedReward?: number;
}

interface PromptScoreEntry {
  score: number;
  count: number;
}

const PROMPT_SCORE_STORAGE_KEY = "promptScoreTableV2";

const DEFAULT_CONFIG: ReminderManagerConfig = {
  enabled: true,
  minInterval: 15 * 60 * 1000, // 15 minutes
  maxInterval: 45 * 60 * 1000, // 45 minutes
  useContextual: false, // Set to true once ML is integrated
  ttsEnabled: true, // Enable TTS by default
};

const INITIAL_EVENT_MAGNITUDE = 0.3;
const OUTCOME_EVENT_MAGNITUDE = 0.5;

export function useReminderManager(
  config: Partial<ReminderManagerConfig> = {},
) {
  const traceReminder = useCallback(
    (message: string, payload: Record<string, unknown> = {}) => {
      const data = {
        ts: new Date().toISOString(),
        source: "renderer-useReminderManager",
        message,
        payload,
      };
      console.log("[ReminderDebug]", data);
      try {
        window.electron?.debugReminder?.(data);
      } catch (error) {
        console.error("Failed to send renderer reminder debug payload:", error);
      }
    },
    [],
  );

  const fullConfig = useMemo(
    () => ({ ...DEFAULT_CONFIG, ...config }),
    [
      config.enabled,
      config.minInterval,
      config.maxInterval,
      config.useContextual,
      config.ttsEnabled,
    ],
  );
  const [currentReminder, setCurrentReminder] = useState<Reminder | null>(null);
  const [nextReminderTime, setNextReminderTime] = useState<number | null>(null);
  const [lastEventId, setLastEventId] = useState<number | null>(null);
  const [lastReminderStart, setLastReminderStart] = useState<number | null>(
    null,
  );
  const [lastReminderShownAt, setLastReminderShownAt] = useState<number | null>(
    null,
  );
  const showInFlightRef = useRef(false);
  const rewardSessionsRef = useRef<RewardSession[]>([]);
  const promptScoresRef = useRef<Record<string, PromptScoreEntry>>({});
  const dashboard = useDashboardData(60000); // poll dashboard data every minute

  const randomBetween = useCallback((min: number, max: number) => {
    if (max <= min) return min;
    return Math.floor(Math.random() * (max - min) + min);
  }, []);

  // Derive contextual signals
  const deriveContext = useCallback(() => {
    const recent: RecentActivity[] = dashboard.recent || [];
    const latest = recent[0];
    const currentTask = latest
      ? `${latest.app_name || ""} ${latest.window_title || ""}`.trim()
      : undefined;
    const idleSeconds =
      typeof latest?.idle_time === "number"
        ? Math.max(0, Math.round(latest.idle_time))
        : undefined;

    // Approximate swap frequency: count app_name changes in the recent list
    let taskSwitches = 0;
    for (let i = 1; i < recent.length; i++) {
      const prev = recent[i - 1];
      const curr = recent[i];
      if (prev?.app_name && curr?.app_name && prev.app_name !== curr.app_name)
        taskSwitches++;
    }

    // Time of day bucketing
    const hour = new Date().getHours();
    const timeOfDay: "morning" | "midday" | "afternoon" | "evening" =
      hour < 10
        ? "morning"
        : hour < 14
          ? "midday"
          : hour < 18
            ? "afternoon"
            : "evening";

    return { currentTask, taskSwitches, idleSeconds, timeOfDay } as const;
  }, [dashboard.recent]);

  // Calculate random interval between min and max
  const getRandomInterval = useCallback(() => {
    const { minInterval, maxInterval } = fullConfig;
    return Math.floor(
      Math.random() * (maxInterval - minInterval) + minInterval,
    );
  }, [fullConfig.minInterval, fullConfig.maxInterval]);

  const getEffectiveRange = useCallback(
    (actionConfig?: BanditActionConfig) => {
      const userMin = fullConfig.minInterval;
      const userMax = Math.max(fullConfig.maxInterval, userMin);

      const candidateMin = actionConfig?.interval_min_ms ?? userMin;
      const candidateMax = actionConfig?.interval_max_ms ?? userMax;

      const boundedMin = Math.min(Math.max(candidateMin, userMin), userMax);
      const boundedMax = Math.min(Math.max(candidateMax, userMin), userMax);

      return {
        min: Math.min(boundedMin, boundedMax),
        max: Math.max(boundedMin, boundedMax),
      };
    },
    [fullConfig.minInterval, fullConfig.maxInterval],
  );

  const isProductive = useCallback((classification?: string | null) => {
    const cls = (classification || "neutral").toLowerCase();
    return cls === "focused" || cls === "productive";
  }, []);

  const getLatestClassification = useCallback(() => {
    const latest = (dashboard.recent || [])[0];
    return latest?.classification || "neutral";
  }, [dashboard.recent]);

  const clampReward = useCallback((value: number) => {
    return Math.max(-1, Math.min(1, value));
  }, []);

  const persistPromptScores = useCallback(() => {
    try {
      localStorage.setItem(
        PROMPT_SCORE_STORAGE_KEY,
        JSON.stringify(promptScoresRef.current),
      );
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PROMPT_SCORE_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Record<string, PromptScoreEntry>;
      if (parsed && typeof parsed === "object") {
        promptScoresRef.current = parsed;
      }
    } catch {
      // non-fatal
    }
  }, []);

  const updatePromptScore = useCallback(
    (
      reminderId: string | undefined,
      reminderState: ReminderState | undefined,
      reward: number,
    ) => {
      if (!reminderId) return;
      const scopedKey = `${reminderState || "normal_focus"}::${reminderId}`;
      const current = promptScoresRef.current[scopedKey] || {
        score: 0,
        count: 0,
      };
      const nextCount = current.count + 1;
      const alpha = Math.min(0.35, 1 / nextCount);
      const nextScore = current.score + alpha * (reward - current.score);
      promptScoresRef.current[scopedKey] = {
        score: nextScore,
        count: nextCount,
      };
      persistPromptScores();
    },
    [persistPromptScores],
  );

  const pickWeightedByPromptRank = useCallback(
    (options: Reminder[], reminderState: ReminderState): Reminder => {
      const unique = options.filter(
        (option, index, arr) =>
          arr.findIndex((r) => r.id === option.id) === index,
      );
      if (unique.length === 0) return getRandomReminder();

      const scored = unique
        .map((reminder) => ({
          reminder,
          score:
            promptScoresRef.current[`${reminderState}::${reminder.id}`]
              ?.score ?? 0,
        }))
        .sort((a, b) => b.score - a.score || Math.random() - 0.5);

      const n = scored.length;
      const weights = scored.map((entry, idx) => {
        const rankWeight = n - idx;
        const scoreWeight = Math.max(0.1, entry.score + 1.1);
        return rankWeight * scoreWeight;
      });
      const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);

      let threshold = Math.random() * totalWeight;
      for (let i = 0; i < scored.length; i++) {
        threshold -= weights[i];
        if (threshold <= 0) return scored[i].reminder;
      }

      return scored[0].reminder;
    },
    [],
  );

  const submitReward = useCallback(
    async (eventId: number, reward: number, note: string) => {
      try {
        await fetch("http://127.0.0.1:5001/api/ml/bandit/reward", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event_id: eventId,
            reward: clampReward(reward),
            note,
          }),
        });
      } catch {
        // non-fatal: next evaluation tick can retry with newer reward state
      }
    },
    [clampReward],
  );

  const pushRewardSession = useCallback(
    (
      eventId: number,
      startedAt: number,
      reminderId?: string,
      reminderState?: ReminderState,
    ) => {
      rewardSessionsRef.current.push({
        eventId,
        startedAt,
        reminderId,
        reminderState,
        dismissed: false,
        initialReward: 0,
        initialSubmitted: false,
        oneMinuteEvaluated: false,
        fiveMinuteEvaluated: false,
        productiveOutcomeResolved: false,
      });
      if (rewardSessionsRef.current.length > 20) {
        rewardSessionsRef.current = rewardSessionsRef.current.slice(-20);
      }
    },
    [],
  );

  // Show a reminder
  const showReminder = useCallback(async () => {
    if (!fullConfig.enabled) return;
    if (showInFlightRef.current) return;
    showInFlightRef.current = true;

    const ctx = deriveContext();
    const shouldUseContext =
      fullConfig.useContextual ||
      Boolean(dashboard.recent && dashboard.recent.length);
    let reminder: Reminder = shouldUseContext
      ? getContextualReminder(ctx)
      : getRandomReminder();
    const currentCategory =
      (dashboard.recent && dashboard.recent[0]?.classification) || "neutral";
    const reminderState = detectReminderState({
      ...ctx,
      currentActivity: currentCategory,
    });
    let actionConfig: BanditActionConfig | undefined;
    let eventIdFromChoose: number | null = null;

    // Call backend bandit chooser with derived context
    try {
      const payload = {
        current_app: ctx.currentTask || "Unknown",
        current_category: currentCategory,
        time_since_last_reminder: lastReminderStart
          ? (Date.now() - lastReminderStart) / 60000
          : 0,
        focus_streak_minutes: 0,
        idle_minutes_last_30: Math.max(
          0,
          Math.round((ctx.idleSeconds || 0) / 60),
        ),
        switches_last_10_min: ctx.taskSwitches || 0,
        user_is_adhd: true,
        time_of_day_bucket: ctx.timeOfDay,
        reminder_state: reminderState,
      };

      // Hard timeout: reminder UX must never block on backend latency/outage.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const res = await fetch("http://127.0.0.1:5001/api/ml/bandit/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      const json = await res.json();
      if (json?.success && json?.data?.event_id) {
        setLastEventId(json.data.event_id);
        eventIdFromChoose = Number(json.data.event_id);
      }

      actionConfig = json?.data?.action_config as
        | BanditActionConfig
        | undefined;

      if (actionConfig?.suppress) {
        const now = Date.now();
        const range = getEffectiveRange(actionConfig);
        setLastReminderStart(now);
        setLastReminderShownAt(now);
        if (eventIdFromChoose !== null) {
          pushRewardSession(eventIdFromChoose, now, undefined, reminderState);
        }
        setNextReminderTime(now + randomBetween(range.min, range.max));
        showInFlightRef.current = false;
        return;
      }

      const preferredTypes = actionConfig?.preferred_types || [];
      if (preferredTypes.length > 0) {
        const options = preferredTypes.flatMap((t) => getRemindersByType(t));
        const stateOptions = getRemindersForState(reminderState);
        const optionsByState = options.filter((candidate) =>
          stateOptions.some((stateReminder) => stateReminder.id === candidate.id),
        );
        if (options.length > 0) {
          reminder = pickWeightedByPromptRank(
            optionsByState.length > 0 ? optionsByState : options,
            reminderState,
          );
        }
      } else {
        const fallbackPool = shouldUseContext
          ? getRemindersForState(reminderState)
          : ADHD_REMINDERS;
        reminder = pickWeightedByPromptRank([reminder, ...fallbackPool], reminderState);
      }

      if (actionConfig?.priority_override) {
        reminder = { ...reminder, priority: actionConfig.priority_override };
      }
      if (
        typeof actionConfig?.duration_ms === "number" &&
        actionConfig.duration_ms > 0
      ) {
        reminder = { ...reminder, duration: actionConfig.duration_ms };
      }
      if (actionConfig?.window_mode) {
        reminder = { ...reminder, windowMode: actionConfig.window_mode };
      }
    } catch (e) {
      // non-fatal for demo; continue with local reminder
    }

    // Add TTS flag to reminder
    reminder = { ...reminder, enableTTS: fullConfig.ttsEnabled };

    // Show custom notification window
    if (window.electron?.showReminderNotification) {
      window.electron.showReminderNotification(reminder);
    }

    setCurrentReminder(reminder);
    const shownAt = Date.now();
    setLastReminderStart(shownAt);
    setLastReminderShownAt(shownAt);
    if (eventIdFromChoose !== null) {
      pushRewardSession(eventIdFromChoose, shownAt, reminder.id, reminderState);
    }

    // Auto-dismiss after duration (default 2 minutes)
    setTimeout(() => {
      setCurrentReminder(null);
    }, reminder.duration || 120000);

    // Schedule next reminder
    const range = getEffectiveRange(actionConfig);
    const nextInterval = randomBetween(range.min, range.max);
    setNextReminderTime(Date.now() + nextInterval);
    showInFlightRef.current = false;
  }, [
    fullConfig,
    deriveContext,
    dashboard.recent,
    lastReminderStart,
    randomBetween,
    getEffectiveRange,
    pickWeightedByPromptRank,
    pushRewardSession,
  ]);

  // Dismiss current reminder
  const dismissReminder = useCallback(() => {
    setCurrentReminder(null);
  }, []);

  // Main timer loop
  useEffect(() => {
    if (!fullConfig.enabled) return;

    const checkTimer = setInterval(() => {
      const now = Date.now();
      if (currentReminder) return;

      // Primary scheduler path
      if (nextReminderTime !== null && now >= nextReminderTime) {
        showReminder();
        return;
      }

      // Watchdog path: if scheduler stalls, force a reminder after max interval + grace.
      if (lastReminderShownAt !== null) {
        const hardDeadline =
          lastReminderShownAt + fullConfig.maxInterval + 15000;
        if (now >= hardDeadline) {
          showReminder();
        }
      }
    }, 5000); // Check every 5 seconds

    // Initialize first reminder schedule
    if (nextReminderTime === null) {
      const initialDelay = Math.floor(Math.random() * 10000) + 5000; // 5-15 seconds
      setTimeout(() => {
        setNextReminderTime(Date.now() + getRandomInterval());
      }, initialDelay);
    }

    return () => clearInterval(checkTimer);
  }, [
    fullConfig.enabled,
    fullConfig.maxInterval,
    nextReminderTime,
    currentReminder,
    showReminder,
    getRandomInterval,
    lastReminderShownAt,
  ]);

  // Re-align schedule when user settings change while reminders are enabled.
  useEffect(() => {
    if (!fullConfig.enabled) return;
    setNextReminderTime(
      Date.now() +
      randomBetween(
        fullConfig.minInterval,
        Math.max(fullConfig.maxInterval, fullConfig.minInterval),
      ),
    );
  }, [
    fullConfig.enabled,
    fullConfig.minInterval,
    fullConfig.maxInterval,
    randomBetween,
  ]);

  // Capture explicit reminder actions from notification window and set initial reward state.
  useEffect(() => {
    if (!window.electron?.onReminderAction) return;

    window.electron.onReminderAction((action: string) => {
      traceReminder("onReminderAction callback fired", {
        action,
        rewardSessionCount: rewardSessionsRef.current.length,
      });
      if (!rewardSessionsRef.current.length) return;
      const session =
        rewardSessionsRef.current[rewardSessionsRef.current.length - 1];
      const normalized = (action || "").toLowerCase();

      try {
        const isDismissed =
          normalized === "dismiss" || normalized === "dismissed-close";

        session.dismissed = isDismissed;
        // Requested behavior: initial response is positive unless dismissed.
        session.initialReward = isDismissed
          ? -INITIAL_EVENT_MAGNITUDE
          : INITIAL_EVENT_MAGNITUDE;

        traceReminder("onReminderAction callback completed", {
          action,
          normalized,
          dismissed: session.dismissed,
          initialReward: session.initialReward,
        });
      } catch (error) {
        traceReminder("onReminderAction callback failed", {
          action,
          error: String(error),
        });
      }
    });
  }, [traceReminder]);

  // Reward flow:
  // - Initial response: +x if not dismissed, -x if dismissed.
  // - 1 minute after prompt: +x if productive, -x if non-productive.
  // - If 1-minute check is non-productive, re-check at 5 minutes with same +x/-x rule.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (!rewardSessionsRef.current.length) return;

      const now = Date.now();
      const currentClassification = getLatestClassification();
      const productiveNow = isProductive(currentClassification);

      for (const session of rewardSessionsRef.current) {
        const elapsed = now - session.startedAt;
        if (!session.initialSubmitted && session.initialReward !== 0) {
          const initial = clampReward(session.initialReward);
          await submitReward(
            session.eventId,
            initial,
            session.dismissed ? "initial-dismissed" : "initial-not-dismissed",
          );
          updatePromptScore(session.reminderId, session.reminderState, initial);
          session.lastSubmittedReward = initial;
          session.initialSubmitted = true;
        }

        if (session.productiveOutcomeResolved) {
          continue;
        }

        // Check #1 at 1 minute.
        if (!session.oneMinuteEvaluated && elapsed >= 60_000) {
          session.oneMinuteEvaluated = true;
          const oneMinuteReward = clampReward(
            session.initialReward +
            (productiveNow
              ? OUTCOME_EVENT_MAGNITUDE
              : -OUTCOME_EVENT_MAGNITUDE),
          );
          const changed =
            session.lastSubmittedReward === undefined ||
            Math.abs(oneMinuteReward - session.lastSubmittedReward) >= 0.01;
          if (changed) {
            await submitReward(
              session.eventId,
              oneMinuteReward,
              productiveNow
                ? "productive-check-1min"
                : "nonproductive-check-1min",
            );
            updatePromptScore(
              session.reminderId,
              session.reminderState,
              oneMinuteReward,
            );
            session.lastSubmittedReward = oneMinuteReward;
          }
          if (productiveNow) {
            session.productiveOutcomeResolved = true;
          }
        }

        // Check #2 at 5 minutes only if 1-minute check did not resolve productivity.
        if (
          !session.productiveOutcomeResolved &&
          session.oneMinuteEvaluated &&
          !session.fiveMinuteEvaluated &&
          elapsed >= 5 * 60_000
        ) {
          session.fiveMinuteEvaluated = true;
          const fiveMinuteReward = clampReward(
            session.initialReward +
            (productiveNow
              ? OUTCOME_EVENT_MAGNITUDE
              : -OUTCOME_EVENT_MAGNITUDE),
          );
          const changed =
            session.lastSubmittedReward === undefined ||
            Math.abs(fiveMinuteReward - session.lastSubmittedReward) >= 0.01;
          if (changed) {
            await submitReward(
              session.eventId,
              fiveMinuteReward,
              productiveNow
                ? "productive-check-5min"
                : "nonproductive-check-5min",
            );
            updatePromptScore(
              session.reminderId,
              session.reminderState,
              fiveMinuteReward,
            );
            session.lastSubmittedReward = fiveMinuteReward;
          }
          session.productiveOutcomeResolved = true;
        }
      }

      // Keep recent sessions only.
      rewardSessionsRef.current = rewardSessionsRef.current.filter(
        (s) => now - s.startedAt < 10 * 60_000,
      );
    }, 10000); // check every 10s

    return () => clearInterval(interval);
  }, [
    getLatestClassification,
    isProductive,
    clampReward,
    submitReward,
    updatePromptScore,
  ]);

  return {
    currentReminder,
    dismissReminder,
    nextReminderTime,
    showReminder, // Manual trigger
  };
}
