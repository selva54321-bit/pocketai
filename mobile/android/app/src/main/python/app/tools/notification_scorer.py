import math
import re
import time
from typing import Any, Dict, List, Optional

SECURITY_REGEX = re.compile(
    r"\b(otp|one time password|verification code|security alert|login attempt|2fa|passcode|unauthorized|secret code|two-factor)\b",
    re.IGNORECASE,
)
TRANSACTION_REGEX = re.compile(
    r"\b(debited|credited|paid|refund|transaction|spent|transferred|bank|atm|upi|rs\.?|inr|\$|payment|wallet|balance|salary)\b",
    re.IGNORECASE,
)
COMMUNICATION_REGEX = re.compile(
    r"\b(call|missed call|incoming call|whatsapp|message|sms|telegram|signal|voicemail|dm|chat)\b",
    re.IGNORECASE,
)
REALTIME_ALERT_REGEX = re.compile(
    r"\b(calendar|alarm|meeting|reminder|flight|train|cab|driver|arriving|delivery out|order out|order delivered|scheduled)\b",
    re.IGNORECASE,
)
WORK_REGEX = re.compile(
    r"\b(email|gmail|outlook|slack|teams|github|pull request|jira|trello|assigned|build failed)\b",
    re.IGNORECASE,
)
PROMO_REGEX = re.compile(
    r"\b(discount|sale|mega sale|flat \d+%|coupon|deal|hurry|cashback|win|lottery|exclusive offer|shop now|festive offer|off on|clearance)\b",
    re.IGNORECASE,
)
URGENCY_WORDS = re.compile(
    r"\b(urgent|immediately|action required|emergency|critical|alert|expires in|warning)\b",
    re.IGNORECASE,
)
MONEY_OR_CODE_REGEX = re.compile(
    r"(\b(?:rs\.?|inr|\$|€)\s*\d+(?:,\d+)*(?:\.\d+)?\b|\b\d{4,6}\b)",
    re.IGNORECASE,
)

RECENCY_HALF_LIFE_HOURS = 2.0
LAMBDA = math.log(2) / RECENCY_HALF_LIFE_HOURS  # ~0.34657


def score_notification(
    notif: Dict[str, Any],
    current_time_ms: Optional[float] = None,
    app_frequency: int = 1,
) -> Dict[str, Any]:
    """Computes an objective mathematical importance score for a single notification."""
    if current_time_ms is None:
        current_time_ms = time.time() * 1000.0

    title = notif.get("title") or ""
    text = notif.get("text") or ""
    sub_text = notif.get("sub_text") or notif.get("subText") or ""
    category_meta = (notif.get("category") or "").lower()
    combined_text = f"{title} {text} {sub_text}".strip()
    reasons: List[str] = []

    # 1. Category Weight (0 to 40, or -15 for promo)
    category_score = 10
    if SECURITY_REGEX.search(combined_text):
        category_score = 40
        reasons.append("Security / OTP (+40)")
    elif TRANSACTION_REGEX.search(combined_text):
        category_score = 35
        reasons.append("Financial Transaction (+35)")
    elif COMMUNICATION_REGEX.search(combined_text) or category_meta in ("call", "msg"):
        category_score = 30
        reasons.append("Direct Message / Call (+30)")
    elif REALTIME_ALERT_REGEX.search(combined_text) or category_meta in ("alarm", "event"):
        category_score = 25
        reasons.append("Real-Time Alert (+25)")
    elif WORK_REGEX.search(combined_text) or category_meta == "email":
        category_score = 18
        reasons.append("Work & Productivity (+18)")
    elif PROMO_REGEX.search(combined_text) or category_meta == "promo":
        category_score = -15
        reasons.append("Promotional Content (-15)")

    # 2. Exponential Recency Decay (0 to 25)
    post_time = notif.get("post_time") or notif.get("timestamp") or current_time_ms
    elapsed_hours = max(0.0, (current_time_ms - post_time) / (1000.0 * 3600.0))
    recency_score = round(25.0 * math.exp(-LAMBDA * elapsed_hours))
    if elapsed_hours < 0.25:
        reasons.append(f"Just now (+{recency_score})")
    elif elapsed_hours < 1.0:
        reasons.append(f"< 1h ago (+{recency_score})")
    else:
        reasons.append(f"{round(elapsed_hours)}h ago (+{recency_score})")

    # 3. App Channel Trust (0 to 20)
    app_score = 8
    pkg = (notif.get("package_name") or notif.get("packageName") or "").lower()
    if any(k in pkg for k in ["bank", "paisa", "phonepe", "paytm", "wallet", "hdfc", "sbi", "icici"]):
        app_score = 20
        reasons.append("Bank / UPI App (+20)")
    elif any(k in pkg for k in ["whatsapp", "dialer", "messaging", "telegram", "signal"]):
        app_score = 16
        reasons.append("Primary Communication (+16)")
    elif any(k in pkg for k in ["deskclock", "calendar", "uber", "ola", "swiggy", "zomato"]):
        app_score = 12
        reasons.append("Transit & Utility (+12)")
    elif any(k in pkg for k in ["myntra", "flipkart", "amazon", "instagram", "facebook"]):
        app_score = 2
        reasons.append("Marketing Channel (+2)")

    # 4. Content Signals & Urgency (-15 to +15)
    content_score = 0
    if URGENCY_WORDS.search(combined_text):
        content_score += 10
        reasons.append("High Urgency Keyword (+10)")
    if MONEY_OR_CODE_REGEX.search(combined_text):
        content_score += 5
        reasons.append("Currency / Code Extracted (+5)")
    if PROMO_REGEX.search(combined_text) and category_score > 0:
        content_score -= 12
        reasons.append("Promo Language Detected (-12)")

    # 5. Volume Saturation Penalty (0 to 15)
    frequency_penalty = min(15, max(0, app_frequency - 2) * 3)
    if frequency_penalty > 0:
        reasons.append(f"App Saturation x{app_frequency} (-{frequency_penalty})")

    raw_score = category_score + recency_score + app_score + content_score - frequency_penalty
    final_score = max(0, min(100, int(round(raw_score))))

    if final_score >= 75:
        tier = "CRITICAL"
    elif final_score >= 50:
        tier = "HIGH"
    elif final_score >= 25:
        tier = "MEDIUM"
    else:
        tier = "LOW"

    return {
        "id": notif.get("id") or f"{pkg}_{int(post_time)}",
        "package_name": pkg,
        "title": title or "(No Title)",
        "text": text,
        "sub_text": sub_text,
        "post_time": post_time,
        "score": final_score,
        "tier": tier,
        "breakdown": {
            "category_score": category_score,
            "recency_score": recency_score,
            "app_score": app_score,
            "content_score": content_score,
            "frequency_penalty": frequency_penalty,
            "reasons": reasons,
        },
    }


def prioritize_notifications(
    notifs: List[Dict[str, Any]],
    current_time_ms: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Prioritizes a list of notifications, applying frequency dampening and sorting descending by score."""
    if current_time_ms is None:
        current_time_ms = time.time() * 1000.0

    pkg_counts: Dict[str, int] = {}
    for n in notifs:
        pkg = (n.get("package_name") or n.get("packageName") or "unknown").lower()
        pkg_counts[pkg] = pkg_counts.get(pkg, 0) + 1

    scored: List[Dict[str, Any]] = []
    for n in notifs:
        pkg = (n.get("package_name") or n.get("packageName") or "unknown").lower()
        freq = pkg_counts.get(pkg, 1)
        scored.append(score_notification(n, current_time_ms=current_time_ms, app_frequency=freq))

    # Sort: highest score first, then newest
    return sorted(scored, key=lambda x: (x["score"], x["post_time"]), reverse=True)
