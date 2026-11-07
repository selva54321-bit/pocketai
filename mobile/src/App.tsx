import React, { useState } from 'react';
import { SafeAreaView, StyleSheet, View, Text, TouchableOpacity, StatusBar } from 'react-native';
import { OperatorScreen } from './screens/OperatorScreen';
import { NotificationsScreen } from './screens/NotificationsScreen';

export default function App() {
  const [activeTab, setActiveTab] = useState<'operator' | 'notifications'>('operator');

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor="#0d1117" />
      <View style={styles.container}>
        {activeTab === 'operator' ? <OperatorScreen /> : <NotificationsScreen />}

        {/* Tab Navigation */}
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'operator' && styles.tabItemActive]}
            onPress={() => setActiveTab('operator')}
          >
            <Text style={styles.tabIcon}>⚡</Text>
            <Text style={[styles.tabLabel, activeTab === 'operator' && styles.tabLabelActive]}>
              Operator
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabItem, activeTab === 'notifications' && styles.tabItemActive]}
            onPress={() => setActiveTab('notifications')}
          >
            <Text style={styles.tabIcon}>🔔</Text>
            <Text style={[styles.tabLabel, activeTab === 'notifications' && styles.tabLabelActive]}>
              Notifications
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#0d1117' },
  container: { flex: 1 },
  tabBar: {
    flexDirection: 'row',
    height: 58,
    backgroundColor: '#161b22',
    borderTopWidth: 1,
    borderTopColor: '#21262d',
  },
  tabItem: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemActive: {
    borderTopWidth: 2,
    borderTopColor: '#58a6ff',
  },
  tabIcon: {
    fontSize: 18,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 11,
    color: '#8b949e',
    fontWeight: '500',
  },
  tabLabelActive: {
    color: '#58a6ff',
    fontWeight: '700',
  },
});
