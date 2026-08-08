import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, RefreshControl, Alert } from 'react-native';
import { X, BellOff, CheckCheck, UserCheck, Wallet, Ticket, Bell, Trash2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';
import { LoadingView } from './LoadingView';
import { timeAgo } from '../../utils/format';

const MODULE_ICON = {
  Recruitment: UserCheck,
  Payroll: Wallet,
  Tickets: Ticket,
};

export function NotificationPanel({ visible, onClose, items, unread, loading, reload, markRead, markAllRead, clearAll }) {
  const { theme } = useTheme();

  const confirmClearAll = () => {
    Alert.alert('Clear all notifications', 'This removes every notification from your feed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear all', style: 'destructive', onPress: clearAll },
    ]);
  };

  const toneColor = (tone) => ({
    emerald: theme.emerald,
    amber: theme.amber,
    rose: theme.rose,
    violet: theme.violet,
    default: theme.textMuted,
  }[tone] || theme.primary);

  const toneBg = (tone) => ({
    emerald: theme.emeraldBg,
    amber: theme.amberBg,
    rose: theme.roseBg,
    violet: theme.violetBg,
    default: theme.surfaceElevated,
  }[tone] || theme.primary + '15');

  return (
    // statusBarTranslucent: without it Android leaves the status-bar strip
    // outside the modal, so the dim backdrop stops short of the top of the screen.
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

        <View style={[styles.sheet, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          <View style={styles.grabber}>
            <View style={[styles.grabberBar, { backgroundColor: theme.border }]} />
          </View>

          <View style={styles.header}>
            <View style={styles.titleWrap}>
              <Text style={[styles.title, { color: theme.textPrimary }]}>Notifications</Text>
              {unread > 0 ? (
                <View style={[styles.countPill, { backgroundColor: theme.primary }]}>
                  <Text style={styles.countPillText}>{unread} new</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.headerActions}>
              {unread > 0 ? (
                <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn} hitSlop={6}>
                  <CheckCheck size={15} color={theme.primary} />
                  <Text style={[styles.markAllText, { color: theme.primary }]}>Mark all</Text>
                </TouchableOpacity>
              ) : null}
              {items.length > 0 ? (
                <TouchableOpacity onPress={confirmClearAll} style={styles.markAllBtn} hitSlop={6}>
                  <Trash2 size={15} color={theme.rose} />
                  <Text style={[styles.markAllText, { color: theme.rose }]}>Clear</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <X size={21} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <LoadingView label="Loading notifications…" />
          ) : items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.surfaceElevated }]}>
                <BellOff size={26} color={theme.textMuted} />
              </View>
              <Text style={[styles.emptyTitle, { color: theme.textPrimary }]}>You're all caught up</Text>
              <Text style={[styles.emptyMsg, { color: theme.textMuted }]}>
                Approvals, payslips and ticket updates will show up here.
              </Text>
            </View>
          ) : (
            <ScrollView
              style={styles.list}
              contentContainerStyle={styles.listContent}
              refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor={theme.primary} />}
            >
              {items.map((n) => {
                const Icon = MODULE_ICON[n.module] || Bell;
                return (
                  <TouchableOpacity
                    key={n.id}
                    activeOpacity={0.75}
                    onPress={() => markRead(n)}
                    style={[
                      styles.row,
                      {
                        backgroundColor: n.isRead ? 'transparent' : theme.primary + '0C',
                        borderColor: theme.border,
                      },
                    ]}
                  >
                    <View style={[styles.rowIcon, { backgroundColor: toneBg(n.tone) }]}>
                      <Icon size={17} color={toneColor(n.tone)} />
                    </View>

                    <View style={styles.rowBody}>
                      <View style={styles.rowTop}>
                        <Text
                          style={[styles.rowTitle, { color: theme.textPrimary }, !n.isRead && styles.rowTitleUnread]}
                          numberOfLines={1}
                        >
                          {n.title}
                        </Text>
                        {!n.isRead ? <View style={[styles.dot, { backgroundColor: theme.primary }]} /> : null}
                      </View>
                      {n.description ? (
                        <Text style={[styles.rowDesc, { color: theme.textSecondary }]} numberOfLines={2}>
                          {n.description}
                        </Text>
                      ) : null}
                      <Text style={[styles.rowMeta, { color: theme.textMuted }]}>
                        {n.module} · {timeAgo(n.timestamp)}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  sheet: {
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderWidth: 1,
    maxHeight: '82%',
    paddingBottom: 10,
  },
  grabber: { alignItems: 'center', paddingTop: 8, paddingBottom: 2 },
  grabberBar: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
  },
  titleWrap: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typography.h3 },
  countPill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  countPillText: { ...typography.micro, color: '#FFFFFF', fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  markAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  markAllText: { ...typography.caption, fontWeight: '700' },
  list: { flexGrow: 0 },
  listContent: { paddingHorizontal: 14, paddingBottom: 20, gap: 8 },
  row: {
    flexDirection: 'row',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  rowBody: { flex: 1, minWidth: 0 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowTitle: { ...typography.body, fontWeight: '600', flexShrink: 1 },
  rowTitleUnread: { fontWeight: '800' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  rowDesc: { ...typography.caption, marginTop: 3 },
  rowMeta: { ...typography.micro, marginTop: 6 },
  emptyWrap: { alignItems: 'center', paddingVertical: 46, paddingHorizontal: 30 },
  emptyIcon: {
    width: 58, height: 58, borderRadius: 29,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  emptyTitle: { ...typography.h4 },
  emptyMsg: { ...typography.caption, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
