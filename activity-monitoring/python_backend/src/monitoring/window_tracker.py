import time
from typing import Optional, Dict, List
import pygetwindow as gw

class WindowTracker:
    # Initialise WindowTracker.
    def __init__(self):
        self.last_window: Optional[str] = None
        self.window_switch_count: int = 0
        self.last_switch_time: float = time.time()

    # Get active window title and process name. Returns dict with 'title'/'process_name' keys, or None if no window detected.
    def get_active_window(self) -> Optional[Dict[str, str]]:
        try:
            active = gw.getActiveWindow()
            if active is None:
                return None

            title = getattr(active, "title", "") or ""
            # track switches
            if title != self.last_window:
                self.window_switch_count += 1
                self.last_switch_time = time.time()
                self.last_window = title

            return {
                "title": title,
                "process_name": self._extract_process_name(title)
            }
        except Exception as e:
            print(f"Error getting active window: {e}")
            return None

    # Get all visible windows. Returns list of dicts with title/process_name, or None if none found.
    def get_window_contents(self) -> Optional[List[Dict[str, str]]]:
        try:
            all_windows = gw.getAllWindows()
            active = gw.getActiveWindow()
            visible_windows: List[Dict[str, str]] = []

            for w in all_windows:
                try:
                    title = getattr(w, "title", "") or ""
                    # skip empty/anonymous windows
                    if not title.strip():
                        continue

                    # Determine visibility defensively:
                    width = getattr(w, "width", None)
                    height = getattr(w, "height", None)

                    if width is not None and height is not None:
                        visible = (width > 0 and height > 0)
                    else:
                        # fallback: assume visible if it has a title
                        visible = True

                    if not visible:
                        continue

                    is_active = False
                    if active is not None:
                        is_active = (getattr(active, "title", "") == title)

                    visible_windows.append({
                        "title": title,
                        "process_name": self._extract_process_name(title),
                        "is_active": is_active,
                        "left": getattr(w, "left", None),
                        "top": getattr(w, "top", None),
                        "width": width,
                        "height": height
                    })
                except Exception as e:
                    print(f"Skipping problematic window object: {e}")

            return visible_windows if visible_windows else None
        except Exception as e:
            print(f"Error getting window contents: {e}")
            return None

    # Extract app name from window title. Handles 'Doc - App' patterns. Filters file paths. Returns process name string.
    def _extract_process_name(self, window_title: str) -> str:
        if not window_title:
            return "Unknown"

        # Helper to detect if a string looks like a file path
        def looks_like_path(s: str) -> bool:
            s_lower = s.lower()
            return ((":\\" in s or ":/" in s) and any(x in s for x in ["users", "documents", "desktop", "appdata"])) or s.endswith((".db", ".txt", ".py", ".json", ".exe"))

        # Common delimiters used by many apps: " - ", " — ", " | "
        for delim in (" - ", " — ", " | "):
            if delim in window_title:
                parts = window_title.split(delim)
                # Check both first and last parts
                first_part = parts[0].strip()
                last_part = parts[-1].strip()
                
                # Prefer the last part (usually app name) unless it looks like a path
                if last_part and not looks_like_path(last_part) and len(last_part) < 100:
                    return last_part
                # Otherwise use first part if it looks reasonable
                if first_part and not looks_like_path(first_part) and len(first_part) < 100:
                    return first_part

        # fallback: first token is usually the app name
        parts = window_title.split()
        if parts and len(parts[0]) < 50 and not looks_like_path(parts[0]):
            return parts[0].strip()
        
        return "Unknown"

    # Return number of window switches since init.
    def get_window_switch_count(self) -> int:
        return self.window_switch_count

    # Reset window switch counter.
    def reset_switch_count(self) -> None:
        self.window_switch_count = 0