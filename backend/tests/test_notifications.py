import time
import pytest
from app.agent import PocketAIAgent
from app.tools.notification_scorer import score_notification, prioritize_notifications
from app.server import app
from fastapi.testclient import TestClient

client = TestClient(app)

@pytest.fixture(scope="module")
def agent():
    return PocketAIAgent()

def test_otp_security_math_score():
    now = time.time() * 1000.0
    otp_notif = {
        "package_name": "com.google.android.apps.authenticator2",
        "title": "Security Alert",
        "text": "Your verification code is 849201. Urgent: Do not share with anyone.",
        "post_time": now
    }
    scored = score_notification(otp_notif, current_time_ms=now)
    assert scored["score"] >= 75
    assert scored["tier"] == "CRITICAL"
    assert any("Security / OTP" in r for r in scored["breakdown"]["reasons"])
    assert any("High Urgency" in r for r in scored["breakdown"]["reasons"])

def test_transaction_math_score():
    now = time.time() * 1000.0
    bank_notif = {
        "package_name": "com.hdfc.bank",
        "title": "HDFC Bank Alert",
        "text": "Your A/C XX4910 has been debited by Rs. 2,450 at Amazon on Nov 21.",
        "post_time": now
    }
    scored = score_notification(bank_notif, current_time_ms=now)
    assert scored["score"] >= 65
    assert scored["tier"] in ("HIGH", "CRITICAL")
    assert any("Financial Transaction" in r for r in scored["breakdown"]["reasons"])
    assert any("Bank / UPI" in r for r in scored["breakdown"]["reasons"])

def test_promotional_spam_math_score():
    now = time.time() * 1000.0
    promo_notif = {
        "package_name": "com.myntra.android",
        "title": "Mega Midnight Sale!",
        "text": "Flat 60% discount on shoes! Hurry, offer ends tonight!",
        "post_time": now - 3600 * 4 * 1000.0 # 4 hours ago
    }
    scored = score_notification(promo_notif, current_time_ms=now)
    assert scored["score"] < 25
    assert scored["tier"] == "LOW"
    assert any("Promotional Content" in r for r in scored["breakdown"]["reasons"])

def test_recency_decay_ordering():
    now = time.time() * 1000.0
    fresh_msg = {
        "id": "1",
        "package_name": "com.whatsapp",
        "title": "Rahul",
        "text": "Call me back",
        "post_time": now # Just now
    }
    old_msg = {
        "id": "2",
        "package_name": "com.whatsapp",
        "title": "Rahul",
        "text": "Call me back",
        "post_time": now - 3600 * 12 * 1000.0 # 12 hours ago
    }
    prioritized = prioritize_notifications([old_msg, fresh_msg], current_time_ms=now)
    assert prioritized[0]["id"] == "1"
    assert prioritized[0]["score"] > prioritized[1]["score"]

def test_app_saturation_penalty():
    now = time.time() * 1000.0
    spam_items = [
        {"package_name": "com.spam.shop", "title": f"Deal {i}", "text": "Check it out", "post_time": now}
        for i in range(5)
    ]
    prioritized = prioritize_notifications(spam_items, current_time_ms=now)
    # The 5 items should have frequency penalty of max(0, 5-2)*3 = 9
    for item in prioritized:
        assert item["breakdown"]["frequency_penalty"] == 9

def test_agent_check_notifications_tool(agent):
    res = agent.process_query("Check my important notifications")
    assert res.status == "executed"
    assert len(res.calls) > 0
    assert res.calls[0].name == "check_notifications"

def test_prioritize_api_endpoint():
    now = time.time() * 1000.0
    payload = {
        "notifications": [
            {
                "id": "n1",
                "package_name": "com.myntra.android",
                "title": "Sale 50% Off",
                "text": "Grab now",
                "timestamp": now - 7200000
            },
            {
                "id": "n2",
                "package_name": "com.google.android.apps.authenticator2",
                "title": "OTP Alert",
                "text": "Your code is 123456",
                "timestamp": now
            }
        ]
    }
    response = client.post("/api/v1/notifications/prioritize", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    # Highest score (OTP) should be first
    assert data[0]["id"] == "n2"
    assert data[0]["score"] > data[1]["score"]
