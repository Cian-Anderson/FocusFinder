"""Flask REST API server providing dashboard data endpoints.

This server exposes routes used by the Electron frontend:
- /api/health
- /api/dashboard/summary
- /api/dashboard/top-apps
- /api/dashboard/hourly-breakdown
- /api/activities/recent

It fetches data from the latest date with activity so the UI
shows existing records even when today's dataset is empty.
"""

from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import date, datetime, timedelta
import logging
import sys
from collections import defaultdict

from ..database.db_manager import DbManager
from ..database.schema import BanditEvent
from ..interpretation.bandit_service import (
    BanditContext,
    choose_reminder_decision,
    log_bandit_event,
    reward_to_storage_int,
)


def _setup_logger() -> logging.Logger:
    logger = logging.getLogger("api")
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        # Route logs to stdout so Electron doesn't mark them as errors
        handler = logging.StreamHandler(stream=sys.stdout)
        handler.setLevel(logging.INFO)
        formatter = logging.Formatter("%(asctime)s %(levelname)s: %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


def create_app() -> Flask:
    app = Flask(__name__)
    CORS(app)

    logger = _setup_logger()
    db_cache = {}

    def _get_profile_name() -> str:
        value = (request.args.get("profile") or "live").strip().lower()
        return value if value in {"live", "baseline", "adhd"} else "live"

    def _get_profiled_db() -> DbManager:
        profile = _get_profile_name()
        if profile not in db_cache:
            db_cache[profile] = DbManager(logger, profile=profile)
        return db_cache[profile]

    class _DbProxy:
        def __getattr__(self, item):
            return getattr(_get_profiled_db(), item)

    db = _DbProxy()

    def _focus_period_metrics(all_activities):
        buckets = {
            "morning": {"focused": 0, "total": 0},   # 06:00-09:59
            "midday": {"focused": 0, "total": 0},    # 10:00-13:59
            "afternoon": {"focused": 0, "total": 0}, # 14:00-17:59
            "evening": {"focused": 0, "total": 0},   # 18:00-05:59 (includes night)
        }

        for a in all_activities:
            ts = getattr(a, "timestamp", None)
            if not ts:
                continue
            hour = ts.hour
            cls = str(getattr(a, "classification", "") or "").lower()
            key = (
                "morning"
                if 6 <= hour < 10
                else "midday"
                if 10 <= hour < 14
                else "afternoon"
                if 14 <= hour < 18
                else "evening"
            )
            buckets[key]["total"] += 1
            if cls in ("focused", "productive"):
                buckets[key]["focused"] += 1

        return {
            key: {
                "focus_pct": round((vals["focused"] / vals["total"]) * 100, 1) if vals["total"] else 0.0,
                "activity_count": vals["total"],
            }
            for key, vals in buckets.items()
        }

    def get_latest_activity_date() -> date:
        """Return the most recent date with any ActivityLog entries."""
        try:
            from ..database.schema import ActivityLog  # type: ignore
            from sqlalchemy import func  # type: ignore
            with db.Session() as s:
                latest_row = (
                    s.query(func.date(ActivityLog.timestamp))
                    .order_by(ActivityLog.timestamp.desc())
                    .first()
                )
                if latest_row and latest_row[0]:
                    val = latest_row[0]
                    if isinstance(val, str):
                        return datetime.strptime(val, "%Y-%m-%d").date()
                    return val
        except Exception as e:
            logger.error(f"latest activity date lookup failed: {e}")
        return date.today()

    @app.get("/api/health")
    @app.get("/health")
    def health():
        return jsonify({"success": True, "status": "ok", "timestamp": datetime.now().isoformat()})

    @app.get("/api/dashboard/summary")
    def summary():
        try:
            target_date = get_latest_activity_date()
            s = db.get_dashboard_summary(target_date)
            focused_sec = int(s.get("productive_minutes", 0) * 60)
            neutral_sec = int(s.get("neutral_minutes", 0) * 60)
            distracted_sec = int(s.get("distracting_minutes", 0) * 60)
            breakdown = {
                "focused_seconds": focused_sec,
                "neutral_seconds": neutral_sec,
                "distracted_seconds": distracted_sec,
                "total_active_seconds": focused_sec + neutral_sec + distracted_sec,
                "focus_score": int(s.get("focus_score", 0)),
            }
            streak = {"current": 0, "best_today": 0, "points": 0}
            payload = {"breakdown": breakdown, "streak": streak, "timestamp": datetime.now().isoformat()}
            return jsonify({"success": True, "data": payload, "date": target_date.isoformat()})
        except Exception as e:
            logger.error(f"summary failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/dashboard/top-apps")
    def top_apps():
        try:
            target_date = get_latest_activity_date()
            rows = db.get_top_applications(target_date, limit=50)
            # Aggregate by app_name across classifications
            agg = {}
            for r in rows:
                name = r.get("app_name") or "Unknown"
                cls = (r.get("classification") or "neutral").lower()
                seconds = int(r.get("total_seconds") or 0)
                entry = agg.setdefault(name, {
                    "name": name,
                    "focused_seconds": 0,
                    "neutral_seconds": 0,
                    "distracted_seconds": 0,
                    "total_seconds": 0,
                })
                # Ensure numeric fields are ints for safe "+=" operations
                entry["focused_seconds"] = int(entry["focused_seconds"] or 0)
                entry["neutral_seconds"] = int(entry["neutral_seconds"] or 0)
                entry["distracted_seconds"] = int(entry["distracted_seconds"] or 0)
                entry["total_seconds"] = int(entry["total_seconds"] or 0)
                if cls in ("focused", "productive"):
                    entry["focused_seconds"] += seconds
                elif cls == "neutral":
                    entry["neutral_seconds"] += seconds
                else:
                    entry["distracted_seconds"] += seconds
                entry["total_seconds"] += seconds

            apps = sorted(agg.values(), key=lambda a: a["total_seconds"], reverse=True)[:10]
            return jsonify({"success": True, "data": apps, "date": target_date.isoformat()})
        except Exception as e:
            logger.error(f"top-apps failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/dashboard/hourly-breakdown")
    def hourly_breakdown():
        try:
            target_date = get_latest_activity_date()
            hourly = db.get_hourly_breakdown(target_date)
            return jsonify({"success": True, "data": hourly, "date": target_date.isoformat()})
        except Exception as e:
            logger.error(f"hourly-breakdown failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # NEW: classification breakdown for target date
    @app.get("/api/dashboard/classification-breakdown")
    def classification_breakdown():
        try:
            target_date = get_latest_activity_date()
            b = db.get_classification_breakdown(target_date)
            total = b.get("total", 0) or 0
            pct = {
                "focused": round((b.get("focused", 0) / total) * 100, 2) if total else 0,
                "neutral": round((b.get("neutral", 0) / total) * 100, 2) if total else 0,
                "distracted": round((b.get("distracted", 0) / total) * 100, 2) if total else 0,
            }
            return jsonify({
                "success": True,
                "date": target_date.isoformat(),
                "data": {
                    "focused_seconds": b.get("focused", 0),
                    "neutral_seconds": b.get("neutral", 0),
                    "distracted_seconds": b.get("distracted", 0),
                    "total_seconds": total,
                    "percentages": pct,
                },
            })
        except Exception as e:
            logger.error(f"classification-breakdown failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # NEW: productivity trend over recent days
    @app.get("/api/dashboard/productivity-trend")
    def productivity_trend():
        try:
            days = int(request.args.get("days", 7))
            days = max(1, min(days, 30))  # safety bounds
            trend = db.get_productivity_trend(days)
            return jsonify({"success": True, "data": trend, "days": days})
        except Exception as e:
            logger.error(f"productivity-trend failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/activities/recent")
    def recent_activities():
        """Return recent activities in snake_case to match frontend hook"""
        try:
            hours_param = request.args.get("hours")
            limit_param = request.args.get("limit")

            hours = None
            if hours_param is not None:
                try:
                    hours = max(1, min(int(hours_param), 24))
                except ValueError:
                    hours = 3

            if limit_param is not None:
                try:
                    limit = max(1, min(int(limit_param), 5000))
                except ValueError:
                    limit = 400
            else:
                # If hours is provided, prefer window-based retrieval over row caps.
                limit = None if hours is not None else 20

            items = db.get_recent_activities(limit=limit, hours=hours)
            logger.debug(f"Building {len(items)} recent activities with snake_case fields")
            data = [
                {
                    "id": a.get("id"),
                    "timestamp": a.get("timestamp"),
                    "app_name": a.get("app_name"),
                    "window_title": a.get("window_title"),
                    "idle_time": int(a.get("idle_time") or 0),
                    "classification": a.get("classification"),
                }
                for a in items
            ]
            return jsonify({"success": True, "data": data})
        except Exception as e:
            logger.error(f"recent-activities failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # ===== ML/Bandit endpoints =====

    @app.get("/api/ml/bandit-events")
    def get_bandit_events():
        try:
            limit = int(request.args.get("limit", 20))
            with db.Session() as session:
                events = session.query(BanditEvent).order_by(BanditEvent.timestamp.desc()).limit(limit).all()
                data = [
                    {
                        "id": e.id,
                        "timestamp": e.timestamp.isoformat(),
                        "context_json": e.context_json,
                        "chosen_action": e.chosen_action,
                        "reward": e.reward,
                        "note": e.note,
                    }
                    for e in events
                ]
            return jsonify({"success": True, "data": data})
        except Exception as e:
            logger.error(f"bandit-events failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.post("/api/ml/bandit/choose")
    def bandit_choose():
        try:
            payload = request.json or {}
            ctx = BanditContext(
                timestamp=datetime.now(),
                current_app=payload.get("current_app") or "Unknown",
                current_category=payload.get("current_category") or "neutral",
                time_since_last_reminder=float(payload.get("time_since_last_reminder") or 0.0),
                focus_streak_minutes=float(payload.get("focus_streak_minutes") or 0.0),
                idle_minutes_last_30=float(payload.get("idle_minutes_last_30") or 0.0),
                switches_last_10_min=int(payload.get("switches_last_10_min") or 0),
                user_is_adhd=bool(payload.get("user_is_adhd") if payload.get("user_is_adhd") is not None else True),
                time_of_day_bucket=payload.get("time_of_day_bucket") or "midday",
                reminder_state=payload.get("reminder_state") or "normal_focus",
            )
            with db.Session() as session:
                decision = choose_reminder_decision(ctx, session=session)
                action = str(decision["action"])
                note = f"{decision.get('policy', 'contextual')};scores={decision.get('scores', {})}"
                event_id = log_bandit_event(session, ctx, action, reward=None, note=note)
            return jsonify(
                {
                    "success": True,
                    "data": {
                        "chosen_action": action,
                        "event_id": event_id,
                        "action_config": decision.get("config", {}),
                        "policy": decision.get("policy", "contextual-ucb-v1"),
                    },
                }
            )
        except Exception as e:
            logger.error(f"bandit-choose failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.post("/api/ml/bandit/reward")
    def bandit_reward():
        """Update reward for a previously logged bandit event."""
        try:
            data = request.json or {}
            if "event_id" not in data:
                return jsonify({"success": False, "error": "Missing event_id"}), 400
            try:
                _eid = data.get("event_id")
                event_id = int(str(_eid))
            except Exception:
                return jsonify({"success": False, "error": "Invalid event_id"}), 400
            reward = data.get("reward")
            note = data.get("note")
            reward_raw = None
            reward_stored = None
            if reward is not None:
                try:
                    reward_raw = float(reward)
                    reward_stored = reward_to_storage_int(reward_raw)
                except Exception:
                    return jsonify({"success": False, "error": "Invalid reward"}), 400

            with db.Session() as session:
                ev = session.query(BanditEvent).filter(BanditEvent.id == event_id).first()
                if not ev:
                    return jsonify({"success": False, "error": "Event not found"}), 404
                setattr(ev, "reward", reward_stored if reward is not None else None)
                if note is not None:
                    note_text = str(note)
                else:
                    note_text = ""
                if reward is not None:
                    reward_note = f"reward_raw={reward_raw:.4f};reward_stored={reward_stored}"
                    setattr(ev, "note", f"{note_text};{reward_note}" if note_text else reward_note)
                elif note is not None:
                    setattr(ev, "note", note_text)
                session.commit()
            return jsonify(
                {
                    "success": True,
                    "data": {
                        "event_id": event_id,
                        "reward": reward_raw,
                        "stored_reward": reward_stored,
                    },
                }
            )
        except Exception as e:
            logger.error(f"bandit-reward failed: {e}")
            return jsonify({"success": False, "error": str(e)}), 500

    # ===== ADHD-Specific Endpoints =====

    @app.get("/api/adhd/summary")
    def adhd_summary():
        """Get comprehensive ADHD metrics summary"""
        try:
            target_date = get_latest_activity_date()
            with db.Session() as session:
                from ..database.schema import ADHDInsights, ActivityLog
                from sqlalchemy import func, and_
                
                # Calculate hyperfocus sessions today
                today_start = datetime.combine(target_date, datetime.min.time())
                today_end = datetime.combine(target_date, datetime.max.time())
                
                # Count continuous focus blocks (intense prolonged focus)
                # Hyperfocus varies by individual but track sustained periods
                activities = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end,
                        ActivityLog.classification == 'focused'
                    )
                ).order_by(ActivityLog.timestamp.asc()).all()
                
                hyperfocus_count = 0
                longest_focus_min = 0.0

                if activities:
                    block_start = activities[0].timestamp
                    block_prev = activities[0].timestamp

                    def close_block(start_ts, end_ts):
                        duration_min = max(1.0, ((end_ts - start_ts).total_seconds() / 60.0) + 1.0)
                        return duration_min

                    for i in range(1, len(activities)):
                        curr_ts = activities[i].timestamp
                        if (curr_ts - block_prev).total_seconds() < 120:
                            block_prev = curr_ts
                            continue

                        duration_min = close_block(block_start, block_prev)
                        if duration_min >= 30:
                            hyperfocus_count += 1
                        longest_focus_min = max(longest_focus_min, duration_min)
                        block_start = curr_ts
                        block_prev = curr_ts

                    duration_min = close_block(block_start, block_prev)
                    if duration_min >= 30:
                        hyperfocus_count += 1
                    longest_focus_min = max(longest_focus_min, duration_min)
                
                # Calculate task switching rate
                all_activities = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end
                    )
                ).order_by(ActivityLog.timestamp.asc()).all()
                
                switches = sum(
                    1
                    for i in range(1, len(all_activities))
                    if str(getattr(all_activities[i], "app_name", "") or "")
                    != str(getattr(all_activities[i-1], "app_name", "") or "")
                )
                
                total_hours = (datetime.now() - today_start).total_seconds() / 3600 if datetime.now().date() == target_date else 24
                switches_per_hour = switches / max(total_hours, 1)

                period_metrics = _focus_period_metrics(all_activities)
                
                # Most distracting app
                distracted_apps = session.query(
                    ActivityLog.app_name,
                    func.count(ActivityLog.id).label('count')
                ).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end,
                        ActivityLog.classification == 'distracted'
                    )
                ).group_by(ActivityLog.app_name).order_by(func.count(ActivityLog.id).desc()).first()
                
                most_distracting = distracted_apps[0] if distracted_apps else "None"
                distraction_count = distracted_apps[1] if distracted_apps else 0
                
                data = {
                    "hyperfocus_sessions": hyperfocus_count,
                    "longest_focus_minutes": int(round(longest_focus_min)),
                    "task_switches_today": switches,
                    "switches_per_hour": round(switches_per_hour, 1),
                    "most_distracting_app": most_distracting,
                    "distraction_episodes": distraction_count,
                    "morning_focus": period_metrics["morning"]["focus_pct"],
                    "midday_focus": period_metrics["midday"]["focus_pct"],
                    "afternoon_focus": period_metrics["afternoon"]["focus_pct"],
                    "evening_focus": period_metrics["evening"]["focus_pct"],
                }
                
                return jsonify({"success": True, "data": data, "date": target_date.isoformat()})
        except Exception as e:
            logger.exception("adhd-summary failed")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/adhd/hyperfocus-sessions")
    def hyperfocus_sessions():
        """Get detailed hyperfocus session data from a rolling window."""
        try:
            target_date = get_latest_activity_date()
            window_days = request.args.get("window_days", default=3, type=int) or 3
            window_days = max(1, min(window_days, 14))
            with db.Session() as session:
                from ..database.schema import ActivityLog
                from sqlalchemy import and_
                
                window_start_date = target_date - timedelta(days=window_days - 1)
                window_start = datetime.combine(window_start_date, datetime.min.time())
                window_end = datetime.combine(target_date, datetime.max.time())
                
                activities = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= window_start,
                        ActivityLog.timestamp <= window_end
                    )
                ).order_by(ActivityLog.timestamp.asc()).all()
                
                sessions = []

                if activities:
                    first = activities[0]
                    block_start = first.timestamp
                    block_prev = first.timestamp
                    block_app = str(getattr(first, "app_name", "") or "Unknown").strip() or "Unknown"
                    block_rows = [first]

                    def push_block(start_ts, end_ts, app_name, rows):
                        duration_min = max(1.0, ((end_ts - start_ts).total_seconds() / 60.0) + 1.0)
                        if duration_min >= 30:
                            sessions.append({
                                "start_time": start_ts.isoformat(),
                                "end_time": end_ts.isoformat(),
                                "duration_minutes": int(round(duration_min)),
                                "intensity": min(100, int((duration_min / 30) * 100)),
                                "primary_activity": app_name,
                            })

                    for i in range(1, len(activities)):
                        curr_ts = activities[i].timestamp
                        curr_app = str(getattr(activities[i], "app_name", "") or "Unknown").strip() or "Unknown"
                        is_contiguous = (curr_ts - block_prev).total_seconds() < 120

                        if is_contiguous and curr_app == block_app:
                            block_prev = curr_ts
                            block_rows.append(activities[i])
                            continue

                        push_block(block_start, block_prev, block_app, block_rows)
                        block_start = curr_ts
                        block_prev = curr_ts
                        block_app = curr_app
                        block_rows = [activities[i]]

                    push_block(block_start, block_prev, block_app, block_rows)

                sessions.sort(
                    key=lambda item: item.get("start_time", ""),
                    reverse=True,
                )
                
                return jsonify({
                    "success": True,
                    "data": sessions,
                    "date": target_date.isoformat(),
                    "window_days": window_days,
                    "window_start": window_start_date.isoformat(),
                })
        except Exception as e:
            logger.exception("hyperfocus-sessions failed")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/adhd/task-switching")
    def task_switching():
        """Get task switching patterns over the day"""
        try:
            target_date = get_latest_activity_date()
            with db.Session() as session:
                from ..database.schema import ActivityLog
                from sqlalchemy import and_
                
                today_start = datetime.combine(target_date, datetime.min.time())
                today_end = datetime.combine(target_date, datetime.max.time())

                all_activities = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end
                    )
                ).order_by(ActivityLog.timestamp.asc()).all()

                if not all_activities:
                    return jsonify({"success": True, "data": [], "date": target_date.isoformat()})

                # Build per-hour buckets up to current/latest available hour (no future zero-padding).
                if target_date == datetime.now().date():
                    cutoff_hour = datetime.now().hour
                else:
                    cutoff_hour = max(a.timestamp.hour for a in all_activities if getattr(a, "timestamp", None))

                hourly_switches = {h: 0 for h in range(cutoff_hour + 1)}
                hourly_activity_counts = {h: 0 for h in range(cutoff_hour + 1)}

                for row in all_activities:
                    ts = getattr(row, "timestamp", None)
                    if ts is None:
                        continue
                    hour = ts.hour
                    if hour <= cutoff_hour:
                        hourly_activity_counts[hour] += 1

                # Attribute each switch to the hour where the new app/context is entered.
                for i in range(1, len(all_activities)):
                    prev_app = str(getattr(all_activities[i - 1], "app_name", "") or "")
                    curr_app = str(getattr(all_activities[i], "app_name", "") or "")
                    if curr_app != prev_app:
                        ts = getattr(all_activities[i], "timestamp", None)
                        if ts is not None and ts.hour <= cutoff_hour:
                            hourly_switches[ts.hour] += 1

                hourly_data = [
                    {
                        "hour": hour,
                        "switches": hourly_switches.get(hour, 0),
                        "activity_count": hourly_activity_counts.get(hour, 0),
                    }
                    for hour in range(cutoff_hour + 1)
                ]
                
                return jsonify({"success": True, "data": hourly_data, "date": target_date.isoformat()})
        except Exception as e:
            logger.exception("task-switching failed")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/adhd/distraction-patterns")
    def distraction_patterns():
        """Get detailed distraction breakdown"""
        try:
            target_date = get_latest_activity_date()
            with db.Session() as session:
                from ..database.schema import ActivityLog
                from sqlalchemy import and_, func
                
                today_start = datetime.combine(target_date, datetime.min.time())
                today_end = datetime.combine(target_date, datetime.max.time())
                
                # Get distraction by app
                distracted_by_app = session.query(
                    ActivityLog.app_name,
                    func.count(ActivityLog.id).label('episodes'),
                    func.sum(func.coalesce(ActivityLog.idle_time, 0)).label('total_seconds')
                ).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end,
                        ActivityLog.classification == 'distracted'
                    )
                ).group_by(ActivityLog.app_name).all()
                
                apps = [
                    {
                        "app_name": row[0],
                        "episodes": row[1],
                        "total_seconds": int(row[2] or 0)
                    }
                    for row in distracted_by_app
                ]
                apps.sort(key=lambda x: x["episodes"], reverse=True)
                
                # Classify severity
                all_distracted = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end,
                        ActivityLog.classification == 'distracted'
                    )
                ).all()
                
                micro_breaks = sum(
                    1 for a in all_distracted
                    if int(getattr(a, "idle_time", 0) or 0) < 120
                )
                minor = sum(
                    1 for a in all_distracted
                    if 120 <= int(getattr(a, "idle_time", 0) or 0) < 600
                )
                major = sum(
                    1 for a in all_distracted
                    if int(getattr(a, "idle_time", 0) or 0) >= 600
                )
                
                severity = {
                    "micro_breaks": micro_breaks,  # < 2 min (healthy!)
                    "minor_distractions": minor,   # 2-10 min
                    "major_distractions": major     # > 10 min
                }
                
                return jsonify({
                    "success": True, 
                    "data": {
                        "by_app": apps[:10],
                        "severity_breakdown": severity
                    }, 
                    "date": target_date.isoformat()
                })
        except Exception as e:
            logger.exception("distraction-patterns failed")
            return jsonify({"success": False, "error": str(e)}), 500

    @app.get("/api/adhd/time-of-day-analysis")
    def time_of_day_analysis():
        """Get focus performance by time of day from activity logs."""
        try:
            target_date = get_latest_activity_date()
            with db.Session() as session:
                from ..database.schema import ActivityLog
                from sqlalchemy import and_

                today_start = datetime.combine(target_date, datetime.min.time())
                today_end = datetime.combine(target_date, datetime.max.time())

                all_activities = session.query(ActivityLog).filter(
                    and_(
                        ActivityLog.timestamp >= today_start,
                        ActivityLog.timestamp <= today_end,
                    )
                ).all()

                metrics = _focus_period_metrics(all_activities)
                period_scores = [
                    {
                        "period": "Morning (6-10am)",
                        "focus_score": metrics["morning"]["focus_pct"],
                        "activity_count": metrics["morning"]["activity_count"],
                    },
                    {
                        "period": "Midday (10am-2pm)",
                        "focus_score": metrics["midday"]["focus_pct"],
                        "activity_count": metrics["midday"]["activity_count"],
                    },
                    {
                        "period": "Afternoon (2-6pm)",
                        "focus_score": metrics["afternoon"]["focus_pct"],
                        "activity_count": metrics["afternoon"]["activity_count"],
                    },
                    {
                        "period": "Evening+Night (6pm-6am)",
                        "focus_score": metrics["evening"]["focus_pct"],
                        "activity_count": metrics["evening"]["activity_count"],
                    },
                ]
                
                return jsonify({"success": True, "data": period_scores, "date": target_date.isoformat()})
        except Exception as e:
            logger.exception("time-of-day-analysis failed")
            return jsonify({"success": False, "error": str(e)}), 500

    # Reminder response logging endpoint (must be defined before returning app)
    @app.route("/api/reminder/response", methods=["POST"])
    def log_reminder_response():
        """Log user response to a reminder notification"""
        try:
            data = request.json
            if not data:
                return jsonify({"success": False, "error": "No data provided"}), 400
            required = [
                "reminder_id",
                "reminder_type",
                "reminder_title",
                "reminder_message",
                "priority",
                "response_type",
            ]
            if not all(field in data for field in required):
                return jsonify({"success": False, "error": "Missing required fields"}), 400

            response_type = str(data.get("response_type") or "").strip().lower()
            response_score_raw = data.get("response_score")
            if response_score_raw is not None:
                try:
                    response_score = float(response_score_raw)
                except Exception:
                    return jsonify({"success": False, "error": "Invalid response_score"}), 400
            else:
                response_score = -0.3 if response_type in {"dismissed", "ignored", "dismissed-close"} else 0.3

            from ..database.schema import ReminderResponse
            from sqlalchemy import func
            with db.Session() as session:
                reminder_id = str(data["reminder_id"])
                prior_count = (
                    session.query(func.count(ReminderResponse.id))
                    .filter(ReminderResponse.reminder_id == reminder_id)
                    .scalar()
                    or 0
                )
                previous_score_row = (
                    session.query(ReminderResponse.prompt_running_score)
                    .filter(ReminderResponse.reminder_id == reminder_id)
                    .filter(ReminderResponse.prompt_running_score.isnot(None))
                    .order_by(ReminderResponse.timestamp.desc(), ReminderResponse.id.desc())
                    .first()
                )
                previous_score = (
                    float(previous_score_row[0]) if previous_score_row and previous_score_row[0] is not None else 0.0
                )
                alpha = min(0.35, 1.0 / float(prior_count + 1))
                prompt_running_score = previous_score + alpha * (response_score - previous_score)

                response = ReminderResponse(
                    timestamp=datetime.now(),
                    reminder_id=reminder_id,
                    reminder_type=data["reminder_type"],
                    reminder_title=data["reminder_title"],
                    reminder_message=data["reminder_message"],
                    priority=data["priority"],
                    response_type=response_type,
                    response_time_seconds=data.get("response_time_seconds"),
                    response_score=response_score,
                    prompt_running_score=prompt_running_score,
                    current_app=data.get("current_app"),
                    current_activity=data.get("current_activity"),
                )
                session.add(response)
                session.commit()
                logger.info(
                    f"Logged reminder response: {data['reminder_id']} - {response_type}; score={response_score:.3f}; running={prompt_running_score:.3f}"
                )

            return jsonify({"success": True, "message": "Response logged"})
        except Exception as e:
            logger.exception("reminder-response failed")
            return jsonify({"success": False, "error": str(e)}), 500

    return app


def run_api_server(host: str = None, port: int = None, debug: bool = None):
    import os

    resolved_host = host or os.environ.get("API_HOST", "127.0.0.1")
    if port is None:
        try:
            resolved_port = int(os.environ.get("API_PORT", "5001"))
        except ValueError:
            resolved_port = 5001
    else:
        resolved_port = port

    if debug is None:
        resolved_debug = os.environ.get("API_DEBUG", "true").lower() in ("1", "true", "yes")
    else:
        resolved_debug = debug

    app = create_app()
    app.run(host=resolved_host, port=resolved_port, debug=resolved_debug, threaded=True)


if __name__ == "__main__":
    # Allow environment overrides, default to 5001 to match frontend config
    import os
    host = os.environ.get("API_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("API_PORT", "5001"))
    except ValueError:
        port = 5001
    debug = os.environ.get("API_DEBUG", "true").lower() in ("1", "true", "yes")
    run_api_server(host=host, port=port, debug=debug)


