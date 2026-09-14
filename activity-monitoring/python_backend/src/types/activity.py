# Initialize Activity with app_name, timestamp, idle_time, window_title, classification.
class Activity:
    def __init__(
        self,
        app_name: str,
        timestamp: str,
        idle_time: float,
        window_title: str = "",
        classification: str = None
    ):
        self.app_name = app_name
        self.timestamp = timestamp
        self.idle_time = idle_time
        self.window_title = window_title
        self.classification = classification 

    # Return string representation of Activity.
    def __repr__(self):
        return (
            f"Activity(app_name={self.app_name}, "
            f"timestamp={self.timestamp}, "
            f"idle_time={self.idle_time}, "
            f"window_title={self.window_title}, "
            f"classification={self.classification})"
        )