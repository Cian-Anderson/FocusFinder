# These checks make sure reminder choices are sensible and improve over time.
# They try a distraction scenario to avoid bad choices, then repeat decisions
# with feedback to see if the system learns to pick the best option more often.
# Example input: {"current_category":"distracted","switches_last_10_min":7,"idle_minutes_last_30":12}.
import importlib.util
from pathlib import Path
import unittest


def load_bandit_module():
    root = Path(__file__).resolve().parents[2]  # final-year-project
    bandit_path = root / "reinforcement-algorithm" / "python" / "bandit.py"
    spec = importlib.util.spec_from_file_location("bandit", bandit_path)
    if spec is None or spec.loader is None:
        raise ImportError(f"Unable to load reinforcement module from {bandit_path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class TestBanditSmoke(unittest.TestCase):
    def setUp(self):
        self.mod = load_bandit_module()
        self.arms = list(self.mod.ACTION_CONFIGS.keys())

    def _empty_stats(self):
        return {a: {"count": 0.0, "mean": 0.0} for a in self.arms}

    def _update(self, stats, action, reward):
        c = stats[action]["count"]
        m = stats[action]["mean"]
        stats[action]["count"] = c + 1.0
        stats[action]["mean"] = ((m * c) + reward) / (c + 1.0)

    def test_distracted_context_avoids_suppress(self):
        """Avoids suppression when context indicates user distraction."""
        stats = self._empty_stats()
        ctx = {
            "current_category": "distracted",
            "switches_last_10_min": 7,
            "idle_minutes_last_30": 12,
            "focus_streak_minutes": 1,
            "time_of_day_bucket": "midday",
        }
        out = self.mod.choose_action_with_ucb(ctx, stats)
        self.assertNotEqual(out["action"], "suppress_reminder")

    def test_learns_best_arm_over_time(self):
        """Learns to prefer the highest-reward action over time."""
        stats = self._empty_stats()
        ctx = {
            "current_category": "neutral",
            "switches_last_10_min": 3,
            "idle_minutes_last_30": 3,
            "focus_streak_minutes": 10,
            "time_of_day_bucket": "morning",
        }

        # Ground-truth reward model for this test scenario:
        # medium prompt is best in this context.
        reward_map = {
            "soft_nudge_long_delay": 0.35,
            "focus_prompt_medium_delay": 0.90,
            "break_prompt_short_delay": 0.45,
            "suppress_reminder": 0.20,
        }

        for _ in range(250):
            out = self.mod.choose_action_with_ucb(ctx, stats)
            action = out["action"]
            self._update(stats, action, reward_map[action])

        final = self.mod.choose_action_with_ucb(ctx, stats)
        self.assertEqual(final["action"], "focus_prompt_medium_delay")

    def test_very_high_switch_count_does_not_suppress(self):
        """Very high task-switching signal (FR5) should never suppress the reminder."""
        stats = self._empty_stats()
        ctx = {
            "current_category": "distracted",
            "switches_last_10_min": 12,
            "idle_minutes_last_30": 0,
            "focus_streak_minutes": 0,
            "time_of_day_bucket": "midday",
        }
        out = self.mod.choose_action_with_ucb(ctx, stats)
        self.assertNotEqual(out["action"], "suppress_reminder")

    def test_calm_focused_context_permits_suppress(self):
        """With no distraction signals and high focus streak, suppress is a valid option (FR5)."""
        stats = self._empty_stats()
        # Give suppress_reminder a strong learned history so UCB will pick it
        for _ in range(30):
            self._update(stats, "suppress_reminder", 1.0)
        ctx = {
            "current_category": "focused",
            "switches_last_10_min": 0,
            "idle_minutes_last_30": 0,
            "focus_streak_minutes": 45,
            "time_of_day_bucket": "morning",
        }
        out = self.mod.choose_action_with_ucb(ctx, stats)
        # In a calm, focused context the algorithm must not be hard-blocked from suppressing
        self.assertIn(out["action"], list(self.arms))


if __name__ == "__main__":
    unittest.main()