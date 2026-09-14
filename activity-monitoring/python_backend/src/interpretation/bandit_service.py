from dataclasses import dataclass
from datetime import datetime
import importlib.util
import json
from typing import Optional, Dict, Any, List
from pathlib import Path


@dataclass
class BanditContext:
    timestamp: datetime
    current_app: str
    current_category: str  # neutral / distracted / productive / focused
    time_since_last_reminder: float
    focus_streak_minutes: float
    idle_minutes_last_30: float
    switches_last_10_min: int
    user_is_adhd: bool
    time_of_day_bucket: str  # "morning", "midday", "afternoon", "evening"
    reminder_state: str = "normal_focus"  # on_break / hyperfocus / normal_focus / drifting_idle / high_task_switching


def _load_bandit_module():
    here = Path(__file__).resolve()
    module_candidates = [
        # Packaged app layout: resources/backend/adaptive-feedback/python/bandit.py
        here.parents[2] / "adaptive-feedback" / "python" / "bandit.py",
        # Dev layout: final-submission/adaptive-feedback/python/bandit.py
        here.parents[4] / "adaptive-feedback" / "python" / "bandit.py",
    ]

    module_path = next((candidate for candidate in module_candidates if candidate.exists()), None)
    if module_path is None:
        raise RuntimeError(
            "Unable to locate reinforcement algorithm module. Tried: "
            + ", ".join(str(path) for path in module_candidates)
        )

    spec = importlib.util.spec_from_file_location("bandit", module_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load reinforcement algorithm module at {module_path}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_bandit = _load_bandit_module()

ACTION_CONFIGS = _bandit.ACTION_CONFIGS
get_action_config = _bandit.get_action_config
choose_action_with_ucb = _bandit.choose_action_with_ucb
arm_context_adjustment = _bandit.arm_context_adjustment
DEFAULT_PRIORS = _bandit.DEFAULT_PRIORS


def reward_to_storage_int(reward: float) -> int:
    """Map reward in [-1.0, 1.0] to integer storage scale [-100, 100]."""
    bounded = max(-1.0, min(1.0, float(reward)))
    return int(round(bounded * 100.0))


def reward_from_storage_int(value: Optional[int]) -> float:
    """Map integer reward scale back to normalized [-1.0, 1.0]."""
    if value is None:
        return 0.0
    return max(-1.0, min(1.0, float(value) / 100.0))


def get_action_config(action: str) -> Dict[str, Any]:
    return _bandit.get_action_config(action)


def _historical_stats_for_arm(session, context: BanditContext, action: str, limit: int = 600) -> Dict[str, float]:
    from ..database.schema import BanditEvent

    rows: List[BanditEvent] = (
        session.query(BanditEvent)
        .filter(BanditEvent.chosen_action == action)
        .order_by(BanditEvent.timestamp.desc())
        .limit(limit)
        .all()
    )

    if not rows:
        return {"count": 0.0, "mean": 0.0}

    weighted_reward = 0.0
    weighted_count = 0.0
    target_category = (context.current_category or "neutral").lower()
    target_bucket = (context.time_of_day_bucket or "midday").lower()
    target_state = (context.reminder_state or "normal_focus").lower()

    matching_rows: List[BanditEvent] = []
    for r in rows:
        try:
            ctx = json.loads(r.context_json or "{}")
            if str(ctx.get("reminder_state", "")).lower() == target_state:
                matching_rows.append(r)
        except Exception:
            continue

    # Prefer truly state-matched history; fallback to all rows for cold-start stability.
    source_rows = matching_rows if matching_rows else rows

    for r in source_rows:
        w = 1.0
        try:
            ctx = json.loads(r.context_json or "{}")
            if str(ctx.get("reminder_state", "")).lower() == target_state:
                w += 0.8
            if str(ctx.get("current_category", "")).lower() == target_category:
                w += 0.6
            if str(ctx.get("time_of_day_bucket", "")).lower() == target_bucket:
                w += 0.3
            if bool(ctx.get("user_is_adhd", False)) == bool(context.user_is_adhd):
                w += 0.1
        except Exception:
            pass

        # Include all pulls in mean/count; unresolved reward (None) is treated as 0.0.
        weighted_reward += reward_from_storage_int(getattr(r, "reward", None)) * w
        weighted_count += w

    if weighted_count <= 0:
        return {"count": 0.0, "mean": 0.0}

    return {"count": weighted_count, "mean": weighted_reward / weighted_count}


def choose_reminder_decision(context: BanditContext, session=None) -> Dict[str, Any]:
    """
    Contextual UCB policy for reminder adaptation.
    Optimizes long-term productivity reward in [-1, 1] from feedback API.
    """
    arms = list(ACTION_CONFIGS.keys())
    context_dict = {
        "current_category": context.current_category,
        "focus_streak_minutes": context.focus_streak_minutes,
        "idle_minutes_last_30": context.idle_minutes_last_30,
        "switches_last_10_min": context.switches_last_10_min,
        "user_is_adhd": context.user_is_adhd,
        "time_of_day_bucket": context.time_of_day_bucket,
        "reminder_state": context.reminder_state,
    }

    # Fallback when no session is supplied (unit tests or offline use)
    if session is None:
        heuristic_scores = {
            arm: DEFAULT_PRIORS.get(arm, 0.0) + arm_context_adjustment(arm, context_dict)
            for arm in arms
        }
        best_action = max(heuristic_scores, key=heuristic_scores.get)
        return {
            "action": best_action,
            "config": get_action_config(best_action),
            "scores": heuristic_scores,
            "policy": "heuristic-fallback",
        }

    arm_stats = {arm: _historical_stats_for_arm(session, context, arm) for arm in arms}
    decision = choose_action_with_ucb(context_dict, arm_stats)
    return {
        "action": decision["action"],
        "config": decision["config"],
        "scores": decision["scores"],
        "policy": decision.get("policy", "bandit-contextual-ucb-v1"),
    }


def choose_reminder_action(context: BanditContext) -> str:
    """
    Compatibility wrapper.
    """
    return choose_reminder_decision(context, session=None)["action"]


def log_bandit_event(session, context: BanditContext, action: str, reward: Optional[int] = None, note: Optional[str] = "stub-policy") -> int:
    """Persist a bandit event via SQLAlchemy session; returns new ID."""
    from ..database.schema import BanditEvent  # local import to avoid circulars

    ctx_dict: Dict[str, Any] = {
        "current_app": context.current_app,
        "current_category": context.current_category,
        "time_since_last_reminder": context.time_since_last_reminder,
        "focus_streak_minutes": context.focus_streak_minutes,
        "idle_minutes_last_30": context.idle_minutes_last_30,
        "switches_last_10_min": context.switches_last_10_min,
        "user_is_adhd": context.user_is_adhd,
        "time_of_day_bucket": context.time_of_day_bucket,
        "reminder_state": context.reminder_state,
    }

    event = BanditEvent(
        timestamp=context.timestamp,
        context_json=json.dumps(ctx_dict),
        chosen_action=action,
        reward=reward,
        note=note,
    )
    session.add(event)
    session.commit()
    return int(event.id)
