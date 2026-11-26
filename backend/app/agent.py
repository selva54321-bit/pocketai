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

SILENT_MODIFIER_PATTERN = re.compile(
    r'(?:(?:[,;\s]+and|\s+then|,|\s+)?\s+(?:please\s+)?(?:don\'?t|do\s+not|stop)\s+(?:speak(?:ing)?|talk(?:ing)?|reply(?:ing)?|respond(?:ing)?)(?:\s+(?:and\s+)?turn\s+off\s+jackie)?'
    r'|(?:[,;\s]+and|\s+then|,|\s+)?\s+(?:without\s+speaking|be\s+quiet|shut\s+up|mute\s+yourself|turn\s+off\s+jackie))\s*[.!?]*$'
    r'|^(?:don\'?t|do\s+not|stop)\s+(?:speak(?:ing)?|talk(?:ing)?|reply(?:ing)?|respond(?:ing)?)\s*[.!?]*$'
    r'|^(?:be\s+quiet|shut\s+up|mute\s+yourself|turn\s+off\s+jackie)\s*[.!?]*$',
    re.IGNORECASE,
)


def extract_silent_modifier(text: str):
    """Detect and strip trailing 'and don't speak' / 'turn off jackie' modifiers."""
    if SILENT_MODIFIER_PATTERN.search(text):
        stripped = SILENT_MODIFIER_PATTERN.sub('', text).strip(' ,;.')
        return stripped, True
    return text, False


def sanitize_text(text: str) -> str:
    """Normalize user voice/text query for optimal token matching."""
    # Normalize comma-separated numbers (1,250 -> 1250)
    cleaned = re.sub(r'(\d+),(\d+)', r'\1\2', text)
    # Normalize wi-fi / wifi
    cleaned = re.sub(r'\bwi-fi\b', 'wifi', cleaned, flags=re.IGNORECASE)
    # Strip wake-word prefixes if user spoke "Hey Jackie", "Jackie", "Hi Jackie", "Ok Jackie"
    cleaned = re.sub(r'^(hey\s+jackie|hi\s+jackie|ok\s+jackie|jackie)[,\s:]*', '', cleaned, flags=re.IGNORECASE).strip()

    # 1. Calling commands: Capitalize target contact name so Needle 3 preserves multi-word proper nouns & acronyms
    m_call = re.match(r'^(call|dial|phone|make a call to)\s+(.+)$', cleaned, re.IGNORECASE)
    if m_call:
        verb = m_call.group(1)
        target = m_call.group(2).strip()
        if not re.match(r'^[0-9+\s\-()]+$', target):
            cleaned = f"{verb} {target.title()}"
        return cleaned.strip()

    # 2. Messaging commands: Capitalize target recipient before the colon
    m_msg = re.match(r'^(send\s+whatsapp\s+to|send\s+sms\s+to|send\s+text\s+to|whatsapp\s+to|text\s+to)\s+([^:]+)(:.*)?$', cleaned, re.IGNORECASE)
    if m_msg:
        verb = m_msg.group(1)
        recipient = m_msg.group(2).strip()
        suffix = m_msg.group(3) or ""
        if not re.match(r'^[0-9+\s\-()]+$', recipient):
            recipient = recipient.title()
        cleaned = f"{verb} {recipient}{suffix}"
        return cleaned.strip()

    # 3. YouTube commands: Normalize speech typos (youtubr, youtub, you tube, yt) & prepositions (in/from/at -> on)
    cleaned = re.sub(r'\b(youtubr|youtub|you tube|yt)\b', 'youtube', cleaned, flags=re.IGNORECASE)
    if re.search(r'\byoutube\b', cleaned, re.IGNORECASE):
        # Pattern A: 'play/search/watch/listen to/find <target> on/in/from/at youtube'
        m_yt1 = re.match(r'^(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+(?:on|in|from|at|via|with|inside)\s+youtube$', cleaned, re.IGNORECASE)
        if m_yt1:
            target = m_yt1.group(1).strip()
            return f"play {target} on youtube"

        # Pattern B: 'search/play youtube for <target>'
        m_yt2 = re.match(r'^(?:search|play|find)\s+youtube\s+(?:for\s+)?(.+)$', cleaned, re.IGNORECASE)
        if m_yt2:
            target = m_yt2.group(1).strip()
            return f"play {target} on youtube"

        # Pattern C: 'play on/in youtube <target>'
        m_yt3 = re.match(r'^play\s+(?:on|in)\s+youtube\s+(.+)$', cleaned, re.IGNORECASE)
        if m_yt3:
            target = m_yt3.group(1).strip()
            return f"play {target} on youtube"

        # Normalize any remaining "in/from/at youtube" to "on youtube"
        cleaned = re.sub(r'\b(in|from|at|via|with|inside)\s+youtube\b', 'on youtube', cleaned, flags=re.IGNORECASE)

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

        # Post-processing: Ensure YouTube commands always resolve target media query
        for c in calls:
            if c.name == "search_youtube":
                q = str(c.arguments.get("query", "")).strip()
                if not q or q.lower() in ("youtube", "on youtube", "in youtube"):
                    m = re.search(r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+on\s+youtube\b', cleaned_text, re.IGNORECASE)
                    if m:
                        c.arguments["query"] = m.group(1).strip()
                    else:
                        c.arguments["query"] = "songs"
            elif c.name == "search_web":
                # Defensive reroute: If search_web was picked for a YouTube query, route to search_youtube
                if re.search(r'\byoutube\b', cleaned_text, re.IGNORECASE):
                    c.name = "search_youtube"
                    m = re.search(r'\b(?:play|search(?:\s+for)?|watch|listen(?:\s+to)?|find)\s+(.+?)\s+on\s+youtube\b', cleaned_text, re.IGNORECASE)
                    if m:
                        c.arguments["query"] = m.group(1).strip()
                    else:
                        clean_q = re.sub(r'\b(on|in|from|via)?\s*youtube\b', '', str(c.arguments.get("query", "")), flags=re.IGNORECASE).strip()
                        c.arguments["query"] = clean_q or "songs"

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
                telemetry=telemetry,
                silent_mode=should_silence,
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
                telemetry=telemetry,
                silent_mode=should_silence,
            )
        else:
            return AgentResponse(
                status="unsupported",
                confidence=confidence,
                reasoning=reasoning,
                message="I can't perform that action on this device.",
                telemetry=telemetry,
                silent_mode=should_silence,
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
