import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Easing } from 'react-native';
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

  // Swing the bell in short bursts while anything is unread, with a pause
  // between rings so it reads as "something's waiting" rather than a jitter.
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
});
