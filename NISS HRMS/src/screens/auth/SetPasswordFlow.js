import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import {
  UserCheck, Smartphone, KeyRound, CheckCircle2, AlertCircle, Eye, EyeOff, ChevronLeft, ArrowRight,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { typography, shadows } from '../../theme';
import { api, ApiError } from '../../services/api';
import { Button } from '../../components/common/Button';
import { OtpInput } from '../../components/auth/OtpInput';
import { COMPANY_OPTIONS } from '../../utils/companyConfig';

function companyLabel(code) {
  return COMPANY_OPTIONS.find((o) => o.value === code)?.label || code;
}

const STEPS = [
  { icon: UserCheck, label: 'Verify Employee' },
  { icon: Smartphone, label: 'Verify Mobile' },
  { icon: KeyRound, label: 'Set Password' },
];

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{6,}$/;

function passwordStrength(pw) {
  if (pw.length === 0) return null;
  if (pw.length < 6) return { label: 'Too short', tone: 'rose', pct: 25 };
  if (pw.length < 9) return { label: 'Fair', tone: 'amber', pct: 50 };
  if (pw.length < 12) return { label: 'Good', tone: 'primary', pct: 75 };
  return { label: 'Strong', tone: 'emerald', pct: 100 };
}

function StepBar({ current }) {
  const { theme } = useTheme();
  return (
    <View style={styles.stepBar}>
      {STEPS.map((s, i) => {
        const done = i < current;
        const active = i === current;
        const color = done ? theme.emerald : active ? theme.primary : theme.textMuted;
        return (
          <React.Fragment key={s.label}>
            <View style={styles.stepNode}>
              <View
                style={[
                  styles.stepCircle,
                  {
                    borderColor: color,
                    backgroundColor: active ? theme.primary + '15' : done ? theme.emeraldBg : 'transparent',
                  },
                ]}
              >
                {done ? <CheckCircle2 size={16} color={theme.emerald} /> : <Text style={[styles.stepNum, { color }]}>{i + 1}</Text>}
              </View>
              <Text style={[styles.stepLabel, { color: active ? theme.textPrimary : theme.textMuted }]}>{s.label}</Text>
            </View>
            {i < STEPS.length - 1 ? (
              <View style={[styles.stepLine, { backgroundColor: done ? theme.emerald : theme.border }]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function ErrorBanner({ message }) {
  const { theme } = useTheme();
  if (!message) return null;
  return (
    <View style={[styles.errorBanner, { backgroundColor: theme.roseBg, borderColor: theme.rose + '40' }]}>
      <AlertCircle size={16} color={theme.rose} />
      <Text style={[styles.errorText, { color: theme.rose }]}>{message}</Text>
    </View>
  );
}

export function SetPasswordFlow({ onDone, onCancel }) {
  const { theme } = useTheme();
  const [step, setStep] = useState(0);
  const [error, setError] = useState(null);

  // Step 1
  const [empCode, setEmpCode] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [companyCode, setCompanyCode] = useState('');
  const [unit, setUnit] = useState('');
  const [checkingEmpCode, setCheckingEmpCode] = useState(false);
  const [empCodeChecked, setEmpCodeChecked] = useState(false);
  const [verifying1, setVerifying1] = useState(false);
  const [verificationToken, setVerificationToken] = useState(null);

  // Step 2
  const [email, setEmail] = useState('');
  const [mobileLocked, setMobileLocked] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState('');
  const [otpStatus, setOtpStatus] = useState('idle');

  // Step 3
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitting3, setSubmitting3] = useState(false);
  const [done, setDone] = useState(false);

  const strength = passwordStrength(password);

  const runEmpCodeCheck = async (code) => {
    if (!code.trim()) return;
    setCheckingEmpCode(true);
    setEmpCodeChecked(false);
    try {
      const res = await api.checkEmpCode(code.trim());
      if (res?.status) {
        setCompanyCode(res.company_code || '');
        setUnit(res.unit || '');
      } else {
        setCompanyCode('');
        setUnit('');
      }
    } catch (e) {
      setCompanyCode('');
      setUnit('');
    } finally {
      setEmpCodeChecked(true);
      setCheckingEmpCode(false);
    }
  };

  const onEmpCodeBlur = () => runEmpCodeCheck(empCode);

  const submitStep1 = async () => {
    setError(null);
    if (!empCode.trim()) return setError('Enter your employee code.');
    if (!/^\d{10}$/.test(mobileNumber.trim())) return setError('Enter a valid 10-digit mobile number.');

    // Belt-and-braces: guarantees company/unit are resolved even if the field
    // never blurred (e.g. the user tapped straight from the keyboard).
    if (!empCodeChecked) await runEmpCodeCheck(empCode);

    setVerifying1(true);
    try {
      const fd = new FormData();
      fd.append('emp_code', empCode.trim());
      fd.append('company_code', companyCode || 'nidhi-impex');
      if (unit) fd.append('unit', unit);
      fd.append('mobile_number', mobileNumber.trim());
      fd.append('type', '0');

      const res = await api.verifyEmployeeIdentity(fd);
      if (res?.status) {
        setVerificationToken(res.verification_token || null);
        if (res.data?.email) setEmail(res.data.email);
        setStep(1);
      } else {
        setError(res?.message || 'Could not verify your identity.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not verify your identity.');
    } finally {
      setVerifying1(false);
    }
  };

  const sendOtp = async () => {
    setError(null);
    const targetMobile = mobileNumber.trim();
    if (!/^\d{10}$/.test(targetMobile)) return setError('Enter a valid 10-digit mobile number.');

    setSendingOtp(true);
    setDevOtp('');
    try {
      const res = await api.sendPasswordResetOtp({
        mobile_number: targetMobile,
        mobile: targetMobile,
        email: email.trim() || undefined,
        emp_code: empCode.trim(),
        verification_token: verificationToken,
        company_code: companyCode || 'nidhi-impex',
        unit,
      });
      if (res?.status || res?.dev_otp) {
        setMobileLocked(true);
        setOtp('');
        setOtpStatus('idle');
        if (res?.dev_otp) setDevOtp(res.dev_otp);
      } else {
        setError(res?.message || 'Could not send verification OTP to your mobile.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send verification OTP to your mobile.');
    } finally {
      setSendingOtp(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    setError(null);
    setOtpStatus('verifying');
    const targetMobile = mobileNumber.trim();
    try {
      const res = await api.verifyPasswordResetOtp({
        mobile_number: targetMobile,
        mobile: targetMobile,
        email: email.trim() || undefined,
        emp_code: empCode.trim(),
        verification_token: verificationToken,
        otp,
      });
      if (res?.status) {
        setOtpStatus('success');
      } else {
        setOtpStatus('error');
        setError(res?.message || 'Incorrect OTP. Please try again.');
        setTimeout(() => {
          setOtpStatus('idle');
          setOtp('');
        }, 900);
      }
    } catch (e) {
      setOtpStatus('error');
      setError(e instanceof ApiError ? e.message : 'Incorrect OTP. Please try again.');
      setTimeout(() => {
        setOtpStatus('idle');
        setOtp('');
      }, 900);
    }
  };

  const submitStep3 = async () => {
    setError(null);
    if (!PASSWORD_REGEX.test(password)) {
      return setError('Password must be at least 6 characters and include 1 uppercase, 1 lowercase, 1 number, and 1 special character.');
    }
    if (password !== confirmPassword) return setError('Passwords do not match.');

    setSubmitting3(true);
    const targetMobile = mobileNumber.trim();
    try {
      const res = await api.setNewPasswordAfterVerification({
        mobile_number: targetMobile,
        mobile: targetMobile,
        email: email.trim() || undefined,
        emp_code: empCode.trim(),
        verification_token: verificationToken,
        password,
        otp,
      });
      if (res?.status) {
        setDone(true);
      } else {
        setError(res?.message || 'Could not set your password.');
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not set your password.');
    } finally {
      setSubmitting3(false);
    }
  };

  if (done) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.doneWrap}>
          <View style={[styles.doneIconWrap, { backgroundColor: theme.emeraldBg }]}>
            <CheckCircle2 size={48} color={theme.emerald} />
          </View>
          <Text style={[styles.doneTitle, { color: theme.textPrimary }]}>Password set</Text>
          <Text style={[styles.doneSubtitle, { color: theme.textMuted }]}>
            You can now sign in with your new password.
          </Text>
          <Button title="Back to Sign In" onPress={onDone} variant="gradient" style={{ marginTop: 24, width: '100%' }} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <TouchableOpacity onPress={onCancel} style={styles.backRow} activeOpacity={0.7}>
          <ChevronLeft size={18} color={theme.primary} />
          <Text style={[styles.backText, { color: theme.primary }]}>Back to Sign In</Text>
        </TouchableOpacity>

        <StepBar current={step} />

        <View style={[styles.card, { backgroundColor: theme.surfaceCard, borderColor: theme.border }, shadows.glass]}>
          <ErrorBanner message={error} />

          {step === 0 && (
            <>
              <View style={styles.stepHeader}>
                <View style={[styles.stepHeaderIcon, { backgroundColor: theme.primary + '15' }]}>
                  <UserCheck size={20} color={theme.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Verify Employee</Text>
                  <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
                    First time here? Confirm your employee code and registered mobile number to get started.
                  </Text>
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Employee Code</Text>
              <TextInput
                style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                value={empCode}
                onChangeText={(v) => setEmpCode(v.toUpperCase())}
                onBlur={onEmpCodeBlur}
                placeholder="e.g. NI1234"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="characters"
              />
              <View style={styles.autoDetectRow}>
                <View style={styles.autoDetectField}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Company</Text>
                  <View style={[styles.readonlyBox, { backgroundColor: theme.border, borderColor: theme.border }]}>
                    <Text style={[styles.readonlyBoxText, { color: companyCode ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                      {checkingEmpCode ? 'Detecting…' : companyCode ? companyLabel(companyCode) : 'Auto-detected'}
                    </Text>
                  </View>
                </View>
                <View style={styles.autoDetectField}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>Branch / Unit</Text>
                  <View style={[styles.readonlyBox, { backgroundColor: theme.border, borderColor: theme.border }]}>
                    <Text style={[styles.readonlyBoxText, { color: unit ? theme.textPrimary : theme.textMuted }]} numberOfLines={1}>
                      {checkingEmpCode ? 'Detecting…' : unit || 'Auto-detected'}
                    </Text>
                  </View>
                </View>
              </View>
              {empCodeChecked && !checkingEmpCode ? (
                companyCode ? (
                  <Text style={[styles.hint, { color: theme.emerald }]}>
                    Detected {companyLabel(companyCode)}{unit ? ` — ${unit}` : ''}
                  </Text>
                ) : (
                  <Text style={[styles.hint, { color: theme.textMuted }]}>
                    Couldn't auto-detect this employee code — you can still continue.
                  </Text>
                )
              ) : null}

              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 14 }]}>Mobile Number</Text>
              <TextInput
                style={[styles.input, { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}
                value={mobileNumber}
                onChangeText={(v) => setMobileNumber(v.replace(/\D/g, '').slice(0, 10))}
                keyboardType="number-pad"
                maxLength={10}
                placeholder="10-digit mobile number"
                placeholderTextColor={theme.textMuted}
              />

              <Button title="Verify & Next" onPress={submitStep1} loading={verifying1} icon={ArrowRight} variant="gradient" style={styles.actionBtn} />
            </>
          )}

          {step === 1 && (
            <>
              <View style={styles.stepHeader}>
                <View style={[styles.stepHeaderIcon, { backgroundColor: theme.cyanBg }]}>
                  <Smartphone size={20} color={theme.cyan} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Verify Mobile</Text>
                  <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>
                    Confirm your registered mobile number to receive a one-time password.
                  </Text>
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>Mobile Number</Text>
              <View style={styles.inlineRow}>
                <TextInput
                  style={[
                    styles.input,
                    styles.inlineInput,
                    { color: theme.textPrimary, backgroundColor: theme.surfaceElevated, borderColor: theme.border },
                    mobileLocked && { opacity: 0.6 },
                  ]}
                  value={mobileNumber}
                  onChangeText={(v) => setMobileNumber(v.replace(/\D/g, '').slice(0, 10))}
                  editable={!mobileLocked}
                  placeholder="10-digit mobile number"
                  placeholderTextColor={theme.textMuted}
                  keyboardType="number-pad"
                  maxLength={10}
                />
                {!mobileLocked && (
                  <Button title="Send OTP" onPress={sendOtp} loading={sendingOtp} variant="gradient" size="small" style={styles.sendBtn} />
                )}
              </View>

              {mobileLocked && (
                <View style={styles.sentRow}>
                  <Text style={[styles.hint, { color: theme.emerald }]}>OTP sent to {mobileNumber} {devOtp ? `(Dev Code: ${devOtp})` : ''}</Text>
                  <TouchableOpacity
                    onPress={() => {
                      setMobileLocked(false);
                      setOtp('');
                      setOtpStatus('idle');
                    }}
                  >
                    <Text style={[styles.linkText, { color: theme.primary }]}>Change mobile</Text>
                  </TouchableOpacity>
                </View>
              )}

              {mobileLocked && (
                <>
                  <Text style={[styles.otpLabel, { color: theme.textSecondary }]}>Enter 6-digit OTP</Text>
                  <OtpInput value={otp} onChange={setOtp} status={otpStatus} onSuccessEnd={() => setStep(2)} />

                  {otpStatus !== 'success' && (
                    <>
                      <Button
                        title="Verify & Next"
                        onPress={verifyOtp}
                        loading={otpStatus === 'verifying'}
                        disabled={otp.length !== 6}
                        icon={ArrowRight}
                        variant="gradient"
                        style={styles.actionBtn}
                      />
                      <TouchableOpacity onPress={sendOtp} style={styles.resendBtn} disabled={sendingOtp}>
                        <Text style={[styles.linkText, { color: theme.primary, textAlign: 'center' }]}>
                          Didn't receive it? Resend OTP
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <View style={styles.stepHeader}>
                <View style={[styles.stepHeaderIcon, { backgroundColor: theme.emeraldBg }]}>
                  <KeyRound size={20} color={theme.emerald} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, { color: theme.textPrimary }]}>Set New Password</Text>
                  <Text style={[styles.stepSubtitle, { color: theme.textMuted }]}>Choose a strong password for your account.</Text>
                </View>
              </View>

              <Text style={[styles.label, { color: theme.textSecondary }]}>New Password</Text>
              <View style={[styles.input, styles.passwordRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.passwordInput, { color: theme.textPrimary }]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!showPassword}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowPassword((v) => !v)} hitSlop={8}>
                  {showPassword ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
                </TouchableOpacity>
              </View>

              {strength && (
                <View style={styles.strengthWrap}>
                  <View style={[styles.strengthTrack, { backgroundColor: theme.surfaceElevated }]}>
                    <View style={[styles.strengthFill, { width: `${strength.pct}%`, backgroundColor: theme[strength.tone] || theme.primary }]} />
                  </View>
                  <Text style={[styles.hint, { color: theme[strength.tone] || theme.primary }]}>{strength.label}</Text>
                </View>
              )}

              <Text style={[styles.label, { color: theme.textSecondary, marginTop: 14 }]}>Confirm Password</Text>
              <View style={[styles.input, styles.passwordRow, { backgroundColor: theme.surfaceElevated, borderColor: theme.border }]}>
                <TextInput
                  style={[styles.passwordInput, { color: theme.textPrimary }]}
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showConfirm}
                  placeholder="••••••••"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                />
                <TouchableOpacity onPress={() => setShowConfirm((v) => !v)} hitSlop={8}>
                  {showConfirm ? <EyeOff size={18} color={theme.textMuted} /> : <Eye size={18} color={theme.textMuted} />}
                </TouchableOpacity>
              </View>

              <Button title="Set Password" onPress={submitStep3} loading={submitting3} icon={CheckCircle2} variant="emerald" style={styles.actionBtn} />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    paddingTop: 50,
    paddingBottom: 60,
  },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 20 },
  backText: { ...typography.body, fontWeight: '600' },
  stepBar: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 20, paddingHorizontal: 4 },
  stepNode: { alignItems: 'center', width: 78 },
  stepCircle: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  stepNum: { ...typography.caption, fontWeight: '700' },
  stepLabel: { ...typography.micro, marginTop: 6, textAlign: 'center' },
  stepLine: { flex: 1, height: 2, marginTop: 15 },
  card: { borderRadius: 24, padding: 20, borderWidth: 1 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 16 },
  errorText: { ...typography.caption, fontWeight: '600', flexShrink: 1 },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 20 },
  stepHeaderIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepTitle: { ...typography.h4, marginBottom: 4 },
  stepSubtitle: { ...typography.caption },
  label: { ...typography.caption, marginBottom: 6 },
  input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, height: 48, fontSize: 14 },
  hint: { ...typography.micro, marginTop: 6 },
  autoDetectRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  autoDetectField: { flex: 1 },
  readonlyBox: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, height: 44, justifyContent: 'center' },
  readonlyBoxText: { fontSize: 13, fontWeight: '600' },
  inlineRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  inlineInput: { flex: 1 },
  sendBtn: { height: 48 },
  sentRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  linkText: { ...typography.caption, fontWeight: '700' },
  otpLabel: { ...typography.caption, textAlign: 'center', marginTop: 18, marginBottom: 12 },
  actionBtn: { marginTop: 20 },
  resendBtn: { marginTop: 14 },
  passwordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  passwordInput: { flex: 1, fontSize: 14 },
  strengthWrap: { marginTop: 8 },
  strengthTrack: { height: 5, borderRadius: 3, overflow: 'hidden' },
  strengthFill: { height: '100%', borderRadius: 3 },
  doneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  doneIconWrap: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  doneTitle: { ...typography.h2, marginBottom: 8 },
  doneSubtitle: { ...typography.body, textAlign: 'center' },
});
