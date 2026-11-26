import json
import logging
import re
import time
from typing import Any, Dict, List, Optional, Tuple
import cactus

from app.config import settings
from app.executor import ActionExecutor
from app.models import AgentResponse, FunctionCall, NotificationAnalysisResponse
from app.tools.notification_scorer import prioritize_notifications
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

# In-memory query deduplication cache: query_clean -> (timestamp, AgentResponse)
_recent_queries: Dict[str, Tuple[float, AgentResponse]] = {}
QUERY_DEDUP_WINDOW_SECONDS = 2.0

SILENT_MODIFIER_PATTERN = re.compile(
    r'(?:(?:[,;\s]+and|\s+then|,|\s+)?\s+(?:please\s+)?(?:don\'?t|do\s+not|stop)\s+(?:speak(?:ing)?|talk(?:ing)?|reply(?:ing)?|respond(?:ing)?)(?:\s+(?:and\s+)?turn\s+off\s+jackie)?'
    r'|(?:[,;\s]+and|\s+then|,|\s+)?\s+(?:without\s+speaking|be\s+quiet|shut\s+up|mute\s+yourself|turn\s+off\s+jackie))\s*[.!?]*$'
    r'|^(?:don\'?t|do\s+not|stop)\s+(?:speak(?:ing)?|talk(?:ing)?|reply(?:ing)?|respond(?:ing)?)\s*[.!?]*$'
    r'|^(?:be\s+quiet|shut\s+up|mute\s+yourself|turn\s+off\s+jackie)\s*[.!?]*$',
    re.IGNORECASE,
)


def extract_silent_modifier(text: str) -> Tuple[str, bool]:
    """Detect and strip trailing 'and don't speak' / 'turn off jackie' modifiers."""
    if SILENT_MODIFIER_PATTERN.search(text):
        stripped = SILENT_MODIFIER_PATTERN.sub('', text).strip(' ,;.')
        return stripped, True
    return text, False


def sanitize_text(text: str) -> str:
    """Normalize user voice/text query for optimal token matching."""
    cleaned = re.sub(r'(\d+),(\d+)', r'\1\2', text)
    cleaned = re.sub(r'\bwi-fi\b', 'wifi', cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r'^(hey\s+jackie|hi\s+jackie|ok\s+jackie|jackie)[,\s:]*',
        '',
        cleaned,
        flags=re.IGNORECASE,
    ).strip()

    m_call = re.match(r'^(call|dial|phone|make a call to)\s+(.+)$', cleaned, re.IGNORECASE)
    if m_call:
        verb = m_call.group(1)
        target = m_call.group(2).strip()
        if not re.match(r'^[0-9+\s\-()]+$', target):
            cleaned = f"{verb} {target.title()}"
        return cleaned.strip()

    m_msg = re.match(
        r'^(send\s+whatsapp\s+to|send\s+sms\s+to|send\s+text\s+to|whatsapp\s+to|text\s+to)\s+([^:]+)(:.*)?$',
        cleaned,
        re.IGNORECASE,
    )
    if m_msg:
        verb = m_msg.group(1)
        recipient = m_msg.group(2).strip()
        suffix = m_msg.group(3) or ""
        if not re.match(r'^[0-9+\s\-()]+$', recipient):
            recipient = recipient.title()
        cleaned = f"{verb} {recipient}{suffix}"
        return cleaned.strip()

    cleaned = re.sub(r'\b(youtubr|youtub|you tube|yt)\b', 'youtube', cleaned, flags=re.IGNORECASE)
    if re.search(r'\byoutube\b', cleaned, re.IGNORECASE):
        m_yt1 = re.match(
            r'^(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+(?:on|in|from|at|via|with|inside)\s+youtube$',
            cleaned,
            re.IGNORECASE,
        )
        if m_yt1:
            target = m_yt1.group(1).strip()
            return f"play {target} on youtube"

        m_yt2 = re.match(r'^(?:search|play|find)\s+youtube\s+(?:for\s+)?(.+)$', cleaned, re.IGNORECASE)
        if m_yt2:
            target = m_yt2.group(1).strip()
            return f"play {target} on youtube"

        m_yt3 = re.match(r'^play\s+(?:on|in)\s+youtube\s+(.+)$', cleaned, re.IGNORECASE)
        if m_yt3:
            target = m_yt3.group(1).strip()
            return f"play {target} on youtube"

        cleaned = re.sub(
            r'\b(in|from|at|via|with|inside)\s+youtube\b', 'on youtube', cleaned, flags=re.IGNORECASE
        )

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

        self.agent = cactus.Cactus(
            tools=self.system_tools + self.notification_tools,
            stateless=True,
        )

    def process_query(self, user_text: str) -> AgentResponse:
        """Process voice/text command from the user and decide on execution."""
        clean_raw = user_text.strip().lower()
        now = time.time()

        if clean_raw in _recent_queries:
            last_time, cached = _recent_queries[clean_raw]
            if now - last_time < QUERY_DEDUP_WINDOW_SECONDS:
                logger.warning(f"Deduplicating embedded query within {now - last_time:.3f}s: '{user_text}'")
                return cached

        base_text, should_silence = extract_silent_modifier(user_text)
        cleaned_text = sanitize_text(base_text)
        if not cleaned_text:
            if should_silence:
                return AgentResponse(
                    status="executed",
                    confidence=1.0,
                    calls=[],
                    message="Muted voice and turned off Jackie.",
                    silent_mode=True,
                )
            return AgentResponse(
                status="unsupported",
                confidence=0.0,
                message="No command received.",
            )

        logger.info(f"Processing embedded query: '{cleaned_text}'")
        raw_res = self.agent.complete(cleaned_text)

        calls_data: List[Dict[str, Any]] = raw_res.get("function_calls") or []
        held_data: List[Dict[str, Any]] = raw_res.get("suppressed_calls") or []
        confidence: float = float(raw_res.get("confidence") or 0.0)
        reasoning: Optional[str] = raw_res.get("reasoning")

        calls = [FunctionCall(name=c["name"], arguments=c.get("arguments", {})) for c in calls_data]
        held = [FunctionCall(name=h["name"], arguments=h.get("arguments", {})) for h in held_data]

        for c in calls:
            if c.name == "search_youtube":
                q = str(c.arguments.get("query", "")).strip()
                if not q or q.lower() in ("youtube", "on youtube", "in youtube"):
                    m = re.search(
                        r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+on\s+youtube\b',
                        cleaned_text,
                        re.IGNORECASE,
                    )
                    c.arguments["query"] = m.group(1).strip() if m else "songs"
            elif c.name == "search_web":
                if re.search(r'\byoutube\b', cleaned_text, re.IGNORECASE):
                    c.name = "search_youtube"
                    m = re.search(
                        r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+on\s+youtube\b',
                        cleaned_text,
                        re.IGNORECASE,
                    )
                    if m:
                        c.arguments["query"] = m.group(1).strip()
                    else:
                        clean_q = re.sub(
                            r'\b(on|in|from|via)?\s*youtube\b', '', str(c.arguments.get("query", "")), flags=re.IGNORECASE
                        ).strip()
                        c.arguments["query"] = clean_q or "songs"

        # Enrich with Android Intent resolution directly on-device
        for call in calls:
            call.arguments["_resolved_android"] = ActionExecutor.resolve_action(call.name, call.arguments)
        for h_call in held:
            h_call.arguments["_resolved_android"] = ActionExecutor.resolve_action(h_call.name, h_call.arguments)

        telemetry = {
            "prefill_tps": raw_res.get("prefill_tps"),
            "decode_tps": raw_res.get("decode_tps"),
            "peak_ram_mb": raw_res.get("peak_ram_mb"),
        }

        if calls:
            primary_call = calls[0]
            action_desc = primary_call.name.replace("_", " ")
            response = AgentResponse(
                status="executed",
                confidence=confidence,
                reasoning=reasoning,
                calls=calls,
                message=f"Executing {action_desc}",
                telemetry=telemetry,
                silent_mode=should_silence,
            )
        elif held:
            candidate = held[0]
            action_desc = candidate.name.replace("_", " ")
            response = AgentResponse(
                status="needs_confirmation",
                confidence=confidence,
                reasoning=reasoning,
                proposed_call=candidate,
                calls=[],
                message=f"Did you mean to {action_desc}? Tap to confirm.",
                telemetry=telemetry,
                silent_mode=should_silence,
            )
        else:
            response = AgentResponse(
                status="unsupported",
                confidence=confidence,
                reasoning=reasoning,
                message="I can't perform that action on this device.",
                telemetry=telemetry,
                silent_mode=should_silence,
            )

        _recent_queries[clean_raw] = (now, response)
        for k in list(_recent_queries.keys()):
            if now - _recent_queries[k][0] > 30.0:
                del _recent_queries[k]

        return response

    def process_query_json(self, user_text: str) -> str:
        """JNI bridge entry point returning serialized AgentResponse JSON."""
        return self.process_query(user_text).model_dump_json()

    def process_notification(self, title: str, text: str, package_name: str) -> Dict[str, Any]:
        """Analyze incoming notification for structured transactions, alerts, or spam."""
        combined_text = sanitize_text(f"Notification from {package_name}: {title} - {text}")
        logger.info(f"Analyzing embedded notification: {combined_text}")

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
                "reasoning": res.get("reasoning"),
            }

        return {
            "matched": False,
            "tool": None,
            "data": {},
            "confidence": confidence,
            "reasoning": res.get("reasoning"),
        }

    def process_notification_json(self, title: str, text: str, package_name: str) -> str:
        """JNI bridge entry point for notification analysis returning serialized JSON."""
        result = self.process_notification(title, text, package_name)
        matched = result["matched"]
        tool = result.get("tool")
        data = result.get("data", {})
        confidence = result.get("confidence", 0.0)

        category = "system"
        is_transaction = False
        if matched:
            if tool == "extract_transaction":
                category = "transaction"
                is_transaction = True
            elif tool == "classify_promotional":
                category = "promotional"
            elif tool == "classify_security_alert":
                category = "security_alert"

        resp = NotificationAnalysisResponse(
            is_transaction=is_transaction,
            data=data,
            category=category,
            summary=f"{category.replace('_', ' ').title()}: {title}",
            confidence=confidence,
        )
        return resp.model_dump_json()

    def prioritize_notifications_json(self, notifications_json: str) -> str:
        """JNI bridge entry point for prioritizing notifications."""
        notifications = json.loads(notifications_json)
        prioritized = prioritize_notifications(notifications)
        return json.dumps(prioritized)
