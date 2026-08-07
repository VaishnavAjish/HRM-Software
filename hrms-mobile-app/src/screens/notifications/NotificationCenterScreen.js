import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Bell, CheckCheck, Ticket, Calendar, FileText, Megaphone, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useNotifications } from '../../context/NotificationContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';

export function NotificationCenterScreen({ onClose }) {
  const { theme } = useTheme();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();

  const getIconForType = (type) => {
    switch (type) {
      case 'leave':
        return <Calendar size={18} color={theme.emerald} />;
      case 'ticket':
        return <Ticket size={18} color={theme.violet} />;
      case 'payroll':
        return <FileText size={18} color={theme.cyan} />;
      default:
        return <Megaphone size={18} color={theme.amber} />;
    }
  };

  return (
    <View style={[styles.modalOverlay, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.headerRow, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <View style={styles.titleGroup}>
          <Bell size={22} color={theme.primary} />
          <Text style={[styles.pageTitle, { color: theme.textPrimary }]}>Notification Center</Text>
          {unreadCount > 0 && (
            <Badge label={`${unreadCount} New`} variant="rose" size="small" />
          )}
        </View>

        <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.surfaceElevated }]} onPress={onClose}>
          <X size={20} color={theme.textPrimary} />
        </TouchableOpacity>
      </View>

      {/* Mark All Read Action */}
      <View style={styles.topActionsRow}>
        <Text style={[styles.subText, { color: theme.textMuted }]}>Real-time System Alerts</Text>
        <TouchableOpacity style={styles.markAllBtn} onPress={markAllAsRead}>
          <CheckCheck size={16} color={theme.primary} />
          <Text style={[styles.markAllText, { color: theme.primary }]}>Mark all as read</Text>
        </TouchableOpacity>
      </View>

      {/* Notifications List */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {notifications.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => markAsRead(item.id)}
            activeOpacity={0.8}
          >
            <Card
              style={[
                styles.notifCard,
                !item.read && { borderColor: theme.primary + '50', backgroundColor: theme.primary + '10' },
              ]}
              glass
            >
              <View style={styles.cardRow}>
                <View style={[styles.iconCircle, { backgroundColor: theme.surfaceElevated }]}>
                  {getIconForType(item.type)}
                </View>

                <View style={{ flex: 1, marginLeft: 12 }}>
                  <View style={styles.cardHeader}>
                    <Text style={[styles.notifTitle, { color: theme.textPrimary }]}>{item.title}</Text>
                    <Text style={[styles.notifTime, { color: theme.textMuted }]}>{item.time}</Text>
                  </View>
                  <Text style={[styles.notifMsg, { color: theme.textSecondary }]}>{item.message}</Text>
                </View>

                {!item.read && <View style={[styles.unreadDot, { backgroundColor: theme.rose }]} />}
              </View>
            </Card>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    paddingTop: 44,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pageTitle: {
    ...typography.h3,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  subText: {
    ...typography.caption,
  },
  markAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  markAllText: {
    ...typography.caption,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingBottom: 40,
  },
  notifCard: {
    marginBottom: 10,
    padding: 14,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  notifTitle: {
    ...typography.h4,
  },
  notifTime: {
    ...typography.micro,
  },
  notifMsg: {
    ...typography.caption,
    lineHeight: 18,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginLeft: 8,
  },
});
