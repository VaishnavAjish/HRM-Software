import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Lock, Mail, ArrowRight, Building2, Eye, EyeOff, AlertCircle, ShieldCheck } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { typography, shadows } from '../../theme';
import { Button } from '../../components/common/Button';
import { SetPasswordFlow } from './SetPasswordFlow';

export function LoginScreen() {
  const { theme } = useTheme();
  const { login } = useAuth();
  const [screen, setScreen] = useState('login'); // 'login' | 'setPassword'
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [focusedField, setFocusedField] = useState(null);

  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(18)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 500, useNativeDriver: true }),
      Animated.timing(slide, { toValue: 0, duration: 500, useNativeDriver: true }),
    ]).start();
  }, []);

  const canSubmit = !loading;

  const handleLogin = async () => {
    if (!canSubmit) return;
    if (!identifier.trim() || !password) {
      setError('Please enter your email/employee code and password.');
      return;
    }
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

  if (screen === 'setPassword') {
    return <SetPasswordFlow onDone={() => setScreen('login')} onCancel={() => setScreen('login')} />;
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { backgroundColor: theme.background }]}
        keyboardShouldPersistTaps="handled"
      >
        <LinearGradient colors={['#E0E7FF', theme.background]} style={styles.backgroundGlow} />
        <View style={[styles.blob, styles.blobOne, { backgroundColor: theme.primary, opacity: 0.1 }]} />
        <View style={[styles.blob, styles.blobTwo, { backgroundColor: theme.violet, opacity: 0.08 }]} />

        <Animated.View style={{ opacity: fade, transform: [{ translateY: slide }] }}>
          <View style={styles.headerArea}>
            <View style={[styles.logoBadge, { backgroundColor: '#EEF2FF', borderColor: theme.primary }, shadows.glow(theme.primary)]}>
              <Building2 size={30} color={theme.primary} />
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
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.surfaceElevated, borderColor: focusedField === 'id' ? theme.primary : theme.border },
                  focusedField === 'id' && shadows.glow(theme.primary),
                ]}
              >
                <Mail size={18} color={focusedField === 'id' ? theme.primary : theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={identifier}
                  onChangeText={setIdentifier}
                  onFocus={() => setFocusedField('id')}
                  onBlur={() => setFocusedField(null)}
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
              <View
                style={[
                  styles.inputWrapper,
                  { backgroundColor: theme.surfaceElevated, borderColor: focusedField === 'pw' ? theme.primary : theme.border },
                  focusedField === 'pw' && shadows.glow(theme.primary),
                ]}
              >
                <Lock size={18} color={focusedField === 'pw' ? theme.primary : theme.textMuted} style={styles.inputIcon} />
                <TextInput
                  style={[styles.input, { color: theme.textPrimary }]}
                  value={password}
                  onChangeText={setPassword}
                  onFocus={() => setFocusedField('pw')}
                  onBlur={() => setFocusedField(null)}
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
              <TouchableOpacity onPress={() => setScreen('setPassword')} style={styles.setPasswordLink}>
                <Text style={[styles.setPasswordText, { color: theme.primary }]}>Set Password</Text>
              </TouchableOpacity>
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

            <View style={styles.footerNoteRow}>
              <ShieldCheck size={13} color={theme.textMuted} />
              <Text style={[styles.footerNote, { color: theme.textMuted }]}>
                Your role is detected automatically after sign in
              </Text>
            </View>
          </View>
        </Animated.View>
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
    height: 340,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobOne: {
    width: 220,
    height: 220,
    top: -60,
    right: -60,
  },
  blobTwo: {
    width: 180,
    height: 180,
    top: 120,
    left: -70,
  },
  headerArea: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  appTitle: {
    ...typography.h1,
    fontSize: 30,
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
    borderWidth: 1.5,
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
  setPasswordLink: {
    alignSelf: 'flex-end',
    marginTop: 8,
  },
  setPasswordText: {
    ...typography.caption,
    fontWeight: '700',
  },
  submitBtn: {
    marginTop: 4,
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 18,
  },
  footerNote: {
    ...typography.micro,
  },
});
