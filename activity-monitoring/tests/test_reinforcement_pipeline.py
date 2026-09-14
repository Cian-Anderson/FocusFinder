# These checks follow data from activity tracking into reminder decisions.
# They confirm the saved activity details are complete, and that API responses
# include the expected fields needed for later analysis.
# Example input payload includes app/category/timing keys sent to /api/ml/bandit/choose.
import json
import unittest
from python_backend.src.monitoring.activity_tracker import ActivityTracker
from python_backend.src.api.server import create_app


class _FakeDbManager:
    def __init__(self):
        self.calls = []

        class _Logger:
            @staticmethod
            def log_idle_time(_idle):
                return None

            @staticmethod
            def log_error(_msg):
                return None

        self.logger = _Logger()

    def store_activity_event(self, **kwargs):
        self.calls.append(kwargs)
        return True


class _FakeIdleDetector:
    @staticmethod
    def get_idle_duration():
        return 0


class _FakeWindowTracker:
    @staticmethod
    def get_active_window():
        return {"process_name": "Code", "title": "App.tsx - Visual Studio Code"}


class _FakeClassifier:
    @staticmethod
    def classify_activity(payload):
        assert "app_name" in payload
        assert "window_title" in payload
        return "focused"


class TestReinforcementPipeline(unittest.TestCase):
    def test_activity_tracker_records_fields_needed_for_rl_context(self):
        """Records activity fields required for RL context generation."""
        db = _FakeDbManager()
        tracker = ActivityTracker(
            db_manager=db,
            idle_detector=_FakeIdleDetector(),
            window_tracker=_FakeWindowTracker(),
            classifier=_FakeClassifier(),
            logger=None,
        )

        ok = tracker.record_activity_event(
            app_name="Visual Studio Code",
            idle_time=42,
            window_title="App.tsx - Visual Studio Code",
        )

        self.assertTrue(ok)
        self.assertEqual(len(db.calls), 1)

        recorded = db.calls[0]
        self.assertEqual(recorded["app_name"], "Visual Studio Code")
        self.assertEqual(recorded["idle_time"], 42)
        self.assertEqual(recorded["window_title"], "App.tsx - Visual Studio Code")
        self.assertEqual(recorded["classification"], "focused")
        self.assertIn("timestamp", recorded)
        self.assertIsInstance(recorded["timestamp"], str)

    def test_bandit_choose_persists_required_context_keys(self):
        """Persists all required bandit context keys in stored events."""
        app = create_app()
        client = app.test_client()

        payload = {
            "current_app": "Visual Studio Code",
            "current_category": "focused",
            "time_since_last_reminder": 21.5,
            "focus_streak_minutes": 57.0,
            "idle_minutes_last_30": 2.0,
            "switches_last_10_min": 3,
            "user_is_adhd": True,
            "time_of_day_bucket": "midday",
            "reminder_state": "hyperfocus",
        }

        choose_res = client.post("/api/ml/bandit/choose?profile=adhd", json=payload)
        self.assertEqual(choose_res.status_code, 200)

        choose_json = choose_res.get_json()
        self.assertTrue(choose_json["success"])
        event_id = choose_json["data"]["event_id"]

        events_res = client.get("/api/ml/bandit-events?profile=adhd&limit=100")
        self.assertEqual(events_res.status_code, 200)
        events_json = events_res.get_json()
        self.assertTrue(events_json["success"])

        matching = [e for e in events_json["data"] if int(e["id"]) == int(event_id)]
        self.assertTrue(matching, "Newly created bandit event not found in API response")

        context = json.loads(matching[0]["context_json"])
        expected_keys = {
            "current_app",
            "current_category",
            "time_since_last_reminder",
            "focus_streak_minutes",
            "idle_minutes_last_30",
            "switches_last_10_min",
            "user_is_adhd",
            "time_of_day_bucket",
            "reminder_state",
        }
        self.assertEqual(set(context.keys()), expected_keys)


if __name__ == "__main__":
    unittest.main()
