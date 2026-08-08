import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Image, Modal, ActivityIndicator } from 'react-native';
import { User, Mail, Phone, Building, Calendar, Shield, LogOut, Hash, CreditCard, RefreshCw } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { DigitalIdCard } from '../../components/common/DigitalIdCard';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { typography, shadows } from '../../theme';

export function ProfileScreen() {
  const { theme } = useTheme();
  const { user, role, switchRole, logout, refreshProfile } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshProfile();
    setRefreshing(false);
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background, justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={theme.primary} />
        <Text style={{ color: theme.textMuted, marginTop: 12 }}>Loading Profile from Backend...</Text>
      </View>
    );
  }

  const empCode = user.emp_code || user.empCode || 'EMP-001';
  const name = user.name || user.full_name || 'Employee';
  const email = user.email || 'N/A';
  const phone = user.mobile_number || user.phone || 'N/A';
  const company = user.company_code || user.company || 'NISS Enterprise';
  const unit = user.unit || 'HQ Unit';
  const department = user.department || 'Operations';
  const designation = user.designation || 'Staff Officer';
  const joiningDate = user.joining_date || user.joiningDate || 'N/A';
  const dob = user.dob || 'N/A';
  const aadhar = user.aadhar_card_no || user.aadhaar || 'N/A';

  return (
    <ScrollView style={[styles.container, { backgroundColor: theme.background }]} contentContainerStyle={styles.contentContainer} showsVerticalScrollIndicator={false}>

      {/* Header & Refresh */}
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginBottom: 0 }]}>Digital Employee Identity</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleRefresh} disabled={refreshing}>
          <RefreshCw size={16} color={theme.primary} />
        </TouchableOpacity>
      </View>

      {/* Interactive Digital ID Card */}
      <DigitalIdCard />

      {/* Mode / Role Info */}
      <Card style={styles.roleModeCard} glass>
        <View style={styles.roleRow}>
          <View style={styles.roleTextGroup}>
            <Text style={[styles.roleModeTitle, { color: theme.textPrimary }]}>
              Mode: {role === 'agent' ? 'Field Agent & Recruitment' : 'Employee Portal'}
            </Text>
            <Text style={[styles.roleModeSub, { color: theme.textMuted }]}>
              Emp Code: {empCode} • {company}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.switchBtn, { backgroundColor: role === 'agent' ? theme.violet : theme.primary }]}
            onPress={() => switchRole(role === 'employee' ? 'agent' : 'employee')}
          >
            <Text style={styles.switchBtnText}>
              Switch to {role === 'employee' ? 'Agent' : 'Employee'}
            </Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* Employment Details Card */}
      <Text style={[styles.sectionTitle, { color: theme.textPrimary, marginTop: 14 }]}>Official Employment Details</Text>
      <Card style={styles.detailsCard} glass>
        {/* Email */}
        <View style={styles.detailRow}>
          <Mail size={18} color={theme.primary} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Enterprise Email</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{email}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Contact Phone */}
        <View style={styles.detailRow}>
          <Phone size={18} color={theme.emerald} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Contact Mobile Number</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{phone}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Company & Unit */}
        <View style={styles.detailRow}>
          <Building size={18} color={theme.cyan} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Company & Branch Unit</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{company} ({unit})</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Department & Designation */}
        <View style={styles.detailRow}>
          <Shield size={18} color={theme.violet} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Department & Designation</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{department} • {designation}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Joining Date */}
        <View style={styles.detailRow}>
          <Calendar size={18} color={theme.amber} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Joining Date & DOB</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>Joined: {joiningDate} • DOB: {dob}</Text>
          </View>
        </View>

        <View style={[styles.divider, { backgroundColor: theme.border }]} />

        {/* Aadhaar Verification */}
        <View style={styles.detailRow}>
          <CreditCard size={18} color={theme.rose} />
          <View style={styles.detailTextWrapper}>
            <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Aadhaar Card Record</Text>
            <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{aadhar}</Text>
          </View>
        </View>
      </Card>

      {/* Security & Logout */}
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionTitle: {
    ...typography.h3,
  },
  refreshBtn: {
    padding: 6,
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
    flex: 1,
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
