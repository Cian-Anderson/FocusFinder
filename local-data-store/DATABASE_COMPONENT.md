# Database Component

- SQLite via SQLAlchemy ORM
- Schema: `activity-monitoring/python_backend/src/database/schema.py`
- Manager: `activity-monitoring/python_backend/src/database/db_manager.py`
- Optional SQLCipher encryption (falls back to plain SQLite if unavailable)
- Three profiles: `live` (`activity_monitor.db`), `baseline`, `adhd`

---

## ORM Models

### ActivityLog (`activity_logs`)
- `id`, `timestamp`, `app_name`, `window_title`, `idle_time`
- `classification` — `focused` / `neutral` / `distracted`
- `distraction_severity` — `micro_break` / `minor_distraction` / `major_distraction`
- `is_active` — 1 = foreground window, 0 = idle/background

### DailyFocusBreakdown (`daily_focus_breakdown`)
- `category` (PK) — `focused` / `neutral` / `distracted`
- `time` — seconds in category today
- `current_streak`, `best_streak_today` — consecutive focused intervals
- `focus_points_earned` — 1 point per 30s focused
- `distraction_count`, `micro_breaks`, `last_updated`

### ADHDInsights (`adhd_insights`)
- `id`, `date` (unique per day)
- `hyperfocus_sessions`, `longest_focus_session` (seconds)
- `rapid_switching_episodes`, `avg_switches_per_hour`
- `longest_time_without_break` (seconds)
- `morning_focus_score` (6–10am), `midday_focus_score` (10am–2pm), `afternoon_focus_score` (2–6pm), `evening_focus_score` (6pm–12am)

### UserSettings (`user_settings`)
Single row.
- `medication_enabled`, `medication_times` (JSON), `medication_duration_hours`
- `hyperfocus_warning_hours` (default 2.5), `break_reminder_minutes` (default 45)
- `rapid_switch_threshold` (switches per 5 min, default 15), `day_start_hour` (default 6)

### ReminderResponse (`reminder_responses`)
- `id`, `timestamp`, `reminder_id`, `reminder_type`, `reminder_title`, `reminder_message`, `priority`
- `response_type` — `acknowledged` / `dismissed` / `ignored`
- `response_time_seconds` — how long before the user responded
- `response_score` — signed per-response score
- `prompt_running_score` — EMA score across sessions for this `reminder_id`
- `current_app`, `current_activity`

### BanditEvent (`bandit_events`)
- `id`, `timestamp`
- `context_json` — serialised BanditContext at time of decision
- `chosen_action` — arm name selected
- `reward` — NULL when pending, filled after user response
- `note`

---

## Data Flow

1. Monitoring loop → writes `ActivityLog` rows via `store_activity_event`
2. API endpoints → read aggregates via `DbManager`
3. Bandit service → writes `BanditEvent` rows; reward filled after user response is logged
