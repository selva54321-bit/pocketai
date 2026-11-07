from typing import Literal, Optional
import cactus

@cactus.tool(triggers=[
    r"\b(debited|credited|paid|refund|transaction|spent|transferred|bank|atm|upi|rs\.?|inr|\$|payment)\b",
    r"\b(account has been debited|account.*credited)\b"
])
def extract_transaction(
    type: Literal["debit", "credit", "transfer", "refund"],
    amount: float,
    currency: Literal["INR", "USD", "EUR", "GBP"] = "INR",
    merchant: Optional[str] = None,
    account_tail: Optional[str] = None,
    date: Optional[str] = None
):
    """Extract financial transaction details from bank, UPI, card, or payment notifications."""
    return {
        "event_type": "transaction",
        "type": type,
        "amount": amount,
        "currency": currency,
        "merchant": merchant,
        "account_tail": account_tail,
        "date": date
    }

@cactus.tool(triggers=[
    r"\b(discount|sale|off|coupon|deal|hurry|cashback|promo|win|lottery|exclusive offer)\b"
])
def classify_promotional(title: str, offer_detail: Optional[str] = None):
    """Classify and tag a notification as promotional, marketing, or spam."""
    return {
        "event_type": "promotional",
        "title": title,
        "offer_detail": offer_detail,
        "priority": "low"
    }

@cactus.tool(triggers=[
    r"\b(otp|one time password|security alert|login attempt|verification code|emergency|urgent)\b"
])
def classify_security_alert(service: str, code: Optional[str] = None, urgency: Literal["high", "critical"] = "high"):
    """Classify critical security alerts, OTPs, or two-factor authentication codes."""
    return {
        "event_type": "security_alert",
        "service": service,
        "code": code,
        "urgency": urgency,
        "priority": "critical"
    }
