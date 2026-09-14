# These checks confirm how long inactivity is measured.
# They use fixed times to verify idle minutes, whether someone counts as idle,
# and whether activity resets to the latest time.
# Example input: last_activity_time=100 with current_time=106/112 and thresholds 10, 20.
import unittest
from python_backend.src.monitoring.idle_detector import IdleDetector


class TestIdleDetector(unittest.TestCase):
    def setUp(self):
        self.idle_detector = IdleDetector()

    def test_check_idle_time(self):
        """Calculates idle duration from last activity timestamp."""
        self.idle_detector.last_activity_time = 100
        self.idle_detector.get_current_time = lambda: 106
        self.assertEqual(self.idle_detector.check_idle_time(), 6)

    def test_is_user_idle(self):
        """Evaluates idle state against different thresholds."""
        self.idle_detector.last_activity_time = 100
        self.idle_detector.get_current_time = lambda: 112
        self.assertTrue(self.idle_detector.is_user_idle(threshold=10))
        self.assertFalse(self.idle_detector.is_user_idle(threshold=20))

    def test_reset_activity(self):
        """Resets activity timestamp to current time source."""
        self.idle_detector.get_current_time = lambda: 250
        self.idle_detector.reset_activity()
        self.assertEqual(self.idle_detector.last_activity_time, 250)

if __name__ == '__main__':
    unittest.main()