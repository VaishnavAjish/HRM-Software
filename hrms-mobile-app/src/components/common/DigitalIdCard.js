import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ShieldCheck, Cpu, QrCode, Building2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';

export function DigitalIdCard() {
  const { theme } = useTheme();
  const { user } = useAuth();

  return (
    <View style={styles.cardWrapper}>
      <LinearGradient
        colors={['#1E1B4B', '#312E81', '#4338CA']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientCard, shadows.glass]}
      >
        {/* Card Top Header */}
        <View style={styles.topHeader}>
          <View style={styles.brandGroup}>
            <Building2 size={22} color="#818CF8" />
            <Text style={styles.companyTitle}>NISS ENTERPRISE</Text>
          </View>
          <View style={styles.verifiedPill}>
            <ShieldCheck size={12} color="#10B981" />
            <Text style={styles.verifiedText}>VERIFIED ID</Text>
          </View>
        </View>

        {/* Chip & QR row */}
        <View style={styles.chipRow}>
          <Cpu size={28} color="#F59E0B" />
          <View style={styles.qrContainer}>
            <QrCode size={36} color="#FFFFFF" />
          </View>
        </View>

        {/* Main Info Section */}
        <View style={styles.infoRow}>
          <Image source={{ uri: user.avatar }} style={styles.idAvatar} />
          <View style={styles.idDetails}>
            <Text style={styles.empName}>{user.name}</Text>
            <Text style={styles.empRole}>{user.designation}</Text>
            <Text style={styles.empDept}>{user.department}</Text>
          </View>
        </View>

        {/* Card Footer */}
        <View style={styles.cardFooter}>
          <View>
            <Text style={styles.footerLabel}>EMPLOYEE ID</Text>
            <Text style={styles.footerValue}>{user.empCode}</Text>
          </View>
          <View>
            <Text style={styles.footerLabel}>JOINING DATE</Text>
            <Text style={styles.footerValue}>{user.joiningDate}</Text>
          </View>
          <View>
            <Text style={styles.footerLabel}>UNIT LOCATION</Text>
            <Text style={styles.footerValue}>{user.unit.split('-')[0]}</Text>
          </View>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardWrapper: {
    width: '100%',
    marginVertical: 12,
  },
  gradientCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  brandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  companyTitle: {
    color: '#F8FAFC',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
  },
  verifiedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
  },
  verifiedText: {
    color: '#34D399',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  qrContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    padding: 6,
    borderRadius: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  idAvatar: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2,
    borderColor: '#818CF8',
    marginRight: 14,
  },
  idDetails: {
    flex: 1,
  },
  empName: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  empRole: {
    color: '#A5B4FC',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  empDept: {
    color: '#94A3B8',
    fontSize: 11,
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.12)',
    paddingTop: 12,
  },
  footerLabel: {
    color: '#64748B',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  footerValue: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
});
