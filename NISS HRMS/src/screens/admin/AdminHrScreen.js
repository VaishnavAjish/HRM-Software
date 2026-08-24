import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl, TextInput, BackHandler } from 'react-native';
import {
  ChevronLeft, Users, UserPlus, Eye, Search
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { LoadingView } from '../../components/common/LoadingView';
import { EmptyState } from '../../components/common/EmptyState';
import { api } from '../../services/api';

export function AdminHrScreen({ onBack }) {
  const { theme } = useTheme();
  const [activeSubTab, setActiveSubTab] = useState('hiring'); // 'hiring' | 'employees'
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [appointments, setAppointments] = useState([]);
  const [trials, setTrials] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);

  // Handle hardware back button inside detail view or screen
  useEffect(() => {
    const onBackPress = () => {
      if (selectedItem) {
        setSelectedItem(null);
        return true;
      }
      if (onBack) {
        onBack();
        return true;
      }
      return false;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [selectedItem, onBack]);

  const loadData = async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      const [apptRes, trialRes, empRes] = await Promise.all([
        api.getAdminAppointments({ limit: 50 }).catch(() => null),
        api.getAdminTrialForms().catch(() => null),
        api.getAdminEmployees({ limit: 50 }).catch(() => null),
      ]);

      if (apptRes?.status && Array.isArray(apptRes.data)) {
        setAppointments(apptRes.data);
      } else {
        setAppointments([]);
      }

      if (trialRes?.status && Array.isArray(trialRes.data)) {
        setTrials(trialRes.data);
      } else {
        setTrials([]);
      }

      if (empRes?.status) {
        const empList = Array.isArray(empRes.data) ? empRes.data : Array.isArray(empRes.employees) ? empRes.employees : [];
        setEmployees(empList);
      } else {
        setEmployees([]);
      }
    } catch (e) {
      setAppointments([]);
      setTrials([]);
      setEmployees([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const safeAppts = Array.isArray(appointments) ? appointments : [];
  const safeTrials = Array.isArray(trials) ? trials : [];
  const safeEmployees = Array.isArray(employees) ? employees : [];

  const totalCandidates = safeAppts.length + safeTrials.length;

  const filteredAppointments = safeAppts.filter(a => {
    if (!a) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (a.name || a.full_name || '').toLowerCase().includes(q) || (a.email || '').toLowerCase().includes(q) || (a.post || a.designation || '').toLowerCase().includes(q);
  });

  const filteredTrials = safeTrials.filter(t => {
    if (!t) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (t.name || t.full_name || '').toLowerCase().includes(q) || (t.phone || t.email || '').toLowerCase().includes(q);
  });

  const filteredEmployees = safeEmployees.filter(e => {
    if (!e) return false;
    const q = search.toLowerCase().trim();
    if (!q) return true;
    return (e.name || '').toLowerCase().includes(q) || (e.email || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
  });

  // Detail View (Strictly View-Only)
  if (selectedItem) {
    const item = selectedItem.data || {};
    const type = selectedItem.type;
    return (
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <TouchableOpacity style={styles.backRow} onPress={() => setSelectedItem(null)} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to HR Console</Text>
        </TouchableOpacity>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <Text style={[styles.title, { color: theme.textPrimary, flexShrink: 1 }]}>{item.name || item.full_name || 'Record Details'}</Text>
            <Badge label="View Only" variant="outline" size="small" />
          </View>

          <Card style={{ padding: 16 }} elevated>
            {type === 'appointment' ? (
              <>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Record Type</Text>
                <Text style={[styles.detailValue, { color: theme.primary }]}>Appointment Application Form</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Email Address</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.email || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Applied Position</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.designation || item.post || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Phone / Mobile</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.phone || item.mobile || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Company Scope</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.company_code || 'All Companies'}</Text>
              </>
            ) : type === 'trial' ? (
              <>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Record Type</Text>
                <Text style={[styles.detailValue, { color: theme.emerald }]}>Trial Candidate Form</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Contact Number</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.phone || item.email || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Assigned Unit / Branch</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.branch || item.unit || 'Main Plant'}</Text>
              </>
            ) : (
              <>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Employee Name</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.name || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Employee ID</Text>
                <Text style={[styles.detailValue, { color: theme.primary }]}>{item.emp_code || item.id || 'N/A'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Department</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.department || 'General Staff'}</Text>
                
                <Text style={[styles.detailLabel, { color: theme.textMuted, marginTop: 10 }]}>Official Email</Text>
                <Text style={[styles.detailValue, { color: theme.textPrimary }]}>{item.email || 'N/A'}</Text>
              </>
            )}
          </Card>
        </ScrollView>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} tintColor={theme.primary} />}
    >
      {onBack ? (
        <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text style={[styles.title, { color: theme.textPrimary }]}>HR Console</Text>
        <Badge label="Read Only" variant="outline" size="small" />
      </View>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        View-only human resource operations, hiring pipeline & staff directory
      </Text>

      {/* Workforce Summary Banner */}
      <Card style={styles.summaryCard} elevated>
        <View style={styles.summaryGrid}>
          <View style={styles.summaryTile}>
            <Text style={[styles.summaryNum, { color: theme.primary }]}>{safeEmployees.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Active Staff</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.summaryTile}>
            <Text style={[styles.summaryNum, { color: theme.emerald }]}>{totalCandidates}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Candidates</Text>
          </View>
          <View style={[styles.divider, { backgroundColor: theme.border }]} />
          <View style={styles.summaryTile}>
            <Text style={[styles.summaryNum, { color: theme.violet }]}>{safeTrials.length}</Text>
            <Text style={[styles.summaryLabel, { color: theme.textMuted }]}>Trial Forms</Text>
          </View>
        </View>
      </Card>

      {/* View Sub-Tab Navigation */}
      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
        <TouchableOpacity style={[styles.tabBtn, activeSubTab === 'hiring' && { backgroundColor: theme.primary }]} onPress={() => setActiveSubTab('hiring')}>
          <Text style={[styles.tabText, { color: activeSubTab === 'hiring' ? '#FFFFFF' : theme.textMuted }]}>
            Hiring Candidates ({totalCandidates})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tabBtn, activeSubTab === 'employees' && { backgroundColor: theme.primary }]} onPress={() => setActiveSubTab('employees')}>
          <Text style={[styles.tabText, { color: activeSubTab === 'employees' ? '#FFFFFF' : theme.textMuted }]}>
            Staff Directory ({safeEmployees.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Read-Only Search */}
      <View style={[styles.searchBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
        <Search size={16} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search candidates or staff..."
          placeholderTextColor={theme.textMuted}
          value={search}
          onChangeText={setSearch}
        />
      </View>

      {loading ? (
        <LoadingView label="Loading HR records…" />
      ) : activeSubTab === 'hiring' ? (
        <View style={{ gap: 10 }}>
          {filteredAppointments.length === 0 && filteredTrials.length === 0 ? (
            <EmptyState icon={UserPlus} title="No candidate applications" message="No candidate appointment or trial records found." />
          ) : (
            <>
              {filteredAppointments.map((a) => (
                <TouchableOpacity key={'appt-' + (a.id || Math.random())} onPress={() => setSelectedItem({ type: 'appointment', data: a })} activeOpacity={0.8}>
                  <Card style={styles.card} elevated>
                    <View style={styles.rowTop}>
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{a.name || a.full_name || 'Candidate'}</Text>
                      <Badge label="Appointment" variant="primary" size="small" />
                    </View>
                    <Text style={[styles.cardSub, { color: theme.textMuted }]}>{a.email || a.phone || 'Form submitted'}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Text style={[styles.cardMeta, { color: theme.emerald }]}>Position: {a.designation || a.post || 'Applicant'}</Text>
                      <Eye size={16} color={theme.textMuted} />
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}

              {filteredTrials.map((t) => (
                <TouchableOpacity key={'trial-' + (t.id || Math.random())} onPress={() => setSelectedItem({ type: 'trial', data: t })} activeOpacity={0.8}>
                  <Card style={styles.card} elevated>
                    <View style={styles.rowTop}>
                      <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{t.name || t.full_name || 'Trial Candidate'}</Text>
                      <Badge label="Trial Form" variant="emerald" size="small" />
                    </View>
                    <Text style={[styles.cardSub, { color: theme.textMuted }]}>{t.phone || t.email || 'Trial intake'}</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                      <Text style={[styles.cardMeta, { color: theme.violet }]}>Branch/Unit: {t.branch || t.unit || 'Main Plant'}</Text>
                      <Eye size={16} color={theme.textMuted} />
                    </View>
                  </Card>
                </TouchableOpacity>
              ))}
            </>
          )}
        </View>
      ) : (
        <View style={{ gap: 10 }}>
          {filteredEmployees.length === 0 ? (
            <EmptyState icon={Users} title="No employees found" message="No matching active staff records." />
          ) : (
            filteredEmployees.map((emp) => (
              <TouchableOpacity key={'emp-' + (emp.id || Math.random())} onPress={() => setSelectedItem({ type: 'employee', data: emp })} activeOpacity={0.8}>
                <Card style={styles.card} elevated>
                  <View style={styles.rowTop}>
                    <Text style={[styles.cardTitle, { color: theme.textPrimary }]}>{emp.name || 'Employee'}</Text>
                    <Badge label={emp.department || 'Staff'} variant="outline" size="small" />
                  </View>
                  <Text style={[styles.cardSub, { color: theme.textMuted }]}>{emp.email || 'No email'}</Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 }}>
                    <Text style={[styles.cardMeta, { color: theme.primary }]}>Emp ID: {emp.emp_code || emp.id}</Text>
                    <Eye size={16} color={theme.textMuted} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { padding: 16, paddingBottom: 40 },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  backText: { ...typography.body, fontWeight: '600' },
  title: { ...typography.h2, fontWeight: '800' },
  subtitle: { ...typography.caption, marginTop: 2, marginBottom: 16 },
  summaryCard: { padding: 16, marginBottom: 16 },
  summaryGrid: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  summaryTile: { alignItems: 'center' },
  summaryNum: { ...typography.h2, fontWeight: '800' },
  summaryLabel: { ...typography.caption, marginTop: 2 },
  divider: { width: 1, height: 32 },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabText: { ...typography.caption, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 14, gap: 8 },
  searchInput: { flex: 1, ...typography.body, padding: 0 },
  card: { padding: 14 },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  cardTitle: { ...typography.h4, fontWeight: '800', flexShrink: 1, marginRight: 8 },
  cardSub: { ...typography.caption },
  cardMeta: { ...typography.micro, fontWeight: '600' },
  detailLabel: { ...typography.caption, fontWeight: '600' },
  detailValue: { ...typography.body, fontWeight: '800', marginTop: 2 },
});
