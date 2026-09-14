# Math helpers used by UCB formula:
# - log(...) for the exploration bonus numerator
# - sqrt(...) for standard UCB square-root term
from math import log, sqrt
from typing import Dict, Any
from src.database.db_manager import DbManager
from pathlib import Path

# adjust path as needed
db_path = Path("../../../database-component/data/activity_monitor.db")

# All possible bandit actions (arms), each with UI/timing behavior the frontend can apply.
ACTION_CONFIGS: Dict[str, Dict[str, Any]] = {
    # Gentle reminder, long delay before next reminder.
    "soft_nudge_long_delay": {
        "suppress": False,                 # show reminder
        "window_mode": "subtle",           # less intrusive popup style
        "priority_override": "low",        # low urgency
        "duration_ms": 12000,              # popup visible 12s
        "interval_min_ms": 30 * 60 * 1000, # next reminder lower bound: 30 min
        "interval_max_ms": 55 * 60 * 1000, # next reminder upper bound: 55 min
        "preferred_types": ["reward", "hydration", "time-check"],
    },

    # Medium strength prompt with medium wait range.
    "focus_prompt_medium_delay": {
        "suppress": False,
        "window_mode": "standard",
        "priority_override": "medium",
        "duration_ms": 15000,
        "interval_min_ms": 15 * 60 * 1000,
        "interval_max_ms": 35 * 60 * 1000,
        "preferred_types": ["focus-prep", "task-switch", "time-check"],
    },

    # Stronger break/focus-interrupt style reminder with shorter delay.
    "break_prompt_short_delay": {
        "suppress": False,
        "window_mode": "assertive",
        "priority_override": "high",
        "duration_ms": 20000,
        "interval_min_ms": 8 * 60 * 1000,
        "interval_max_ms": 22 * 60 * 1000,
        "preferred_types": ["break", "hyperfocus", "movement"],
    },

    # Intentionally do not show a reminder, but still define timing bounds.
    "suppress_reminder": {
        "suppress": True,                  # no popup
        "window_mode": "subtle",
        "priority_override": "low",
        "duration_ms": 0,
        "interval_min_ms": 20 * 60 * 1000,
        "interval_max_ms": 45 * 60 * 1000,
        "preferred_types": [],
    },
}

# Prior expectation for each action before enough data exists.
# Used to stabilize early behavior when arm counts are low.
DEFAULT_PRIORS: Dict[str, float] = {
    "soft_nudge_long_delay": 0.20,
    "focus_prompt_medium_delay": 0.30,
    "break_prompt_short_delay": 0.22,
    "suppress_reminder": 0.18,
}


def get_action_config(action: str) -> Dict[str, Any]:
    # Return config for selected action. Fallback to a safe default action if unknown key is passed.
    return ACTION_CONFIGS.get(action, ACTION_CONFIGS["focus_prompt_medium_delay"])


def arm_context_adjustment(action: str, context: Dict[str, Any]) -> float:
    # Add a small rule-based context bonus/penalty to each arm score.
    # Makes action choice sensitive to current behavior signals (distracted vs focused, switch rate, idle time, focus streak, time bucket).
    # Lightweight contextual layer on top of UCB.
    category = str(context.get("current_category") or "neutral").lower()
    focus_mins = max(0.0, float(context.get("focus_streak_minutes") or 0.0))
    idle_mins = max(0.0, float(context.get("idle_minutes_last_30") or 0.0))
    switches = max(0, int(context.get("switches_last_10_min") or 0))

    delta = 0.0  # additive adjustment for this arm in this context

    if action == "break_prompt_short_delay":
        # Boost for scattered/idle/switch-heavy users.
        if category in {"distracted"} or switches >= 5 or idle_mins >= 8:
            delta += 0.28
        # Penalize aggressive prompting if already focused and stable.
        if category in {"focused", "productive"} and focus_mins < 35 and switches <= 2:
            delta -= 0.25

    elif action == "focus_prompt_medium_delay":
        # Medium prompts are good for neutral/distracted states.
        if category in {"neutral", "distracted"}:
            delta += 0.12
        # Extra bump if switching is elevated.
        if switches >= 4:
            delta += 0.08

    elif action == "soft_nudge_long_delay":
        # Reward low-intrusion when user is working smoothly.
        if category in {"focused", "productive"} and switches <= 2 and idle_mins < 4:
            delta += 0.16
        # Penalize soft nudges when user is distracted.
        if category == "distracted":
            delta -= 0.18

    elif action == "suppress_reminder":
        # Suppress only when focus is strong and stable.
        if category in {"focused", "productive"} and focus_mins >= 25 and switches <= 1 and idle_mins < 3:
            delta += 0.2
        # Strong penalty for suppression if behavior indicates drift/distraction.
        if category == "distracted" or switches >= 4 or idle_mins >= 6:
            delta -= 0.35

    # Small evening preference toward less intrusive actions.
    if str(context.get("time_of_day_bucket") or "").lower() == "evening" and action in {
        "soft_nudge_long_delay",
        "suppress_reminder",
    }:
        delta += 0.05

    return delta


def choose_action_with_ucb(
    context: Dict[str, Any],
    arm_stats: Dict[str, Dict[str, float]],
    exploration_c: float = 0.65,
) -> Dict[str, Any]:
    # Contextual UCB chooser. Returns the best action and debug info.
    # Inputs:
    #   context: current behavior/time features
    #   arm_stats: per-arm learning state, expected shape:
    #       arm_stats[action] = {"count": <num_plays>, "mean": <avg_reward>}
    #   exploration_c: exploration strength
    # Score per arm:
    #   score = base + exploration + context_adjustment
    #   base = 0.65 * empirical_mean + 0.35 * prior
    #   exploration = c * sqrt(2*log(total_count+2)/(count+1))
    arms = list(ACTION_CONFIGS.keys())

    # Total interaction count across arms (for UCB exploration term).
    total_count = sum(float(arm_stats.get(arm, {}).get("count", 0.0)) for arm in arms)

    scores: Dict[str, float] = {}
    for arm in arms:
        stats = arm_stats.get(arm, {})

        # How often this arm was selected.
        count = float(stats.get("count", 0.0))

        # Learned average reward for this arm (if never used, default 0).
        empirical = float(stats.get("mean", 0.0)) if count > 0 else 0.0

        # Prior baseline to avoid extreme cold-start behavior.
        prior = DEFAULT_PRIORS.get(arm, 0.0)

        # Blend learned performance and prior.
        base = (0.65 * empirical) + (0.35 * prior)

        # UCB exploration bonus (math formula):
        # - larger when total traffic grows
        # - larger for less-sampled arms (small count)
        exploration = exploration_c * sqrt(max(0.0, (2.0 * log(total_count + 2.0)) / (count + 1.0)))

        # Final arm score combines global learning + local context heuristics.
        scores[arm] = base + exploration + arm_context_adjustment(arm, context)

    # Pick the arm with highest final score.
    best_action = max(scores, key=lambda arm: scores[arm])

    # Return action + resolved UI config + debug/telemetry score map.
    return {
        "action": best_action,
        "config": get_action_config(best_action),
        "scores": scores,
        "policy": "bandit-contextual-ucb-v1",
    }
