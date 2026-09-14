import time
from pynput import mouse, keyboard
from typing import Optional

# Initialise IdleDetector. idle_threshold = seconds to consider idle (default 5 min).
class IdleDetector:
   
    def __init__(self, idle_threshold: int = 300):
        self.idle_threshold = idle_threshold
        self.last_activity_time = time.time()
        self.is_listening = False
        self.mouse_listener = None
        self.keyboard_listener = None

    # Return current epoch time in seconds.
    def get_current_time(self) -> float:
        return time.time()

    # Return seconds since last input event (raw duration).
    def get_idle_duration(self) -> int:
        return int(self.get_current_time() - self.last_activity_time)

    # Return raw idle duration (same as get_idle_duration).
    def check_idle_time(self) -> int:
        return self.get_idle_duration()

    # Return True if idle duration >= threshold (default self.idle_threshold).
    def is_user_idle(self, threshold: Optional[int] = None) -> bool:
        th = threshold if threshold is not None else self.idle_threshold
        return self.get_idle_duration() >= th

    # Reset last-activity timestamp to now.
    def reset_activity(self) -> None:
        self.last_activity_time = self.get_current_time()

    # Start background listeners for mouse and keyboard events.
    def start_listening(self) -> None:
        if self.is_listening:
            return

        self.is_listening = True

        # mouse movement callback
        self.mouse_listener = mouse.Listener(
            on_move=lambda x, y: self.reset_activity(),
            on_click=lambda x, y, button, pressed: self.reset_activity(),
            on_scroll=lambda x, y, dx, dy: self.reset_activity()
        )
        self.mouse_listener.daemon = True
        self.mouse_listener.start()

        # keyboard callback
        self.keyboard_listener = keyboard.Listener(
            on_press=lambda key: self.reset_activity()
        )
        self.keyboard_listener.daemon = True
        self.keyboard_listener.start()

        print("Idle detection listeners started")

    # Stop listeners.
    def stop_listening(self) -> None:
        if not self.is_listening:
            return
        self.is_listening = False
        if self.mouse_listener:
            try:
                self.mouse_listener.stop()
            except Exception as e:
                print(f"Failed to stop mouse listener: {e}")
        if self.keyboard_listener:
            try:
                self.keyboard_listener.stop()
            except Exception as e:
                print(f"Failed to stop keyboard listener: {e}")
        print("Idle detection listeners stopped")