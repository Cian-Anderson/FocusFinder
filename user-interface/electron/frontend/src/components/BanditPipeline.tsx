import React, { useEffect, useMemo, useState } from "react";

type BanditEvent = {
  id: number;
  timestamp: string;
  context_json: string;
  chosen_action: string;
  reward: number | null;
  note?: string | null;
};

function parseContext(ctxJson: string): Record<string, any> {
  try {
    return JSON.parse(ctxJson ?? "{}");
  } catch {
    return {};
  }
}

export default function BanditPipeline() {
  const [events, setEvents] = useState<BanditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const API_BASE = "http://127.0.0.1:5001";

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://127.0.0.1:5001/api/ml/bandit-events");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setEvents(data ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Failed to fetch events");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
    const id = setInterval(fetchEvents, 5000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    return events.map((ev) => {
      const ctx = parseContext(ev.context_json);
      return {
        id: ev.id,
        time: new Date(ev.timestamp).toLocaleString(),
        app: ctx.active_app ?? "-",
        category: ctx.category ?? "-",
        streak: ctx.focus_streak_minutes ?? ctx.streak_minutes ?? "-",
        switches: ctx.switch_count ?? "-",
        action: ev.chosen_action ?? "-",
        reward: ev.reward ?? "-",
      };
    });
  }, [events]);

  const triggerDemoChoose = async () => {
    try {
      setError(null);
      setLoading(true);
      const payload = {
        active_app: "VSCode",
        category: "coding",
        focus_streak_minutes: 42,
        switch_count: 3,
        hour_of_day: new Date().getHours(),
      };
      const res = await fetch("http://127.0.0.1:5001/api/ml/bandit/choose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await res.json();
      await fetchEvents();
    } catch (e: any) {
      setError(e?.message ?? "Failed to trigger demo choose");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <button
          className="px-3 py-1 rounded bg-slate-700 text-white"
          onClick={fetchEvents}
          disabled={loading}
          aria-label="Refresh bandit events"
        >
          Refresh
        </button>
        <button
          className="px-3 py-1 rounded bg-indigo-600 text-white"
          onClick={triggerDemoChoose}
          disabled={loading}
          aria-label="Trigger demo choose action"
        >
          Trigger Demo Choose
        </button>
        {loading && <span className="text-slate-300">Loading…</span>}
        {error && <span className="text-red-400">{error}</span>}
      </div>

      <div className="overflow-auto border border-slate-700 rounded">
        <div className="px-3 py-2 text-xs text-slate-400 border-b border-slate-700 bg-slate-900">
          Each row is one bandit decision event with context features, selected reminder action, and observed reward.
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-800 text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left">Event Time</th>
              <th className="px-3 py-2 text-left">Active App</th>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-left">Focus Streak (min)</th>
              <th className="px-3 py-2 text-left">Switch Count</th>
              <th className="px-3 py-2 text-left">Chosen Reminder</th>
              <th className="px-3 py-2 text-left">Reward Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className="odd:bg-slate-900 even:bg-slate-800 text-slate-200"
              >
                <td className="px-3 py-2">{r.time}</td>
                <td className="px-3 py-2">{r.app}</td>
                <td className="px-3 py-2">{r.category}</td>
                <td className="px-3 py-2">{r.streak}</td>
                <td className="px-3 py-2">{r.switches}</td>
                <td className="px-3 py-2">{r.action}</td>
                <td className="px-3 py-2">{r.reward}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  className="px-3 py-6 text-center text-slate-400"
                  colSpan={7}
                >
                  No events yet. Click "Trigger Demo Choose".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
