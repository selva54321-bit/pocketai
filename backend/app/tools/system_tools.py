from typing import Literal, Optional
import cactus

@cactus.tool(triggers=[
    r"\b(open|launch|start|switch to)\b.*\b(app|youtube|timetable|whatsapp|camera|spotify|browser|chrome|maps|calendar|settings|calculator|clock)\b",
    r"\bopen\b",
    r"\blaunch\b"
])
def open_application(app_name: str, target_view: Optional[str] = None):
    """Open an installed application (such as YouTube, College Timetable, WhatsApp, Settings, Camera, Clock)."""
    return {
        "action": "open_app",
        "app_name": app_name.strip().lower(),
        "target_view": target_view
    }

@cactus.tool(triggers=[
    r"\b(battery saver|power saver|low power mode)\b",
    r"\b(turn|switch|enable|disable)\b.*\b(battery saver|power saver)\b.*\b(on|off)\b"
])
def set_battery_saver(enabled: bool):
    """Turn device battery saver / power saver mode on or off."""
    return {
        "action": "set_battery_saver",
        "enabled": enabled
    }

@cactus.tool(triggers=[
    r"\b(brightness)\b.*\b(\d{1,3}%?)\b",
    r"\bset brightness\b",
    r"\b(dim|brighten)\b.*\b(screen|display)\b"
])
def set_brightness(level: int):
    """Set screen brightness percentage from 0 to 100."""
    return {
        "action": "set_brightness",
        "level": max(0, min(100, int(level)))
    }

@cactus.tool(triggers=[
    r"\b(do not disturb|dnd)\b",
    r"\b(turn|switch|enable|disable)\b.*\b(do not disturb|dnd)\b.*\b(on|off)\b"
])
def set_do_not_disturb(enabled: bool):
    """Turn Do Not Disturb (DND) mode on or off."""
    return {
        "action": "set_dnd",
        "enabled": enabled
    }

@cactus.tool(triggers=[
    r"\b(timer|countdown)\b.*\b(\d+)\b.*\b(second|minute|hour)s?\b",
    r"\b(start|set)\b.*\b(\d+)\b.*(minute|second|hour)\b.*\btimer\b"
])
def start_timer(duration_minutes: int, label: Optional[str] = "Timer"):
    """Start a countdown timer with the specified duration in minutes and optional label."""
    return {
        "action": "start_timer",
        "duration_minutes": duration_minutes,
        "label": label or "Timer"
    }

@cactus.tool(triggers=[
    r"\b(college timetable|timetable|class schedule|schedule)\b",
    r"\bopen\b.*\b(timetable|schedule)\b"
])
def open_timetable(day_of_week: Optional[str] = None):
    """Open the college timetable or class schedule for the current or specified day."""
    return {
        "action": "open_timetable",
        "day": day_of_week
    }
