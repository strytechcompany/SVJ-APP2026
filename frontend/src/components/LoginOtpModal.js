import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ActivityIndicator, Alert, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const HEADER_BG = '#3D2200';

export default function LoginOtpModal({ visible, email, onVerify, onCancel, loading }) {
  const [otp, setOtp] = useState('');

  const handleVerify = () => {
    if (otp.length !== 6) {
      return Alert.alert('Error', 'Please enter a valid 6-digit OTP');
    }
    onVerify(otp);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <View style={styles.overlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.keyboardView}>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>Two-Step Verification</Text>
                <TouchableOpacity onPress={onCancel} disabled={loading}>
                  <MaterialCommunityIcons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.content}>
                <MaterialCommunityIcons name="email-check" size={48} color={GOLD} style={styles.icon} />
                <Text style={styles.infoText}>We sent a 6-digit verification code to</Text>
                <Text style={styles.emailText}>{email}</Text>
                
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    value={otp}
                    onChangeText={setOtp}
                    keyboardType="numeric"
                    maxLength={6}
                    placeholder="Enter 6-digit OTP"
                    textAlign="center"
                    autoFocus
                  />
                </View>

                <TouchableOpacity style={styles.verifyBtn} onPress={handleVerify} disabled={loading || otp.length < 6}>
                  {loading ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.verifyBtnText}>Verify to Login</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  keyboardView: { width: '100%', alignItems: 'center' },
  modalContainer: { width: '100%', backgroundColor: '#FFF', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 40, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 10, elevation: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: HEADER_BG },
  content: { alignItems: 'center' },
  icon: { marginBottom: 15 },
  infoText: { color: '#555', fontSize: 15, marginBottom: 5 },
  emailText: { color: HEADER_BG, fontSize: 16, fontWeight: '700', marginBottom: 25 },
  inputContainer: { width: '100%', marginBottom: 25 },
  input: { borderWidth: 2, borderColor: GOLD, borderRadius: 12, padding: 16, fontSize: 24, fontWeight: '700', color: '#333', backgroundColor: '#F9F9F9', letterSpacing: 5 },
  verifyBtn: { width: '100%', backgroundColor: HEADER_BG, padding: 18, borderRadius: 12, alignItems: 'center' },
  verifyBtnText: { color: GOLD, fontSize: 18, fontWeight: '800' }
});
