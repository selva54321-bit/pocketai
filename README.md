# PocketAI — Android AI Personal Phone Operator

PocketAI is an on-device personal phone operator powered by **Needle 3** (`cactus-compute`) and **React Native**. It gives you complete voice and text automation over your phone's day-to-day operations with sub-millisecond edge latency and full offline tool-calling intelligence.

---

## Complete Capabilities Matrix

| Category | Voice / Text Commands | Android Execution Mechanism |
| :--- | :--- | :--- |
| **📱 Hardware Toggles** | `"Turn on flashlight"`, `"Turn off torch"` | `CameraManager.setTorchMode` |
| | `"Turn volume up"`, `"Mute volume"`, `"Volume max"` | `AudioManager.adjustStreamVolume` |
| | `"Set brightness to 40%"` | `Settings.System.SCREEN_BRIGHTNESS` |
| | `"Turn on Do Not Disturb"` | `NotificationManager.INTERRUPTION_FILTER_PRIORITY` |
| | `"Turn on battery saver"` | `Settings.ACTION_BATTERY_SAVER_SETTINGS` |
| **⚙️ System Settings** | `"Open Wi-Fi settings"`, `"Open Bluetooth"` | Direct Android Settings Intent routing |
| | `"Open location settings"`, `"Open sound settings"` | `Settings.ACTION_LOCATION_SOURCE_SETTINGS`, etc. |
| **💬 Communication** | `"Call Mom"`, `"Dial 9876543210"` | `Intent.ACTION_DIAL` |
| | `"Send SMS to Rahul: I am on my way"` | `Intent.ACTION_SENDTO` (`smsto:`) |
| | `"Send WhatsApp to Dad: Call me back"` | `com.whatsapp` intent with text payload |
| | `"Email professor: Assignment submission"` | `Intent.ACTION_SENDTO` (`mailto:`) |
| **⏰ Alarms & Timers** | `"Set an alarm for 7:30 AM"` | `AlarmClock.ACTION_SET_ALARM` |
| | `"Start a 25-minute timer"` | `AlarmClock.ACTION_SET_TIMER` |
| **🗺️ Navigation & Search** | `"Navigate to Central Mall"` | Google Maps GPS navigation intent (`google.navigation:q=`) |
| | `"Search who won yesterday's match"` | `Intent.ACTION_WEB_SEARCH` |
| | `"Play lo-fi beats on YouTube"` | `com.google.android.youtube` / web search |
| **🎵 Media & Notes** | `"Pause music"`, `"Next song"`, `"Resume music"` | `AudioManager.dispatchMediaKeyEvent` |
| | `"Take a note: Buy milk and bread"` | Instant local memo storage |
| | `"Open my college timetable"` | College timetable schedule viewer |
| **🔔 Notification Intel** | Automatic transaction, alert, and spam parsing | `NotificationListenerService` $\rightarrow$ Needle 3 extractor |

---

## Multi-Tiered Intelligence & Safety

1. **Safe Everyday Actions ($\ge$ 35% confidence)**:
   - Hardware toggles (torch, volume, brightness, timer, navigation, settings, media playback) trigger and execute immediately.
2. **Sensitive Communications (< 70% confidence)**:
   - High-impact operations (placing calls, sending messages/WhatsApp/emails) display an instant **1-Tap Confirmation Card** with Needle's parsed reasoning to prevent accidental sends.
3. **Sub-Millisecond On-Device Inference**:
   - Runs locally on CPU via `cactus-compute` with byte-level constrained grammars.
   - Zero hallucinated parameter names, zero cloud API fees, and ~350MB peak RAM footprint.

---

## Quick Start & Testing

### 1. Start the Needle 3 Engine
```bash
cd backend
source .venv/bin/activate
python run.py
```

### 2. Reverse Ports (Phone to PC)
```bash
adb reverse tcp:8000 tcp:8000
adb reverse tcp:8081 tcp:8081
```

### 3. Start Metro & Launch on Phone
```bash
cd mobile
npx react-native start
# Press 'a' to run on your connected Android phone, or in a separate terminal:
npx react-native run-android
```
