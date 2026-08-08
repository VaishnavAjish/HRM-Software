import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Bell } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { Avatar } from './Avatar';
import { NotificationPanel } from './NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';

export function Header({ onNavigateProfile }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const notifications = useNotifications();

  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const { unread } = notifications;

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.leftSection}>
        <View style={styles.titleWrapper}>
          <Text style={[styles.greetingText, { color: theme.textMuted }]}>Welcome back,</Text>
          <Text style={[styles.userNameText, { color: theme.textPrimary }]} numberOfLines={1}>
            {firstName}
          </Text>
        </View>
      </View>

      <View style={styles.rightSection}>
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={() => setPanelOpen(true)}
          activeOpacity={0.7}
        >
          <Bell size={18} color={theme.textSecondary} />
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.rose, borderColor: theme.surface }]}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity onPress={onNavigateProfile} activeOpacity={0.8}>
          <Avatar name={user?.name} uri={user?.photo} size={42} />
        </TouchableOpacity>
      </View>

      <NotificationPanel visible={panelOpen} onClose={() => setPanelOpen(false)} {...notifications} />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingTop: 46,
    paddingBottom: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
  },
  leftSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  titleWrapper: {
    flexShrink: 1,
  },
  greetingText: {
    ...typography.caption,
  },
  userNameText: {
    ...typography.h4,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
});
