# These checks make sure activity tracking records the right details.
# They use simple stand-in data so we can focus on whether saving works,
# whether window details are returned, and whether timing settings are updated.
# Example input: app_name="TestApp", idle_time=10, window_title="Test Window".
import unittest
from python_backend.src.monitoring.activity_tracker import ActivityTracker


class _FakeDbManager:
    # Stand-in DB manager for activity tracker tests.
    def __init__(self):
        self.calls = []

        class _Logger:
            # Stand-in logger for DB manager.
            @staticmethod
            def log_idle_time(_idle):
                return None

            @staticmethod
            def log_error(_msg):
                return None

        self.logger = _Logger()

    # Store activity event in call log.
    def store_activity_event(self, **kwargs):
        self.calls.append(kwargs)
        return True


class _FakeIdleDetector:
    # Stand-in idle detector for tests.
    @staticmethod
    def get_idle_duration():
        return 0


class _FakeWindowTracker:
    # Stand-in window tracker for tests.
    @staticmethod
    def get_active_window():
        return {"process_name": "Code", "title": "main.py - Visual Studio Code"}


class TestActivityTracker(unittest.TestCase):
    # Set up fake DB and tracker for each test.
    def setUp(self):
        self.fake_db = _FakeDbManager()
        self.activity_tracker = ActivityTracker(
            db_manager=self.fake_db,
            idle_detector=_FakeIdleDetector(),
            window_tracker=_FakeWindowTracker(),
            classifier=None,
            logger=None,
        )

    # Test: Returns active window metadata with expected keys.
    def test_get_active_window_title(self):
        title = self.activity_tracker.get_active_window_title()
        self.assertIsInstance(title, dict)
        self.assertIn("process_name", title)
        self.assertIn("title", title)

    # Test: Stores an activity event with the provided fields.
    def test_record_activity_event(self):
        ok = self.activity_tracker.record_activity_event(
            app_name="TestApp",
            idle_time=10,
            window_title="Test Window",
        )
        self.assertTrue(ok)
        self.assertEqual(len(self.fake_db.calls), 1)
        self.assertEqual(self.fake_db.calls[0]["app_name"], "TestApp")
        self.assertEqual(self.fake_db.calls[0]["idle_time"], 10)

    # Test: Updates the tracker polling interval value.
    def test_set_monitoring_interval(self):
        self.activity_tracker.set_monitoring_interval(30)
        self.assertEqual(self.activity_tracker.monitoring_interval, 30)

if __name__ == '__main__':
    unittest.main()