from sqlalchemy import Column, Integer, String, DateTime, Text, Float, Date, JSON
from sqlalchemy.ext.declarative import declarative_base


Base = declarative_base()


class ActivityLog(Base):
    __tablename__ = 'activity_logs'

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False)
    app_name = Column(String, nullable=False)
    window_title = Column(Text, nullable=True)
    idle_time = Column(Integer, nullable=True, default=0)
    classification = Column(String, nullable=True)  # focused, neutral, distracted
    distraction_severity = Column(String, nullable=True)  # micro_break, minor_distraction, major_distraction
    is_active = Column(Integer, nullable=False, default=0)  # 1 if this was the foreground window, 0 otherwise


class DailyFocusBreakdown(Base):
    """Simple 3-row table showing time spent in each category today"""
    __tablename__ = 'daily_focus_breakdown'

    category = Column(String, primary_key=True)  # 'focused', 'neutral', or 'distracted'
    time = Column(Integer, default=0)  # seconds spent in this category today

    # ADHD-specific: Streak tracking
    current_streak = Column(Integer, default=0)  # consecutive focused intervals
    best_streak_today = Column(Integer, default=0)  # longest streak today

    # ADHD-specific: Gamification
    focus_points_earned = Column(Integer, default=0)  # 1 point per 30s focused

    # Distraction tracking
    distraction_count = Column(Integer, default=0)  # number of distraction episodes
    micro_breaks = Column(Integer, default=0)  # healthy short breaks

    last_updated = Column(DateTime, nullable=False)


class ADHDInsights(Base):
    """Track ADHD-specific patterns and insights"""
    __tablename__ = 'adhd_insights'

    id = Column(Integer, primary_key=True)
    date = Column(Date, nullable=False, unique=True)

    # Hyperfocus tracking
    hyperfocus_sessions = Column(Integer, default=0)  # times focused 2+ hours straight
    longest_focus_session = Column(Integer, default=0)  # seconds

    # Task switching
    rapid_switching_episodes = Column(Integer, default=0)  # overwhelm indicators
    avg_switches_per_hour = Column(Float, default=0.0)

    # Time since breaks
    longest_time_without_break = Column(Integer, default=0)  # seconds

    # Time-of-day patterns
    morning_focus_score = Column(Float, default=0.0)  # 6-10am
    midday_focus_score = Column(Float, default=0.0)   # 10am-2pm
    afternoon_focus_score = Column(Float, default=0.0) # 2-6pm
    evening_focus_score = Column(Float, default=0.0)   # 6pm-12am

    created_at = Column(DateTime, nullable=False)
    last_updated = Column(DateTime, nullable=False)


class UserSettings(Base):
    """User preferences and ADHD-specific settings"""
    __tablename__ = 'user_settings'

    id = Column(Integer, primary_key=True, default=1)  # Single row

    # Medication tracking (optional)
    medication_enabled = Column(Integer, default=0)  # boolean
    medication_times = Column(String, nullable=True)  # JSON: ["08:00", "12:00"]
    medication_duration_hours = Column(Float, default=4.0)

    # Customizable thresholds
    hyperfocus_warning_hours = Column(Float, default=2.5)
    break_reminder_minutes = Column(Integer, default=45)
    rapid_switch_threshold = Column(Integer, default=15)  # switches per 5 min

    # Day start time (for irregular sleep schedules)
    day_start_hour = Column(Integer, default=6)  # when to reset daily stats

    created_at = Column(DateTime, nullable=False)
    last_updated = Column(DateTime, nullable=False)


class ReminderResponse(Base):
    """Track user responses to ADHD reminder notifications"""
    __tablename__ = 'reminder_responses'

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False)

    # Reminder details
    reminder_id = Column(String, nullable=False)  # e.g., 'break-1', 'time-1'
    reminder_type = Column(String, nullable=False)  # break, hydration, time-check, etc.
    reminder_title = Column(String, nullable=False)
    reminder_message = Column(Text, nullable=False)
    priority = Column(String, nullable=False)  # high, medium, low

    # User response
    response_type = Column(String, nullable=False)  # 'acknowledged', 'dismissed', 'ignored'
    response_time_seconds = Column(Integer, nullable=True)  # how long before response
    response_score = Column(Float, nullable=True)  # per-response signed score (+x/-x)
    prompt_running_score = Column(Float, nullable=True)  # EMA score per reminder_id across sessions

    # Context at time of reminder
    current_app = Column(String, nullable=True)
    current_activity = Column(String, nullable=True)  # focused, neutral, distracted


class BanditEvent(Base):
    __tablename__ = 'bandit_events'

    id = Column(Integer, primary_key=True)
    timestamp = Column(DateTime, nullable=False)
    context_json = Column(Text, nullable=False)
    chosen_action = Column(String(64), nullable=False)
    reward = Column(Integer, nullable=True)  # 0/1 or score; NULL for pending/unknown
    note = Column(Text, nullable=True)


def create_database(engine):
    Base.metadata.create_all(engine)
    try:
        with engine.begin() as conn:
            result = conn.exec_driver_sql("PRAGMA table_info(reminder_responses)")
            existing_cols = {str(row[1]) for row in result.fetchall()}
            if "response_score" not in existing_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE reminder_responses ADD COLUMN response_score FLOAT"
                )
            if "prompt_running_score" not in existing_cols:
                conn.exec_driver_sql(
                    "ALTER TABLE reminder_responses ADD COLUMN prompt_running_score FLOAT"
                )
    except Exception:
        # Non-fatal migration guard for first-run/partial schemas.
        pass
