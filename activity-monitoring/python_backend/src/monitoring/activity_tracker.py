from datetime import datetime
import time
from typing import Optional, Dict

class ActivityTracker:
    # Initialise ActivityTracker with db_manager, idle_detector, window_tracker, classifier, logger.
    def __init__(self, db_manager, idle_detector, window_tracker, classifier=None, logger=None):
        self.db_manager = db_manager
        self.idle_detector = idle_detector
        self.window_tracker = window_tracker
        self.classifier = classifier
        self.logger = logger
        self.is_monitoring = False
        self.monitoring_interval = 60 

    # Get active window info. Returns dict with title/process_name, or None.
    def get_active_window_title(self) -> Optional[Dict]:
        return self.window_tracker.get_active_window()

    # Record activity event to DB. Returns True if recorded, False otherwise.
    def record_activity_event(self, app_name: str, idle_time: int, window_title: str = None, is_active: bool = False) -> bool:
        try:
            timestamp = self.get_current_timestamp()

            # Derive classification using classifier if available
            classification = None
            if self.classifier is not None:
                try:
                    classification = self.classifier.classify_activity({
                        'app_name': app_name,
                        'window_title': window_title or '',
                        'timestamp': timestamp
                    })
                except Exception as ce:
                    if self.logger:
                        try:
                            self.logger.log_error(f"Classification failed: {ce}")
                        except Exception as log_err:
                            print(f"Failed to log classification error: {log_err}")
                    classification = None

            self.db_manager.store_activity_event(
                app_name=app_name,
                timestamp=timestamp,
                idle_time=idle_time,
                window_title=window_title,
                classification=classification,
                is_active=is_active
            )
            return True
        except Exception as e:
            # keep logging lightweight
            try:
                if self.logger:
                    self.logger.log_error(f"Error recording activity event: {e}")
                else:
                    self.db_manager.logger.log_error(f"Error recording activity event: {e}")
            except Exception:
                print(f"Error recording activity event: {e}")
            return False

    # Get current timestamp in ISO format.
    def get_current_timestamp(self) -> str:
        return datetime.now().isoformat()

    # Start monitoring loop. Uses idle_detector.get_idle_duration().
    def start_monitoring(self) -> None:
        print("Activity monitoring started...")
        self.is_monitoring = True

        try:
            while self.is_monitoring:
                active_window = self.get_active_window_title()
                # always get raw idle duration (seconds)
                idle_duration = self.idle_detector.get_idle_duration()

                # log idle duration (if logger present)
                try:
                    self.db_manager.logger.log_idle_time(idle_duration)
                except Exception as log_err:
                    print(f"Failed to log idle time: {log_err}")

                if active_window is None:
                    # still record an "idle or no active window" event
                    self.record_activity_event(app_name="NoActiveWindow", idle_time=idle_duration, window_title="", is_active=False)
                    time.sleep(self.monitoring_interval)
                    continue

                self.record_activity_event(
                    app_name=active_window.get('process_name', 'Unknown'),
                    idle_time=idle_duration,
                    window_title=active_window.get('title', ''),
                    is_active=True
                )

                time.sleep(self.monitoring_interval)

        except KeyboardInterrupt:
            print("Monitoring stopped by user")
            self.stop_monitoring()
        except Exception as e:
            print(f"Error during monitoring: {e}")
            self.stop_monitoring()

    # Stop the monitoring loop.
    def stop_monitoring(self) -> None:
        self.is_monitoring = False
        print("Activity monitoring stopped")

    # Set monitoring interval in seconds.
    def set_monitoring_interval(self, interval: int) -> None:
        if interval > 0:
            self.monitoring_interval = interval
        else:
            raise ValueError("Monitoring interval must be greater than 0")