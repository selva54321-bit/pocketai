import logging
import re
from typing import Any, Dict, List, Optional
import cactus

from app.config import settings
from app.models import AgentResponse, FunctionCall
from app.tools.system_tools import (
    open_application,
    set_battery_saver,
    set_brightness,
    set_do_not_disturb,
    toggle_flashlight,
    adjust_volume,
    open_system_setting,
    start_timer,
    set_alarm,
    make_phone_call,
    send_sms,
    send_whatsapp,
    send_email,
    navigate_to,
    search_web,
    search_youtube,
    control_media,
    take_note,
    copy_to_clipboard,
    open_timetable,
)
from app.tools.notification_tools import (
    extract_transaction,
    classify_promotional,
    classify_security_alert,
    check_notifications,
)
from app.tools.device_tools import (
    get_battery_status,
    set_ringer_mode,
    open_camera,
    take_screenshot,
    lock_screen,
    open_notification_panel,
    open_quick_settings,
)
from app.tools.routine_tools import execute_routine

logger = logging.getLogger("pocketai.agent")

def sanitize_text(text: str) -> str:
    """Normalize user voice/text query for optimal token matching."""
    # Normalize comma-separated numbers (1,250 -> 1250)
    cleaned = re.sub(r'(\d+),(\d+)', r'\1\2', text)
    # Normalize wi-fi / wifi
    cleaned = re.sub(r'\bwi-fi\b', 'wifi', cleaned, flags=re.IGNORECASE)
    return cleaned.strip()

class PocketAIAgent:
    def __init__(self, confidence_threshold: Optional[float] = None):
        self.confidence_threshold = (
            confidence_threshold if confidence_threshold is not None else settings.CONFIDENCE_THRESHOLD
        )
        self.system_tools = [
            open_application,
            set_battery_saver,
            set_brightness,
            set_do_not_disturb,
            toggle_flashlight,
            adjust_volume,
            open_system_setting,
            start_timer,
            set_alarm,
            make_phone_call,
            send_sms,
            send_whatsapp,
            send_email,
            navigate_to,
            search_web,
            search_youtube,
            control_media,
            take_note,
            copy_to_clipboard,
            open_timetable,
            get_battery_status,
            set_ringer_mode,
            open_camera,
            take_screenshot,
            lock_screen,
            open_notification_panel,
            open_quick_settings,
            execute_routine,
        ]
        self.notification_tools = [
            extract_transaction,
            classify_promotional,
            classify_security_alert,
            check_notifications,
        ]

        # Use stateless=True so each query/command is evaluated cleanly without turn contamination
        self.agent = cactus.Cactus(
            tools=self.system_tools + self.notification_tools,
            stateless=True
        )

    def process_query(self, user_text: str) -> AgentResponse:
        """Process voice/text command from the user and decide on execution."""
        cleaned_text = sanitize_text(user_text)
        if not cleaned_text:
            return AgentResponse(
                status="unsupported",
                confidence=0.0,
                message="No command received."
            )

        logger.info(f"Processing query: '{cleaned_text}'")
        raw_res = self.agent.complete(cleaned_text)

        calls_data: List[Dict[str, Any]] = raw_res.get("function_calls") or []
        held_data: List[Dict[str, Any]] = raw_res.get("suppressed_calls") or []
        confidence: float = float(raw_res.get("confidence") or 0.0)
        reasoning: Optional[str] = raw_res.get("reasoning")

        calls = [FunctionCall(name=c["name"], arguments=c.get("arguments", {})) for c in calls_data]
        held = [FunctionCall(name=h["name"], arguments=h.get("arguments", {})) for h in held_data]

        telemetry = {
            "prefill_tps": raw_res.get("prefill_tps"),
            "decode_tps": raw_res.get("decode_tps"),
            "peak_ram_mb": raw_res.get("peak_ram_mb")
        }

        # Intuitive Operator Execution Logic:
        # 1. If Needle matches a tool (calls), execute it directly!
        # 2. If no direct call but a candidate was held (suppressed_calls), prompt for confirmation.
        # 3. Otherwise, return unsupported.
        if calls:
            primary_call = calls[0]
            action_desc = primary_call.name.replace("_", " ")
            return AgentResponse(
                status="executed",
                confidence=confidence,
                reasoning=reasoning,
                calls=calls,
                message=f"Executing {action_desc}",
                telemetry=telemetry
            )
        elif held:
            candidate = held[0]
            action_desc = candidate.name.replace("_", " ")
            return AgentResponse(
                status="needs_confirmation",
                confidence=confidence,
                reasoning=reasoning,
                proposed_call=candidate,
                calls=[],
                message=f"Did you mean to {action_desc}? Tap to confirm.",
                telemetry=telemetry
            )
        else:
            return AgentResponse(
                status="unsupported",
                confidence=confidence,
                reasoning=reasoning,
                message="I can't perform that action on this device.",
                telemetry=telemetry
            )

    def process_notification(self, title: str, text: str, package_name: str) -> Dict[str, Any]:
        """Analyze incoming notification for structured transactions, alerts, or spam."""
        combined_text = sanitize_text(f"Notification from {package_name}: {title} - {text}")
        logger.info(f"Analyzing notification: {combined_text}")

        res = self.agent.complete(combined_text)
        calls = res.get("function_calls") or []
        confidence = float(res.get("confidence") or 0.0)

        if calls:
            call = calls[0]
            return {
                "matched": True,
                "tool": call["name"],
                "data": call.get("arguments", {}),
                "confidence": confidence,
                "reasoning": res.get("reasoning")
            }

        return {
            "matched": False,
            "tool": None,
            "data": {},
            "confidence": confidence,
            "reasoning": res.get("reasoning")
        }
