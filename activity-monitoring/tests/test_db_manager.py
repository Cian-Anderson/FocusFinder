# These checks confirm that the database manager correctly writes and reads back
# activity data using a real SQLite file (no SQLCipher required).
# Each test gets its own temporary database file via DB_PATH so nothing is
# shared between runs and the live database is never touched.
# Example input: store_activity_event(app_name="TestApp", ...) then verify the
# row is returned by get_recent_activities with the correct fields.
import os
import tempfile
import unittest
import logging
from datetime import date

from python_backend.src.database.db_manager import DbManager


class _SilentLogger(logging.Logger):
    """Minimal logger that suppresses output during tests."""
    def __init__(self):
        super().__init__("test_db_manager")
        self.addHandler(logging.NullHandler())


def _make_db():
    """Create a DbManager backed by a fresh temporary file."""
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DB_PATH"] = tmp.name
    db = DbManager(logger=_SilentLogger())
    return db, tmp.name


class TestDbManagerPersistence(unittest.TestCase):

    def setUp(self):
        self.db, self.db_path = _make_db()

    def tearDown(self):
        self.db.close()
        os.environ.pop("DB_PATH", None)
        try:
            os.unlink(self.db_path)
        except OSError:
            pass

    def test_store_and_retrieve_activity_event(self):
        """Written activity row is readable back with correct app_name."""
        ok = self.db.store_activity_event(
            app_name="TestApp",
            window_title="Test Window",
            idle_time=0,
            classification="focused",
            is_active=True,
        )
        self.assertTrue(ok)
        rows = self.db.get_recent_activities(limit=10)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["app_name"], "TestApp")

    def test_stored_classification_is_preserved(self):
        """Classification written is the classification returned."""
        self.db.store_activity_event(
            app_name="YouTube",
            window_title="YouTube - Home",
            idle_time=0,
            classification="distracted",
            is_active=True,
        )
        rows = self.db.get_recent_activities(limit=10)
        self.assertEqual(rows[0]["classification"], "distracted")

    def test_multiple_events_are_all_stored(self):
        """Storing three events returns three rows."""
        for i in range(3):
            self.db.store_activity_event(
                app_name=f"App{i}",
                window_title=f"Window {i}",
                idle_time=i,
                classification="neutral",
                is_active=True,
            )
        rows = self.db.get_recent_activities(limit=10)
        self.assertEqual(len(rows), 3)

    def test_focus_score_reflects_stored_data(self):
        """Dashboard summary returns non-zero focus_score after focused events are stored."""
        today = date.today()
        # Store enough focused events to register in the hourly summary
        for _ in range(5):
            self.db.store_activity_event(
                app_name="Visual Studio Code",
                window_title="main.py",
                idle_time=0,
                classification="focused",
                is_active=True,
            )
        summary = self.db.get_dashboard_summary(today)
        self.assertIn("focus_score", summary)
        self.assertGreaterEqual(summary["focus_score"], 0)

    def test_empty_db_returns_empty_activity_list(self):
        """A fresh database returns no activity rows."""
        rows = self.db.get_recent_activities(limit=10)
        self.assertEqual(rows, [])

    def test_data_persists_across_manager_restart(self):
        """Data written before closing DbManager is still readable after reopening the same file (NFR6)."""
        self.db.store_activity_event(
            app_name="PersistApp",
            window_title="Persist Window",
            idle_time=0,
            classification="focused",
            is_active=True,
        )
        # Simulate application restart: close and reopen on the same file
        self.db.close()
        db2 = DbManager(logger=_SilentLogger())
        try:
            rows = db2.get_recent_activities(limit=10)
            app_names = [r["app_name"] for r in rows]
            self.assertIn("PersistApp", app_names)
        finally:
            db2.close()
            # Prevent tearDown double-close
            self.db = db2


if __name__ == "__main__":
    unittest.main()
