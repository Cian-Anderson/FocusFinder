# These checks make sure the app reads window information correctly.
# They use pretend window data to verify app names, ignore unusable entries,
# and correctly mark which window is currently active.
# Example input: active title "main.py - Visual Studio Code" and window list with one blank entry.
import unittest
from unittest.mock import patch
from python_backend.src.monitoring.window_tracker import WindowTracker
import python_backend.src.monitoring.window_tracker as window_tracker_module


class _FakeWindow:
    # Initialize fake window with title, position, and size.
    def __init__(self, title, left=0, top=0, width=800, height=600):
        self.title = title
        self.left = left
        self.top = top
        self.width = width
        self.height = height


class TestWindowTracker(unittest.TestCase):
    # Set up a WindowTracker instance for each test.
    def setUp(self):
        # Create a WindowTracker for use in tests.
        self.window_tracker = WindowTracker()

    # Test: gets active window details and resolves process name.
    def test_get_active_window_title(self):
        # Patch getActiveWindow to return a fake window and check process name resolution.
        with patch.object(window_tracker_module.gw, "getActiveWindow", return_value=_FakeWindow("main.py - Visual Studio Code")):
            window = self.window_tracker.get_active_window()

        if window is None:
            self.fail("Expected an active window result")
        self.assertIsInstance(window, dict)
        self.assertEqual(window["process_name"], "Visual Studio Code")

    # Test: returns visible windows and marks the active one.
    def test_get_window_contents(self):
        # Patch getActiveWindow and getAllWindows to return fake windows and check output list.
        active = _FakeWindow("main.py - Visual Studio Code")
        windows = [
            active,
            _FakeWindow("ChatGPT - Browser"),
            _FakeWindow("", width=0, height=0),
        ]

        with patch.object(window_tracker_module.gw, "getActiveWindow", return_value=active), \
             patch.object(window_tracker_module.gw, "getAllWindows", return_value=windows):
            contents = self.window_tracker.get_window_contents()

        if contents is None:
            self.fail("Expected window contents list")
        self.assertIsInstance(contents, list)
        self.assertEqual(len(contents), 2)
        self.assertTrue(any(w["is_active"] for w in contents))

if __name__ == '__main__':
    unittest.main()