import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { wakeServer } from '../services/api';
import LoginOtpModal from '../components/LoginOtpModal';
import ForgotPasswordModal from '../components/ForgotPasswordModal';

const GOLD = '#D4AF37';
const GOLD_DARK = '#B8962E';
const WHITE = '#FFFFFF';
const LIGHT_GRAY = '#F8F8F8';
const BORDER = '#E8E0CC';
const TEXT_DARK = '#1A1A1A';
const TEXT_GRAY = '#888888';

export default function LoginScreen({ navigation }) {
  const { login, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [wakeStatus, setWakeStatus] = useState(null);
  const [errors, setErrors] = useState({});
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [otpLoading, setOtpLoading] = useState(false);
  const [forgotModalVisible, setForgotModalVisible] = useState(false);

  const resetForm = useCallback(() => {
    setEmail('');
    setPassword('');
    setShowPassword(false);
    setErrors({});
    setOtpModalVisible(false);
    setOtpLoading(false);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      resetForm();
    }, [resetForm])
  );

  const validate = () => {
    const newErrors = {};
    if (!email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(email)) newErrors.email = 'Enter a valid email';
    if (!password) newErrors.password = 'Password is required';
    else if (password.length < 6) newErrors.password = 'Password must be at least 6 characters';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const attemptLogin = async () => {
    const res = await login(email.trim().toLowerCase(), password);
    if (res.requires_otp) setOtpModalVisible(true);
  };

  const isNetworkError = (err) =>
    err?.message === 'Network Error' ||
    err?.code === 'ERR_NETWORK' ||
    err?.code === 'ECONNREFUSED';

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await wakeServer(setWakeStatus);
      setWakeStatus(null);
      try {
        await attemptLogin();
      } catch (firstErr) {
        if (isNetworkError(firstErr)) {
          // Server process is up but not yet fully ready — wait and retry once
          setWakeStatus('Server is warming up, retrying...');
          await new Promise((r) => setTimeout(r, 6000));
          setWakeStatus(null);
          await attemptLogin();
        } else {
          throw firstErr;
        }
      }
    } catch (error) {
      console.error('[Login] error:', error?.code, error?.message, error?.response?.data);

      let title = 'Login Failed';
      let message;

      if (isNetworkError(error)) {
        title = 'Cannot Connect';
        message = 'The server could not be reached. Please check your internet connection and try again.';
      } else if (error?.code === 'ECONNABORTED') {
        title = 'Connection Timeout';
        message = 'The server took too long to respond. Please try again in a moment.';
      } else if (error?.response?.status === 429) {
        title = 'Too Many Attempts';
        message = 'Too many failed login attempts. Your account is locked for 15 minutes.\n\nPlease wait before trying again.';
      } else {
        message = error?.response?.data?.message || error?.message || 'An unexpected error occurred.';
      }

      Alert.alert(title, message);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (otp) => {
    setOtpLoading(true);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp);
      setOtpModalVisible(false);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || 'Failed to verify OTP.';
      Alert.alert('Verification Failed', message);
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="dark-content" backgroundColor={WHITE} />
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.logoContainer}>
            <Text style={styles.logoIcon}>💎</Text>
          </View>
          <Text style={styles.appName}>Sri Vaishnavi</Text>
          <Text style={styles.appSub}>Jewellers</Text>
          <View style={styles.goldDivider} />
        </View>

        {/* Card */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Welcome Back</Text>
          <Text style={styles.cardSubtitle}>Sign in to your account</Text>

          {/* Email */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Email Address</Text>
            <TextInput
              style={[styles.input, errors.email && styles.inputError]}
              value={email}
              onChangeText={(val) => { setEmail(val); setErrors((e) => ({ ...e, email: null })); }}
              placeholder="Enter your email"
              placeholderTextColor={TEXT_GRAY}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              importantForAutofill="no"
            />
            {errors.email ? <Text style={styles.errorText}>{errors.email}</Text> : null}
          </View>

          {/* Password */}
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Password</Text>
            <View style={[styles.passwordRow, errors.password && styles.inputError]}>
              <TextInput
                style={styles.passwordInput}
                value={password}
                onChangeText={(val) => { setPassword(val); setErrors((e) => ({ ...e, password: null })); }}
                placeholder="Enter your password"
                placeholderTextColor={TEXT_GRAY}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                onPress={() => setShowPassword((v) => !v)}
                style={styles.eyeButton}
                activeOpacity={0.7}
              >
                <Text style={styles.eyeText}>{showPassword ? 'Hide' : 'Show'}</Text>
              </TouchableOpacity>
            </View>
            {errors.password ? <Text style={styles.errorText}>{errors.password}</Text> : null}
          </View>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, loading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color={WHITE} size="small" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>
          {!!wakeStatus && (
            <Text style={styles.wakeStatusText}>{wakeStatus}</Text>
          )}

          {/* Forgot Password */}
          <TouchableOpacity
            style={styles.forgotButton}
            onPress={() => setForgotModalVisible(true)}
            activeOpacity={0.7}
          >
            <Text style={styles.forgotText}>Forgot Password?</Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>Sri Vaishnavi Jewellers © 2024</Text>
      </ScrollView>

      <LoginOtpModal
        visible={otpModalVisible}
        email={email}
        loading={otpLoading}
        onVerify={handleVerifyOtp}
        onCancel={() => setOtpModalVisible(false)}
      />

      <ForgotPasswordModal
        visible={forgotModalVisible}
        onClose={() => setForgotModalVisible(false)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: WHITE,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  header: {
    alignItems: 'center',
    marginBottom: 36,
  },
  logoContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: LIGHT_GRAY,
    borderWidth: 2,
    borderColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  logoIcon: {
    fontSize: 36,
  },
  appName: {
    fontSize: 26,
    fontWeight: '700',
    color: TEXT_DARK,
    letterSpacing: 0.5,
  },
  appSub: {
    fontSize: 16,
    color: GOLD_DARK,
    fontWeight: '500',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
  },
  goldDivider: {
    width: 48,
    height: 2,
    backgroundColor: GOLD,
    borderRadius: 1,
    marginTop: 14,
  },
  card: {
    backgroundColor: WHITE,
    borderRadius: 16,
    padding: 28,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: TEXT_DARK,
    marginBottom: 4,
  },
  cardSubtitle: {
    fontSize: 14,
    color: TEXT_GRAY,
    marginBottom: 24,
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: TEXT_DARK,
    marginBottom: 8,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontSize: 15,
    color: TEXT_DARK,
    backgroundColor: LIGHT_GRAY,
  },
  inputError: {
    borderColor: '#E53E3E',
  },
  passwordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 48,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 10,
    backgroundColor: LIGHT_GRAY,
    paddingLeft: 14,
  },
  passwordInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_DARK,
  },
  eyeButton: {
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
  },
  eyeText: {
    fontSize: 13,
    color: GOLD_DARK,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: '#E53E3E',
    marginTop: 4,
    marginLeft: 2,
  },
  loginButton: {
    height: 50,
    backgroundColor: GOLD,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  loginButtonDisabled: {
    opacity: 0.7,
  },
  loginButtonText: {
    color: WHITE,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  wakeStatusText: {
    textAlign: 'center',
    fontSize: 12,
    color: GOLD_DARK,
    marginTop: 8,
  },
  forgotButton: {
    alignItems: 'center',
    marginTop: 14,
    paddingVertical: 4,
  },
  forgotText: {
    fontSize: 14,
    color: GOLD_DARK,
    fontWeight: '600',
  },
  footer: {
    textAlign: 'center',
    color: TEXT_GRAY,
    fontSize: 12,
    marginTop: 32,
  },
});
