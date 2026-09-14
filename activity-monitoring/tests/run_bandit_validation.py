# This script runs a full health check for reminder decision behavior.
# It runs tests, calls the related APIs, and then repeats decision + feedback
# rounds to check that choices improve in the expected direction.
# Example input: choose payload for "Visual Studio Code" with neutral context and timed reminder features.
import subprocess
import sys
from collections import Counter
import importlib
from pathlib import Path


def run_command(cmd, cwd: Path, label: str) -> None:
    print(f"\n=== {label} ===")
    print(f"$ {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True)
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip())
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed with exit code {result.returncode}")


def resolve_create_app(project_root: Path):
    python_backend = project_root / "python_backend"
    if str(python_backend) not in sys.path:
        sys.path.insert(0, str(python_backend))

    module = importlib.import_module("src.api.server")
    return getattr(module, "create_app")


def run_api_loop(project_root: Path) -> None:
    print("\n=== Step 3: API choose/reward/events check ===")
    create_app = resolve_create_app(project_root)

    app = create_app()
    client = app.test_client()

    payload = {
        "current_app": "Visual Studio Code",
        "current_category": "neutral",
        "time_since_last_reminder": 15.0,
        "focus_streak_minutes": 18.0,
        "idle_minutes_last_30": 2.0,
        "switches_last_10_min": 3,
        "user_is_adhd": True,
        "time_of_day_bucket": "midday",
    }

    choose = client.post("/api/ml/bandit/choose?profile=adhd", json=payload).get_json()
    if not choose or not choose.get("success"):
        raise RuntimeError(f"Choose API failed: {choose}")

    event_id = choose["data"]["event_id"]
    chosen_action = choose["data"]["chosen_action"]
    action_config = choose["data"].get("action_config", {})

    reward = client.post(
        "/api/ml/bandit/reward?profile=adhd",
        json={"event_id": event_id, "reward": 0.8, "note": "run_bandit_validation_step3"},
    ).get_json()
    if not reward or not reward.get("success"):
        raise RuntimeError(f"Reward API failed: {reward}")

    events = client.get("/api/ml/bandit-events?profile=adhd&limit=100").get_json()
    if not events or not events.get("success"):
        raise RuntimeError(f"Events API failed: {events}")

    found = [e for e in events["data"] if int(e["id"]) == int(event_id)]
    if not found:
        raise RuntimeError("Created event_id not found in bandit-events response")

    print(f"Chosen action: {chosen_action}")
    print(f"Action config keys: {sorted(action_config.keys())}")
    print(f"Reward stored response: {reward['data']}")


def run_adaptation_check(project_root: Path) -> None:
    print("\n=== Step 4: Adaptation/convergence check ===")
    create_app = resolve_create_app(project_root)

    app = create_app()
    client = app.test_client()

    base_payload = {
        "current_app": "Visual Studio Code",
        "current_category": "neutral",
        "time_since_last_reminder": 12.0,
        "focus_streak_minutes": 12.0,
        "idle_minutes_last_30": 2.0,
        "switches_last_10_min": 3,
        "user_is_adhd": True,
        "time_of_day_bucket": "morning",
    }

    reward_map = {
        "soft_nudge_long_delay": 0.30,
        "focus_prompt_medium_delay": 0.95,
        "break_prompt_short_delay": 0.45,
        "suppress_reminder": 0.20,
    }

    chosen_actions = []
    rounds = 40

    for _ in range(rounds):
        choose = client.post("/api/ml/bandit/choose?profile=adhd", json=base_payload).get_json()
        if not choose or not choose.get("success"):
            raise RuntimeError(f"Choose API failed during adaptation run: {choose}")

        action = choose["data"]["chosen_action"]
        event_id = choose["data"]["event_id"]
        chosen_actions.append(action)

        reward = reward_map.get(action, 0.0)
        reward_res = client.post(
            "/api/ml/bandit/reward?profile=adhd",
            json={"event_id": event_id, "reward": reward, "note": "run_bandit_validation_step4"},
        ).get_json()
        if not reward_res or not reward_res.get("success"):
            raise RuntimeError(f"Reward API failed during adaptation run: {reward_res}")

    counts = Counter(chosen_actions)
    top_action, top_count = counts.most_common(1)[0]

    print(f"Action counts: {dict(counts)}")
    print(f"Top action: {top_action} ({top_count}/{rounds})")
    print(f"Last 10 actions: {chosen_actions[-10:]}")

    if top_action != "focus_prompt_medium_delay":
        raise RuntimeError(
            "Adaptation check failed: expected focus_prompt_medium_delay to dominate under reward model"
        )


def main() -> int:
    project_root = Path(__file__).resolve().parents[1]

    try:
        run_command(
            [sys.executable, "-m", "unittest", "tests.test_bandit_smoke", "-v"],
            cwd=project_root,
            label="Step 1: Bandit smoke tests",
        )

        run_command(
            [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
            cwd=project_root,
            label="Step 2: Full backend test suite",
        )

        run_api_loop(project_root)
        run_adaptation_check(project_root)

        print("\n✅ Bandit validation PASSED (steps 1-4)")
        return 0
    except Exception as exc:
        print(f"\n❌ Bandit validation FAILED: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
