from typing import Any, Dict
import cactus

@cactus.tool(triggers=[
    r"\b(good morning|good night|bedtime|focus mode|routine)\b",
    r"\bstart focus mode\b"
])
def execute_routine(routine_name: str) -> Dict[str, Any]:
    """Execute a multi-step phone routine or macro such as Good Morning, Bedtime, or Focus Mode.
    Args:
        routine_name: One of 'good_morning', 'good_night', or 'focus_mode'.
    Use whenever the user asks:
    - 'Good morning'
    - 'Good night' / 'Bedtime'
    - 'Start focus mode'
    """
    return {
        "status": "ready",
        "action": "execute_routine",
        "routine": routine_name
    }
