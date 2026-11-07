import pytest
from app.agent import PocketAIAgent
from app.executor import ActionExecutor
from fastapi.testclient import TestClient
from app.server import app

@pytest.fixture(scope="module")
def agent():
    return PocketAIAgent()

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

def test_turn_on_battery_saver(agent):
    res = agent.process_query("Turn on battery saver.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "set_battery_saver"
    assert target_call.arguments.get("enabled") is True

def test_open_youtube(agent):
    res = agent.process_query("Open YouTube.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "open_application"
    assert "youtube" in target_call.arguments.get("app_name", "").lower()

    # Verify Android resolution
    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "OPEN_APP"
    assert resolved["package_name"] == "com.google.android.youtube"

def test_set_brightness_40_percent(agent):
    res = agent.process_query("Set brightness to 40%.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "set_brightness"
    assert int(target_call.arguments.get("level")) == 40

    # Verify Android brightness range translation (0-255)
    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "SET_BRIGHTNESS"
    assert resolved["percent"] == 40
    assert resolved["system_value"] == int((40 / 100.0) * 255)

def test_turn_on_do_not_disturb(agent):
    res = agent.process_query("Turn on Do Not Disturb.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "set_do_not_disturb"
    assert target_call.arguments.get("enabled") is True

def test_open_college_timetable(agent):
    res = agent.process_query("Open my college timetable.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name in ["open_timetable", "open_application"]

def test_start_25_minute_timer(agent):
    res = agent.process_query("Start a 25-minute timer.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "start_timer"
    assert target_call.arguments.get("duration_minutes") == 25

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "START_TIMER"
    assert resolved["length_seconds"] == 25 * 60

def test_transaction_notification_extraction(agent):
    notification_text = "Your account has been debited by Rs. 1,250 at Amazon on November 8."
    result = agent.process_notification(
        title="Bank Alert",
        text=notification_text,
        package_name="com.bank.app"
    )
    assert result["matched"] is True
    assert result["tool"] == "extract_transaction"
    data = result["data"]
    assert float(data.get("amount", 0)) == 1250 or float(data.get("amount", 0)) == 1250.0
    assert data.get("type") == "debit"

def test_api_endpoints(client):
    # Test /health
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    # Test /api/v1/query
    query_resp = client.post("/api/v1/query", json={"query": "Open YouTube"})
    assert query_resp.status_code == 200
    data = query_resp.json()
    assert data["status"] in ["executed", "needs_confirmation"]

    # Test /api/v1/notification
    notif_resp = client.post("/api/v1/notification", json={
        "package_name": "com.hdfc.bank",
        "title": "HDFC Bank Alert",
        "text": "Your account has been debited by Rs. 1,250 at Amazon on November 8."
    })
    assert notif_resp.status_code == 200
    notif_data = notif_resp.json()
    assert notif_data["is_transaction"] is True
    assert notif_data["category"] == "transaction"
