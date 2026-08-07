import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Mail, ShieldCheck, User, ArrowRight, Building2 } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Button } from '../../components/common/Button';

export function LoginScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const [email, setEmail] = useState('alex.mercer@enterprise-hrms.com');
  const [password, setPassword] = useState('••••••••••••');
  const [selectedRole, setSelectedRole] = useState('employee');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    await login(email, password, selectedRole);
    setLoading(false);
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={['#1E1B4B', theme.background]}
        style={styles.backgroundGlow}
      />

      <View style={styles.headerArea}>
        <View style={styles.logoBadge}>
          <Building2 size={28} color="#818CF8" />
        </View>
        <Text style={[styles.appTitle, { color: theme.textPrimary }]}>NISS Enterprise</Text>
        <Text style={[styles.appSubtitle, { color: theme.textMuted }]}>Mobile Workforce & Agent Platform</Text>
      </View>

      <View style={[styles.formCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
        {/* Role Selector Tabs */}
        <View style={[styles.roleTabContainer, { backgroundColor: theme.surfaceElevated }]}>
          <TouchableOpacity
            style={[
              styles.roleTab,
              selectedRole === 'employee' && { backgroundColor: theme.primary },
            ]}
            onPress={() => setSelectedRole('employee')}
            activeOpacity={0.8}
          >
            <User size={16} color={selectedRole === 'employee' ? '#FFFFFF' : theme.textMuted} />
            <Text
              style={[
                styles.roleTabText,
                { color: selectedRole === 'employee' ? '#FFFFFF' : theme.textMuted },
              ]}
            >
              Employee Portal
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.roleTab,
              selectedRole === 'agent' && { backgroundColor: theme.violet },
            ]}
            onPress={() => setSelectedRole('agent')}
            activeOpacity={0.8}
          >
            <ShieldCheck size={16} color={selectedRole === 'agent' ? '#FFFFFF' : theme.textMuted} />
            <Text
              style={[
                styles.roleTabText,
                { color: selectedRole === 'agent' ? '#FFFFFF' : theme.textMuted },
              ]}
            >
              Agent Support
            </Text>
          </TouchableOpacity>
        </View>

        {/* Email Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Enterprise Email</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={email}
              onChangeText={setEmail}
              placeholder="name@company.com"
              placeholderTextColor={theme.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
        </View>

        {/* Password Input */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Password</Text>
          <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
            <Lock size={18} color={theme.textMuted} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { color: theme.textPrimary }]}
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={theme.textMuted}
              secureTextEntry
            />
          </View>
        </View>

        {/* Action Button */}
        <Button
          title={`Sign In as ${selectedRole === 'agent' ? 'Agent' : 'Employee'}`}
          onPress={handleLogin}
          loading={loading}
          icon={ArrowRight}
          variant={selectedRole === 'agent' ? 'accent' : 'gradient'}
          style={styles.submitBtn}
        />

        {/* Biometric quick note */}
        <Text style={[styles.biometricNote, { color: theme.textMuted }]}>
          🔒 Secured by Biometric & JWT Enterprise SSO
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
  },
  backgroundGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 320,
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(99, 102, 241, 0.2)',
    borderWidth: 1,
    borderColor: '#6366F1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  appTitle: {
    ...typography.h1,
  },
  appSubtitle: {
    ...typography.body,
    marginTop: 4,
  },
  formCard: {
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
  },
  roleTabContainer: {
    flexDirection: 'row',
    padding: 4,
    borderRadius: 18,
    marginBottom: 20,
  },
  roleTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    gap: 6,
  },
  roleTabText: {
    ...typography.caption,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    ...typography.caption,
    marginBottom: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 48,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  submitBtn: {
    marginTop: 10,
  },
  biometricNote: {
    ...typography.micro,
    textAlign: 'center',
    marginTop: 16,
  },
});
