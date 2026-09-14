# These checks confirm that the rule-based activity classifier assigns the correct
# category given different app names and window titles.
# The ADHD time-of-day adjustment is stubbed out so tests focus purely on
# the classification rules, not the time-aware layer.
# Example inputs: "Visual Studio Code" → focused, "YouTube" → distracted,
# "NoActiveWindow" → neutral, browser with "github" title → focused.
import unittest
from unittest.mock import patch
from python_backend.src.interpretation.activity_classifier import ActivityClassifier


class _FakeDbManager:
    # Stand-in DB manager for classifier tests.
    pass


class _FakeLogger:
    # Stand-in logger for classifier tests.
    @staticmethod
    def log_error(_msg):
        return None


def _make_classifier():
    # Create an ActivityClassifier with patched ADHDHelper for isolated rule-based tests.
    with patch(
        "python_backend.src.interpretation.adhd_helper.ADHDHelper.__init__",
        return_value=None,
    ):
        classifier = ActivityClassifier(
            db_manager=_FakeDbManager(),
            logger=_FakeLogger(),
        )
    classifier.adhd_helper.adjust_classification_for_time_of_day = (
        lambda base, _ts: base
    )
    return classifier


def _record(app_name, window_title=""):
    # Helper to create a record dict for classifier tests.
    return {
        "app_name": app_name,
        "window_title": window_title,
        "timestamp": "2026-04-16T10:00:00",
    }


class TestActivityClassifierRules(unittest.TestCase):
    # Set up classifier for each test.
    def setUp(self):
        self.classifier = _make_classifier()

    # Test: Named IDE is classified as focused.
    def test_known_focused_app_is_classified_focused(self):
        result = self.classifier.classify_activity(_record("Visual Studio Code", "main.py"))
        self.assertEqual(result, "focused")

    # Test: App name matching is case-insensitive.
    def test_focused_app_case_insensitive(self):
        result = self.classifier.classify_activity(_record("visual studio code", "main.py"))
        self.assertEqual(result, "focused")

    # Test: Window title containing a productive keyword → focused.
    def test_productive_window_title_keyword_gives_focused(self):
        result = self.classifier.classify_activity(_record("UnknownApp", "thesis - Word"))
        self.assertEqual(result, "focused")

    # Test: Named entertainment app is classified as distracted.
    def test_known_distracted_app_is_classified_distracted(self):
        result = self.classifier.classify_activity(_record("YouTube", "YouTube"))
        self.assertEqual(result, "distracted")

    # Test: Window title containing an entertainment keyword → distracted.
    def test_entertainment_window_title_keyword_gives_distracted(self):
        result = self.classifier.classify_activity(_record("Google Chrome", "funny memes - Reddit"))
        self.assertEqual(result, "distracted")

    # Test: NoActiveWindow sentinel value → neutral.
    def test_no_active_window_is_neutral(self):
        result = self.classifier.classify_activity(_record("NoActiveWindow"))
        self.assertEqual(result, "neutral")

    # Test: Empty app name → neutral.
    def test_empty_app_name_is_neutral(self):
        result = self.classifier.classify_activity(_record(""))
        self.assertEqual(result, "neutral")

    # Test: 'Unknown' app name → neutral.
    def test_unknown_sentinel_is_neutral(self):
        result = self.classifier.classify_activity(_record("Unknown"))
        self.assertEqual(result, "neutral")

    # Test: System utility app → neutral.
    def test_known_neutral_app_is_classified_neutral(self):
        result = self.classifier.classify_activity(_record("Calculator"))
        self.assertEqual(result, "neutral")

    # Test: Browser window (Firefox) showing GitHub → focused via browser heuristic.
    def test_browser_with_github_title_is_focused(self):
        result = self.classifier.classify_activity(
            _record("Firefox", "github - cian-collage/fyp")
        )
        self.assertEqual(result, "focused")

    # Test: Browser window (Firefox) showing a streaming site → distracted.
    def test_browser_with_entertainment_title_is_distracted(self):
        result = self.classifier.classify_activity(
            _record("Firefox", "netflix - continue watching")
        )
        self.assertEqual(result, "distracted")


if __name__ == "__main__":
    unittest.main()
