import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  PermissionsAndroid,
  AppState,
  AppStateStatus,
  Animated,
} from 'react-native';
import { apiClient } from '../api/client';
import { AndroidNative } from '../native/AndroidOperator';
import { AgentResponse, FunctionCall } from '../types';

interface ActionCategory {
  category: string;
  items: string[];
}

const ACTION_CATEGORIES: ActionCategory[] = [
  {
    category: '⚡ Complete Mobile Automation',
    items: [
      'What is my battery level?',
      'Mute my phone.',
      'Set phone to vibrate.',
      'Take a selfie.',
      'Take a screenshot.',
      'Lock my phone.',
      'Pull down notifications.',
      'Open quick settings.',
    ],
  },
  {
    category: '🌅 Routines & Focus Macros',
    items: [
      'Good morning.',
      'Good night.',
      'Start focus mode.',
    ],
  },
  {
    category: '📱 Hardware & Voice Trigger',
    items: [
      'Say "Hey Jackie" from home screen.',
      'Check my notifications.',
      'Turn on flashlight.',
      'Turn volume up.',
      'Set brightness to 40%.',
      'Turn on Do Not Disturb.',
      'Turn on battery saver.',
      'Open Wi-Fi settings.',
    ],
  },
  {
    category: '💬 Direct Calling & Messaging',
    items: [
      'Call kalif.',
      'Call Mom.',
      'Send WhatsApp to Rahul: I am on my way.',
      'Send SMS to Dad: Call me back.',
      'Navigate to Central Mall.',
    ],
  },
  {
    category: '⏰ Alarms, Media & Search',
    items: [
      'Set an alarm for 7:00 AM.',
      'Start a 25-minute timer.',
      'Play lo-fi beats on YouTube.',
      'Pause music.',
      'Open my college timetable.',
      'Search who won the match.',
    ],
  },
];

// Module-level global lock across all component mounts, navigations, and instances
let globalLastCommandText = '';
let globalLastCommandTime = 0;
let isCommandExecuting = false;
let globalLastActionKey = '';
let globalLastActionTime = 0;

export const OperatorScreen: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoMicEnabled, setAutoMicEnabled] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string>('');
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [accessibilityEnabled, setAccessibilityEnabled] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const autoMicRef = useRef(autoMicEnabled);
  autoMicRef.current = autoMicEnabled;
  const wakeWordRef = useRef(wakeWordEnabled);
  wakeWordRef.current = wakeWordEnabled;
  const isListeningRef = useRef(false);
  const isStartingRef = useRef(false);
  const coldBootDoneRef = useRef(false);
  const lastExecutedRef = useRef<{ text: string; time: number }>({ text: '', time: 0 });

  // Pulse animation when microphone is actively listening
  useEffect(() => {
    if (isListening) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1.0,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isListening]);

  // Start speech listening helper
  const startMicSession = async () => {
    if (isListeningRef.current || isStartingRef.current) {
      console.log('[PocketAI] Mic session already starting or active, ignoring duplicate start request.');
      return;
    }
    isStartingRef.current = true;
    try {
      console.log('[PocketAI] Requesting speech.start()...');
      await AndroidNative.speech.start();
      console.log('[PocketAI] Speech recognition started active');
      setIsListening(true);
      isListeningRef.current = true;
    } catch (err: any) {
      console.warn('[PocketAI] Speech start error:', err);
      setIsListening(false);
      isListeningRef.current = false;
    } finally {
      isStartingRef.current = false;
    }
  };

  const toggleWakeWord = async () => {
    const nextState = !wakeWordEnabled;
    setWakeWordEnabled(nextState);
    wakeWordRef.current = nextState;
    try {
      if (nextState) {
        await AndroidNative.wakeWord.start();
        Alert.alert(
          'Hands-Free Voice Trigger Enabled',
          'Jackie will listen for "Hey Jackie" hands-free while your screen is ON.\n\nWhen your screen turns OFF, the microphone shuts down completely to prevent background battery drain and eliminate privacy dots.'
        );
      } else {
        await AndroidNative.wakeWord.stop();
        Alert.alert(
          'Hands-Free Voice Trigger Disabled',
          'Hands-free listening is OFF.\n\nJackie will only listen when you hold the Side Key, press the Home Button, or tap the mic.'
        );
      }
    } catch (err: any) {
      console.warn('[PocketAI] Toggle wake word error:', err);
    }
  };

  const handleOpenAssistantSettings = async () => {
    try {
      await AndroidNative.openDefaultAssistantSettings();
    } catch (err: any) {
      Alert.alert('Settings Error', err.message || 'Failed to open assistant settings.');
    }
  };

  const checkConnection = async () => {
    const isOk = await apiClient.checkHealth();
    setBackendConnected(isOk);
    return isOk;
  };

  const checkAccessibility = async () => {
    try {
      const enabled = await AndroidNative.isAccessibilityServiceEnabled();
      setAccessibilityEnabled(enabled);
      return enabled;
    } catch {
      return false;
    }
  };

  const handleBadgePress = async () => {
    const ok = await checkConnection();
    if (ok) {
      Alert.alert('Needle 3 Engine', 'Connected successfully to backend on port 8000.');
    } else {
      Alert.alert(
        'Backend Offline',
        'Cannot connect to Needle 3 Edge backend (port 8000).\n\nPlease verify:\n1. USB cable is plugged in\n2. Run: adb reverse tcp:8000 tcp:8000\n3. Backend server is running: python run.py',
        [
          { text: 'Retry', onPress: checkConnection },
          { text: 'OK', style: 'cancel' },
        ]
      );
    }
  };

  useEffect(() => {
    // 1. Initial Launch: Verify runtime permissions, arm assistant/wake-word, and trigger auto-listen
    const initApp = async () => {
      checkConnection();
      checkAccessibility();
      if (Platform.OS === 'android') {
        try {
          const hasRecordAudio = await PermissionsAndroid.check(
            PermissionsAndroid.PERMISSIONS.RECORD_AUDIO
          );

          if (!hasRecordAudio) {
            console.log('[PocketAI] Requesting audio and phone permissions...');
            await PermissionsAndroid.requestMultiple([
              PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
              PermissionsAndroid.PERMISSIONS.CALL_PHONE,
              PermissionsAndroid.PERMISSIONS.READ_CONTACTS,
            ]);
          }

          // If wakeWord is enabled (Screen-On mode), start it; otherwise ensure it's stopped
          if (wakeWordRef.current) {
            AndroidNative.wakeWord.start().catch((e) => {
              console.warn('[PocketAI] WakeWordService start warning:', e);
            });
            AndroidNative.wakeWord.setForegroundState(false).catch(() => {});
          } else {
            AndroidNative.wakeWord.stop().catch(() => {});
          }

          // Check if app was opened via wake word or system Assistant gesture ("Hold Home / Side Key")
          const initialWake = await AndroidNative.wakeWord.getInitialCommand();
          if (initialWake.wakeWordTriggered) {
            console.log('[PocketAI] Launched via wake word / Assistant intent:', initialWake);
            coldBootDoneRef.current = true;
            if (initialWake.commandText && initialWake.commandText.trim()) {
              handleSendCommand(initialWake.commandText.trim());
              return;
            } else {
              // Triggered by Assistant / Side Key without pre-speech: start mic immediately!
              setTimeout(() => {
                startMicSession();
              }, 300);
              return;
            }
          }

          // Zero-background mic architecture: Do not auto-start microphone on cold launch
          coldBootDoneRef.current = true;
        } catch (e) {
          console.warn('[PocketAI] Permission / init error:', e);
          coldBootDoneRef.current = true;
        }
      }
    };
    initApp();

    // 2. Resume / Return from Home Screen: Check connection & ensure background mic is off
    let previousState = AppState.currentState;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`[PocketAI] AppState transitioned from ${previousState} -> ${nextAppState}`);
      if (
        coldBootDoneRef.current &&
        (previousState === 'background' || previousState === 'inactive') &&
        nextAppState === 'active'
      ) {
        checkConnection();
        checkAccessibility();
      } else if (nextAppState === 'background') {
        // App backgrounded: release manual speech recognizer cleanly
        AndroidNative.speech.stop().catch(() => {});
        setIsListening(false);
        isListeningRef.current = false;
        // In background: if wakeWord is disabled, ensure service is stopped
        if (!wakeWordRef.current) {
          AndroidNative.wakeWord.stop().catch(() => {});
        }
      }
      previousState = nextAppState;
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // 3. Wake Word Detected Event Listener (emitted when "Hey Jackie" is spoken)
    let lastWakeTriggerTime = 0;
    const unsubWakeWord = AndroidNative.wakeWord.onDetected((evt) => {
      const now = Date.now();
      if (now - lastWakeTriggerTime < 1500) {
        console.log('[PocketAI] Debouncing duplicate WakeWord event in UI');
        return;
      }
      lastWakeTriggerTime = now;
      console.log('[PocketAI] WakeWord detected event in UI:', evt);
      if (evt.commandText && evt.commandText.trim()) {
        handleSendCommand(evt.commandText.trim());
      } else {
        startMicSession();
      }
    });

    // 4. Speech Recognizer event listeners
    const unsubResult = AndroidNative.speech.onResult((text) => {
      console.log('[PocketAI] Recognized Speech Text:', text);
      setInputText(text);
      setIsListening(false);
      isListeningRef.current = false;
      if (text && text.trim()) {
        handleSendCommand(text.trim());
      }
    });

    const unsubPartial = AndroidNative.speech.onPartial((partial) => {
      setInputText(partial);
    });

    const unsubError = AndroidNative.speech.onError((errMsg: string) => {
      console.log('[PocketAI] Speech error / timeout:', errMsg);
      setIsListening(false);
      isListeningRef.current = false;
    });

    return () => {
      appStateSub.remove();
      unsubWakeWord();
      unsubResult();
      unsubPartial();
      unsubError();
    };
  }, []);

  const handleSendCommand = async (commandText: string) => {
    const textToRun = commandText.trim();
    if (!textToRun) return;

    // Module-level global debounce across any and all component instances
    const now = Date.now();
    if (
      (globalLastCommandText.toLowerCase() === textToRun.toLowerCase() && now - globalLastCommandTime < 3000) ||
      isCommandExecuting
    ) {
      console.log('[PocketAI] Dropping duplicate command execution (global lock):', textToRun);
      return;
    }
    globalLastCommandText = textToRun;
    globalLastCommandTime = now;
    isCommandExecuting = true;

    // Immediately release microphone
    AndroidNative.speech.stop().catch(() => {});
    setIsListening(false);
    isListeningRef.current = false;

    setLoading(true);
    setExecutionMessage('');
    try {
      const response = await apiClient.sendQuery(textToRun);
      setLatestResponse(response);

      if (response.status === 'executed' && response.calls.length > 0) {
        // Automatically execute confident action via Android Native Bridge
        await executeCall(response.calls[0]);
      }
    } catch (err: any) {
      Alert.alert('Operator Error', err.message || 'Failed to communicate with Needle engine.');
    } finally {
      setLoading(false);
      setTimeout(() => {
        isCommandExecuting = false;
      }, 500);
    }
  };

  const executeCall = async (call: FunctionCall) => {
    try {
      const resolved = call.arguments._resolved_android;
      const actionKey = JSON.stringify(resolved || call);
      const now = Date.now();
      if (actionKey === globalLastActionKey && now - globalLastActionTime < 2500) {
        console.log('[PocketAI] Dropping duplicate action execution (action lock):', actionKey);
        return;
      }
      globalLastActionKey = actionKey;
      globalLastActionTime = now;

      let msg = '';
      if (resolved) {
        msg = await AndroidNative.executeResolvedAction(resolved);
        setExecutionMessage(`✓ ${msg}`);
      } else {
        msg = `Action '${call.name}' triggered.`;
        setExecutionMessage(msg);
      }

      if (ttsEnabled && msg) {
        const spoken = msg.replace(/^[✓✗⚙️⚡🔊🔇🦾]\s*/, '').trim();
        AndroidNative.tts.speak(spoken).catch((e) => {
          console.warn('[PocketAI] TTS feedback warning:', e);
        });
      }
    } catch (e: any) {
      const errMsg = e.message || 'Execution failed';
      setExecutionMessage(`✗ Execution failed: ${errMsg}`);
      if (ttsEnabled) {
        AndroidNative.tts.speak(`Action failed: ${errMsg}`).catch(() => {});
      }
      Alert.alert('Action Error', errMsg);
    }
  };

  const toggleVoiceRecording = async () => {
    if (isListeningRef.current) {
      await AndroidNative.speech.stop();
      setIsListening(false);
      isListeningRef.current = false;
    } else {
      startMicSession();
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>PocketAI</Text>
          <View style={styles.badgesGroup}>
            {/* Samsung Bixby Mode Assistant Badge */}
            <TouchableOpacity
              style={[styles.autoMicBadge, styles.wakeWordOn]}
              onPress={handleOpenAssistantSettings}
            >
              <Text style={[styles.autoMicText, styles.wakeWordText]}>
                ⚡ Bixby Mode
              </Text>
            </TouchableOpacity>

            {/* Jackie Screen-ON Hands-Free Hotword Toggle */}
            <TouchableOpacity
              style={[styles.autoMicBadge, wakeWordEnabled ? styles.autoMicOn : styles.autoMicOff]}
              onPress={toggleWakeWord}
            >
              <Text style={styles.autoMicText}>
                {wakeWordEnabled ? '🎙️ Jackie: Screen-ON' : '🔇 Jackie: OFF'}
              </Text>
            </TouchableOpacity>

            {/* Jackie Voice TTS Feedback Toggle */}
            <TouchableOpacity
              style={[styles.autoMicBadge, ttsEnabled ? styles.autoMicOn : styles.autoMicOff]}
              onPress={() => setTtsEnabled((prev) => !prev)}
            >
              <Text style={styles.autoMicText}>
                {ttsEnabled ? '🔊 Voice' : '🔇 Mute'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.onlineBadge,
                backendConnected === false && styles.offlineBadge,
                backendConnected === null && styles.pendingBadge,
              ]}
              onPress={handleBadgePress}
            >
              <View
                style={[
                  styles.onlineDot,
                  backendConnected === false && styles.offlineDot,
                  backendConnected === null && styles.pendingDot,
                ]}
              />
              <Text
                style={[
                  styles.onlineText,
                  backendConnected === false && styles.offlineText,
                  backendConnected === null && styles.pendingText,
                ]}
              >
                {backendConnected === false ? 'Offline' : backendConnected ? 'Needle 3' : 'Checking...'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.subtitle}>On-Device Personal Phone Automation Engine</Text>
      </View>

      {/* Live Active Listening Banner */}
      {isListening && (
        <View style={styles.listeningBanner}>
          <Animated.View style={[styles.pulseCircle, { transform: [{ scale: pulseAnim }] }]}>
            <Text style={styles.listeningIcon}>🎙️</Text>
          </Animated.View>
          <View style={styles.listeningTexts}>
            <Text style={styles.listeningTitle}>Listening...</Text>
            <Text style={styles.listeningSubtitle}>Speak your command now</Text>
          </View>
          <TouchableOpacity style={styles.stopButton} onPress={toggleVoiceRecording}>
            <Text style={styles.stopButtonText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Hands-Free Accessibility Service Banner */}
        {!accessibilityEnabled && (
          <View style={styles.accessibilityBanner}>
            <View style={styles.assistantBannerHeader}>
              <View style={[styles.assistantIconCircle, { backgroundColor: '#d2992226' }]}>
                <Text style={styles.assistantBannerIcon}>🦾</Text>
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={styles.assistantBannerTitle}>Hands-Free UI Automation</Text>
                <Text style={styles.assistantBannerSubtitle}>
                  Enable PocketAI Accessibility to auto-send WhatsApp chats, take screenshots, lock phone & pull notification shades hands-free.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.accessibilitySettingsButton}
              onPress={() => AndroidNative.openAccessibilitySettings()}
            >
              <Text style={styles.assistantSettingsButtonText}>⚙️ Enable Accessibility Service</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Samsung Bixby Mode / Digital Assistant Banner */}
        <View style={styles.assistantBanner}>
          <View style={styles.assistantBannerHeader}>
            <View style={styles.assistantIconCircle}>
              <Text style={styles.assistantBannerIcon}>⚡</Text>
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={styles.assistantBannerTitle}>Bixby-Style Phone Assistant</Text>
              <Text style={styles.assistantBannerSubtitle}>
                Zero background mic & 0% battery drain. Press Side Button or long-press Home to talk.
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.assistantSettingsButton}
            onPress={handleOpenAssistantSettings}
          >
            <Text style={styles.assistantSettingsButtonText}>⚙️ Set as Phone Assistant</Text>
          </TouchableOpacity>
        </View>

        {/* Result & Telemetry Card */}
        {latestResponse && (
          <View style={styles.responseCard}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusBadge,
                  latestResponse.status === 'executed'
                    ? styles.badgeSuccess
                    : latestResponse.status === 'needs_confirmation'
                    ? styles.badgeWarning
                    : styles.badgeNeutral,
                ]}
              >
                <Text style={styles.statusBadgeText}>
                  {latestResponse.status.replace('_', ' ').toUpperCase()}
                </Text>
              </View>
              <Text style={styles.confidenceText}>
                Confidence: {Math.round(latestResponse.confidence * 100)}%
              </Text>
            </View>

            {latestResponse.message && (
              <Text style={styles.agentMessage}>{latestResponse.message}</Text>
            )}

            {latestResponse.reasoning && (
              <Text style={styles.reasoningText}>
                Needle reasoning: "{latestResponse.reasoning}"
              </Text>
            )}

            {/* Confirmation Action Button for sensitive actions */}
            {latestResponse.status === 'needs_confirmation' && latestResponse.proposed_call && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => executeCall(latestResponse.proposed_call!)}
              >
                <Text style={styles.confirmButtonText}>
                  Tap to Confirm: {latestResponse.proposed_call.name.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            )}

            {/* Execution status message */}
            {executionMessage ? (
              <View style={styles.executionBox}>
                <Text style={styles.executionStatus}>{executionMessage}</Text>
              </View>
            ) : null}

            {/* Telemetry info */}
            {latestResponse.telemetry && (
              <View style={styles.telemetryRow}>
                {latestResponse.telemetry.decode_tps && (
                  <Text style={styles.telemetryItem}>
                    ⚡ {Math.round(latestResponse.telemetry.decode_tps)} tok/s
                  </Text>
                )}
                {latestResponse.telemetry.peak_ram_mb && (
                  <Text style={styles.telemetryItem}>
                    💾 {Math.round(latestResponse.telemetry.peak_ram_mb)} MB RAM
                  </Text>
                )}
              </View>
            )}
          </View>
        )}

        {/* Categorized Day-to-Day Operations Palette */}
        {ACTION_CATEGORIES.map((cat, catIdx) => (
          <View key={catIdx} style={styles.categorySection}>
            <Text style={styles.sectionHeader}>{cat.category}</Text>
            <View style={styles.chipGrid}>
              {cat.items.map((cmd, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.chip}
                  onPress={() => {
                    setInputText(cmd);
                    handleSendCommand(cmd);
                  }}
                >
                  <Text style={styles.chipText}>{cmd}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>

      {/* Input Dock */}
      <View style={styles.inputDock}>
        <TextInput
          style={styles.input}
          placeholder={isListening ? 'Listening to speech...' : "Speak or type: 'Call kalif', 'Torch on'..."}
          placeholderTextColor="#888"
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={() => handleSendCommand(inputText)}
        />

        <TouchableOpacity
          style={[styles.micButton, isListening && styles.micButtonActive]}
          onPress={toggleVoiceRecording}
        >
          <Text style={styles.micButtonText}>{isListening ? '⏹' : '🎤'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.sendButton}
          onPress={() => handleSendCommand(inputText)}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.sendButtonText}>➔</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '700', color: '#f0f6fc' },
  badgesGroup: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  autoMicBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  autoMicOn: {
    backgroundColor: '#388bfd22',
    borderColor: '#388bfd',
  },
  autoMicOff: {
    backgroundColor: '#21262d',
    borderColor: '#30363d',
  },
  autoMicText: { color: '#58a6ff', fontSize: 11, fontWeight: '600' },
  wakeWordOn: {
    backgroundColor: '#8957e522',
    borderColor: '#a371f7',
  },
  wakeWordText: {
    color: '#a371f7',
  },
  onlineBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#23863622',
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#238636',
  },
  onlineDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#3fb950', marginRight: 4 },
  onlineText: { color: '#3fb950', fontSize: 11, fontWeight: '600' },
  offlineBadge: {
    backgroundColor: '#da363322',
    borderColor: '#da3633',
  },
  offlineDot: { backgroundColor: '#f85149' },
  offlineText: { color: '#f85149' },
  pendingBadge: {
    backgroundColor: '#d2992222',
    borderColor: '#d29922',
  },
  pendingDot: { backgroundColor: '#d29922' },
  pendingText: { color: '#d29922' },
  subtitle: { fontSize: 12, color: '#8b949e', marginTop: 4 },

  // Live Listening Banner
  listeningBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1f242c',
    borderBottomWidth: 1,
    borderBottomColor: '#388bfd',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  pulseCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#da3633',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listeningIcon: { fontSize: 18 },
  listeningTexts: { flex: 1 },
  listeningTitle: { color: '#f0f6fc', fontSize: 14, fontWeight: '700' },
  listeningSubtitle: { color: '#8b949e', fontSize: 11 },
  stopButton: {
    backgroundColor: '#30363d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
  stopButtonText: { color: '#f0f6fc', fontSize: 12, fontWeight: '600' },

  // Accessibility Banner
  accessibilityBanner: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#d2992266',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  accessibilitySettingsButton: {
    backgroundColor: '#d29922',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },

  // Assistant Banner
  assistantBanner: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  assistantBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  assistantIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#388bfd26',
    justifyContent: 'center',
    alignItems: 'center',
  },
  assistantBannerIcon: {
    fontSize: 18,
  },
  assistantBannerTitle: {
    color: '#f0f6fc',
    fontSize: 14,
    fontWeight: '700',
  },
  assistantBannerSubtitle: {
    color: '#8b949e',
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  assistantSettingsButton: {
    backgroundColor: '#238636',
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: 'center',
  },
  assistantSettingsButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },

  content: { flex: 1 },
  contentContainer: { padding: 16 },
  categorySection: { marginBottom: 18 },
  sectionHeader: { fontSize: 13, fontWeight: '700', color: '#8b949e', marginBottom: 8, textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: { color: '#c9d1d9', fontSize: 13 },
  responseCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#388bfd',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  statusBadgeText: { fontSize: 11, fontWeight: 'bold', color: '#fff' },
  badgeSuccess: { backgroundColor: '#238636' },
  badgeWarning: { backgroundColor: '#d29922' },
  badgeNeutral: { backgroundColor: '#484f58' },
  confidenceText: { color: '#8b949e', fontSize: 12 },
  agentMessage: { color: '#f0f6fc', fontSize: 16, fontWeight: '600', marginVertical: 8 },
  reasoningText: { color: '#8b949e', fontSize: 13, fontStyle: 'italic', marginBottom: 8 },
  confirmButton: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  confirmButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  executionBox: {
    backgroundColor: '#2386361a',
    borderRadius: 6,
    padding: 8,
    marginTop: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3fb950',
  },
  executionStatus: { color: '#3fb950', fontSize: 13, fontWeight: '600' },
  telemetryRow: { flexDirection: 'row', gap: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#21262d', paddingTop: 8 },
  telemetryItem: { color: '#58a6ff', fontSize: 12 },
  inputDock: {
    flexDirection: 'row',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
    backgroundColor: '#161b22',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    backgroundColor: '#0d1117',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#f0f6fc',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  micButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#21262d',
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonActive: { backgroundColor: '#da3633' },
  micButtonText: { fontSize: 18 },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#238636',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});
