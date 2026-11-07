import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

const { AndroidOperator, SpeechRecognition } = NativeModules;
const speechEmitter = SpeechRecognition ? new NativeEventEmitter(SpeechRecognition) : null;
const operatorEmitter = AndroidOperator ? new NativeEventEmitter(AndroidOperator) : null;

export interface SystemPermissions {
  canWriteSettings: boolean;
  hasDndPolicy: boolean;
}

export const AndroidNative = {
  isAvailable: Platform.OS === 'android' && Boolean(AndroidOperator),

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

  async startTimer(seconds: number, label: string = 'Timer', skipUi: boolean = false): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.startTimer(seconds, label, skipUi);
  },

  async openBatterySaverSettings(): Promise<string> {
    if (!this.isAvailable) throw new Error('AndroidOperator not available');
    return await AndroidOperator.openBatterySaverSettings();
  },

  // Execute resolved action from Needle 3 tool call
  async executeResolvedAction(action: Record<string, any>): Promise<string> {
    const actionType = action.android_action;
    switch (actionType) {
      case 'OPEN_APP':
        return await this.openApp(action.package_name);
      case 'SET_BRIGHTNESS':
        return await this.setBrightness(action.percent);
      case 'SET_DND':
        return await this.setDoNotDisturb(action.enabled);
      case 'START_TIMER':
        return await this.startTimer(action.length_seconds, action.message, action.skip_ui);
      case 'SET_BATTERY_SAVER':
        return await this.openBatterySaverSettings();
      default:
        throw new Error(`Unsupported android action: ${actionType}`);
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
  }
};
