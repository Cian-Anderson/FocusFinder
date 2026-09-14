"""
Main entry point for Activity Monitoring backend.
Initializes monitoring, classifier, logger, and API server.
"""
import sys
import os
import ctypes

# Fix Windows console encoding for emojis
if sys.platform == "win32":
    try:
        ctypes.windll.kernel32.SetConsoleOutputCP(65001)
    except Exception as e:
        print(f"Failed to set Windows console code page: {e}")
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')

from .monitoring.activity_tracker import ActivityTracker
from .monitoring.idle_detector import IdleDetector
from .monitoring.window_tracker import WindowTracker
from .database.db_manager import DbManager
from .utils.logger import Logger
from .interpretation.activity_classifier import ActivityClassifier
from .api.server import run_api_server
import threading

def main():
    logger = Logger()
    db = DbManager(logger)
    classifier = ActivityClassifier(db_manager=db, logger=logger)
    
    # Initialize monitoring components
    idle_detector = IdleDetector()
    window_tracker = WindowTracker()
    
    # ActivityTracker requires (db_manager, idle_detector, window_tracker)
    activity_tracker = ActivityTracker(db, idle_detector, window_tracker)
    
    # Inject remaining dependencies
    activity_tracker.classifier = classifier
    activity_tracker.logger = logger
    
    # Start monitoring in background thread
    monitor_thread = threading.Thread(
        target=activity_tracker.start_monitoring,
        daemon=True
    )
    monitor_thread.start()
    
    logger.log("Activity monitoring started")
    
    host = os.environ.get("MONITORING_HOST", "127.0.0.1")
    try:
        port = int(os.environ.get("MONITORING_PORT", "5000"))
    except ValueError:
        port = 5000
    debug = os.environ.get("MONITORING_DEBUG", "false").lower() in ("1", "true", "yes")

    # Start API server (blocks here) - keep debug off by default to avoid reloader caching.
    run_api_server(host=host, port=port, debug=debug)

if __name__ == "__main__":
    main()