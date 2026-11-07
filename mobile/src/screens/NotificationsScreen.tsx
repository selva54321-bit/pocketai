import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  NativeEventEmitter,
  NativeModules,
  Alert,
} from 'react-native';
import { apiClient } from '../api/client';
import { NotificationAnalysis, NotificationPayload } from '../types';

export const NotificationsScreen: React.FC = () => {
  const [items, setItems] = useState<NotificationAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    // Listen for live Android system notifications from NotificationListener
    const emitter = new NativeEventEmitter(NativeModules.AndroidOperator || {});
    const sub = emitter.addListener('onNotificationReceived', async (raw: any) => {
      const payload: NotificationPayload = {
        package_name: raw.packageName,
        title: raw.title,
        text: raw.text,
        timestamp: raw.postTime,
        id: raw.id,
      };
      await processIncomingNotification(payload);
    });

    return () => sub.remove();
  }, []);

  const processIncomingNotification = async (payload: NotificationPayload) => {
    try {
      setAnalyzing(true);
      const analyzed = await apiClient.analyzeNotification(payload);
      setItems((prev) => [analyzed, ...prev]);
    } catch (err: any) {
      console.warn('Failed to analyze notification:', err);
    } finally {
      setAnalyzing(false);
    }
  };

  // Quick simulation helper for testing
  const simulateNotification = async (type: 'bank' | 'promo' | 'otp') => {
    let payload: NotificationPayload;
    if (type === 'bank') {
      payload = {
        package_name: 'com.hdfc.bank',
        title: 'HDFC Bank Alert',
        text: 'Your account has been debited by Rs. 1,250 at Amazon on November 8.',
        timestamp: Date.now(),
      };
    } else if (type === 'promo') {
      payload = {
        package_name: 'com.myntra.android',
        title: 'Mega Fashion Sale',
        text: 'Flat 50% discount on shoes! Hurry, offer ends tonight!',
        timestamp: Date.now(),
      };
    } else {
      payload = {
        package_name: 'com.google.android.apps.authenticator2',
        title: 'Security Alert',
        text: 'Your Google verification code is 492810. Do not share it.',
        timestamp: Date.now(),
      };
    }
    await processIncomingNotification(payload);
  };

  const renderItem = ({ item }: { item: NotificationAnalysis }) => {
    const isTx = item.is_transaction;
    const tx = item.data;

    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View
            style={[
              styles.tag,
              item.category === 'transaction'
                ? styles.tagTx
                : item.category === 'security_alert'
                ? styles.tagSecurity
                : styles.tagPromo,
            ]}
          >
            <Text style={styles.tagText}>{item.category.toUpperCase()}</Text>
          </View>
          <Text style={styles.appTitle}>{item.raw.package_name}</Text>
        </View>

        {/* Financial extraction details */}
        {isTx && tx && (
          <View style={styles.txBox}>
            <View style={styles.txRow}>
              <Text style={styles.txAmount}>
                {tx.currency || 'INR'} {tx.amount}
              </Text>
              <Text style={styles.txType}>{tx.type?.toUpperCase()}</Text>
            </View>
            {tx.merchant && (
              <Text style={styles.txDetail}>Merchant: {tx.merchant}</Text>
            )}
            {tx.date && <Text style={styles.txDetail}>Date: {tx.date}</Text>}
          </View>
        )}

        <Text style={styles.notifTitle}>{item.raw.title}</Text>
        <Text style={styles.notifBody}>{item.raw.text}</Text>

        {item.summary && (
          <Text style={styles.summaryText}>Needle: {item.summary}</Text>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Notification Intelligence</Text>
        <Text style={styles.subtitle}>
          Real-time transaction extraction & smart categorization
        </Text>
      </View>

      {/* Simulator buttons */}
      <View style={styles.simBar}>
        <Text style={styles.simLabel}>Simulate:</Text>
        <TouchableOpacity
          style={styles.simBtn}
          onPress={() => simulateNotification('bank')}
        >
          <Text style={styles.simBtnText}>💳 Bank SMS</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.simBtn}
          onPress={() => simulateNotification('promo')}
        >
          <Text style={styles.simBtnText}>🏷️ Promo</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.simBtn}
          onPress={() => simulateNotification('otp')}
        >
          <Text style={styles.simBtnText}>🔑 OTP</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={items}
        keyExtractor={(_, index) => index.toString()}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No notifications analyzed yet.</Text>
            <Text style={styles.emptySubtext}>
              Tap "Simulate Bank SMS" above or grant Notification Listener permission on device.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { padding: 18, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  title: { fontSize: 22, fontWeight: '700', color: '#f0f6fc' },
  subtitle: { fontSize: 13, color: '#8b949e', marginTop: 4 },
  simBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 8,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  simLabel: { color: '#8b949e', fontSize: 12, fontWeight: 'bold' },
  simBtn: {
    backgroundColor: '#21262d',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  simBtnText: { color: '#c9d1d9', fontSize: 12 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  tagTx: { backgroundColor: '#238636' },
  tagSecurity: { backgroundColor: '#da3633' },
  tagPromo: { backgroundColor: '#388bfd33', borderWidth: 1, borderColor: '#388bfd' },
  tagText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  appTitle: { color: '#8b949e', fontSize: 11 },
  txBox: {
    backgroundColor: '#0d1117',
    borderRadius: 8,
    padding: 10,
    marginVertical: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#3fb950',
  },
  txRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  txAmount: { fontSize: 18, fontWeight: 'bold', color: '#3fb950' },
  txType: { fontSize: 12, color: '#8b949e', fontWeight: 'bold' },
  txDetail: { color: '#c9d1d9', fontSize: 12, marginTop: 4 },
  notifTitle: { color: '#f0f6fc', fontWeight: '600', fontSize: 14, marginTop: 4 },
  notifBody: { color: '#8b949e', fontSize: 13, marginTop: 2 },
  summaryText: { color: '#58a6ff', fontSize: 12, fontStyle: 'italic', marginTop: 8 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#f0f6fc', fontSize: 16, fontWeight: 'bold' },
  emptySubtext: { color: '#8b949e', fontSize: 13, textAlign: 'center', marginTop: 8 },
});
