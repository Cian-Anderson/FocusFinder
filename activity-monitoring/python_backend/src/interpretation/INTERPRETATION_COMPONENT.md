# Interpretation Component

- Responsible for classifying user activity and extracting ADHD-relevant patterns
- Source: `activity-monitoring/python_backend/src/interpretation/`
- Main modules: `activity_classifier.py`, `adhd_helper.py`, `bandit_service.py`

---

## Modules

### activity_classifier.py
- Classifies each activity event as `focused`, `neutral`, or `distracted`
- Uses app name, window title, and time of day
- Integrates with `ADHDHelper` for advanced pattern detection
- Can update classifications and manage custom app lists

### adhd_helper.py
- Detects ADHD-specific patterns: hyperfocus, rapid switching, time since last break, distraction severity
- Uses user settings (thresholds, medication times) from the database
- Updates daily ADHD insights

### bandit_service.py
- Loads and interfaces with the UCB multi-armed bandit algorithm
- Chooses adaptive feedback actions based on context
- Logs bandit events and rewards
- Handles reward normalization and action configuration

---

## Data Flow

1. `ActivityClassifier` classifies each event and can update recent activities
2. `ADHDHelper` provides pattern detection and insights for the dashboard
3. `bandit_service.py` selects and logs adaptive feedback actions
