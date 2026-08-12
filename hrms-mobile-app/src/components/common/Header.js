import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing, Modal, Alert } from 'react-native';
import { Bell, User, LogOut, X, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Avatar } from './Avatar';
import { Badge } from './Badge';
import { NotificationPanel } from './NotificationPanel';
import { useNotifications } from '../../hooks/useNotifications';

export function Header({ onNavigateProfile }) {
  const { theme } = useTheme();
  const { user, role, logout } = useAuth();
  const [panelOpen, setPanelOpen] = useState(false);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const notifications = useNotifications();

  const firstName = (user?.name || '').split(' ')[0] || 'there';
  const { unread } = notifications;

  const swing = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (unread <= 0) {
      swing.setValue(0);
      return undefined;
    }
    const tick = (toValue, duration) =>
      Animated.timing(swing, { toValue, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true });

    const loop = Animated.loop(
      Animated.sequence([
        tick(1, 110), tick(-1, 200), tick(1, 200), tick(-1, 200), tick(0, 110),
        Animated.delay(1800),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [unread, swing]);

  const bellRotate = swing.interpolate({ inputRange: [-1, 1], outputRange: ['-16deg', '16deg'] });

  const handleLogoutPress = () => {
    setProfileModalOpen(false);
    Alert.alert(
      'Sign Out',
      'Are you sure you want to log out of your account?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log Out',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const handleProfileDetailsPress = () => {
    setProfileModalOpen(false);
    onNavigateProfile?.();
  };

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
          style={styles.bellButton}
          onPress={() => { notifications.reload(); setPanelOpen(true); }}
          activeOpacity={0.6}
          hitSlop={8}
        >
          <Animated.View style={{ transform: [{ rotate: bellRotate }] }}>
            <Bell
              size={23}
              color={unread > 0 ? theme.primary : theme.textSecondary}
              strokeWidth={unread > 0 ? 2.4 : 2}
            />
          </Animated.View>
          {unread > 0 ? (
            <View style={[styles.badge, { backgroundColor: theme.rose, borderColor: theme.surface }]}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setProfileModalOpen(true)} activeOpacity={0.8} hitSlop={10}>
          <Avatar name={user?.name} uri={user?.photo} size={42} />
        </TouchableOpacity>
      </View>

      <NotificationPanel visible={panelOpen} onClose={() => setPanelOpen(false)} {...notifications} />

      {/* Admin Profile Modal */}
      <Modal
        visible={profileModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileModalOpen(false)}
      >
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setProfileModalOpen(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[styles.modalCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: theme.textPrimary }]}>Account Menu</Text>
              <TouchableOpacity onPress={() => setProfileModalOpen(false)} hitSlop={8}>
                <X size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Profile Brief */}
            <View style={[styles.userBrief, { backgroundColor: theme.surfaceElevated }]}>
              <Avatar name={user?.name} uri={user?.photo} size={50} />
              <View style={styles.userBriefText}>
                <Text style={[styles.userName, { color: theme.textPrimary }]}>{user?.name || 'User'}</Text>
                <Text style={[styles.userEmail, { color: theme.textMuted }]} numberOfLines={1}>
                  {user?.email || user?.emp_code || 'Staff Member'}
                </Text>
                <View style={{ marginTop: 4, flexDirection: 'row' }}>
                  <Badge
                    label={role === 'admin' ? 'Administrator' : role === 'agent' ? 'Field Agent' : 'Employee'}
                    variant={role === 'admin' ? 'violet' : role === 'agent' ? 'amber' : 'emerald'}
                    size="small"
                  />
                </View>
              </View>
            </View>

            {/* Only Profile Options */}
            <View style={styles.optionsList}>
              <TouchableOpacity
                style={[styles.optionItem, { backgroundColor: theme.surfaceElevated }]}
                onPress={handleProfileDetailsPress}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: theme.primary + '18' }]}>
                  <User size={18} color={theme.primary} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionTitle, { color: theme.textPrimary }]}>My Profile Details</Text>
                  <Text style={[styles.optionSub, { color: theme.textMuted }]}>View & edit personal profile</Text>
                </View>
                <ChevronRight size={18} color={theme.textMuted} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.optionItem, { backgroundColor: theme.roseBg || '#FEF2F2' }]}
                onPress={handleLogoutPress}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconWrap, { backgroundColor: theme.rose + '18' }]}>
                  <LogOut size={18} color={theme.rose} />
                </View>
                <View style={styles.optionTextWrap}>
                  <Text style={[styles.optionTitle, { color: theme.rose }]}>Log Out</Text>
                  <Text style={[styles.optionSub, { color: theme.rose + 'AA' }]}>Sign out of your account</Text>
                </View>
                <ChevronRight size={18} color={theme.rose} />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
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
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  rightSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bellButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: -1,
    right: -2,
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

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 22,
    borderWidth: 1,
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    ...typography.h4,
    fontWeight: '800',
  },
  userBrief: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 16,
    marginBottom: 14,
  },
  userBriefText: {
    marginLeft: 12,
    flex: 1,
  },
  userName: {
    ...typography.body,
    fontWeight: '800',
  },
  userEmail: {
    ...typography.micro,
    marginTop: 1,
  },
  optionsList: {
    gap: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    gap: 12,
  },
  optionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTextWrap: {
    flex: 1,
  },
  optionTitle: {
    ...typography.body,
    fontWeight: '700',
    fontSize: 14,
  },
  optionSub: {
    ...typography.micro,
    marginTop: 1,
  },
});
