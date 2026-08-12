import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput } from 'react-native';
import { ChevronLeft, FileText, Calculator, ShieldCheck, CheckCircle2, AlertCircle, Search, Percent } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography } from '../../theme';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';

export function AdminTdsScreen({ onBack }) {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState('summary'); // 'summary' | 'declarations' | 'slabs'
  const [searchQuery, setSearchQuery] = useState('');

  const TDS_RECORDS = [
    { id: '1', empName: 'Abhishek Variya', empCode: '1132', pan: 'ABCDE1234F', grossAnnual: '₹12,40,000', regime: 'New Regime', tdsDeducted: '₹64,200', status: 'Compliant' },
    { id: '2', empName: 'Ajaybhai Basiya', empCode: '1128', pan: 'BKWPB9876K', grossAnnual: '₹9,80,000', regime: 'Old Regime', tdsDeducted: '₹38,500', status: 'Declaration Pending' },
    { id: '3', empName: 'Anirudhhabhai Shekhada', empCode: '1136', pan: 'CLZPS4567M', grossAnnual: '₹15,20,000', regime: 'New Regime', tdsDeducted: '₹1,02,400', status: 'Compliant' },
    { id: '4', empName: 'Dineshbhai Chavda', empCode: '1127', pan: 'DMKPT7890N', grossAnnual: '₹8,60,000', regime: 'Old Regime', tdsDeducted: '₹22,000', status: 'Verified' },
  ];

  const filteredRecords = TDS_RECORDS.filter(
    (r) => r.empName.toLowerCase().includes(searchQuery.toLowerCase()) || r.empCode.includes(searchQuery)
  );

  return (
    <ScrollView style={[styles.screen, { backgroundColor: theme.background }]} contentContainerStyle={styles.content}>
      {onBack ? (
        <TouchableOpacity style={styles.backRow} onPress={onBack} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to More</Text>
        </TouchableOpacity>
      ) : null}

      <Text style={[styles.title, { color: theme.textPrimary }]}>TDS Tax Management</Text>
      <Text style={[styles.subtitle, { color: theme.textMuted }]}>
        Tax Deduction at Source calculations, tax regimes & 80C/80D declarations
      </Text>

      {/* Overview Cards */}
      <View style={styles.statsGrid}>
        <Card style={styles.statCard} elevated>
          <View style={[styles.statIconWrap, { backgroundColor: theme.primary + '15' }]}>
            <Calculator size={18} color={theme.primary} />
          </View>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>₹2,27,100</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>Total TDS Deducted (YTD)</Text>
        </Card>

        <Card style={styles.statCard} elevated>
          <View style={[styles.statIconWrap, { backgroundColor: theme.emerald + '15' }]}>
            <ShieldCheck size={18} color={theme.emerald} />
          </View>
          <Text style={[styles.statValue, { color: theme.textPrimary }]}>334 Staff</Text>
          <Text style={[styles.statLabel, { color: theme.textMuted }]}>PAN Validated Records</Text>
        </Card>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { backgroundColor: theme.surfaceElevated }]}>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'summary' && { backgroundColor: theme.primary }]}
          onPress={() => setActiveTab('summary')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'summary' ? '#FFFFFF' : theme.textMuted }]}>
            Employee TDS List
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabBtn, activeTab === 'declarations' && { backgroundColor: theme.primary }]}
          onPress={() => setActiveTab('declarations')}
        >
          <Text style={[styles.tabText, { color: activeTab === 'declarations' ? '#FFFFFF' : theme.textMuted }]}>
            Declarations
          </Text>
        </TouchableOpacity>
      </View>

      {/* Search Input */}
      <View style={[styles.searchBox, { backgroundColor: theme.surfaceCard, borderColor: theme.border }]}>
        <Search size={16} color={theme.textMuted} />
        <TextInput
          style={[styles.searchInput, { color: theme.textPrimary }]}
          placeholder="Search by name, code, or PAN..."
          placeholderTextColor={theme.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* TDS List */}
      <View style={styles.listSection}>
        {filteredRecords.map((record) => (
          <Card key={record.id} style={styles.recordCard} elevated>
            <View style={styles.recordHeader}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.empName, { color: theme.textPrimary }]}>{record.empName}</Text>
                <Text style={[styles.empMeta, { color: theme.textMuted }]}>
                  ID {record.empCode} · PAN: {record.pan}
                </Text>
              </View>
              <Badge
                label={record.status}
                variant={record.status === 'Compliant' || record.status === 'Verified' ? 'emerald' : 'amber'}
                size="small"
              />
            </View>

            <View style={[styles.recordDetails, { backgroundColor: theme.surfaceElevated }]}>
              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Gross Annual</Text>
                <Text style={[styles.detailVal, { color: theme.textPrimary }]}>{record.grossAnnual}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>Selected Regime</Text>
                <Text style={[styles.detailVal, { color: theme.primary }]}>{record.regime}</Text>
              </View>

              <View style={styles.detailItem}>
                <Text style={[styles.detailLabel, { color: theme.textMuted }]}>TDS YTD</Text>
                <Text style={[styles.detailVal, { color: theme.emerald }]}>{record.tdsDeducted}</Text>
              </View>
            </View>
          </Card>
        ))}
      </View>
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
  statsGrid: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, padding: 14 },
  statIconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  statValue: { ...typography.h4, fontWeight: '800' },
  statLabel: { ...typography.micro, marginTop: 2 },
  tabBar: { flexDirection: 'row', padding: 4, borderRadius: 12, marginBottom: 14 },
  tabBtn: { flex: 1, paddingVertical: 8, borderRadius: 9, alignItems: 'center' },
  tabText: { ...typography.caption, fontWeight: '700' },
  searchBox: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, borderWidth: 1, marginBottom: 14, gap: 8 },
  searchInput: { flex: 1, ...typography.body, padding: 0 },
  listSection: { gap: 10 },
  recordCard: { padding: 14 },
  recordHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  empName: { ...typography.body, fontWeight: '800' },
  empMeta: { ...typography.caption, marginTop: 1 },
  recordDetails: { flexDirection: 'row', justifyContent: 'space-between', padding: 10, borderRadius: 12 },
  detailItem: { alignItems: 'flex-start' },
  detailLabel: { ...typography.micro },
  detailVal: { ...typography.caption, fontWeight: '700', marginTop: 2 },
});
