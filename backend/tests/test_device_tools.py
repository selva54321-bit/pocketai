import pytest
from app.agent import PocketAIAgent
from app.executor import ActionExecutor

@pytest.fixture(scope="module")
def agent():
    return PocketAIAgent()

def test_battery_status_tool(agent):
    res = agent.process_query("What is my battery level?")
    assert len(res.calls) > 0
    assert res.calls[0].name == "get_battery_status"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "GET_BATTERY_STATUS"

def test_set_ringer_mode_silent(agent):
    res = agent.process_query("Mute my phone")
    assert len(res.calls) > 0
    assert res.calls[0].name == "set_ringer_mode"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "SET_RINGER_MODE"

def test_take_selfie_tool(agent):
    res = agent.process_query("Take a selfie")
    assert len(res.calls) > 0
    assert res.calls[0].name == "open_camera"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "OPEN_CAMERA"

def test_take_screenshot_tool(agent):
    res = agent.process_query("Take a screenshot")
    assert len(res.calls) > 0
    assert res.calls[0].name == "take_screenshot"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "TAKE_SCREENSHOT"

def test_lock_screen_tool(agent):
    res = agent.process_query("Lock my phone")
    assert len(res.calls) > 0
    assert res.calls[0].name == "lock_screen"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "LOCK_SCREEN"

def test_routine_good_morning(agent):
    res = agent.process_query("Good morning")
    assert len(res.calls) > 0
    assert res.calls[0].name == "execute_routine"
    resolved = ActionExecutor.resolve_action(res.calls[0].name, res.calls[0].arguments)
    assert resolved["android_action"] == "EXECUTE_ROUTINE"
