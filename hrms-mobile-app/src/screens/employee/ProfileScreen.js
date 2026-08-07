import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image } from 'react-native';
import { User, Mail, Phone, Building, Calendar, Shield, LogOut, Lock, KeyRound } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { DigitalIdCard } from '../../components/common/DigitalIdCard';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge } from '../../components/common/Badge';
import { typography, shadows } from '../../theme';

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, role, switchRole, logout } = useAuth();

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Interactive Digital ID Card */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>Digital Employee Identity</Text>
      <DigitalIdCard />

      {/* Role & Portal Mode Card */}
      <Card style={styles.roleModeCard} glass>
        <View style={styles.roleRow}>
          <View style={styles.roleTextGroup}>
            <Text style={[styles.roleModeTitle, { color: theme.textPrimary }]}>
              Current Role: {role === 'agent' ? 'Field Agent & Desk Support' : 'Standard Enterprise Employee'}
            </Text>
            <Text style={[styles.roleModeSub, { color: theme.textMuted }]}>
              Switch between Employee and Support Agent workflows
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchBtn, { backgroundColor: theme.primary }]}
            onPress={() => switchRole(role === 'employee' ? 'agent' : 'employee')}
          >
            <Text style={styles.switchBtnText}>
              Switch to {role === 'employee' ? 'Agent' : 'Employee'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Employment Details Card */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 14 }]}>Employment Profile</Text>
      <Card style={styles.detailsCard} glass>
        <View style={styles.detailRow}>
          <Mail size={18} color={theme.primary} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Enterprise Email</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{user.email}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.detailRow}>
          <Phone size={18} color={theme.emerald} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Contact Phone</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{user.phone}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.detailRow}>
          <User size={18} color={theme.violet} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Reporting Manager</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{user.manager}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        <View style={styles.detailRow}>
          <Building size={18} color={theme.cyan} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Company & Unit Location</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{user.company} ({user.unit})</Text>
          </View>
        </View>
      </Card>

      {/* Security & Signout */}
      <View style={styles.securityArea}>
        <Button
          title="Sign Out of Mobile App"
          icon={LogOut}
          variant="rose"
          onPress={logout}
          style={{ width: '100%' }}
        />
      </View>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  contentContainer: {
    padding: 18,
    paddingBottom: 100,
  },
  sectionTitle: {
    ...typography.h3,
    marginBottom: 10,
  },
  roleModeCard: {
    marginBottom: 16,
    padding: 16,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  roleTextGroup: {
    flex: 1,
  },
  roleModeTitle: {
    ...typography.h4,
  },
  roleModeSub: {
    ...typography.caption,
    marginTop: 2,
  },
  switchBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  switchBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  detailsCard: {
    padding: 16,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  detailTextWrapper: {
    marginLeft: 14,
  },
  detailLabel: {
    ...typography.micro,
  },
  detailValue: {
    ...typography.caption,
    fontWeight: '700',
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 4,
  },
  securityArea: {
    marginTop: 10,
  },
});
