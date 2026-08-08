import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Mail, Phone, ArrowRightCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Card } from '../common/Card';
import { Badge } from '../common/Badge';
import { Avatar } from '../common/Avatar';
import { timeAgo } from '../../utils/format';
import { TYPE_VARIANT, typeLabel, isCandidateApproved, isCandidateProcessed, canProcess } from '../../screens/agent/candidateHelpers';

export function CandidateCard({ candidate: c, onView, onProcess }) {
  const { theme } = useTheme();

  return (
    <Card style={styles.card} elevated>
      <TouchableOpacity activeOpacity={0.8} onPress={() => onView(c)}>
        <View style={styles.top}>
          <Avatar name={c.name} uri={c.photo} size={44} />
          <View style={styles.info}>
            <Text style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {c.name || 'Unnamed candidate'}
            </Text>
            <Text style={[styles.meta, { color: theme.textMuted }]} numberOfLines={1}>
              {c.designation || c.department || '—'}
              {c.emp_code ? ` · ${c.emp_code}` : ''}
            </Text>
          </View>
          <View style={styles.badgeCol}>
            <Badge label={typeLabel(c.type)} variant={TYPE_VARIANT[c.type] || 'default'} size="small" />
            <Badge
              label={isCandidateApproved(c) ? 'Approved' : 'Pending'}
              variant={isCandidateApproved(c) ? 'emerald' : 'amber'}
              size="small"
              style={{ marginTop: 4 }}
            />
          </View>
        </View>

        <View style={styles.contactRow}>
          {c.email ? (
            <View style={styles.contactItem}>
              <Mail size={12} color={theme.textMuted} />
              <Text style={[styles.contactText, { color: theme.textMuted }]} numberOfLines={1}>{c.email}</Text>
            </View>
          ) : null}
          {c.mobile_number ? (
            <View style={styles.contactItem}>
              <Phone size={12} color={theme.textMuted} />
              <Text style={[styles.contactText, { color: theme.textMuted }]}>{c.mobile_number}</Text>
            </View>
          ) : null}
        </View>

        {c.department || c.company_code || c.unit ? (
          <Text style={[styles.subMeta, { color: theme.textMuted }]} numberOfLines={1}>
            {[c.department, c.company_code, c.unit].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </TouchableOpacity>

      <View style={styles.bottomRow}>
        <Text style={[styles.time, { color: theme.textMuted }]}>Submitted {timeAgo(c.created_at)}</Text>
        <View style={styles.actionsRow}>
          <TouchableOpacity onPress={() => onView(c)}>
            <Text style={[styles.actionLink, { color: theme.primary }]}>View</Text>
          </TouchableOpacity>
          {canProcess(c) && onProcess ? (
            <TouchableOpacity style={styles.processBtn} onPress={() => onProcess(c)}>
              <ArrowRightCircle size={13} color={theme.emerald} />
              <Text style={[styles.actionLink, { color: theme.emerald }]}>Process</Text>
            </TouchableOpacity>
          ) : c.type === 'trial' && isCandidateProcessed(c) ? (
            <Text style={[styles.processedLabel, { color: theme.textMuted }]}>Processed</Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: 10, padding: 16 },
  top: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  info: { flex: 1, marginLeft: 12, marginRight: 8 },
  name: { ...typography.h4 },
  meta: { ...typography.caption, marginTop: 2 },
  badgeCol: { alignItems: 'flex-end' },
  contactRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 4 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  contactText: { ...typography.caption },
  subMeta: { ...typography.caption, marginBottom: 6 },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.25)',
  },
  time: { ...typography.micro },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  actionLink: { ...typography.caption, fontWeight: '700' },
  processBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  processedLabel: { ...typography.caption, fontWeight: '600' },
});
