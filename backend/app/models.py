from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

class FunctionCall(BaseModel):
    name: str
    arguments: Dict[str, Any]

class AgentRequest(BaseModel):
    query: str
    context: Optional[Dict[str, Any]] = Field(default_factory=dict)

class ActionExecutionStatus(str):
    EXECUTED = "executed"
    NEEDS_CONFIRMATION = "needs_confirmation"
    UNSUPPORTED = "unsupported"
    ERROR = "error"

class AgentResponse(BaseModel):
    status: Literal["executed", "needs_confirmation", "unsupported", "error"]
    confidence: float
    reasoning: Optional[str] = None
    calls: List[FunctionCall] = Field(default_factory=list)
    proposed_call: Optional[FunctionCall] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None

class NotificationPayload(BaseModel):
    package_name: str
    app_title: Optional[str] = None
    title: str
    text: str
    timestamp: Optional[int] = None
    id: Optional[str] = None

class NotificationAnalysisResponse(BaseModel):
    is_transaction: bool
    data: Optional[Dict[str, Any]] = None
    category: str  # transaction, alert, spam, personal, system
    summary: Optional[str] = None
    confidence: float
