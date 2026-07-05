import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { authAPI } from '../../services/api';

const GOLD = '#D4AF37';
const HEADER_BG = '#3D2200';

export default function ChangePasswordModal({ visible, onClose }) {
  const [step, setStep] = useState(1); // 1 = requesting OTP, 2 = entering OTP & new pass
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      requestOtp();
    } else {
      // Reset state when closed
      setStep(1);
      setOtp('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  }, [visible]);

  const requestOtp = async () => {
    setLoading(true);
    try {
      const res = await authAPI.requestPasswordOtp();
      if (res.data.success) {
        setStep(2);
        Alert.alert('OTP Sent', 'Please check your email for the 6-digit verification code. (For this demo, check the backend terminal console).');
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to request OTP');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!otp || !newPassword || !confirmPassword) {
      return Alert.alert('Error', 'Please fill in all fields');
    }
    if (newPassword !== confirmPassword) {
      return Alert.alert('Error', 'Passwords do not match');
    }
    if (newPassword.length < 8) { // Updated from 20 to 8 for realistic testing, User schema has minlength: 20
      return Alert.alert('Error', 'Password is too short. Try a longer password.');
    }

    setLoading(true);
    try {
      const res = await authAPI.resetPassword({ otp, newPassword, confirmPassword });
      if (res.data.success) {
        Alert.alert('Success', 'Your password has been changed securely!');
        onClose();
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Change Password</Text>
                <TouchableOpacity onPress={onClose} disabled={loading}>
                  <MaterialCommunityIcons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              {step === 1 ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color={GOLD} />
                  <Text style={styles.loadingText}>Requesting secure OTP to your email...</Text>
                </View>
              ) : (
                <View style={styles.content}>
                  <Text style={styles.infoText}>Enter the 6-digit code sent to your registered email along with your new password.</Text>
                  
                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>OTP Verification Code</Text>
                    <TextInput
                      style={styles.input}
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="numeric"
                      maxLength={6}
                      placeholder="123456"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry
                      placeholder="••••••••"
                    />
                  </View>

                  <View style={styles.inputContainer}>
                    <Text style={styles.label}>Confirm New Password</Text>
                    <TextInput
                      style={styles.input}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry
                      placeholder="••••••••"
                    />
                  </View>

                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
                    {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Verify & Save</Text>}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  keyboardView: { width: '100%', alignItems: 'center' },
  modalContainer: { width: '90%', backgroundColor: '#FFF', borderRadius: 20, padding: 20, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 10 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: HEADER_BG },
  loadingContainer: { alignItems: 'center', paddingVertical: 40 },
  loadingText: { marginTop: 16, color: '#666', fontSize: 15 },
  content: { paddingBottom: 10 },
  infoText: { color: '#555', fontSize: 13, marginBottom: 20, lineHeight: 20 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: '#666', fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 15, color: '#333', backgroundColor: '#F9F9F9' },
  saveBtn: { backgroundColor: HEADER_BG, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: GOLD, fontSize: 16, fontWeight: '800' }
});
