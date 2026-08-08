import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Sun, Moon, Shield, User, LogOut } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography } from '../../theme';
import { Avatar } from './Avatar';

export function Header({ onNavigateProfile }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, role, logout } = useAuth();

  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const isAgent = role === 'agent';

  const confirmLogout = () => {
    Alert.alert('Log out', 'You will need to sign in again to continue.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log out', style: 'destructive', onPress: logout },
    ]);
  };

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      <View style={styles.leftSection}>
        <TouchableOpacity onPress={onNavigateProfile} activeOpacity={0.8}>
          <Avatar name={user?.name} uri={user?.photo} size={42} ringColor={theme.primary} />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={[styles.greetingText, { color: theme.textMuted }]}>Welcome back,</Text>
          <Text style={[styles.userNameText, { color: theme.textPrimary }]} numberOfLines={1}>
            {firstName}
          </Text>
        </View>
      </View>

      <View style={styles.rightSection}>
        <View
          style={[
            styles.roleBadge,
            { backgroundColor: isAgent ? theme.violetBg : theme.cyanBg, borderColor: isAgent ? theme.violet : theme.cyan },
          ]}
        >
          {isAgent ? <Shield size={12} color={theme.violet} /> : <User size={12} color={theme.cyan} />}
          <Text style={[styles.roleText, { color: isAgent ? theme.violet : theme.cyan }]}>
            {isAgent ? 'Agent' : 'Employee'}
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          {isDark ? <Sun size={18} color="#F59E0B" /> : <Moon size={18} color="#6366F1" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={confirmLogout}
          activeOpacity={0.7}
        >
          <LogOut size={18} color={theme.rose} />
        </TouchableOpacity>
      </View>
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
    marginLeft: 12,
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
    gap: 8,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    gap: 4,
  },
  roleText: {
    ...typography.caption,
    fontWeight: '600',
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
