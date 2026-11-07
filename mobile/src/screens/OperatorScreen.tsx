import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { apiClient } from '../api/client';
import { AndroidNative } from '../native/AndroidOperator';
import { AgentResponse, FunctionCall } from '../types';

const SAMPLE_COMMANDS = [
  'Turn on battery saver.',
  'Open YouTube.',
  'Set brightness to 40%.',
  'Turn on Do Not Disturb.',
  'Open my college timetable.',
  'Start a 25-minute timer.',
];

export const OperatorScreen: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [latestResponse, setLatestResponse] = useState<AgentResponse | null>(null);
  const [executionMessage, setExecutionMessage] = useState<string>('');

  useEffect(() => {
    // Listen to speech recognition events
    const unsubResult = AndroidNative.speech.onResult((text) => {
      setInputText(text);
      setIsListening(false);
      handleSendCommand(text);
    });

    const unsubPartial = AndroidNative.speech.onPartial((text) => {
      setInputText(text);
    });

    const unsubError = AndroidNative.speech.onError((err) => {
      setIsListening(false);
      console.warn('Speech error:', err);
    });

    return () => {
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
        // High confidence: Automatically execute via Android Native Bridge
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
        setExecutionMessage(`✓ Success: ${msg}`);
      } else {
        setExecutionMessage(`Action '${call.name}' triggered.`);
      }
    } catch (e: any) {
      setExecutionMessage(`✗ Execution failed: ${e.message}`);
    }
  };

  const toggleVoiceRecording = async () => {
    if (isListening) {
      await AndroidNative.speech.stop();
      setIsListening(false);
    } else {
      try {
        await AndroidNative.speech.start();
        setIsListening(true);
      } catch (err: any) {
        Alert.alert('Microphone Error', err.message);
      }
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>PocketAI Operator</Text>
        <Text style={styles.subtitle}>On-Device Needle 3 Intelligence</Text>
      </View>

      <ScrollView style={styles.content} contentContainerStyle={styles.contentContainer}>
        {/* Sample Command Suggestions */}
        <Text style={styles.sectionHeader}>Quick Actions</Text>
        <View style={styles.chipGrid}>
          {SAMPLE_COMMANDS.map((cmd, idx) => (
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

            {/* Confirmation Action Button if confidence was below 70% */}
            {latestResponse.status === 'needs_confirmation' && latestResponse.proposed_call && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={() => executeCall(latestResponse.proposed_call!)}
              >
                <Text style={styles.confirmButtonText}>
                  Confirm & Execute: {latestResponse.proposed_call.name.replace('_', ' ')}
                </Text>
              </TouchableOpacity>
            )}

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

            {executionMessage ? (
              <Text style={styles.executionStatus}>{executionMessage}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Input Dock */}
      <View style={styles.inputDock}>
        <TextInput
          style={styles.input}
          placeholder="Speak or type a command..."
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
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  title: { fontSize: 22, fontWeight: '700', color: '#f0f6fc' },
  subtitle: { fontSize: 13, color: '#8b949e', marginTop: 4 },
  content: { flex: 1 },
  contentContainer: { padding: 16 },
  sectionHeader: { fontSize: 14, fontWeight: '600', color: '#8b949e', marginBottom: 10, textTransform: 'uppercase' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 20 },
  chip: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { color: '#c9d1d9', fontSize: 13 },
  responseCard: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 12,
    padding: 16,
    marginTop: 10,
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
  telemetryRow: { flexDirection: 'row', gap: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: '#21262d', paddingTop: 8 },
  telemetryItem: { color: '#58a6ff', fontSize: 12 },
  executionStatus: { color: '#3fb950', fontSize: 13, fontWeight: '600', marginTop: 10 },
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
