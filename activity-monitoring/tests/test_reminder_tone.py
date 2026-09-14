# These checks verify that all reminder messages delivered to the user are
# supportive and non-judgemental in tone (NFR8).
# The tests check every reminder message string defined in REMINDER_TYPES
# (the seeded reminder content used by the system) against a list of
# harsh, negative, or judgemental words and phrases that would be
# inappropriate for an ADHD-aware application.
# They also confirm that the bandit ACTION_CONFIGS only reference
# reminder type categories that are known, supportive types.
import importlib.util
import unittest
from pathlib import Path



# Load REMINDER_TYPES from reset_and_seed.py dynamically
def _load_reminder_types():
    root = Path(__file__).resolve().parents[1]  # activity-monitoring-component
    seed_path = root / "python_backend" / "reset_and_seed.py"
    spec = importlib.util.spec_from_file_location("reset_and_seed", seed_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.REMINDER_TYPES


def _load_bandit_module():
    root = Path(__file__).resolve().parents[2]  # final-year-project
    bandit_path = root / "reinforcement-algorithm" / "python" / "bandit.py"
    spec = importlib.util.spec_from_file_location("bandit", bandit_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


# Words that are inappropriate for a supportive, non-judgemental ADHD tool.
# Any reminder message containing one of these would fail the tone check.
HARSH_WORDS = [
    "failed", "failure", "lazy", "useless", "pathetic", "stupid", "idiot",
    "wasted", "loser", "worthless", "incompetent", "hopeless", "give up",
    "distracted again", "stop wasting", "you should have", "why haven't you",
    "as usual", "typical", "unproductive again",
]

# The complete set of reminder type categories the system is designed to use.
# Any category not in this list would be unexpected and worth flagging.
KNOWN_SUPPORTIVE_TYPES = {
    "reward", "hydration", "time-check", "focus-prep", "task-switch",
    "break", "hyperfocus", "movement", "posture",
}


class TestReminderTone(unittest.TestCase):

    def setUp(self):
        self.reminder_types = _load_reminder_types()
        self.bandit_mod = _load_bandit_module()

    def test_no_reminder_message_contains_harsh_language(self):
        """All reminder messages are free of harsh or judgemental language (NFR8)."""
        for type_key, title, message, _ in self.reminder_types:
            lowered = message.lower()
            for word in HARSH_WORDS:
                self.assertNotIn(
                    word,
                    lowered,
                    f"Reminder '{type_key}' message contains harsh word '{word}': {message!r}",
                )

    def test_no_reminder_title_contains_harsh_language(self):
        """All reminder titles are free of harsh or judgemental language (NFR8)."""
        for type_key, title, _, _ in self.reminder_types:
            lowered = title.lower()
            for word in HARSH_WORDS:
                self.assertNotIn(
                    word,
                    lowered,
                    f"Reminder '{type_key}' title contains harsh word '{word}': {title!r}",
                )

    def test_all_reminder_messages_are_non_empty(self):
        """Every reminder type has a non-empty title and message."""
        for type_key, title, message, _ in self.reminder_types:
            self.assertTrue(title.strip(), f"Reminder '{type_key}' has an empty title")
            self.assertTrue(message.strip(), f"Reminder '{type_key}' has an empty message")

    def test_bandit_action_configs_use_only_known_supportive_types(self):
        """All bandit action preferred_types reference known, supportive reminder categories (NFR8)."""
        for action, config in self.bandit_mod.ACTION_CONFIGS.items():
            for preferred in config.get("preferred_types", []):
                self.assertIn(
                    preferred,
                    KNOWN_SUPPORTIVE_TYPES,
                    f"Action '{action}' references unknown/unsupported type '{preferred}'",
                )


if __name__ == "__main__":
    unittest.main()
