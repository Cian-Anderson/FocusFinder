import React from "react";
import { Brain, Zap, TrendingDown, Clock } from "lucide-react";
import { useADHDData } from "../hooks/useADHDData";
import { HyperfocusChart } from "./adhd/HyperfocusChart";
import { TaskSwitchingAnalysis } from "./adhd/TaskSwitchingAnalysis";
import { DistractionBreakdown } from "./adhd/DistractionBreakdown";
import { TimeOfDayHeatmap } from "./adhd/TimeOfDayHeatmap";

type DataProfile = "live" | "baseline" | "adhd";

export function ADHDMetrics({ profile = "live" }: { profile?: DataProfile }) {
  const data = useADHDData(60000, profile); // Poll every minute
  const currentHour = new Date().getHours();
  const displayedTaskSwitching =
    profile === "live"
      ? data.taskSwitching.filter((row) => row.hour <= currentHour)
      : data.taskSwitching;
  const displayedTaskSwitches = displayedTaskSwitching.reduce(
    (sum, row) => sum + (Number.isFinite(row.switches) ? row.switches : 0),
    0,
  );
  const displayedSwitchesPerHour =
    displayedTaskSwitching.length > 0
      ? (displayedTaskSwitches / displayedTaskSwitching.length).toFixed(1)
      : "0.0";
  return (
    <div className="w-full min-h-screen flex flex-col bg-slate-100">
      {/* Header */}
      <header className="insights-hero px-6 py-5">
        <div className="flex items-center">
          <div className="flex items-center gap-3">
            <Brain className="w-8 h-8" />
            <div>
              <h1 className="text-2xl font-bold">ADHD Insights Dashboard</h1>
              <p className="insights-hero__subtitle text-sm mt-1">
                Understanding your unique cognitive patterns • Evidence-based
                strategies • Neurodiversity-affirming
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div
        className="flex-1 overflow-auto px-6 pt-6"
        style={{ paddingBottom: "36px" }}
      >
        <div className="max-w-[1800px] mx-auto space-y-6">
          {/* Loading / Error State */}
          {data.loading && (
            <div className="text-center py-12 text-slate-500">
              Loading ADHD metrics...
            </div>
          )}

          {data.error && (
            <div className="text-center py-12 text-red-600">
              Error loading data: {data.error}
            </div>
          )}

          {!data.loading && !data.error && data.summary && (
            <>
              {/* Summary Stats Row */}
              <div className="grid grid-cols-4 gap-4">
                <StatCard
                  icon={<Zap className="w-6 h-6 text-amber-600" />}
                  label="Hyperfocus Sessions"
                  value={data.hyperfocusSessions.length.toString()}
                  subtitle="30+ min unbroken app sessions (last 3 days)"
                  helpText="Deep work sessions your superpower!"
                  color="amber"
                  tone="butter"
                />
                <StatCard
                  icon={<Clock className="w-6 h-6 text-blue-600" />}
                  label="Longest Focus"
                  value={`${data.summary.longest_focus_minutes}`}
                  subtitle="minutes of continuous flow"
                  helpText="Peak concentration duration today"
                  color="blue"
                  tone="sky"
                />
                <StatCard
                  icon={<TrendingDown className="w-6 h-6 text-purple-600" />}
                  label="Task Switches"
                  value={displayedTaskSwitches.toString()}
                  subtitle={`${displayedSwitchesPerHour}/hr average`}
                  helpText="Lower = better attention continuity"
                  color="purple"
                  tone="violet"
                />
                <StatCard
                  icon={<Brain className="w-6 h-6 text-rose-600" />}
                  label="Top Distraction"
                  value={data.summary.most_distracting_app}
                  subtitle={`${data.summary.distraction_episodes} interruptions`}
                  helpText="Consider app limits or notification blocking"
                  color="rose"
                  tone="coral"
                />
              </div>

              {/* Charts Grid */}
              <div className="grid grid-cols-2 gap-4 items-stretch">
                <HyperfocusChart sessions={data.hyperfocusSessions} />
                <TaskSwitchingAnalysis data={displayedTaskSwitching} />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <DistractionBreakdown patterns={data.distractionPatterns} />
                <TimeOfDayHeatmap data={data.timeOfDay} />
              </div>

              {/* ADHD Tips & Tricks Section */}
              <div role="region" aria-label="ADHD tips and tricks" className="bg-white rounded-lg p-8 border border-slate-200 shadow-sm">
                <h3 className="text-2xl text-slate-900 font-bold mb-10 flex items-center gap-2">
                  <Brain size={28} className="text-purple-600" />
                  ADHD Tips & Tricks
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', columnGap: '24px', marginBottom: '32px', marginLeft: '16px', marginRight: '16px' }}>
                  <div className="support-card rounded-lg p-10 border shadow-sm">
                    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "56px minmax(0, 1fr)" }}>
                      <div className="ml-2 mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-amber-300">
                        <Zap className="h-7 w-7" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0" style={{ paddingRight: "72px" }}>
                        <h4 className="font-bold text-slate-900 text-lg mb-4">
                          Task Initiation
                        </h4>
                        <p className="text-base text-slate-700 leading-relaxed">
                          Struggling to start? This is executive dysfunction, not
                          laziness.
                          <strong className="block mt-3">The 2-Minute Rule:</strong>
                          Commit to just 2 minutes of work. Often, starting is the
                          hardest part once you're in motion, momentum builds.
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="support-card rounded-lg p-10 border shadow-sm">
                    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "56px minmax(0, 1fr)" }}>
                      <div className="ml-2 mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-sky-300">
                        <Clock className="h-7 w-7" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0" style={{ paddingRight: "72px" }}>
                        <h4 className="font-bold text-slate-900 text-lg mb-4">
                          Time Blindness & Hyperfocus
                        </h4>
                        <p className="text-base text-slate-700 leading-relaxed">
                          Hyperfocus can last for hours you lose track of time and
                          basic needs. Research shows ADHD brains often misjudge
                          time.
                          <strong className="block mt-3">
                            Work in 30-45 min bursts
                          </strong>{" "}
                          with 5-10 min breaks (ADHD Ireland).
                          <span className="block mt-2">
                            Use visual timers to make time tangible.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="support-card rounded-lg p-10 border shadow-sm">
                    <div className="grid items-start gap-4" style={{ gridTemplateColumns: "56px minmax(0, 1fr)" }}>
                      <div className="ml-2 mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center text-rose-300">
                        <TrendingDown className="h-7 w-7" strokeWidth={2.2} />
                      </div>
                      <div className="min-w-0" style={{ paddingRight: "72px" }}>
                        <h4 className="font-bold text-slate-900 text-lg mb-4">
                          Context Switching & Distractibility
                        </h4>
                        <p className="text-base text-slate-700 leading-relaxed">
                          High task-switching reflects attention difficulties, not
                          multitasking skill. Each switch drains mental energy.
                          <strong className="block mt-3">Strategies:</strong>
                          Batch similar tasks, use Pomodoro (25 min focus), turn off
                          notifications. Distinguish voluntary changes from
                          impulsive distractions.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="support-footnote mt-10 pt-6 border-t border-slate-100 text-sm text-slate-600">
                  <p className="italic">
                    💜 <strong>Remember:</strong> These patterns reflect ADHD neurobiology differences in attention regulation, reward processing, and time perception. You're not broken; your brain just works differently. These tools help you work <em>with</em> your ADHD, not against it.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  subtitle,
  helpText,
  color,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtitle: string;
  helpText?: string;
  color: string;
  tone: "sky" | "butter" | "violet" | "coral";
}) {
  const bgClass = `bg-${color}-50`;
  return (
    <div className={`dashboard-stat dashboard-stat--${tone} bg-white rounded-lg p-4 border border-slate-200 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-start gap-3">
        <div className={`p-2.5 rounded-lg ${bgClass}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="dashboard-stat__label text-slate-600 text-sm font-medium">{label}</div>
          <div
            className="dashboard-stat__value text-slate-900 text-2xl font-bold truncate mt-1"
            title={value}
          >
            {value}
          </div>
          <div className="text-xs text-slate-500 mt-1">{subtitle}</div>
          {helpText && (
            <div className="text-xs text-slate-400 mt-2 italic">{helpText}</div>
          )}
        </div>
      </div>
    </div>
  );
}
