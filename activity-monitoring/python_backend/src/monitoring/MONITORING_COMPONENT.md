# Monitoring Component

- Polls system state every 60 seconds
- Source: `activity-monitoring/python_backend/src/monitoring/`
- Three modules: `window_tracker.py`, `idle_detector.py`, `activity_tracker.py`

---

## Modules

### WindowTracker (`window_tracker.py`)
- Uses `pygetwindow` to get the currently active window title
- Derives a best-effort process/app name from the window title
- Tracks window switch count and time of last switch
- `get_active_window()`, returns `{ title, process_name }` or `None`
- `get_window_contents()`, returns all visible windows with `is_active` flag

### IdleDetector (`idle_detector.py`)
- Uses `pynput` background listeners (mouse + keyboard) to detect user input
- Resets a timestamp on any mouse move, click, scroll, or keypress
- `get_idle_duration()`, seconds since last input event
- `is_user_idle(threshold)`, True if idle duration >= threshold (default 5 minutes)
- `start_listening()` / `stop_listening()`, manage daemon listener threads

### ActivityTracker (`activity_tracker.py`)
- Depends on `WindowTracker`, `IdleDetector`, `DbManager`, and optionally a `Classifier`
- `start_monitoring()`, main polling loop; runs until `stop_monitoring()` is called
- Each tick: gets active window → gets idle duration → classifies activity → writes `ActivityLog` row
- Records a `NoActiveWindow` event if no foreground window is detected
- `record_activity_event()`, wraps `db_manager.store_activity_event()`; returns `False` on error without raising

---

## Data Flow

1. `IdleDetector` listeners run in daemon threads, updating `last_activity_time` on any input
2. `ActivityTracker` polling loop (60s interval) calls `WindowTracker.get_active_window()`
3. Idle duration is read from `IdleDetector.get_idle_duration()` each tick
4. If a `Classifier` is injected, `classify_activity()` is called before writing
5. Each event is written to `ActivityLog` via `DbManager.store_activity_event()`
