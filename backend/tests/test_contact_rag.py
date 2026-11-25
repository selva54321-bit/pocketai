import pytest
from app.agent import PocketAIAgent
from app.executor import ActionExecutor

@pytest.fixture(scope="module")
def agent():
    return PocketAIAgent()

def test_extract_mithil_bit_multiword(agent):
    res = agent.process_query("call mithil bit")
    assert len(res.calls) > 0
    call = res.calls[0]
    assert call.name == "make_phone_call"
    assert "mithil bit" in call.arguments.get("contact_or_number", "").lower()

    resolved = ActionExecutor.resolve_action(call.name, call.arguments)
    assert resolved["android_action"] == "MAKE_CALL"
    assert "mithil bit" in resolved["contact_or_number"].lower()

def test_extract_mithil_single_word(agent):
    res = agent.process_query("call mithil")
    assert len(res.calls) > 0
    call = res.calls[0]
    assert call.name == "make_phone_call"
    assert call.arguments.get("contact_or_number", "").lower() == "mithil"

def test_extract_mithil_amma(agent):
    res = agent.process_query("call mithil amma")
    assert len(res.calls) > 0
    call = res.calls[0]
    assert call.name == "make_phone_call"
    assert "mithil amma" in call.arguments.get("contact_or_number", "").lower()

def test_whatsapp_mithil_bit(agent):
    res = agent.process_query("send whatsapp to mithil bit: on my way")
    assert len(res.calls) > 0
    call = res.calls[0]
    assert call.name == "send_whatsapp"
    assert "mithil bit" in call.arguments.get("recipient", "").lower()
    assert "on my way" in call.arguments.get("message", "").lower()
