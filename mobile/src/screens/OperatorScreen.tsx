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

export const OperatorScreen: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [autoMicEnabled, setAutoMicEnabled] = useState(true);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string>('');

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const autoMicRef = useRef(autoMicEnabled);
  autoMicRef.current = autoMicEnabled;
  const wakeWordRef = useRef(wakeWordEnabled);
  wakeWordRef.current = wakeWordEnabled;
  const isListeningRef = useRef(false);
  const isStartingRef = useRef(false);
  const coldBootDoneRef = useRef(false);

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
      } else {
        await AndroidNative.wakeWord.stop();
      }
    } catch (err: any) {
      console.warn('[PocketAI] Toggle wake word error:', err);
    }
  };

  useEffect(() => {
    // 1. Initial Launch: Verify runtime permissions, arm wake-word service, and trigger auto-listen
    const initApp = async () => {
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

          // Start the WakeWordService for 'Hey Jackie' in background
          if (wakeWordRef.current) {
            AndroidNative.wakeWord.start().catch((e) => {
              console.warn('[PocketAI] WakeWordService start warning:', e);
            });
            // Mark app currently in foreground so background recognizer doesn't collide
            AndroidNative.wakeWord.setForegroundState(true).catch(() => {});
          }

          // Check if app was opened via wake word ("Hey Jackie <command>")
          const initialWake = await AndroidNative.wakeWord.getInitialCommand();
          if (initialWake.wakeWordTriggered) {
            console.log('[PocketAI] Launched via wake word intent:', initialWake);
            coldBootDoneRef.current = true;
            if (initialWake.commandText && initialWake.commandText.trim()) {
              handleSendCommand(initialWake.commandText.trim());
              return;
            }
          }

          // If auto-mic enabled, start listening
          if (autoMicRef.current) {
            setTimeout(() => {
              coldBootDoneRef.current = true;
              startMicSession();
            }, 450);
          } else {
            coldBootDoneRef.current = true;
          }
        } catch (e) {
          console.warn('[PocketAI] Permission / init error:', e);
          coldBootDoneRef.current = true;
        }
      }
    };
    initApp();

    // 2. Resume / Return from Home Screen: Auto-start mic & manage wake word background state
    let previousState = AppState.currentState;
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      console.log(`[PocketAI] AppState transitioned from ${previousState} -> ${nextAppState}`);
      if (
        coldBootDoneRef.current &&
        (previousState === 'background' || previousState === 'inactive') &&
        nextAppState === 'active'
      ) {
        // App is now foreground: pause background wake word listener so foreground operator can listen
        AndroidNative.wakeWord.setForegroundState(true).catch(() => {});
        if (autoMicRef.current) {
          setTimeout(() => {
            console.log('[PocketAI] Auto-starting mic on app resume from home screen...');
            startMicSession();
          }, 500);
        }
      } else if (nextAppState === 'background') {
        // App backgrounded: release foreground speech recognizer cleanly
        AndroidNative.speech.stop().catch(() => {});
        setIsListening(false);
        isListeningRef.current = false;
        // Resume background 'Hey Jackie' detection!
        if (wakeWordRef.current) {
          AndroidNative.wakeWord.setForegroundState(false).catch(() => {});
        }
      }
      previousState = nextAppState;
    };
    const appStateSub = AppState.addEventListener('change', handleAppStateChange);

    // 3. Wake Word Detected Event Listener (emitted when "Hey Jackie" is spoken)
    const unsubWakeWord = AndroidNative.wakeWord.onDetected((evt) => {
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
    }
  };

  const executeCall = async (call: FunctionCall) => {
    try {
      const resolved = call.arguments._resolved_android;
      if (resolved) {
        const msg = await AndroidNative.executeResolvedAction(resolved);
        setExecutionMessage(`✓ ${msg}`);
      } else {
        setExecutionMessage(`Action '${call.name}' triggered.`);
      }
    } catch (e: any) {
      setExecutionMessage(`✗ Execution failed: ${e.message}`);
      Alert.alert('Action Error', e.message || 'Failed to execute action on device.');
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
          <Text style={styles.title}>PocketAI Operator</Text>
          <View style={styles.badgesGroup}>
            {/* 'Hey Jackie' Background Wake Word Toggle Badge */}
            <TouchableOpacity
              style={[styles.autoMicBadge, wakeWordEnabled ? styles.wakeWordOn : styles.autoMicOff]}
              onPress={toggleWakeWord}
            >
              <Text style={[styles.autoMicText, wakeWordEnabled && styles.wakeWordText]}>
                {wakeWordEnabled ? "⚡ 'Hey Jackie': ON" : "🔇 'Hey Jackie': OFF"}
              </Text>
            </TouchableOpacity>

            {/* Auto-Mic on Open Toggle Badge */}
            <TouchableOpacity
              style={[styles.autoMicBadge, autoMicEnabled ? styles.autoMicOn : styles.autoMicOff]}
              onPress={() => setAutoMicEnabled((prev) => !prev)}
            >
              <Text style={styles.autoMicText}>
                {autoMicEnabled ? '🎙️ Mic: ON' : '🔇 Mic: OFF'}
              </Text>
            </TouchableOpacity>

            <View style={styles.onlineBadge}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>Needle 3</Text>
            </View>
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
