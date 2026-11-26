import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { prioritizeNotifications } from '../utils/notificationScorer';

const { AndroidOperator, SpeechRecognition, TextToSpeech, PocketAIAgent } = NativeModules;
const speechEmitter = SpeechRecognition ? new NativeEventEmitter(SpeechRecognition) : null;
const operatorEmitter = AndroidOperator ? new NativeEventEmitter(AndroidOperator) : null;

// Module-level deduplication trackers
let globalLastSpeechResult = '';
let globalLastSpeechTime = 0;
let globalLastWakeTime = 0;
let globalLastWakeCommand = '';

export interface SystemPermissions {
  canWriteSettings: boolean;
  hasDndPolicy: boolean;
}

export const AndroidNative = {
  isAvailable: Platform.OS === 'android' && Boolean(AndroidOperator),
  onNavigateTab: null as (((tab: 'operator' | 'notifications') => void) | null),

  async checkPermissions(): Promise<SystemPermissions> {
    if (!this.isAvailable) return { canWriteSettings: false, hasDndPolicy: false };
    return await AndroidOperator.checkPermissions();
  },

  async openApp(packageName: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openApp(packageName);
  },

  async setBrightness(levelPercent: number): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.setBrightness(levelPercent);
  },

  async setDoNotDisturb(enable: boolean): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.setDoNotDisturb(enable);
  },

  async toggleFlashlight(enable: boolean): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.toggleFlashlight(enable);
  },

  async adjustVolume(action: string, levelPercent: number = 50): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.adjustVolume(action, levelPercent);
  },

  async controlMedia(action: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.controlMedia(action);
  },

  async startTimer(seconds: number, label: string = 'Timer', skipUi: boolean = false): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.startTimer(seconds, label, skipUi);
  },

  async setAlarm(hour: number, minute: number, label: string = 'Alarm', skipUi: boolean = false): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.setAlarm(hour, minute, label, skipUi);
  },

  async makeCall(contactOrNumber: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.makeCall(contactOrNumber);
  },

  async sendSms(recipient: string, message: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.sendSms(recipient, message);
  },

  async sendWhatsApp(recipient: string, message: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.sendWhatsApp(recipient, message);
  },

  async sendEmail(recipient: string, subject: string, body: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.sendEmail(recipient, subject, body);
  },

  async navigateTo(destination: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.navigateTo(destination);
  },

  async searchWeb(query: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.searchWeb(query);
  },

  async searchYouTube(query: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.searchYouTube(query);
  },

  async openSetting(settingName: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openSetting(settingName);
  },

  async copyToClipboard(text: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.copyToClipboard(text);
  },

  async openBatterySaverSettings(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openBatterySaverSettings();
  },

  async openDefaultAssistantSettings(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openDefaultAssistantSettings();
  },

  async getBatteryStatus(): Promise<{ percentage: number; isCharging: boolean; status: string; summary: string }> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.getBatteryStatus();
  },

  async setRingerMode(mode: string): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.setRingerMode(mode);
  },

  async openCamera(mode: string = 'rear'): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openCamera(mode);
  },

  async isAccessibilityServiceEnabled(): Promise<boolean> {
    if (!this.isAvailable) return false;
    return await AndroidOperator.isAccessibilityServiceEnabled();
  },

  async openAccessibilitySettings(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openAccessibilitySettings();
  },

  async takeScreenshot(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.takeScreenshot();
  },

  async lockScreen(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.lockScreen();
  },

  async openNotificationPanel(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openNotificationPanel();
  },

  async openQuickSettingsPanel(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openQuickSettingsPanel();
  },

  // Central dispatch for resolved Needle 3 tool actions
  async executeResolvedAction(action: Record<string, any>): Promise<string> {
    const rawAction = action.android_action || action.action || action.name || '';
    const actionType = String(rawAction).toUpperCase().trim();
    switch (actionType) {
      case 'OPEN_APP':
        return await this.openApp(action.package_name);
      case 'SET_BRIGHTNESS':
        return await this.setBrightness(action.percent);
      case 'SET_DND':
        return await this.setDoNotDisturb(action.enabled);
      case 'TOGGLE_FLASHLIGHT':
        return await this.toggleFlashlight(action.enabled);
      case 'ADJUST_VOLUME':
        return await this.adjustVolume(action.action, action.level_percent || 50);
      case 'CONTROL_MEDIA':
        return await this.controlMedia(action.action);
      case 'START_TIMER':
        return await this.startTimer(action.length_seconds, action.message, action.skip_ui);
      case 'SET_ALARM':
        return await this.setAlarm(action.hour, action.minute, action.label, action.skip_ui);
      case 'MAKE_CALL':
        return await this.makeCall(action.contact_or_number);
      case 'SEND_SMS':
        return await this.sendSms(action.recipient, action.message);
      case 'SEND_WHATSAPP':
        return await this.sendWhatsApp(action.recipient, action.message);
      case 'SEND_EMAIL':
        return await this.sendEmail(action.recipient, action.subject, action.body);
      case 'NAVIGATE_TO':
        return await this.navigateTo(action.destination);
      case 'SEARCH_WEB':
        return await this.searchWeb(action.query);
      case 'SEARCH_YOUTUBE':
        return await this.searchYouTube(action.query);
      case 'OPEN_SETTING':
        return await this.openSetting(action.setting_name);
      case 'SET_BATTERY_SAVER':
        return await this.openBatterySaverSettings();
      case 'COPY_CLIPBOARD':
        return await this.copyToClipboard(action.text);
      case 'CHECK_NOTIFICATIONS':
      case 'CHECK_NOTIFICATION':
      case 'READ_NOTIFICATIONS': {
        const notifs = await this.notifications.getActive();
        const prioritized = prioritizeNotifications(notifs);
        const important = prioritized.filter((n) => n.score >= 50);
        if (this.onNavigateTab) {
          this.onNavigateTab('notifications');
        }
        if (important.length === 0) {
          return `Checked notifications (${prioritized.length} active, 0 critical). Opened Notifications screen.`;
        }
        const topSummary = important
          .slice(0, 2)
          .map((n) => `[${n.score} pts] ${n.title}`)
          .join('; ');
        return `Found ${important.length} important notifications (${topSummary}). Opened Notifications.`;
      }
      case 'GET_BATTERY_STATUS': {
        const bat = await this.getBatteryStatus();
        return bat.summary;
      }
      case 'SET_RINGER_MODE':
        return await this.setRingerMode(action.mode || 'normal');
      case 'OPEN_CAMERA':
        return await this.openCamera(action.mode || 'rear');
      case 'TAKE_SCREENSHOT':
        return await this.takeScreenshot();
      case 'LOCK_SCREEN':
        return await this.lockScreen();
      case 'OPEN_NOTIFICATION_PANEL':
        return await this.openNotificationPanel();
      case 'OPEN_QUICK_SETTINGS':
        return await this.openQuickSettingsPanel();
      case 'EXECUTE_ROUTINE': {
        const routine = String(action.routine || '').toLowerCase();
        if (routine.includes('morning')) {
          await this.setDoNotDisturb(false);
          const bat = await this.getBatteryStatus();
          return `Good morning! Do Not Disturb turned off. ${bat.summary}.`;
        } else if (routine.includes('night') || routine.includes('bedtime')) {
          await this.setDoNotDisturb(true);
          await this.setBrightness(0);
          await this.setAlarm(7, 0, 'Morning Alarm', true);
          return 'Good night! Enabled Do Not Disturb, dimmed brightness, and set alarm for 7:00 AM.';
        } else if (routine.includes('focus')) {
          await this.setDoNotDisturb(true);
          await this.setRingerMode('vibrate');
          await this.startTimer(45 * 60, 'Focus Session', true);
          return 'Focus mode active! Enabled Do Not Disturb, set phone to vibrate, and started 45-minute timer.';
        }
        return `Executed routine: ${action.routine}`;
      }
      case 'NAVIGATE_SCREEN': {
        const screen = String(action.screen || '').toLowerCase();
        if (screen === 'notifications' || screen === 'notification') {
          if (this.onNavigateTab) {
            this.onNavigateTab('notifications');
          }
          return 'Opened Notifications screen.';
        }
        return `Navigated to ${action.screen}`;
      }
      default:
        throw new Error(`Unsupported android action: ${rawAction || actionType}`);
    }
  },

  // Speech Recognition wrappers
  speech: {
    async start(): Promise<string> {
      if (!SpeechRecognition) throw new Error('SpeechRecognition module missing');
      return await SpeechRecognition.startListening();
    },

    async stop(): Promise<string> {
      if (!SpeechRecognition) throw new Error('SpeechRecognition module missing');
      return await SpeechRecognition.stopListening();
    },

    onPartial(callback: (text: string) => void) {
      if (!speechEmitter) return () => {};
      const sub = speechEmitter.addListener('onSpeechPartial', (e: { partialText: string }) => {
        callback(e.partialText);
      });
      return () => sub.remove();
    },

    onResult(callback: (text: string) => void) {
      if (!speechEmitter) return () => {};
      const sub = speechEmitter.addListener('onSpeechResult', (e: { text: string }) => {
        const text = (e.text || '').trim();
        if (!text) return;
        const now = Date.now();
        if (text.toLowerCase() === globalLastSpeechResult.toLowerCase() && now - globalLastSpeechTime < 2500) {
          console.log('[PocketAI] Native speech deduplication: ignoring identical speech within 2.5s:', text);
          return;
        }
        globalLastSpeechResult = text;
        globalLastSpeechTime = now;
        callback(text);
      });
      return () => sub.remove();
    },

    onError(callback: (errorMsg: string) => void) {
      if (!speechEmitter) return () => {};
      const sub = speechEmitter.addListener('onSpeechError', (e: { message: string }) => {
        callback(e.message);
      });
      return () => sub.remove();
    }
  },

  // Text-to-Speech (TTS) voice feedback
  tts: {
    async speak(text: string): Promise<boolean> {
      if (!TextToSpeech) return false;
      try {
        return await TextToSpeech.speak(text);
      } catch {
        return false;
      }
    },
    async stop(): Promise<boolean> {
      if (!TextToSpeech) return false;
      return await TextToSpeech.stop();
    },
    async isSpeaking(): Promise<boolean> {
      if (!TextToSpeech) return false;
      return await TextToSpeech.isSpeaking();
    }
  },

  // Embedded In-Process Python AI Agent (Chaquopy + Needle 3)
  agent: {
    isAvailable: Platform.OS === 'android' && Boolean(PocketAIAgent),

    async warmUp(): Promise<boolean> {
      if (!PocketAIAgent) return false;
      return await PocketAIAgent.warmUp();
    },

    async checkHealth(): Promise<{ status: string; agent: string; embedded: boolean }> {
      if (!PocketAIAgent) throw new Error('PocketAIAgent native module missing');
      return await PocketAIAgent.checkHealth();
    },

    async query(queryText: string): Promise<any> {
      if (!PocketAIAgent) throw new Error('PocketAIAgent native module missing');
      const jsonStr = await PocketAIAgent.query(queryText);
      return JSON.parse(jsonStr);
    },

    async processNotification(title: string, text: string, packageName: string): Promise<any> {
      if (!PocketAIAgent) throw new Error('PocketAIAgent native module missing');
      const jsonStr = await PocketAIAgent.processNotification(title, text, packageName);
      return JSON.parse(jsonStr);
    },

    async prioritizeNotifications(notifications: any[]): Promise<any[]> {
      if (!PocketAIAgent) return [];
      const jsonStr = await PocketAIAgent.prioritizeNotifications(JSON.stringify(notifications));
      return JSON.parse(jsonStr);
    }
  },

  // Wake Word ('Hey Jackie') Controls
  wakeWord: {
    async start(): Promise<string> {
      if (!AndroidOperator) throw new Error('AndroidOperator missing');
      return await AndroidOperator.startWakeWordService();
    },

    async stop(): Promise<string> {
      if (!AndroidOperator) throw new Error('AndroidOperator missing');
      return await AndroidOperator.stopWakeWordService();
    },

    async setForegroundState(isForeground: boolean): Promise<boolean> {
      if (!AndroidOperator) return false;
      return await AndroidOperator.setWakeWordForegroundState(isForeground);
    },

    async isRunning(): Promise<boolean> {
      if (!AndroidOperator) return false;
      return await AndroidOperator.isWakeWordServiceRunning();
    },

    async getInitialCommand(): Promise<{ wakeWordTriggered: boolean; commandText: string }> {
      if (!AndroidOperator) return { wakeWordTriggered: false, commandText: '' };
      return await AndroidOperator.getInitialWakeWordCommand();
    },

    onDetected(callback: (event: { wakeWordTriggered: boolean; commandText: string }) => void) {
      if (!operatorEmitter) return () => {};
      const sub = operatorEmitter.addListener('onWakeWordDetected', (evt: any) => {
        const cmd = (evt?.commandText || '').trim();
        const now = Date.now();
        if (now - globalLastWakeTime < 2000 && cmd.toLowerCase() === globalLastWakeCommand.toLowerCase()) {
          console.log('[PocketAI] Native wake deduplication: ignoring duplicate wake event within 2s:', cmd);
          return;
        }
        globalLastWakeTime = now;
        globalLastWakeCommand = cmd;
        callback(evt);
      });
      return () => sub.remove();
    },

    onStatusChanged(callback: (enabled: boolean) => void) {
      if (!operatorEmitter) return () => {};
      const sub = operatorEmitter.addListener('onWakeWordStatusChanged', (evt: { enabled: boolean }) => {
        callback(Boolean(evt?.enabled));
      });
      return () => sub.remove();
    }
  },

  // System Notifications
  notifications: {
    async getActive(): Promise<any[]> {
      if (!AndroidOperator) return [];
      const raw = await AndroidOperator.getActiveNotifications();
      return (raw || []).map((item: any) => ({
        id: item.id,
        package_name: item.packageName,
        title: item.title,
        text: item.text,
        subText: item.subText,
        timestamp: item.postTime,
        category: item.category,
        isOngoing: item.isOngoing,
        isClearable: item.isClearable,
      }));
    },

    async isEnabled(): Promise<boolean> {
      if (!AndroidOperator) return false;
      return await AndroidOperator.isNotificationListenerEnabled();
    },

    async openSettings(): Promise<string> {
      if (!AndroidOperator) throw new Error('AndroidOperator missing');
      return await AndroidOperator.openNotificationListenerSettings();
    },

    onReceived(callback: (payload: any) => void) {
      if (!operatorEmitter) return () => {};
      const sub = operatorEmitter.addListener('onNotificationReceived', (raw: any) => {
        callback({
          id: raw.id,
          package_name: raw.packageName,
          title: raw.title,
          text: raw.text,
          subText: raw.subText,
          timestamp: raw.postTime,
          category: raw.category,
          isOngoing: raw.isOngoing,
          isClearable: raw.isClearable,
        });
      });
      return () => sub.remove();
    }
  }
};
