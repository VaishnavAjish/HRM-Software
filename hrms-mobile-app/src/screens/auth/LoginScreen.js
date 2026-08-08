import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Mail, ArrowRight, Building2, Eye, EyeOff, AlertCircle } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Button } from '../../components/common/Button';

export function LoginScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const canSubmit = identifier.trim().length > 0 && password.length > 0 && !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res = await login(identifier.trim(), password);
      if (!res.success) {
        setError(res.message || 'Invalid credentials');
      }
    } catch (e) {
      setError(e.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={['#1E1B4B', theme.background]} style={styles.backgroundGlow} />

        <View style={styles.headerArea}>
          <View style={styles.logoBadge}>
            <Building2 size={28} color="#818CF8" />
          </View>
          <Text style={[styles.appTitle, { color: theme.textPrimary }]}>NISS Enterprise</Text>
          <Text style={[styles.appSubtitle, { color: theme.textMuted }]}>Employee & Agent Portal</Text>
        </View>

        <View style={[styles.formCard, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]}>
              <AlertCircle size={16} color={theme.rose} />
              <Text style={[styles.errorText, { color: theme.rose }]}>{error}</Text>
            </View>
          ) : null}

          <View style={styles.inputGroup}>
            <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>Email or Employee Code</Text>
            <View style={[styles.inputWrapper, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
              <Mail size={18} color={theme.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { color: theme.textPrimary }]}
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="name@company.com or EMP001"
                placeholderTextColor={theme.textMuted}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          </View>

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
                secureTextEntry={!showPassword}
                autoCapitalize="none"
              />
              <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                {showPassword ? (
                  <EyeOff size={18} color={theme.textMuted} />
                ) : (
                  <Eye size={18} color={theme.textMuted} />
                )}
              </TouchableOpacity>
            </View>
          </View>

          <Button
            title="Sign In"
            onPress={handleLogin}
            loading={loading}
            disabled={!canSubmit}
            icon={ArrowRight}
            variant="gradient"
            style={styles.submitBtn}
          />

          <Text style={[styles.footerNote, { color: theme.textMuted }]}>
            Your role (Employee or Agent) is detected automatically after sign in.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingVertical: 40,
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
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  errorText: {
    ...typography.caption,
    fontWeight: '600',
    flexShrink: 1,
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
  footerNote: {
    ...typography.micro,
    textAlign: 'center',
    marginTop: 16,
  },
});
