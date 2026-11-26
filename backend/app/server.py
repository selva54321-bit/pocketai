import json
import logging
import time
from typing import Dict, List, Tuple
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.agent import PocketAIAgent
from app.executor import ActionExecutor
from app.models import (
    AgentRequest,
    AgentResponse,
    NotificationPayload,
    NotificationAnalysisResponse,
    BatchNotificationRequest,
)
from app.tools.notification_scorer import prioritize_notifications

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("pocketai.server")

app = FastAPI(
    title="PocketAI - Edge Operator Backend",
    description="On-device phone operator powered by Needle 3 & Cactus Compute",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize agent singleton
agent = PocketAIAgent()

# In-memory query deduplication cache: query_clean -> (timestamp, AgentResponse)
_recent_queries: Dict[str, Tuple[float, AgentResponse]] = {}
QUERY_DEDUP_WINDOW_SECONDS = 2.0

@app.get("/health")
def health():
    return {
        "status": "healthy",
        "agent": "Needle 3 (Cactus Compute)",
        "threshold": agent.confidence_threshold
    }

@app.post("/api/v1/query", response_model=AgentResponse)
def handle_query(req: AgentRequest):
    """Process a voice or text command and return the actionable Android payload."""
    clean_query = req.query.strip().lower()
    now = time.time()

    # Deduplicate rapid identical queries within deduplication window
    if clean_query in _recent_queries:
        last_time, cached_response = _recent_queries[clean_query]
        if now - last_time < QUERY_DEDUP_WINDOW_SECONDS:
            logger.warning(
                f"Deduplicating identical query within {now - last_time:.3f}s: '{req.query}'"
            )
            return cached_response

    try:
        response = agent.process_query(req.query)

        # Enrich executed or proposed calls with resolved Android Intent details
        if response.calls:
            for call in response.calls:
                call.arguments["_resolved_android"] = ActionExecutor.resolve_action(
                    call.name, call.arguments
                )
        if response.proposed_call and "_resolved_android" not in response.proposed_call.arguments:
            response.proposed_call.arguments["_resolved_android"] = ActionExecutor.resolve_action(
                response.proposed_call.name, response.proposed_call.arguments
            )

        _recent_queries[clean_query] = (now, response)
        # Purge entries older than 30s
        for k in list(_recent_queries.keys()):
            if now - _recent_queries[k][0] > 30.0:
                del _recent_queries[k]

        return response
    except Exception as e:
        logger.error(f"Error handling query '{req.query}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/notification", response_model=NotificationAnalysisResponse)
def handle_notification(payload: NotificationPayload):
    """Analyze an incoming phone notification for transactions, alerts, or spam."""
    try:
        result = agent.process_notification(
            title=payload.title,
            text=payload.text,
            package_name=payload.package_name
        )

        matched = result["matched"]
        tool = result.get("tool")
        data = result.get("data", {})
        confidence = result.get("confidence", 0.0)

        category = "system"
        is_transaction = False

        if matched:
            if tool == "extract_transaction":
                category = "transaction"
                is_transaction = True
            elif tool == "classify_promotional":
                category = "promotional"
            elif tool == "classify_security_alert":
                category = "security_alert"

        return NotificationAnalysisResponse(
            is_transaction=is_transaction,
            data=data,
            category=category,
            confidence=confidence,
            summary=result.get("reasoning")
        )
    except Exception as e:
        logger.error(f"Error handling notification: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/v1/notifications/prioritize")
def handle_prioritize_notifications(payload: BatchNotificationRequest):
    """Mathematically rank active device notifications using decay, category, and trust weights."""
    try:
        ranked = prioritize_notifications(payload.notifications)
        return ranked
    except Exception as e:
        logger.error(f"Error prioritizing notifications: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

manager = ConnectionManager()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Bidirectional WebSocket for low-latency voice streaming and instant feedback."""
    await manager.connect(websocket)
    logger.info("Client connected via WebSocket")
    try:
        while True:
            raw_text = await websocket.receive_text()
            data = json.loads(raw_text)
            event_type = data.get("type", "query")

            if event_type == "query":
                user_text = data.get("text", "")
                response = agent.process_query(user_text)

                if response.calls:
                    for call in response.calls:
                        call.arguments["_resolved_android"] = ActionExecutor.resolve_action(
                            call.name, call.arguments
                        )
                if response.proposed_call and "_resolved_android" not in response.proposed_call.arguments:
                    response.proposed_call.arguments["_resolved_android"] = ActionExecutor.resolve_action(
                        response.proposed_call.name, response.proposed_call.arguments
                    )

                await websocket.send_json({
                    "type": "query_result",
                    "payload": response.model_dump()
                })

            elif event_type == "notification":
                payload = data.get("payload", {})
                res = agent.process_notification(
                    title=payload.get("title", ""),
                    text=payload.get("text", ""),
                    package_name=payload.get("package_name", "")
                )
                await websocket.send_json({
                    "type": "notification_analyzed",
                    "payload": res
                })

    except WebSocketDisconnect:
        manager.disconnect(websocket)
        logger.info("Client disconnected from WebSocket")
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
        manager.disconnect(websocket)
