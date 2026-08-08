import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Home, Ticket, FileText, User } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';

// Only rendered for the employee role — agents get a single self-contained
// screen with no tab bar (see App.js).
export function FloatingTabBar({ activeTab, onSelectTab }) {
  const { theme } = useTheme();

  const currentTabs = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'payslips', label: 'Payslips', icon: FileText },
    { id: 'tickets', label: 'Tickets', icon: Ticket },
    { id: 'profile', label: 'Profile', icon: User },
  ];

  return (
    <View style={styles.floatingContainer}>
      <View style={[styles.tabBarCard, { backgroundColor: theme.tabBarBg, borderColor: theme.border }]}>
        {currentTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <TouchableOpacity
              key={tab.id}
              style={[styles.tabItem, isActive && { backgroundColor: theme.primary + '18' }]}
              onPress={() => onSelectTab(tab.id)}
              activeOpacity={0.7}
            >
              <Icon size={20} color={isActive ? theme.primary : theme.textMuted} strokeWidth={isActive ? 2.5 : 1.8} />
              <Text
                style={[styles.tabLabel, { color: isActive ? theme.primary : theme.textMuted }, isActive && styles.activeTabLabel]}
              >
                {tab.label}
              </Text>
              {isActive && <View style={[styles.activePill, { backgroundColor: theme.primary }]} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  tabBarCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 30,
    borderWidth: 1,
    width: '100%',
    ...shadows.glass,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 20,
    position: 'relative',
  },
  tabLabel: {
    ...typography.micro,
    marginTop: 3,
  },
  activeTabLabel: {
    fontWeight: '700',
  },
  activePill: {
    position: 'absolute',
    top: -8,
    width: 16,
    height: 3,
    borderRadius: 2,
  },
});
