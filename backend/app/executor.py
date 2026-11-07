from typing import Any, Dict, Optional

# Known popular package names for standard intents
PACKAGE_MAP: Dict[str, str] = {
    "youtube": "com.google.android.youtube",
    "whatsapp": "com.whatsapp",
    "spotify": "com.spotify.music",
    "camera": "com.android.camera",
    "settings": "com.android.settings",
    "chrome": "com.android.chrome",
    "browser": "com.android.chrome",
    "clock": "com.google.android.deskclock",
    "calculator": "com.google.android.calculator",
    "calendar": "com.google.android.calendar",
    "maps": "com.google.android.apps.maps",
}

class ActionExecutor:
    """Translates high-level tool calls into concrete Android Intent payloads."""

    @staticmethod
    def resolve_action(call_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        if call_name == "open_application":
            app_name = str(arguments.get("app_name", "")).strip().lower()
            package_name = PACKAGE_MAP.get(app_name)
            return {
                "android_action": "OPEN_APP",
                "app_name": app_name,
                "package_name": package_name,
                "target_view": arguments.get("target_view")
            }

        elif call_name == "set_battery_saver":
            enabled = bool(arguments.get("enabled", True))
            return {
                "android_action": "SET_BATTERY_SAVER",
                "enabled": enabled,
                "intent_fallback": "android.settings.BATTERY_SAVER_SETTINGS"
            }

        elif call_name == "set_brightness":
            percent = int(arguments.get("level", 50))
            clamped = max(0, min(100, percent))
            # Android brightness standard range is 0 - 255
            system_val = int((clamped / 100.0) * 255)
            return {
                "android_action": "SET_BRIGHTNESS",
                "percent": clamped,
                "system_value": system_val
            }

        elif call_name == "set_do_not_disturb":
            enabled = bool(arguments.get("enabled", True))
            return {
                "android_action": "SET_DND",
                "enabled": enabled,
                "filter": "PRIORITY" if enabled else "ALL"
            }

        elif call_name == "start_timer":
            minutes = int(arguments.get("duration_minutes", 1))
            seconds = minutes * 60
            label = arguments.get("label", "Timer")
            return {
                "android_action": "START_TIMER",
                "intent": "android.intent.action.SET_TIMER",
                "length_seconds": seconds,
                "message": label,
                "skip_ui": False
            }

        elif call_name == "open_timetable":
            day = arguments.get("day")
            return {
                "android_action": "NAVIGATE_SCREEN",
                "screen": "CollegeTimetable",
                "params": {"day": day}
            }

        return {
            "android_action": "UNKNOWN",
            "call_name": call_name,
            "raw_arguments": arguments
        }
