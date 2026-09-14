from sqlalchemy import func
from sqlalchemy.orm import sessionmaker
from datetime import datetime, date, timedelta
from typing import Dict, List, Optional, Union
from pathlib import Path
import logging
import os

from .schema import ActivityLog, DailyFocusBreakdown, create_database
from .sqlcipher_support import create_sqlcipher_engine, get_or_create_sqlcipher_passphrase, sqlcipher_available


SAMPLE_INTERVAL_SECONDS = 60


class DbManager:
    def __init__(self, logger: logging.Logger, profile: str = "live"):
        # accept custom Logger with .log/.log_error by adapting to stdlib-like API
        self.logger = logger
        if not hasattr(self.logger, "info") and hasattr(self.logger, "log"):
            self.logger.info = self.logger.log  # type: ignore
        if not hasattr(self.logger, "error"):
            self.logger.error = getattr(self.logger, "log_error", getattr(self.logger, "log", print))  # type: ignore

        normalized = (profile or "live").strip().lower()
        filename_map = {
            "live": "activity_monitor.db",
            "baseline": "activity_monitor_baseline.db",
            "adhd": "activity_monitor_adhd.db",
        }
        db_filename = filename_map.get(normalized, "activity_monitor.db")

        configured_db_path = os.environ.get("DB_PATH", "").strip()
        if configured_db_path:
            configured_path = Path(configured_db_path)
            if configured_path.suffix:
                db_path = configured_path
            else:
                db_path = configured_path / db_filename
        else:
            local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
            if local_app_data:
                db_path = Path(local_app_data) / "ADHD-Activity-Monitor" / "data" / db_filename
            else:
                # Fallback for non-Windows/test environments.
                db_path = Path.home() / ".adhd-activity-monitor" / "data" / db_filename

        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db_path = db_path
        self.passphrase, self.passphrase_loaded_from_disk = get_or_create_sqlcipher_passphrase(db_path)
        self.engine = create_sqlcipher_engine(db_path, self.passphrase)
        create_database(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.logger.info(f"Database initialized for profile '{normalized}' at {db_path}")
        if sqlcipher_available():
            source = "loaded from disk" if self.passphrase_loaded_from_disk else "generated for this machine"
            self.logger.info(f"SQLCipher is enabled; local key was {source}")
        else:
            self.logger.info("SQLCipher bindings were not found; database opened without encryption")

    @property
    def session(self):
        return self.Session()

    def close(self):
        try:
            self.engine.dispose()
        except Exception as e:
            self.logger.error(f"Failed to dispose database engine: {e}")

    def insert_activity(self, app_name: str, window_title: str, idle_time: int, classification: str) -> bool:
        try:
            with self.Session() as s:
                rec = ActivityLog(
                    timestamp=datetime.now(),
                    app_name=app_name,
                    window_title=window_title,
                    idle_time=idle_time,
                    classification=classification,
                )
                s.add(rec)
                s.commit()
            return True
        except Exception as e:
            self.logger.error(f"insert_activity failed: {e}")
            return False

    # Alias for insert_activity. Used by activity_tracker
    def store_activity_event(self, app_name: str, window_title: str, idle_time: int, classification: str = None, timestamp: Union[str, datetime, None] = None, is_active: bool = False) -> bool:
        try:
            # Normalize timestamp to a datetime instance
            ts: datetime
            if isinstance(timestamp, datetime):
                ts = timestamp
            elif isinstance(timestamp, str) and timestamp:
                try:
                    ts = datetime.fromisoformat(timestamp)
                except Exception:
                    ts = datetime.now()
            else:
                ts = datetime.now()

            with self.Session() as s:
                rec = ActivityLog(
                    timestamp=ts,
                    app_name=app_name,
                    window_title=window_title,
                    idle_time=idle_time,
                    classification=classification or "neutral",
                    is_active=1 if is_active else 0,
                )
                s.add(rec)
                s.commit()
            return True
        except Exception as e:
            self.logger.error(f"store_activity_event failed: {e}")
            return False

    def get_daily_breakdown(self) -> Dict[str, int]:
        try:
            with self.Session() as s:
                rows = s.query(DailyFocusBreakdown).all()
                return {row.category: getattr(row, "time", 0) for row in rows}
        except Exception as e:
            self.logger.error(f"get_daily_breakdown failed: {e}")
            return {}

    def get_dashboard_summary(self, target_date: date) -> Dict:
        try:
            with self.Session() as s:
                # Get hourly breakdown first (which has normalization built in)
                hourly_data = self.get_hourly_breakdown(target_date)
                
                # Sum up validated hourly data to get daily totals
                total_min = sum(h["productive"] + h["neutral"] + h["distracting"] for h in hourly_data)
                prod_min = sum(h["productive"] for h in hourly_data)
                neutral_min = sum(h["neutral"] for h in hourly_data)
                dist_min = sum(h["distracting"] for h in hourly_data)
                
                focus_score = int(round((prod_min / total_min) * 100, 0)) if total_min > 0 else 0
                return {
                    "total_active_minutes": int(total_min),
                    "productive_minutes": int(prod_min),
                    "neutral_minutes": int(neutral_min),
                    "distracting_minutes": int(dist_min),
                    "focus_score": focus_score,
                }
        except Exception as e:
            self.logger.error(f"get_dashboard_summary failed: {e}")
            return {
                "total_active_minutes": 0,
                "productive_minutes": 0,
                "neutral_minutes": 0,
                "distracting_minutes": 0,
                "focus_score": 0,
            }

    def get_top_applications(self, target_date: date, limit: int = 10) -> List[Dict]:
        try:
            with self.Session() as s:
                rows = (
                    s.query(
                        ActivityLog.id,
                        ActivityLog.timestamp,
                        ActivityLog.app_name,
                        ActivityLog.classification,
                    )
                    .filter(func.date(ActivityLog.timestamp) == target_date)
                    .filter(ActivityLog.is_active == 1)  # Only count active window logs
                    .order_by(ActivityLog.timestamp.asc(), ActivityLog.id.asc())
                    .all()
                )

                counted_minute_slots = set()
                aggregates: Dict[tuple, int] = {}
                total_time = 0

                for r in rows:
                    timestamp = r.timestamp
                    if isinstance(timestamp, str):
                        try:
                            timestamp = datetime.fromisoformat(timestamp)
                        except ValueError:
                            continue

                    minute_slot = timestamp.strftime("%Y-%m-%d %H:%M")
                    if minute_slot in counted_minute_slots:
                        continue

                    counted_minute_slots.add(minute_slot)
                    app_name = (r.app_name or "").strip()

                    # Skip rows that look like file paths to avoid polluted app labels
                    if any(pattern in app_name.lower() for pattern in [":\\", "users\\", ".db", ".py", ".exe", "/users/", "onedrive"]):
                        continue

                    classification = (r.classification or "neutral").lower()
                    key = (app_name, classification)
                    aggregates[key] = aggregates.get(key, 0) + SAMPLE_INTERVAL_SECONDS
                    total_time += SAMPLE_INTERVAL_SECONDS

                if total_time <= 0:
                    return []

                results = [
                    {
                        "app_name": app,
                        "classification": cls,
                        "total_seconds": int(seconds),
                        "percentage": round((seconds / total_time) * 100, 2),
                    }
                    for (app, cls), seconds in aggregates.items()
                ]

                results.sort(key=lambda item: item["total_seconds"], reverse=True)
                return results[:limit]
        except Exception as e:
            self.logger.error(f"get_top_applications failed: {e}")
            return []

    def get_hourly_breakdown(self, target_date: date) -> List[Dict]:
        try:
            with self.Session() as s:
                results = (
                    s.query(
                        ActivityLog.id,
                        ActivityLog.timestamp,
                        ActivityLog.classification,
                    )
                    .filter(func.date(ActivityLog.timestamp) == target_date)
                    .filter(ActivityLog.is_active == 1)  # Only count active window logs
                    .order_by(ActivityLog.timestamp.asc(), ActivityLog.id.asc())
                    .all()
                )

                hours: Dict[str, Dict] = {}
                counted_minute_slots = set()

                for r in results:
                    timestamp = r.timestamp
                    if isinstance(timestamp, str):
                        try:
                            timestamp = datetime.fromisoformat(timestamp)
                        except ValueError:
                            continue

                    minute_slot = timestamp.strftime("%Y-%m-%d %H:%M")
                    if minute_slot in counted_minute_slots:
                        continue

                    counted_minute_slots.add(minute_slot)
                    hour = timestamp.strftime("%H:00")
                    if hour not in hours:
                        hours[hour] = {"hour": hour, "productive": 0, "neutral": 0, "distracting": 0, "total": 0}

                    if r.classification in ("focused", "productive"):
                        hours[hour]["productive"] += 1
                    elif r.classification == "neutral":
                        hours[hour]["neutral"] += 1
                    else:
                        hours[hour]["distracting"] += 1

                for hour_data in hours.values():
                    hour_data["total"] = hour_data["productive"] + hour_data["neutral"] + hour_data["distracting"]

                data = list(hours.values())
                data.sort(key=lambda x: x["hour"])
                return data
        except Exception as e:
            self.logger.error(f"get_hourly_breakdown failed: {e}")
            return []

    def get_recent_activities(self, limit: Optional[int] = 20, hours: Optional[int] = None) -> List[Dict]:
        """Return recent active-window activity rows for the UI.

        Args:
            limit: Maximum rows to return. If None, no explicit row cap is applied.
            hours: Optional lookback window in hours.
        """
        try:
            with self.Session() as s:
                query = (
                    s.query(ActivityLog)
                    .filter(ActivityLog.is_active == 1)
                    .order_by(ActivityLog.timestamp.desc())
                )

                if hours is not None and hours > 0:
                    cutoff = datetime.now() - timedelta(hours=hours)
                    query = query.filter(ActivityLog.timestamp >= cutoff)

                if limit is not None and limit > 0:
                    query = query.limit(limit)

                rows = query.all()

                return [
                    {
                        "id": r.id,
                        "timestamp": r.timestamp.isoformat() if getattr(r, "timestamp", None) else None,
                        "app_name": r.app_name,
                        "window_title": r.window_title,
                        "idle_time": int(r.idle_time or 0),
                        "classification": r.classification or "neutral",
                    }
                    for r in rows
                ]
        except Exception as e:
            self.logger.error(f"get_recent_activities failed: {e}")
            return []

    # ------------------------------------------------------------------
    # New aggregation helpers for richer dashboard components
    # ------------------------------------------------------------------
    def get_classification_breakdown(self, target_date: date) -> Dict[str, int]:
        """Return seconds spent per classification for a given date."""
        try:
            with self.Session() as s:
                results = (
                    s.query(
                        ActivityLog.classification,
                        func.coalesce(func.sum(ActivityLog.idle_time), 0).label("total_seconds"),
                    )
                    .filter(func.date(ActivityLog.timestamp) == target_date)
                    .group_by(ActivityLog.classification)
                    .all()
                )
                breakdown = {"focused": 0, "neutral": 0, "distracted": 0}
                for r in results:
                    cls = (r.classification or "neutral").lower()
                    seconds = int(r.total_seconds or 0)
                    if cls in ("focused", "productive"):
                        breakdown["focused"] += seconds
                    elif cls == "neutral":
                        breakdown["neutral"] += seconds
                    else:
                        breakdown["distracted"] += seconds
                breakdown["total"] = breakdown["focused"] + breakdown["neutral"] + breakdown["distracted"]
                return breakdown
        except Exception as e:
            self.logger.error(f"get_classification_breakdown failed: {e}")
            return {"focused": 0, "neutral": 0, "distracted": 0, "total": 0}

    def get_productivity_trend(self, days: int = 7) -> List[Dict]:
        """Return daily focus metrics for recent N days (including today)."""
        try:
            end_date = date.today()
            start_date = end_date - timedelta(days=days - 1)
            with self.Session() as s:
                rows = (
                    s.query(
                        ActivityLog.id,
                        ActivityLog.timestamp,
                        ActivityLog.classification,
                    )
                    .filter(func.date(ActivityLog.timestamp) >= start_date)
                    .filter(func.date(ActivityLog.timestamp) <= end_date)
                    .filter(ActivityLog.is_active == 1)
                    .order_by(ActivityLog.timestamp.asc(), ActivityLog.id.asc())
                    .all()
                )

                per_day: Dict[str, Dict[str, int]] = {}
                counted_minute_slots = set()

                for r in rows:
                    timestamp = r.timestamp
                    if isinstance(timestamp, str):
                        try:
                            timestamp = datetime.fromisoformat(timestamp)
                        except ValueError:
                            continue

                    minute_slot = timestamp.strftime("%Y-%m-%d %H:%M")
                    if minute_slot in counted_minute_slots:
                        continue

                    counted_minute_slots.add(minute_slot)
                    day_str = timestamp.strftime("%Y-%m-%d")
                    cls = (r.classification or "neutral").lower()
                    bucket = per_day.setdefault(day_str, {"focused": 0, "neutral": 0, "distracted": 0})

                    if cls in ("focused", "productive"):
                        bucket["focused"] += SAMPLE_INTERVAL_SECONDS
                    elif cls == "neutral":
                        bucket["neutral"] += SAMPLE_INTERVAL_SECONDS
                    else:
                        bucket["distracted"] += SAMPLE_INTERVAL_SECONDS

                trend: List[Dict] = []
                for i in range(days):
                    d = start_date + timedelta(days=i)
                    key = d.strftime("%Y-%m-%d")
                    raw = per_day.get(key, {"focused": 0, "neutral": 0, "distracted": 0})

                    focused_seconds = raw["focused"]
                    distracted_seconds = raw["distracted"]
                    total_min = (focused_seconds + distracted_seconds) / 60.0
                    prod_min = focused_seconds / 60.0
                    focus_score = int(round((prod_min / total_min) * 100, 0)) if total_min > 0 else 0

                    trend.append({
                        "date": key,
                        "focused_seconds": focused_seconds,
                        "neutral_seconds": raw["neutral"],
                        "distracted_seconds": distracted_seconds,
                        "focus_score": focus_score,
                    })
                return trend
        except Exception as e:
            self.logger.error(f"get_productivity_trend failed: {e}")
            return []