from dataclasses import asdict, dataclass, field
import json
from typing import Any, Dict, List, Literal, Optional


@dataclass
class FunctionCall:
    name: str
    arguments: Dict[str, Any] = field(default_factory=dict)

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)


@dataclass
class AgentRequest:
    query: str
    context: Dict[str, Any] = field(default_factory=dict)


class ActionExecutionStatus(str):
    EXECUTED = "executed"
    NEEDS_CONFIRMATION = "needs_confirmation"
    UNSUPPORTED = "unsupported"
    ERROR = "error"


@dataclass
class AgentResponse:
    status: Literal["executed", "needs_confirmation", "unsupported", "error"]
    confidence: float
    reasoning: Optional[str] = None
    calls: List[FunctionCall] = field(default_factory=list)
    proposed_call: Optional[FunctionCall] = None
    message: Optional[str] = None
    telemetry: Optional[Dict[str, Any]] = None

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)

    def model_dump_json(self) -> str:
        return json.dumps(self.model_dump())


@dataclass
class NotificationPayload:
    package_name: str
    title: str
    text: str
    app_title: Optional[str] = None
    timestamp: Optional[int] = None
    id: Optional[str] = None


@dataclass
class NotificationAnalysisResponse:
    is_transaction: bool
    category: str
    confidence: float
    data: Optional[Dict[str, Any]] = None
    summary: Optional[str] = None

    def model_dump(self) -> Dict[str, Any]:
        return asdict(self)

    def model_dump_json(self) -> str:
        return json.dumps(self.model_dump())


@dataclass
class BatchNotificationRequest:
    notifications: List[Dict[str, Any]] = field(default_factory=list)
