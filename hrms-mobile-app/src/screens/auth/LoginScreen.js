import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Mail, ShieldCheck, User, ArrowRight, Building2, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Button } from '../../components/common/Button';

export function LoginScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { login, authError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState('employee');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setErrorMessage('Please enter your Enterprise Email / Employee Code and Password');
      return;
    }
    setErrorMessage('');
    setLoading(true);
    const res = await login(email.trim(), password, selectedRole);
    setLoading(false);
    if (!res.success) {
      setErrorMessage(res.message || 'Invalid credentials or backend connection failed');
    }
  };

  const handleDemoFill = (type) => {
    if (type === 'emp') {
      setEmail('EMP001');
      setPassword('password123');
      setSelectedRole('employee');
    } else if (type === 'agent') {
      setEmail('agent@niss.com');
      setPassword('agent123');
      setSelectedRole('agent');
    }
    setErrorMessage('');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <LinearGradient
        colors={isDark ? ['#1E1B4B', '#090D16'] : ['#E0E7FF', '#F1F5F9']}
        style={styles.backgroundGlow}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Top Branding */}
        <View style={styles.headerArea}>
          <TouchableOpacity style={styles.logoBadge} onPress={toggleTheme} activeOpacity={0.8}>
            <Building2 size={32} color="#6366F1" />
          </TouchableOpacity>
          <Text style={[styles.appTitle, { color: theme.textPrimary }]}>NISS Enterprise</Text>
          <Text style={[styles.appSubtitle, { color: theme.textMuted }]}>
            Real Backend HRMS & Field Agent Mobile Portal
          </Text>
        </View>

        {/* Error Feedback Banner */}
        {(errorMessage || authError) ? (
          <View style={[styles.errorCard, { backgroundColor: theme.roseBg, borderColor: theme.rose }]}>
            <AlertCircle size={18} color={theme.rose} style={{ marginRight: 8 }} />
            <Text style={[styles.errorText, { color: theme.rose }]}>
              {errorMessage || authError}
            </Text>
          </View>
        ) : null}

        {/* Login Form Card */}
        <View style={[styles.formCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          {/* Role Selector Tabs */}
          <View style={[styles.roleTabContainer, { backgroundColor: theme.surfaceElevated }]}>
            <TouchableOpacity
              style={[
                styles.roleTab,
                selectedRole === 'employee' && { backgroundColor: theme.primary },
              ]}
              onPress={() => { setSelectedRole('employee'); setErrorMessage(''); }}
              activeOpacity={0.85}
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
              onPress={() => { setSelectedRole('agent'); setErrorMessage(''); }}
              activeOpacity={0.85}
            >
              <ShieldCheck size={16} color={selectedRole === 'agent' ? '#FFFFFF' : theme.textMuted} />
              <Text
                style={[
                  styles.roleTabText,
                  { color: selectedRole === 'agent' ? '#FFFFFF' : theme.textMuted },
                ]}
              >
                Agent Workspace
              </Text>
            </TouchableOpacity>
          </View>

          {/* Email / Emp Code Input */}
          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Enterprise Email or Employee Code</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.textPrimary }]}
                value={email}
                onChangeText={setEmail}
                placeholder="Enter Email or Emp Code (e.g. EMP001)"
                placeholderTextColor={theme.textMuted}
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
                placeholder="Enter your password"
                placeholderTextColor={theme.textMuted}
                secureTextEntry={!showPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={{ padding: 4 }}>
                {showPassword ? (
                  <EyeOff size={18} color={theme.textMuted} />
                ) : (
                  <Eye size={18} color={theme.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* Login Button */}
          <Button
            title={`Sign In to ${selectedRole === 'agent' ? 'Agent Workspace' : 'Employee Portal'}`}
            onPress={handleLogin}
            loading={loading}
            icon={ArrowRight}
            variant={selectedRole === 'agent' ? 'accent' : 'gradient'}
            style={styles.submitBtn}
          />

          {/* Quick Demo Helper Pills */}
          <Text style={[styles.demoLabel, { color: theme.textMuted }]}>Fill Test Credentials:</Text>
          <View style={styles.quickPillRow}>
            <TouchableOpacity
              style={[styles.quickPill, { backgroundColor: theme.primary + '1F', borderColor: theme.primary }]}
              onPress={() => handleDemoFill('emp')}
            >
              <User size={12} color={theme.primary} />
              <Text style={[styles.quickPillText, { color: theme.primary }]}>Employee (EMP001)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.quickPill, { backgroundColor: theme.violet + '1F', borderColor: theme.violet }]}
              onPress={() => handleDemoFill('agent')}
            >
              <ShieldCheck size={12} color={theme.violet} />
              <Text style={[styles.quickPillText, { color: theme.violet }]}>Agent Portal</Text>
            </TouchableOpacity>
          </View>

          {/* Server Connection Pill */}
          <Text style={[styles.serverNote, { color: theme.textMuted }]}>
            🌐 Backend Server: http://192.168.1.53:8000/api
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 40,
    justifyContent: 'center',
  },
  backgroundGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 24,
  },
  logoBadge: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
    borderWidth: 1.5,
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
    textAlign: 'center',
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    ...typography.caption,
    fontWeight: '600',
    flex: 1,
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
    paddingVertical: 11,
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
    fontWeight: '600',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 14,
    height: 50,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
  },
  submitBtn: {
    marginTop: 8,
  },
  demoLabel: {
    ...typography.micro,
    textAlign: 'center',
    marginTop: 18,
    marginBottom: 8,
    fontWeight: '600',
  },
  quickPillRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    gap: 6,
  },
  quickPillText: {
    ...typography.micro,
    fontWeight: '700',
  },
  serverNote: {
    ...typography.micro,
    textAlign: 'center',
    marginTop: 18,
  },
});
