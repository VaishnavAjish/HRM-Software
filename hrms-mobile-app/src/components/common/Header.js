import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { Bell, Sun, Moon, Shield, User, ChevronDown, Check } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationContext';
import { typography, shadows } from '../../theme';

export function Header({ title, onOpenNotifications, onNavigateProfile }) {
  const { theme, isDark, toggleTheme } = useTheme();
  const { user, role, switchRole } = useAuth();
  const { unreadCount } = useNotifications();
  const [roleModalVisible, setRoleModalVisible] = useState(false);

  return (
    <View style={[styles.headerContainer, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
      {/* User Info & Title */}
      <View style={styles.leftSection}>
        <TouchableOpacity style={styles.avatarTouchable} onPress={onNavigateProfile} activeOpacity={0.8}>
          <Image source={{ uri: user.avatar }} style={styles.avatar} />
          <View style={[styles.onlineDot, { backgroundColor: theme.emerald }]} />
        </TouchableOpacity>
        <View style={styles.titleWrapper}>
          <Text style={[styles.greetingText, { color: theme.textMuted }]}>
            Welcome back,
          </Text>
          <Text style={[styles.userNameText, { color: theme.textPrimary }]} numberOfLines={1}>
            {user.name.split(' ')[0]}
          </Text>
        </View>
      </View>

      {/* Action Icons */}
      <View style={styles.rightSection}>
        {/* Role Switcher Pill */}
        <TouchableOpacity
          style={[
            styles.roleBadge,
            {
              backgroundColor: role === 'agent' ? theme.violetBg : theme.cyanBg,
              borderColor: role === 'agent' ? theme.violet : theme.cyan,
            },
          ]}
          onPress={() => setRoleModalVisible(true)}
          activeOpacity={0.8}
        >
          {role === 'agent' ? (
            <Shield size={12} color={theme.violet} style={styles.roleIcon} />
          ) : (
            <User size={12} color={theme.cyan} style={styles.roleIcon} />
          )}
          <Text
            style={[
              styles.roleText,
              { color: role === 'agent' ? theme.violet : theme.cyan },
            ]}
          >
            {role === 'agent' ? 'Agent' : 'Employee'}
          </Text>
          <ChevronDown size={12} color={role === 'agent' ? theme.violet : theme.cyan} />
        </TouchableOpacity>

        {/* Theme Toggle */}
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={toggleTheme}
          activeOpacity={0.7}
        >
          {isDark ? (
            <Sun size={18} color="#F59E0B" />
          ) : (
            <Moon size={18} color="#6366F1" />
          )}
        </TouchableOpacity>

        {/* Notifications Icon with Badge */}
        <TouchableOpacity
          style={[styles.iconButton, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
          onPress={onOpenNotifications}
          activeOpacity={0.7}
        >
          <Bell size={18} color={theme.textPrimary} />
          {unreadCount > 0 && (
            <View style={[styles.unreadBadge, { backgroundColor: theme.rose }]}>
              <Text style={styles.unreadBadgeText}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Role Switcher Modal */}
      <Modal
        visible={roleModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRoleModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRoleModalVisible(false)}
        >
          <View style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
            <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>
              Switch Mobile Mode
            </Text>
            <Text style={[styles.modalSubtitle, { color: theme.textMuted }]}>
              Select active portal workflow
            </Text>

            {/* Option 1: Employee */}
            <TouchableOpacity
              style={[
                styles.roleOption,
                {
                  backgroundColor: role === 'employee' ? theme.primaryGradient[0] + '20' : theme.surfaceElevated,
                  borderColor: role === 'employee' ? theme.primary : theme.border,
                },
              ]}
              onPress={() => {
                switchRole('employee');
                setRoleModalVisible(false);
              }}
            >
              <View style={[styles.optionIconCircle, { backgroundColor: theme.cyanBg }]}>
                <User size={20} color={theme.cyan} />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Employee Portal</Text>
                <Text style={[styles.optionDesc, { color: theme.textMuted }]}>Punch attendance, raise tickets, apply leave, view payslips</Text>
              </View>
              {role === 'employee' && <Check size={18} color={theme.primary} />}
            </TouchableOpacity>

            {/* Option 2: Agent */}
            <TouchableOpacity
              style={[
                styles.roleOption,
                {
                  backgroundColor: role === 'agent' ? theme.violetBg : theme.surfaceElevated,
                  borderColor: role === 'agent' ? theme.violet : theme.border,
                },
              ]}
              onPress={() => {
                switchRole('agent');
                setRoleModalVisible(false);
              }}
            >
              <View style={[styles.optionIconCircle, { backgroundColor: theme.violetBg }]}>
                <Shield size={20} color={theme.violet} />
              </View>
              <View style={styles.optionTextWrapper}>
                <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>Agent & Desk Support</Text>
                <Text style={[styles.optionDesc, { color: theme.textMuted }]}>Manage assigned tickets, field task visits, SLA response</Text>
              </View>
              {role === 'agent' && <Check size={18} color={theme.violet} />}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
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
  },
  avatarTouchable: {
    position: 'relative',
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 2,
    borderColor: '#6366F1',
  },
  onlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#0F172A',
  },
  titleWrapper: {
    marginLeft: 12,
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
  roleIcon: {
    marginRight: 2,
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
    position: 'relative',
  },
  unreadBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    borderRadius: 24,
    padding: 22,
    borderWidth: 1,
    ...shadows.glass,
  },
  modalTitle: {
    ...typography.h3,
    marginBottom: 4,
  },
  modalSubtitle: {
    ...typography.body,
    marginBottom: 20,
  },
  roleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 16,
    borderWidth: 1.5,
    marginBottom: 12,
  },
  optionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  optionTextWrapper: {
    flex: 1,
  },
  optionTitle: {
    ...typography.h4,
    marginBottom: 2,
  },
  optionDesc: {
    ...typography.caption,
  },
});
