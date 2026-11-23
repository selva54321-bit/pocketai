import { NativeModules, NativeEventEmitter, Platform } from 'react-native';
import { prioritizeNotifications } from '../utils/notificationScorer';

const { AndroidOperator, SpeechRecognition } = NativeModules;
const speechEmitter = SpeechRecognition ? new NativeEventEmitter(SpeechRecognition) : null;
const operatorEmitter = AndroidOperator ? new NativeEventEmitter(AndroidOperator) : null;

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
        callback(e.text);
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
      const sub = operatorEmitter.addListener('onWakeWordDetected', callback);
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
