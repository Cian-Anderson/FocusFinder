import os
from datetime import datetime
import sys

class Logger:
    # Initialize Logger with log_dir (default 'logs').
    def __init__(self, log_dir="logs"):
        self.log_dir = log_dir
        os.makedirs(log_dir, exist_ok=True)
        
        # Set UTF-8 encoding for console output
        if sys.platform == "win32":
            sys.stdout.reconfigure(encoding='utf-8')
            sys.stderr.reconfigure(encoding='utf-8')
    
    # Write log message with level and timestamp.
    def _write(self, level, message):
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        line = f"[{timestamp}] {level}: {message}"
        
        # Print to console with UTF-8 encoding
        try:
            print(line)
        except UnicodeEncodeError:
            # Fallback: remove emojis if encoding fails
            clean_message = message.encode('ascii', 'ignore').decode('ascii')
            print(f"[{timestamp}] {level}: {clean_message}")
        
        # Write to log file
        log_file = os.path.join(self.log_dir, f"{datetime.now().strftime('%Y-%m-%d')}.log")
        try:
            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line + "\n")
        except Exception as e:
            print(f"Failed to write to log file: {e}")
    
    # Log info message.
    def log(self, message):
        self._write("INFO", message)
    
    # Log error message.
    def log_error(self, message):
        self._write("ERROR", message)
    
    # Log warning message.
    def log_warning(self, message):
        self._write("WARNING", message)

    # Log idle time if idle_seconds > 300.
    def log_idle_time(self, idle_seconds):
        if idle_seconds > 300:
            minutes = idle_seconds // 60
            self.log(f"User idle for {minutes} minutes")