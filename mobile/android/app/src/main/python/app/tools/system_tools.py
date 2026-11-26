from typing import Literal, Optional
import cactus

# -------------------------------------------------------------
# 1. Device Hardware & Connectivity Toggles
# -------------------------------------------------------------

@cactus.tool(triggers=[
    r"\b(open|launch|start|switch to)\b.*\b(app|youtube|timetable|whatsapp|camera|spotify|browser|chrome|maps|calendar|settings|calculator|clock|gmail|instagram)\b",
    r"\bopen\b",
    r"\blaunch\b"
])
def open_application(app_name: str, target_view: Optional[str] = None):
    """Open an installed application (such as YouTube, College Timetable, WhatsApp, Settings, Camera, Clock, Gmail)."""
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
    r"\b(flashlight|torch)\b",
    r"\b(turn|switch|toggle)\b.*\b(flashlight|torch)\b"
])
def toggle_flashlight(enabled: bool):
    """Turn phone flashlight or torch on or off."""
    return {
        "action": "toggle_flashlight",
        "enabled": enabled
    }

@cactus.tool(triggers=[
    r"\b(volume)\b.*\b(up|down|mute|unmute|max|percent|\d+)\b",
    r"\b(turn volume|set volume|mute volume|unmute volume)\b"
])
def adjust_volume(action: Literal["up", "down", "mute", "unmute", "max", "set"], level_percent: Optional[int] = None):
    """Raise, lower, mute, unmute, or set media and ring volume."""
    return {
        "action": "adjust_volume",
        "volume_action": action,
        "level_percent": level_percent or 50
    }

@cactus.tool(triggers=[
    r"\b(open|show|go to)\b.*\b(wifi|wi-fi|bluetooth|location|sound|display|battery|apps|settings)\b",
    r"\b(wifi|wi-fi|bluetooth|location)\b.*\bsettings\b"
])
def open_system_setting(setting_name: Literal["wifi", "bluetooth", "location", "sound", "display", "battery", "apps"]):
    """Open a specific device settings page (WiFi, Bluetooth, Location, Sound, Display, Battery, Apps)."""
    return {
        "action": "open_setting",
        "setting_name": setting_name.lower().replace("-", "")
    }

# -------------------------------------------------------------
# 2. Clocks, Timers & Alarms
# -------------------------------------------------------------

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
    r"\b(alarm)\b.*\b(\d{1,2}(:\d{2})?\s*(am|pm)?)\b",
    r"\b(set|wake me up)\b.*\balarm\b"
])
def set_alarm(hour: int, minute: int, am_pm: Optional[Literal["am", "pm"]] = None, label: Optional[str] = "Alarm"):
    """Set an alarm at a specific hour and minute with optional AM/PM label."""
    # Convert to 24hr format if AM/PM specified
    final_hour = hour
    if am_pm == "pm" and final_hour < 12:
        final_hour += 12
    elif am_pm == "am" and final_hour == 12:
        final_hour = 0

    return {
        "action": "set_alarm",
        "hour": final_hour,
        "minute": minute,
        "label": label or "Alarm"
    }

# -------------------------------------------------------------
# 3. Communication (Calls, SMS, WhatsApp, Email)
# -------------------------------------------------------------

@cactus.tool(triggers=[
    r"\b(call|dial)\b",
    r"\bphone\s+[a-zA-Z]+",
    r"\bmake a (call|phone call)\b"
])
def make_phone_call(contact_or_number: str):
    """Place a phone call or open the dialer for a contact name or phone number."""
    return {
        "action": "make_call",
        "contact_or_number": contact_or_number.strip()
    }

@cactus.tool(triggers=[
    r"\b(sms|text message|send text|send sms)\b"
])
def send_sms(recipient: str, message: str):
    """Send an SMS text message to a contact or phone number."""
    return {
        "action": "send_sms",
        "recipient": recipient.strip(),
        "message": message.strip()
    }

@cactus.tool(triggers=[
    r"\b(whatsapp|wa message)\b",
    r"\bsend\b.*\b(whatsapp)\b"
])
def send_whatsapp(recipient: str, message: str):
    """Send a WhatsApp message to a named contact or phone number."""
    return {
        "action": "send_whatsapp",
        "recipient": recipient.strip(),
        "message": message.strip()
    }

@cactus.tool(triggers=[
    r"\b(send email|email to|write email|compose email)\b"
])
def send_email(recipient: str, subject: str, body: str):
    """Compose and send an email with recipient, subject, and body."""
    return {
        "action": "send_email",
        "recipient": recipient.strip(),
        "subject": subject.strip(),
        "body": body.strip()
    }

# -------------------------------------------------------------
# 4. Navigation & Web Search
# -------------------------------------------------------------

@cactus.tool(triggers=[
    r"\b(navigate to|directions to|route to|take me to)\b",
    r"\bhow to go to\b"
])
def navigate_to(destination: str):
    """Open Google Maps GPS navigation to a specified address, business, or destination."""
    return {
        "action": "navigate_to",
        "destination": destination.strip()
    }

@cactus.tool(triggers=[
    r"^(?!.*\b(youtube|youtubes|yt|youtubr|spotify|spotifi)\b).*\b(google|search the web|search web|search for)\b",
    r"\bwho (is|was)\b",
    r"^(?!.*\b(youtube|youtubes|yt|youtubr|spotify|spotifi)\b).*\bsearch\b"
])
def search_web(query: str):
    """Search Google or the web for general queries, information, or websites."""
    return {
        "action": "search_web",
        "query": query.strip()
    }

@cactus.tool(triggers=[
    r"\b(search|find|play|watch|stream|listen)\b.*\b(on\s+youtube|in\s+youtube|from\s+youtube|youtube|youtubes|youtubr|yt)\b",
    r"\b(youtube|youtubes|youtubr|yt)\b.*\b(search|play|find|for)\b",
    r"\bplay\b.*\b(youtube|youtubes|youtubr|yt)\b",
    r"\b(on|in|from)\s+(youtube|youtubes|youtubr|yt)\b"
])
def search_youtube(query: str):
    """Search YouTube and play a video, song, music, creator, or channel on the YouTube app."""
    return {
        "action": "search_youtube",
        "query": query.strip()
    }

@cactus.tool(triggers=[
    r"\b(search|find|play|stream|listen)\b.*\b(on\s+spotify|in\s+spotify|from\s+spotify|spotify|spotifi)\b",
    r"\b(spotify|spotifi)\b.*\b(search|play|find|for)\b",
    r"\bplay\b.*\b(spotify|spotifi)\b",
    r"\b(on|in|from)\s+(spotify|spotifi)\b"
])
def search_spotify(query: str):
    """Search Spotify and play a song, track, album, playlist, or artist on the Spotify app."""
    return {
        "action": "search_spotify",
        "query": query.strip()
    }

# -------------------------------------------------------------
# 5. Media & Productivity (Music, Notes, Clipboard, Timetable)
# -------------------------------------------------------------

@cactus.tool(triggers=[
    r"^(?!.*\b(youtube|youtubes|yt|youtubr|spotify|spotifi)\b).*\b(music|song|track)\b.*\b(play|pause|resume|skip|next|previous)\b",
    r"\b(pause music|resume music|next song|previous song|stop music)\b"
])
def control_media(action: Literal["play_pause", "next", "previous", "stop"]):
    """Control background audio playback: play/pause, next track, or previous track."""
    return {
        "action": "control_media",
        "media_action": action
    }

@cactus.tool(triggers=[
    r"\b(note|memo|take a note|jot down|remind me to)\b"
])
def take_note(content: str, title: Optional[str] = None):
    """Quickly save a personal note, memo, or reminder."""
    return {
        "action": "take_note",
        "content": content.strip(),
        "title": title or "Quick Note"
    }

@cactus.tool(triggers=[
    r"\b(copy to clipboard|copy otp|copy code|copy this)\b"
])
def copy_to_clipboard(text: str):
    """Copy text, OTP, address, or phone number to the system clipboard."""
    return {
        "action": "copy_clipboard",
        "text": text.strip()
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
