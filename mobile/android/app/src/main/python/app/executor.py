import re
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
    "gmail": "com.google.android.gm",
    "instagram": "com.instagram.android",
    "telegram": "org.telegram.messenger",
    "music": "com.google.android.apps.youtube.music",
    "files": "com.google.android.apps.nbu.files",
}

SYSTEM_SETTINGS_NAMES = {"wifi", "wi-fi", "bluetooth", "location", "sound", "display", "battery", "apps"}

class ActionExecutor:
    """Translates high-level tool calls into concrete Android Intent payloads."""

    @staticmethod
    def resolve_action(call_name: str, arguments: Dict[str, Any]) -> Dict[str, Any]:
        # Filter out internal keys to avoid circular references
        clean_args = {k: v for k, v in arguments.items() if k != "_resolved_android"}

        # 1. Open Application / System Settings routing
        if call_name == "open_application":
            app_name = str(clean_args.get("app_name", "")).strip().lower()
            if app_name in SYSTEM_SETTINGS_NAMES:
                return {
                    "android_action": "OPEN_SETTING",
                    "setting_name": app_name.replace("-", "")
                }
            package_name = PACKAGE_MAP.get(app_name)
            return {
                "android_action": "OPEN_APP",
                "app_name": app_name,
                "package_name": package_name,
                "target_view": clean_args.get("target_view")
            }

        # 2. Battery Saver
        elif call_name == "set_battery_saver":
            enabled = bool(clean_args.get("enabled", True))
            return {
                "android_action": "SET_BATTERY_SAVER",
                "enabled": enabled,
                "intent_fallback": "android.settings.BATTERY_SAVER_SETTINGS"
            }

        # 3. Screen Brightness
        elif call_name == "set_brightness":
            percent = int(clean_args.get("level", 50))
            clamped = max(0, min(100, percent))
            system_val = int((clamped / 100.0) * 255)
            return {
                "android_action": "SET_BRIGHTNESS",
                "percent": clamped,
                "system_value": system_val
            }

        # 4. Do Not Disturb
        elif call_name == "set_do_not_disturb":
            enabled = bool(clean_args.get("enabled", True))
            return {
                "android_action": "SET_DND",
                "enabled": enabled,
                "filter": "PRIORITY" if enabled else "ALL"
            }

        # 5. Flashlight / Torch
        elif call_name == "toggle_flashlight":
            enabled = bool(clean_args.get("enabled", True))
            return {
                "android_action": "TOGGLE_FLASHLIGHT",
                "enabled": enabled
            }

        # 6. Volume Adjustment
        elif call_name == "adjust_volume":
            vol_action = str(clean_args.get("action") or clean_args.get("volume_action") or "up").lower()
            level = clean_args.get("level_percent", 50)
            return {
                "android_action": "ADJUST_VOLUME",
                "action": vol_action,
                "level_percent": int(level) if level is not None else 50
            }

        # 7. Media Playback (Play/Pause/Next)
        elif call_name == "control_media":
            action = str(clean_args.get("action") or clean_args.get("media_action") or "play_pause").lower()
            return {
                "android_action": "CONTROL_MEDIA",
                "action": action
            }

        # 8. Start Countdown Timer
        elif call_name == "start_timer":
            minutes = int(clean_args.get("duration_minutes", 1))
            seconds = minutes * 60
            label = clean_args.get("label", "Timer")
            return {
                "android_action": "START_TIMER",
                "intent": "android.intent.action.SET_TIMER",
                "length_seconds": seconds,
                "message": label,
                "skip_ui": False
            }

        # 9. Set Alarm
        elif call_name == "set_alarm":
            hour = int(clean_args.get("hour", 7))
            minute = int(clean_args.get("minute", 0))
            am_pm = clean_args.get("am_pm")
            if am_pm == "pm" and hour < 12:
                hour += 12
            elif am_pm == "am" and hour == 12:
                hour = 0
            label = clean_args.get("label", "Alarm")
            return {
                "android_action": "SET_ALARM",
                "hour": hour,
                "minute": minute,
                "label": label,
                "skip_ui": False
            }

        # 10. Phone Call
        elif call_name == "make_phone_call":
            contact = str(clean_args.get("contact_or_number", "")).strip()
            return {
                "android_action": "MAKE_CALL",
                "contact_or_number": contact
            }

        # 11. SMS
        elif call_name == "send_sms":
            return {
                "android_action": "SEND_SMS",
                "recipient": str(clean_args.get("recipient", "")).strip(),
                "message": str(clean_args.get("message", "")).strip()
            }

        # 12. WhatsApp
        elif call_name == "send_whatsapp":
            return {
                "android_action": "SEND_WHATSAPP",
                "recipient": str(clean_args.get("recipient", "")).strip(),
                "message": str(clean_args.get("message", "")).strip()
            }

        # 13. Email
        elif call_name == "send_email":
            return {
                "android_action": "SEND_EMAIL",
                "recipient": str(clean_args.get("recipient", "")).strip(),
                "subject": str(clean_args.get("subject", "")).strip(),
                "body": str(clean_args.get("body", "")).strip()
            }

        # 14. Turn-by-turn Navigation
        elif call_name == "navigate_to":
            return {
                "android_action": "NAVIGATE_TO",
                "destination": str(clean_args.get("destination", "")).strip()
            }

        # 15. Web Search
        elif call_name == "search_web":
            raw_query = str(clean_args.get("query", "")).strip()
            # Defensive redirect: If web search was invoked for a YouTube or Spotify query, route to the app
            if re.search(r'\b(youtube|youtubes|youtubr|yt)\b', raw_query, re.IGNORECASE):
                yt_target = re.sub(r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+', '', raw_query, flags=re.IGNORECASE)
                yt_target = re.sub(r'\b(?:on|in|from|via|with|inside)\s+(?:youtube|youtubes|youtubr|yt)\b', '', yt_target, flags=re.IGNORECASE).strip()
                if not yt_target or yt_target.lower() in ("youtube", "youtubes", "youtubr", "yt"):
                    yt_target = "songs"
                return {
                    "android_action": "SEARCH_YOUTUBE",
                    "query": yt_target
                }
            if re.search(r'\b(spotify|spotifi)\b', raw_query, re.IGNORECASE):
                sp_target = re.sub(r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+', '', raw_query, flags=re.IGNORECASE)
                sp_target = re.sub(r'\b(?:on|in|from|via|with|inside)\s+(?:spotify|spotifi)\b', '', sp_target, flags=re.IGNORECASE).strip()
                if not sp_target or sp_target.lower() in ("spotify", "spotifi"):
                    sp_target = "songs"
                return {
                    "android_action": "SEARCH_SPOTIFY",
                    "query": sp_target
                }
            return {
                "android_action": "SEARCH_WEB",
                "query": raw_query
            }

        # 16. YouTube Search & Auto-Play
        elif call_name == "search_youtube":
            raw_query = str(clean_args.get("query", "")).strip()
            cleaned_q = re.sub(r'\b(?:on|in|from|via|with|inside)\s+(?:youtube|youtubes|youtubr|yt)\b', '', raw_query, flags=re.IGNORECASE).strip()
            cleaned_q = re.sub(r'^(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+', '', cleaned_q, flags=re.IGNORECASE).strip()
            if not cleaned_q or cleaned_q.lower() in ("youtube", "youtubes", "youtubr", "yt"):
                cleaned_q = "songs"
            return {
                "android_action": "SEARCH_YOUTUBE",
                "query": cleaned_q
            }

        # 16b. Spotify Search & Auto-Play
        elif call_name == "search_spotify":
            raw_query = str(clean_args.get("query", "")).strip()
            cleaned_q = re.sub(r'\b(?:on|in|from|via|with|inside)\s+(?:spotify|spotifi)\b', '', raw_query, flags=re.IGNORECASE).strip()
            cleaned_q = re.sub(r'^(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+', '', cleaned_q, flags=re.IGNORECASE).strip()
            if not cleaned_q or cleaned_q.lower() in ("spotify", "spotifi"):
                cleaned_q = "songs"
            return {
                "android_action": "SEARCH_SPOTIFY",
                "query": cleaned_q
            }

        # 17. Device Settings
        elif call_name == "open_system_setting":
            setting = str(clean_args.get("setting_name", "settings")).lower().replace("-", "")
            return {
                "android_action": "OPEN_SETTING",
                "setting_name": setting
            }

        # 18. Clipboard
        elif call_name == "copy_to_clipboard":
            return {
                "android_action": "COPY_CLIPBOARD",
                "text": str(clean_args.get("text", "")).strip()
            }

        # 19. College Timetable
        elif call_name == "open_timetable":
            day = clean_args.get("day")
            return {
                "android_action": "NAVIGATE_SCREEN",
                "screen": "CollegeTimetable",
                "params": {"day": day}
            }

        # 20. Check Notifications
        elif call_name in ("check_notifications", "check_notification", "read_notifications"):
            min_priority = clean_args.get("min_priority", "high")
            category_filter = clean_args.get("category_filter", "all")
            return {
                "android_action": "CHECK_NOTIFICATIONS",
                "min_priority": min_priority,
                "category_filter": category_filter,
                "screen": "Notifications"
            }

        # 21. Battery Status
        elif call_name in ("get_battery_status", "battery_status", "check_battery"):
            return {
                "android_action": "GET_BATTERY_STATUS"
            }

        # 22. Ringer Sound Mode
        elif call_name in ("set_ringer_mode", "set_sound_mode"):
            mode = str(clean_args.get("mode", "normal")).lower()
            return {
                "android_action": "SET_RINGER_MODE",
                "mode": mode
            }

        # 23. Camera & Selfie
        elif call_name in ("open_camera", "take_photo", "take_selfie"):
            mode = str(clean_args.get("mode", "rear")).lower()
            return {
                "android_action": "OPEN_CAMERA",
                "mode": mode
            }

        # 24. Take Screenshot
        elif call_name in ("take_screenshot", "capture_screen"):
            return {
                "android_action": "TAKE_SCREENSHOT"
            }

        # 25. Lock Screen
        elif call_name in ("lock_screen", "turn_off_screen"):
            return {
                "android_action": "LOCK_SCREEN"
            }

        # 26. Notification Panel
        elif call_name == "open_notification_panel":
            return {
                "android_action": "OPEN_NOTIFICATION_PANEL"
            }

        # 27. Quick Settings Panel
        elif call_name == "open_quick_settings":
            return {
                "android_action": "OPEN_QUICK_SETTINGS"
            }

        # 28. Smart Routines & Macros
        elif call_name in ("execute_routine", "run_routine"):
            routine = str(clean_args.get("routine_name") or clean_args.get("routine", "good_morning")).lower()
            return {
                "android_action": "EXECUTE_ROUTINE",
                "routine": routine
            }

        return {
            "android_action": "UNKNOWN",
            "call_name": call_name,
            "raw_arguments": clean_args
        }
