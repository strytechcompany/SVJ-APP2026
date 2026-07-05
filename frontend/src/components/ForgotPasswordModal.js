import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
  ScrollView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authAPI, wakeServer } from '../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#3D2200';
const LIGHT_GRAY = '#F8F8F8';
const BORDER = '#E8E0CC';
const TEXT_DARK = '#1A1A1A';
const TEXT_GRAY = '#888888';
const ERROR_RED = '#E53E3E';

const STEPS = [
  { icon: 'lock-reset',        title: 'Account Recovery',  subtitle: 'Enter your registered email to receive a password reset OTP.' },
  { icon: 'email-check-outline', title: 'Verify OTP',      subtitle: null },
  { icon: 'lock-check-outline',  title: 'New Password',    subtitle: 'Create a strong new password for your account.' },
];

export default function ForgotPasswordModal({ visible, onClose }) {
  const [step, setStep]                     = useState(1);
  const [email, setEmail]                   = useState('');
  const [emailError, setEmailError]         = useState('');
  const [otp, setOtp]                       = useState('');
  const [newPassword, setNewPassword]       = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPwd, setShowNewPwd]         = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [loading, setLoading]               = useState(false);
  const [wakeStatus, setWakeStatus]         = useState(null);
  const submitRef                           = useRef(false);

  const reset = () => {
    setStep(1);
    setEmail('');
    setEmailError('');
    setOtp('');
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPwd(false);
    setShowConfirmPwd(false);
    setLoading(false);
    setWakeStatus(null);
    submitRef.current = false;
  };

  const handleClose = () => { reset(); onClose(); };

  // ── Step 1: send OTP ──────────────────────────────────────────────────────
  const handleSendOtp = async () => {
    if (submitRef.current) return;
    const emailTrimmed = email.trim().toLowerCase();
    if (!emailTrimmed) { setEmailError('Email address is required'); return; }
    if (!/\S+@\S+\.\S+/.test(emailTrimmed)) { setEmailError('Enter a valid email address'); return; }
    setEmailError('');
    submitRef.current = true;
    setLoading(true);
    try {
      await wakeServer(setWakeStatus);
      setWakeStatus(null);
      await authAPI.forgotPassword(emailTrimmed);
      setEmail(emailTrimmed);
      setStep(2);
    } catch (err) {
      Alert.alert('Not Found', err?.response?.data?.message || 'Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  };

  // ── Step 2: resend OTP ────────────────────────────────────────────────────
  const handleResendOtp = async () => {
    if (submitRef.current) return;
    submitRef.current = true;
    setLoading(true);
    try {
      await authAPI.forgotPassword(email);
      setOtp('');
      Alert.alert('OTP Resent', 'A new code has been sent to your email.');
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to resend OTP.');
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  };

  // ── Step 2 → 3: validate OTP locally then advance ─────────────────────────
  const handleContinue = () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter the full 6-digit code from your email.');
      return;
    }
    setStep(3);
  };

  // ── Step 3: reset password ────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (submitRef.current) return;
    if (newPassword.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'Passwords do not match.');
      return;
    }
    submitRef.current = true;
    setLoading(true);
    try {
      await authAPI.resetForgotPassword({ email, otp, newPassword, confirmPassword });
      Alert.alert(
        'Password Reset',
        'Your password has been reset successfully. Please log in with your new password.',
        [{ text: 'Login Now', onPress: handleClose }],
      );
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.message || 'Failed to reset password.';
      if (status === 401) {
        // Wrong OTP — bounce back to step 2 to re-enter
        Alert.alert('Invalid OTP', message, [
          { text: 'Try Again', onPress: () => { setStep(2); setOtp(''); } },
        ]);
      } else {
        Alert.alert('Error', message);
      }
    } finally {
      setLoading(false);
      submitRef.current = false;
    }
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const renderStep1 = () => (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Email Address</Text>
        <TextInput
          style={[styles.input, emailError ? styles.inputError : null]}
          value={email}
          onChangeText={(v) => { setEmail(v); setEmailError(''); }}
          placeholder="Enter your registered email"
          placeholderTextColor={TEXT_GRAY}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
        />
        {!!emailError && <Text style={styles.errorText}>{emailError}</Text>}
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.btnDisabled]}
        onPress={handleSendOtp}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#FFF" size="small" />
          : <Text style={styles.primaryBtnText}>Send OTP</Text>}
      </TouchableOpacity>
      {!!wakeStatus && (
        <Text style={styles.wakeStatusText}>{wakeStatus}</Text>
      )}
    </>
  );

  const renderStep2 = () => (
    <>
      <View style={styles.sentToBox}>
        <MaterialCommunityIcons name="email-fast-outline" size={20} color={GOLD} />
        <Text style={styles.sentToText}>Code sent to <Text style={styles.sentToEmail}>{email}</Text></Text>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>6-Digit OTP</Text>
        <TextInput
          style={[styles.input, styles.otpInput]}
          value={otp}
          onChangeText={setOtp}
          keyboardType="numeric"
          maxLength={6}
          placeholder="• • • • • •"
          placeholderTextColor={BORDER}
          textAlign="center"
          autoFocus
        />
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, otp.length < 6 && styles.btnDisabled]}
        onPress={handleContinue}
        disabled={otp.length < 6}
        activeOpacity={0.85}
      >
        <Text style={styles.primaryBtnText}>Continue →</Text>
      </TouchableOpacity>

      <View style={styles.rowLinks}>
        <TouchableOpacity onPress={() => { setStep(1); setOtp(''); }} disabled={loading}>
          <Text style={styles.linkText}>← Change Email</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleResendOtp} disabled={loading}>
          {loading
            ? <ActivityIndicator size="small" color={DARK_BROWN} />
            : <Text style={styles.linkText}>Resend OTP</Text>}
        </TouchableOpacity>
      </View>
    </>
  );

  const renderStep3 = () => (
    <>
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>New Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={newPassword}
            onChangeText={setNewPassword}
            placeholder="Minimum 6 characters"
            placeholderTextColor={TEXT_GRAY}
            secureTextEntry={!showNewPwd}
            autoCapitalize="none"
            autoFocus
          />
          <TouchableOpacity onPress={() => setShowNewPwd((v) => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showNewPwd ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Confirm Password</Text>
        <View style={styles.passwordRow}>
          <TextInput
            style={styles.passwordInput}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Re-enter your password"
            placeholderTextColor={TEXT_GRAY}
            secureTextEntry={!showConfirmPwd}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowConfirmPwd((v) => !v)} style={styles.eyeBtn}>
            <Text style={styles.eyeText}>{showConfirmPwd ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryBtn, loading && styles.btnDisabled]}
        onPress={handleResetPassword}
        disabled={loading}
        activeOpacity={0.85}
      >
        {loading
          ? <ActivityIndicator color="#FFF" size="small" />
          : <Text style={styles.primaryBtnText}>Reset Password</Text>}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setStep(2)} disabled={loading} style={styles.backLink}>
        <Text style={styles.linkText}>← Back to OTP</Text>
      </TouchableOpacity>
    </>
  );

  const currentStep = STEPS[step - 1];

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.kavWrapper}
          >
            <View style={styles.sheet}>

              {/* ── Progress dots ── */}
              <View style={styles.progressRow}>
                {[1, 2, 3].map((n) => (
                  <View
                    key={n}
                    style={[
                      styles.dot,
                      step >= n && styles.dotActive,
                      step === n && styles.dotCurrent,
                    ]}
                  />
                ))}
              </View>

              {/* ── Header bar ── */}
              <View style={styles.header}>
                <View style={styles.headerLeft}>
                  <MaterialCommunityIcons name={currentStep.icon} size={22} color={GOLD} />
                  <Text style={styles.headerTitle}>{currentStep.title}</Text>
                </View>
                <TouchableOpacity onPress={handleClose} disabled={loading} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <MaterialCommunityIcons name="close" size={22} color="#555" />
                </TouchableOpacity>
              </View>

              {/* ── Sub-title ── */}
              {currentStep.subtitle && (
                <Text style={styles.subtitle}>{currentStep.subtitle}</Text>
              )}
              {step === 2 && (
                <Text style={styles.subtitle}>
                  Check your inbox and enter the 6-digit code we sent you.
                </Text>
              )}

              {/* ── Step content ── */}
              <ScrollView
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={styles.scrollArea}
              >
                {step === 1 && renderStep1()}
                {step === 2 && renderStep2()}
                {step === 3 && renderStep3()}
              </ScrollView>

            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  kavWrapper: { width: '100%' },
  sheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: Platform.OS === 'ios' ? 40 : 32,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 20,
    maxHeight: '92%',
  },
  // Progress
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginBottom: 20,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0D0B0',
  },
  dotActive: { backgroundColor: GOLD },
  dotCurrent: { width: 22, borderRadius: 4 },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 19, fontWeight: '800', color: DARK_BROWN },
  subtitle: {
    fontSize: 13,
    color: TEXT_GRAY,
    lineHeight: 19,
    marginBottom: 22,
    marginTop: 2,
  },
  scrollArea: { flexGrow: 0 },
  // Fields
  fieldGroup: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, marginBottom: 8 },
  input: {
    height: 50,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: TEXT_DARK,
    backgroundColor: LIGHT_GRAY,
  },
  inputError: { borderColor: ERROR_RED },
  errorText: { fontSize: 12, color: ERROR_RED, marginTop: 4, marginLeft: 2 },
  otpInput: {
    height: 66,
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 14,
    borderColor: GOLD,
    borderWidth: 2,
    color: DARK_BROWN,
    textAlign: 'center',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: LIGHT_GRAY,
    paddingLeft: 14,
  },
  passwordInput: { flex: 1, fontSize: 15, color: TEXT_DARK },
  eyeBtn: { paddingHorizontal: 14, height: '100%', justifyContent: 'center' },
  eyeText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  // Sent-to box
  sentToBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFBF0',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8D9A0',
  },
  sentToText: { fontSize: 13, color: '#555', flex: 1 },
  sentToEmail: { fontWeight: '700', color: DARK_BROWN },
  // Buttons
  primaryBtn: {
    height: 52,
    backgroundColor: DARK_BROWN,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.55 },
  primaryBtnText: { color: GOLD, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  // Links
  rowLinks: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  backLink: { marginTop: 14, alignSelf: 'flex-start' },
  linkText: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  wakeStatusText: { textAlign: 'center', fontSize: 12, color: '#888', marginTop: 8 },
});
