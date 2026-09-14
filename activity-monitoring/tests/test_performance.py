# These checks provide quantitative evidence that key operations complete within
# acceptable time bounds, supporting NFR2 (unobtrusive monitoring) and NFR3
# (minimal CPU / memory usage).
# Each test measures wall-clock time for a single operation and asserts it
# finishes within a generous threshold that would be imperceptible to a user.
# Thresholds: classifier < 100 ms, bandit UCB decision < 100 ms,
#             DB write < 500 ms (includes SQLAlchemy session overhead).
import importlib.util
import os
import tempfile
import time
import unittest
import logging
from pathlib import Path
from unittest.mock import patch

from python_backend.src.interpretation.activity_classifier import ActivityClassifier
from python_backend.src.database.db_manager import DbManager



# Helpers shared across tests
class _SilentLogger(logging.Logger):
    # Logger that suppresses output during performance tests.
    def __init__(self):
        super().__init__("test_performance")
        self.addHandler(logging.NullHandler())


def _load_bandit_module():
    # Dynamically load the bandit module for performance tests.
    root = Path(__file__).resolve().parents[2]
    bandit_path = root / "reinforcement-algorithm" / "python" / "bandit.py"
    spec = importlib.util.spec_from_file_location("bandit", bandit_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _make_classifier():
    # Create an ActivityClassifier with patched ADHDHelper for isolated performance tests.
    with patch(
        "python_backend.src.interpretation.adhd_helper.ADHDHelper.__init__",
        return_value=None,
    ):
        clf = ActivityClassifier(db_manager=object(), logger=_SilentLogger())
    clf.adhd_helper.adjust_classification_for_time_of_day = lambda base, _ts: base
    return clf


def _make_db():
    # Create a temporary database for DB write performance tests.
    tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
    tmp.close()
    os.environ["DB_PATH"] = tmp.name
    return DbManager(logger=_SilentLogger()), tmp.name



# Test: classifier response time is under 100 ms
class TestClassifierPerformance(unittest.TestCase):
    # Set up classifier for each performance test.
    def setUp(self):
        self.classifier = _make_classifier()

    # Test: classify_activity call completes in under 100 ms (NFR3).
    def test_single_classification_under_100ms(self):
        record = {
            "app_name": "Visual Studio Code",
            "window_title": "main.py",
            "timestamp": "2026-04-16T10:00:00",
        }
        start = time.perf_counter()
        self.classifier.classify_activity(record)
        elapsed_ms = (time.perf_counter() - start) * 1000
        self.assertLess(elapsed_ms, 100, f"Classification took {elapsed_ms:.1f} ms — exceeds 100 ms threshold")



# Test: bandit UCB decision completes in under 100 ms
class TestBanditDecisionPerformance(unittest.TestCase):
    # Set up bandit module and context for each performance test.
    def setUp(self):
        self.mod = _load_bandit_module()
        self.arms = list(self.mod.ACTION_CONFIGS.keys())
        self.stats = {a: {"count": 0.0, "mean": 0.0} for a in self.arms}
        self.ctx = {
            "current_category": "neutral",
            "switches_last_10_min": 3,
            "idle_minutes_last_30": 2,
            "focus_streak_minutes": 15,
            "time_of_day_bucket": "morning",
        }

    # Test: UCB action selection completes in under 100 ms (NFR2/NFR3).
    def test_bandit_ucb_decision_under_100ms(self):
        start = time.perf_counter()
        self.mod.choose_action_with_ucb(self.ctx, self.stats)
        elapsed_ms = (time.perf_counter() - start) * 1000
        self.assertLess(elapsed_ms, 100, f"Bandit decision took {elapsed_ms:.1f} ms — exceeds 100 ms threshold")



# Test: DB write completes in under 500 ms
class TestDbWritePerformance(unittest.TestCase):
    # Set up and tear down a temporary DB for each performance test.
    def setUp(self):
        self.db, self.db_path = _make_db()

    def tearDown(self):
        self.db.close()
        os.environ.pop("DB_PATH", None)
        try:
            os.unlink(self.db_path)
        except OSError:
            pass

    # Test: store_activity_event call completes in under 500 ms (NFR3).
    def test_single_activity_write_under_500ms(self):
        start = time.perf_counter()
        self.db.store_activity_event(
            app_name="TestApp",
            window_title="Test Window",
            idle_time=0,
            classification="focused",
            is_active=True,
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        self.assertLess(elapsed_ms, 500, f"DB write took {elapsed_ms:.1f} ms — exceeds 500 ms threshold")


if __name__ == "__main__":
    unittest.main()
