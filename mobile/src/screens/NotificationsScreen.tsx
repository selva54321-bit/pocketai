import React, { useState, useEffect, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AndroidNative } from '../native/AndroidOperator';
import { apiClient } from '../api/client';
import {
  NotificationPayload,
  PrioritizedNotification,
  PriorityTier,
} from '../types';
import { prioritizeNotifications, scoreNotification } from '../utils/notificationScorer';

type FilterTab = 'all' | 'important' | 'transactions' | 'noise';

export const NotificationsScreen: React.FC = () => {
  const [rawNotifs, setRawNotifs] = useState<NotificationPayload[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [listenerEnabled, setListenerEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<FilterTab>('all');

  // Load active notifications on mount
  useEffect(() => {
    checkPermissionAndSync();

    // Listen to real-time incoming notifications
    const unsub = AndroidNative.notifications.onReceived((incoming: NotificationPayload) => {
      setRawNotifs((prev) => {
        // Replace existing item if matching ID/pkg, else prepend
        const filtered = prev.filter((n) => n.id !== incoming.id);
        return [incoming, ...filtered];
      });

      // Background Needle entity analysis
      apiClient.analyzeNotification(incoming).catch(() => {});
    });

    return () => unsub();
  }, []);

  const checkPermissionAndSync = async () => {
    try {
      const isEnabled = await AndroidNative.notifications.isEnabled();
      setListenerEnabled(isEnabled);
      if (isEnabled) {
        await syncActiveNotifications();
      }
    } catch (e) {
      console.warn('Failed to check notification permission:', e);
    }
  };

  const syncActiveNotifications = async () => {
    setSyncing(true);
    try {
      const active = await AndroidNative.notifications.getActive();
      setRawNotifs(active);
    } catch (err: any) {
      Alert.alert('Sync Error', err.message || 'Failed to read active notifications.');
    } finally {
      setSyncing(false);
    }
  };

  const handleOpenSettings = async () => {
    try {
      await AndroidNative.notifications.openSettings();
    } catch (e: any) {
      Alert.alert('Settings Error', e.message);
    }
  };

  // Mathematically prioritized notifications
  const prioritizedList = useMemo(() => {
    return prioritizeNotifications(rawNotifs);
  }, [rawNotifs]);

  // Tab Filtering
  const filteredList = useMemo(() => {
    switch (activeTab) {
      case 'important':
        return prioritizedList.filter((n) => n.score >= 50);
      case 'transactions':
        return prioritizedList.filter(
          (n) =>
            n.breakdown.reasons.some((r) => r.includes('Transaction')) ||
            n.breakdown.categoryScore === 35
        );
      case 'noise':
        return prioritizedList.filter((n) => n.score < 25);
      case 'all':
      default:
        return prioritizedList;
    }
  }, [prioritizedList, activeTab]);

  // Statistics
  const stats = useMemo(() => {
    const total = prioritizedList.length;
    const critical = prioritizedList.filter((n) => n.tier === 'CRITICAL').length;
    const high = prioritizedList.filter((n) => n.tier === 'HIGH').length;
    const important = critical + high;
    const noise = prioritizedList.filter((n) => n.tier === 'LOW').length;
    return { total, important, noise };
  }, [prioritizedList]);

  // Simulation Helper for testing mathematical prioritization
  const simulateNotification = (type: 'bank' | 'otp' | 'promo' | 'chat') => {
    let payload: NotificationPayload;
    const now = Date.now();

    if (type === 'bank') {
      payload = {
        id: `sim_bank_${now}`,
        package_name: 'com.hdfc.bank',
        title: 'HDFC Bank Alert',
        text: 'Your A/C XX4910 has been debited by Rs. 2,450 at Amazon on Nov 21. UPI Ref: 39481029.',
        timestamp: now,
      };
    } else if (type === 'otp') {
      payload = {
        id: `sim_otp_${now}`,
        package_name: 'com.google.android.apps.authenticator2',
        title: 'Security Alert: Google Verification',
        text: 'Your verification OTP code is 849201. Urgent: Do not share with anyone.',
        timestamp: now,
      };
    } else if (type === 'chat') {
      payload = {
        id: `sim_chat_${now}`,
        package_name: 'com.whatsapp',
        title: 'Rahul (WhatsApp)',
        text: 'Hey are we meeting at Central Mall today? Call me when you get this.',
        timestamp: now - 1000 * 60 * 5, // 5 mins ago
      };
    } else {
      payload = {
        id: `sim_promo_${now}`,
        package_name: 'com.myntra.android',
        title: '🔥 Mega Midnight Flash Sale!',
        text: 'Flat 60% discount + extra Rs. 500 off on shoes & fashion. Hurry, offer ends tonight!',
        timestamp: now - 1000 * 60 * 90, // 1.5 hrs ago
      };
    }

    setRawNotifs((prev) => [payload, ...prev]);
  };

  const getTierBadgeStyle = (tier: PriorityTier) => {
    switch (tier) {
      case 'CRITICAL':
        return styles.badgeCritical;
      case 'HIGH':
        return styles.badgeHigh;
      case 'MEDIUM':
        return styles.badgeMedium;
      case 'LOW':
      default:
        return styles.badgeLow;
    }
  };

  const getTierStripeStyle = (tier: PriorityTier) => {
    switch (tier) {
      case 'CRITICAL':
        return styles.stripeCritical;
      case 'HIGH':
        return styles.stripeHigh;
      case 'MEDIUM':
        return styles.stripeMedium;
      case 'LOW':
      default:
        return styles.stripeLow;
    }
  };

  const renderItem = ({ item }: { item: PrioritizedNotification }) => {
    const elapsedMinutes = Math.max(0, Math.round((Date.now() - item.postTime) / 60000));
    const timeDisplay =
      elapsedMinutes === 0
        ? 'Just now'
        : elapsedMinutes < 60
        ? `${elapsedMinutes}m ago`
        : `${Math.round(elapsedMinutes / 60)}h ago`;

    return (
      <View style={[styles.card, getTierStripeStyle(item.tier)]}>
        {/* Card Header */}
        <View style={styles.cardHeader}>
          <View style={styles.headerLeft}>
            <View style={[styles.priorityBadge, getTierBadgeStyle(item.tier)]}>
              <Text style={styles.priorityScore}>{item.score}</Text>
              <Text style={styles.priorityTier}>{item.tier}</Text>
            </View>
            <Text style={styles.packageName} numberOfLines={1}>
              {item.packageName.replace('com.', '')}
            </Text>
          </View>
          <Text style={styles.timeText}>{timeDisplay}</Text>
        </View>

        {/* Notification Content */}
        <Text style={styles.notifTitle}>{item.title}</Text>
        <Text style={styles.notifBody}>{item.text}</Text>
        {Boolean(item.subText) && (
          <Text style={styles.notifSubText}>{item.subText}</Text>
        )}

        {/* Mathematical Reasons Breakdown */}
        <View style={styles.reasonsContainer}>
          <Text style={styles.reasonsLabel}>Prioritization Factors:</Text>
          <View style={styles.reasonsChips}>
            {item.breakdown.reasons.map((r, i) => (
              <View key={i} style={styles.reasonChip}>
                <Text style={styles.reasonChipText}>{r}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Card Actions */}
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.actionBtn}
            onPress={() => AndroidNative.openApp(item.packageName).catch(() => {})}
          >
            <Text style={styles.actionBtnText}>Open App ➔</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Notification Prioritizer</Text>
          <TouchableOpacity
            style={styles.syncBtn}
            onPress={syncActiveNotifications}
            disabled={syncing}
          >
            {syncing ? (
              <ActivityIndicator size="small" color="#58a6ff" />
            ) : (
              <Text style={styles.syncBtnText}>🔄 Sync</Text>
            )}
          </TouchableOpacity>
        </View>
        <Text style={styles.subtitle}>
          Active status bar ranking via recency decay & category math
        </Text>
      </View>

      {/* Permission Warning Banner if Listener Disabled */}
      {!listenerEnabled && (
        <TouchableOpacity style={styles.permBanner} onPress={handleOpenSettings}>
          <Text style={styles.permBannerTitle}>⚠️ Notification Access Required</Text>
          <Text style={styles.permBannerSubtitle}>
            Tap to enable PocketAI in Android Settings to read active notifications.
          </Text>
        </TouchableOpacity>
      )}

      {/* Stats Summary Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statBox}>
          <Text style={styles.statNumber}>{stats.total}</Text>
          <Text style={styles.statLabel}>Active</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#388bfd' }]}>{stats.important}</Text>
          <Text style={styles.statLabel}>Important (≥50)</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statBox}>
          <Text style={[styles.statNumber, { color: '#8b949e' }]}>{stats.noise}</Text>
          <Text style={styles.statLabel}>Noise Filtered</Text>
        </View>
      </View>

      {/* Filter Tabs */}
      <View style={styles.tabsRow}>
        {(['all', 'important', 'transactions', 'noise'] as FilterTab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabButton, activeTab === tab && styles.tabButtonActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabButtonText, activeTab === tab && styles.tabButtonTextActive]}>
              {tab === 'all'
                ? `All (${stats.total})`
                : tab === 'important'
                ? `Important (${stats.important})`
                : tab === 'transactions'
                ? 'Transactions'
                : `Noise (${stats.noise})`}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Quick Simulation Bar */}
      <View style={styles.simBar}>
        <Text style={styles.simLabel}>Test Math:</Text>
        <TouchableOpacity style={styles.simBtn} onPress={() => simulateNotification('otp')}>
          <Text style={styles.simBtnText}>🔑 Security OTP</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simBtn} onPress={() => simulateNotification('bank')}>
          <Text style={styles.simBtnText}>💳 Bank SMS</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simBtn} onPress={() => simulateNotification('chat')}>
          <Text style={styles.simBtnText}>💬 WhatsApp</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.simBtn} onPress={() => simulateNotification('promo')}>
          <Text style={styles.simBtnText}>🏷️ Promo Sale</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications List */}
      <FlatList
        data={filteredList}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>📭</Text>
            <Text style={styles.emptyTitle}>No Notifications in this filter</Text>
            <Text style={styles.emptySubtitle}>
              Tap "🔄 Sync" above to read live status bar notifications or use "Test Math" buttons.
            </Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0d1117' },
  header: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#21262d' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: '#f0f6fc' },
  subtitle: { fontSize: 12, color: '#8b949e', marginTop: 4 },
  syncBtn: {
    backgroundColor: '#21262d',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  syncBtnText: { color: '#58a6ff', fontSize: 12, fontWeight: '600' },

  permBanner: {
    backgroundColor: '#da363322',
    borderColor: '#da3633',
    borderWidth: 1,
    margin: 12,
    padding: 10,
    borderRadius: 8,
  },
  permBannerTitle: { color: '#f85149', fontWeight: '700', fontSize: 13 },
  permBannerSubtitle: { color: '#c9d1d9', fontSize: 11, marginTop: 2 },

  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#161b22',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  statBox: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: 18, fontWeight: '700', color: '#f0f6fc' },
  statLabel: { fontSize: 10, color: '#8b949e', textTransform: 'uppercase', marginTop: 2 },
  statDivider: { width: 1, height: '70%', backgroundColor: '#30363d', alignSelf: 'center' },

  tabsRow: {
    flexDirection: 'row',
    backgroundColor: '#0d1117',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
  },
  tabButton: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: '#161b22',
    borderWidth: 1,
    borderColor: '#30363d',
  },
  tabButtonActive: {
    backgroundColor: '#388bfd22',
    borderColor: '#388bfd',
  },
  tabButtonText: { color: '#8b949e', fontSize: 11, fontWeight: '500' },
  tabButtonTextActive: { color: '#58a6ff', fontWeight: '700' },

  simBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#161b22',
    borderBottomWidth: 1,
    borderBottomColor: '#21262d',
    flexWrap: 'wrap',
    gap: 6,
  },
  simLabel: { color: '#8b949e', fontSize: 11, fontWeight: '700' },
  simBtn: {
    backgroundColor: '#21262d',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  simBtnText: { color: '#c9d1d9', fontSize: 11 },

  list: { padding: 12 },
  card: {
    backgroundColor: '#161b22',
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  stripeCritical: { borderLeftWidth: 4, borderLeftColor: '#da3633' },
  stripeHigh: { borderLeftWidth: 4, borderLeftColor: '#388bfd' },
  stripeMedium: { borderLeftWidth: 4, borderLeftColor: '#d29922' },
  stripeLow: { borderLeftWidth: 4, borderLeftColor: '#484f58' },

  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  priorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeCritical: { backgroundColor: '#da3633' },
  badgeHigh: { backgroundColor: '#1f6feb' },
  badgeMedium: { backgroundColor: '#9e6a03' },
  badgeLow: { backgroundColor: '#30363d' },
  priorityScore: { color: '#fff', fontSize: 12, fontWeight: '800' },
  priorityTier: { color: '#fff', fontSize: 9, fontWeight: '700' },

  packageName: { color: '#8b949e', fontSize: 11, fontWeight: '500', flex: 1 },
  timeText: { color: '#6e7681', fontSize: 11 },

  notifTitle: { color: '#f0f6fc', fontSize: 14, fontWeight: '600', marginTop: 8 },
  notifBody: { color: '#c9d1d9', fontSize: 13, marginTop: 4, lineHeight: 18 },
  notifSubText: { color: '#8b949e', fontSize: 11, marginTop: 2 },

  reasonsContainer: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  reasonsLabel: { color: '#8b949e', fontSize: 10, textTransform: 'uppercase', fontWeight: '700' },
  reasonsChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  reasonChip: {
    backgroundColor: '#0d1117',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#30363d',
  },
  reasonChipText: { color: '#58a6ff', fontSize: 10 },

  cardActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
    paddingTop: 6,
  },
  actionBtn: { paddingVertical: 2 },
  actionBtnText: { color: '#58a6ff', fontSize: 11, fontWeight: '600' },

  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: '#f0f6fc', fontSize: 15, fontWeight: '700' },
  emptySubtitle: { color: '#8b949e', fontSize: 12, textAlign: 'center', marginTop: 4 },
});
