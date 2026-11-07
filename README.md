# PocketAI — Android AI Personal Phone Operator

PocketAI is an on-device personal phone operator powered by **Needle 3** (`cactus-compute`) and **React Native**. It allows natural voice or text control over phone settings, app navigation, system timers, and parses notification streams into structured financial and alert ledgers.

---

## Architecture Overview

```
Voice / Text Input (SpeechRecognizer / UI)
           ↓
Needle 3 Engine (Cactus Compute / on-device tool calling)
           ↓
Action Validation & Confidence Scoring
           ├── (Confidence >= 70%)  →  Execute immediately via Android Native Bridge
           ├── (Confidence < 70%)   →  Ask 1-tap confirmation
           └── (No match)           →  Gracefully decline
           ↓
Android Native Module (Intents, Brightness, DND, Alarms)
```

### Components

1. **Backend Edge Service (`/backend`)**:
   - Python 3.12+ / 3.14+ service using `cactus-compute` with the **Needle 3** model (~35MB weights).
   - FastAPI REST API & WebSocket server for sub-millisecond edge communication.
   - Constrained JSON grammar tool registry for device control and notification intelligence.
   - Comprehensive Pytest test suite covering all sample commands and transaction extraction.

2. **Mobile Client (`/mobile`)**:
   - React Native application with native Java/Kotlin modules.
   - `AndroidOperatorModule.java`: Handles app launching, screen brightness (`Settings.System`), Do Not Disturb (`NotificationManager`), battery saver, and alarms (`AlarmClock.ACTION_SET_TIMER`).
   - `NotificationListener.java`: Android `NotificationListenerService` that intercepts notifications and streams them into the Needle parser.
   - `SpeechRecognitionModule.java`: Android's `SpeechRecognizer` bridge with real-time partial streaming.

---

## Quick Start

### 1. Run the Needle 3 Edge Service

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run the test suite
pytest -v tests/test_agent.py

# Start the edge service (FastAPI on port 8000)
python run.py
```

### 2. Available API Endpoints

- `GET /health` — Check engine readiness and confidence thresholds.
- `POST /api/v1/query` — Send command text (`{"query": "Open YouTube"}`). Returns actionable payload and resolved Android Intent.
- `POST /api/v1/notification` — Send raw notification (`{"package_name": "com.hdfc.bank", "title": "Alert", "text": "..."}`). Returns structured transaction data.
- `WS /ws` — Bidirectional WebSocket for streaming voice transcripts and live telemetry.

---

## Supported Voice / Text Actions

- **"Turn on battery saver."** → Opens battery saver controls or toggles power saver.
- **"Open YouTube."** → Launches `com.google.android.youtube`.
- **"Set brightness to 40%."** → Adjusts `SCREEN_BRIGHTNESS` directly.
- **"Turn on Do Not Disturb."** → Sets `INTERRUPTION_FILTER_PRIORITY`.
- **"Open my college timetable."** → Routes to schedule screen or app.
- **"Start a 25-minute timer."** → Triggers `AlarmClock.ACTION_SET_TIMER` with 1500 seconds.

---

## Notification Intelligence

Extracts structured JSON from unformatted notification streams:

```json
// Input Notification:
// "Your account has been debited by Rs. 1,250 at Amazon on November 8."

{
  "type": "debit",
  "merchant": "Amazon",
  "amount": 1250.0,
  "currency": "INR",
  "date": "2026-11-08"
}
```
