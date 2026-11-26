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

# -------------------------------------------------------------
# Existing Hardware & System Control Tests
# -------------------------------------------------------------

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

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "OPEN_APP"
    assert resolved["package_name"] == "com.google.android.youtube"

def test_play_song_on_youtube(agent):
    res = agent.process_query("play song on youtube")
    assert res.status == "executed"
    call = res.calls[0]
    assert call.name == "search_youtube"
    assert call.arguments.get("query") == "song"
    resolved = ActionExecutor.resolve_action(call.name, call.arguments)
    assert resolved["android_action"] == "SEARCH_YOUTUBE"
    assert resolved["query"] == "song"

def test_play_songs_in_youtubr(agent):
    res = agent.process_query("play songs in youtubr")
    assert res.status == "executed"
    call = res.calls[0]
    assert call.name == "search_youtube"
    assert call.arguments.get("query") == "songs"
    resolved = ActionExecutor.resolve_action(call.name, call.arguments)
    assert resolved["android_action"] == "SEARCH_YOUTUBE"
    assert resolved["query"] == "songs"

def test_play_lofi_in_youtube(agent):
    res = agent.process_query("play lo-fi beats in youtube")
    assert res.status == "executed"
    call = res.calls[0]
    assert call.name == "search_youtube"
    assert call.arguments.get("query") == "lo-fi beats"
    resolved = ActionExecutor.resolve_action(call.name, call.arguments)
    assert resolved["android_action"] == "SEARCH_YOUTUBE"
    assert resolved["query"] == "lo-fi beats"

def test_set_brightness_40_percent(agent):
    res = agent.process_query("Set brightness to 40%.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "set_brightness"
    assert int(target_call.arguments.get("level")) == 40

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

def test_start_25_minute_timer(agent):
    res = agent.process_query("Start a 25-minute timer.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "start_timer"
    assert target_call.arguments.get("duration_minutes") == 25

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "START_TIMER"
    assert resolved["length_seconds"] == 25 * 60

# -------------------------------------------------------------
# New Day-to-Day Operations Tests
# -------------------------------------------------------------

def test_toggle_flashlight(agent):
    res = agent.process_query("Turn on flashlight.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "toggle_flashlight"
    assert target_call.arguments.get("enabled") is True

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "TOGGLE_FLASHLIGHT"
    assert resolved["enabled"] is True

def test_adjust_volume(agent):
    res = agent.process_query("Turn volume up.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "adjust_volume"

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "ADJUST_VOLUME"
    assert resolved["action"] == "up"

def test_set_alarm(agent):
    res = agent.process_query("Set an alarm for 7:30 AM.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "set_alarm"
    assert target_call.arguments.get("hour") == 7
    assert target_call.arguments.get("minute") == 30

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "SET_ALARM"
    assert resolved["hour"] == 7
    assert resolved["minute"] == 30

def test_make_phone_call(agent):
    res = agent.process_query("Call Mom.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "make_phone_call"
    assert "mom" in target_call.arguments.get("contact_or_number", "").lower()

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "MAKE_CALL"

def test_send_whatsapp(agent):
    res = agent.process_query("Send WhatsApp to Rahul: I am on my way.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "send_whatsapp"
    assert "rahul" in target_call.arguments.get("recipient", "").lower()

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "SEND_WHATSAPP"
    assert resolved["recipient"].lower() == "rahul"

def test_navigate_to(agent):
    res = agent.process_query("Navigate to Central Mall.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "navigate_to"
    assert "central mall" in target_call.arguments.get("destination", "").lower()

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "NAVIGATE_TO"
    assert resolved["destination"] == "Central Mall"

def test_open_wifi_settings(agent):
    res = agent.process_query("Open Wi-Fi settings.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name in ["open_system_setting", "open_application"]

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "OPEN_SETTING"
    assert resolved["setting_name"] == "wifi"

def test_control_media(agent):
    res = agent.process_query("Pause music.")
    assert res.status in ["executed", "needs_confirmation"]
    target_call = res.calls[0] if res.calls else res.proposed_call
    assert target_call.name == "control_media"

    resolved = ActionExecutor.resolve_action(target_call.name, target_call.arguments)
    assert resolved["android_action"] == "CONTROL_MEDIA"

# -------------------------------------------------------------
# Notification Extraction & API Tests
# -------------------------------------------------------------

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
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"

    # Test query API with flash light
    query_resp = client.post("/api/v1/query", json={"query": "Turn on flashlight"})
    assert query_resp.status_code == 200
    data = query_resp.json()
    assert data["status"] in ["executed", "needs_confirmation"]
    assert data["calls"][0]["name"] == "toggle_flashlight"
    assert data["calls"][0]["arguments"]["_resolved_android"]["android_action"] == "TOGGLE_FLASHLIGHT"
