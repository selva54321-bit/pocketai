import logging
from typing import Any, Dict, List, Optional
import cactus

from app.config import settings
from app.models import AgentResponse, FunctionCall
from app.tools.system_tools import (
    open_application,
    open_timetable,
    set_battery_saver,
    set_brightness,
    set_do_not_disturb,
    start_timer,
)
from app.tools.notification_tools import (
    extract_transaction,
    classify_promotional,
    classify_security_alert,
)

logger = logging.getLogger("pocketai.agent")

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
            start_timer,
            open_timetable,
        ]
        self.notification_tools = [
            extract_transaction,
            classify_promotional,
            classify_security_alert,
        ]

        # Primary agent with all capabilities
        self.agent = cactus.Cactus(
            tools=self.system_tools + self.notification_tools,
            stateless=False
        )

    def process_query(self, user_text: str) -> AgentResponse:
        """Process voice/text command from the user and decide on execution."""
        cleaned_text = user_text.strip()
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

        # Decision threshold logic
        if calls and confidence >= self.confidence_threshold:
            # Action is confident: Execute immediately
            return AgentResponse(
                status="executed",
                confidence=confidence,
                reasoning=reasoning,
                calls=calls,
                message=f"Executing {calls[0].name.replace('_', ' ')}",
                telemetry=telemetry
            )
        elif calls or held:
            # Uncertain or candidate held: Request confirmation
            candidate = calls[0] if calls else held[0]
            action_desc = candidate.name.replace("_", " ")
            return AgentResponse(
                status="needs_confirmation",
                confidence=confidence,
                reasoning=reasoning,
                proposed_call=candidate,
                calls=calls,
                message=f"Did you mean to {action_desc}? Tap to confirm.",
                telemetry=telemetry
            )
        else:
            # Nothing matched
            return AgentResponse(
                status="unsupported",
                confidence=confidence,
                reasoning=reasoning,
                message="I can't perform that action on this device.",
                telemetry=telemetry
            )

    def process_notification(self, title: str, text: str, package_name: str) -> Dict[str, Any]:
        """Analyze incoming notification for structured transactions, alerts, or spam."""
        combined_text = f"Notification from {package_name}: {title} - {text}"
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
