from typing import Any, Dict
import cactus

@cactus.tool(triggers=[
    r"\b(battery|battery level|battery percentage|battery status|charging)\b",
    r"\bhow much battery\b"
])
def get_battery_status() -> Dict[str, Any]:
    """Check the current battery percentage and charging status of the phone.
    Use whenever the user asks:
    - 'What is my battery level?'
    - 'How much battery is left?'
    - 'Is my phone charging?'
    - 'Battery status'
    """
    return {
        "status": "ready",
        "action": "get_battery_status"
    }

@cactus.tool(triggers=[
    r"\b(mute|silent|unmute|ringer|vibrate)\b",
    r"\b(silent mode|vibrate mode|normal mode)\b",
    r"\bmute\b"
])
def set_ringer_mode(mode: str = "normal") -> Dict[str, Any]:
    """Set the phone ringer sound mode between normal, vibrate, or silent.
    Args:
        mode: The sound mode desired: 'silent', 'vibrate', or 'normal'.
    Use whenever the user asks:
    - 'Mute my phone'
    - 'Set phone to vibrate'
    - 'Turn on phone sound'
    - 'Silent mode'
    """
    return {
        "status": "ready",
        "action": "set_ringer_mode",
        "mode": mode
    }

@cactus.tool(triggers=[
    r"\b(selfie|camera|front camera|take a photo|take a pic|take a picture)\b"
])
def open_camera(mode: str = "rear") -> Dict[str, Any]:
    """Launch the camera app to take a photo or a front-facing selfie.
    Args:
        mode: 'rear' to open normal camera, or 'front_selfie' to open front camera.
    Use whenever the user asks:
    - 'Open camera'
    - 'Take a photo'
    - 'Take a selfie'
    - 'Open front camera'
    """
    return {
        "status": "ready",
        "action": "open_camera",
        "mode": mode
    }

@cactus.tool(triggers=[
    r"\b(screenshot|capture screen|screen capture)\b",
    r"\btake a screenshot\b"
])
def take_screenshot() -> Dict[str, Any]:
    """Capture a screenshot of the current screen.
    Use whenever the user asks:
    - 'Take a screenshot'
    - 'Capture screen'
    - 'Screenshot this'
    """
    return {
        "status": "ready",
        "action": "take_screenshot"
    }

@cactus.tool(triggers=[
    r"\b(lock|lock screen|lock phone|turn off screen)\b",
    r"\block my phone\b"
])
def lock_screen() -> Dict[str, Any]:
    """Turn off the display and lock the phone.
    Use whenever the user asks:
    - 'Lock my phone'
    - 'Lock screen'
    - 'Turn off screen'
    """
    return {
        "status": "ready",
        "action": "lock_screen"
    }

@cactus.tool(triggers=[
    r"\b(notification shade|notification panel|pull down notifications|show notifications)\b"
])
def open_notification_panel() -> Dict[str, Any]:
    """Pull down the notification shade to view notifications.
    Use whenever the user asks:
    - 'Pull down notifications'
    - 'Show notification panel'
    """
    return {
        "status": "ready",
        "action": "open_notification_panel"
    }

@cactus.tool(triggers=[
    r"\b(quick settings|quick settings panel|quick settings toggles)\b"
])
def open_quick_settings() -> Dict[str, Any]:
    """Pull down the Quick Settings toggle drawer.
    Use whenever the user asks:
    - 'Open quick settings'
    - 'Show quick settings toggles'
    """
    return {
        "status": "ready",
        "action": "open_quick_settings"
    }
