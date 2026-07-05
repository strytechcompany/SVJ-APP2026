import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { createChitCustomer } from '../../services/chitService';

const DURATION_OPTIONS = [3, 6, 9, 12, 18, 24];

export default function AddChitCustomerModal({ visible, onClose, onSuccess }) {
  const [customerName, setCustomerName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [address, setAddress] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [durationMonths, setDurationMonths] = useState(12);
  const [isCustomDuration, setIsCustomDuration] = useState(false);
  const [customDuration, setCustomDuration] = useState('');
  
  const [loading, setLoading] = useState(false);

  // Simple auto date calc based on today + duration months
  const calculateEndDate = () => {
    const start = new Date();
    const end = new Date(start.setMonth(start.getMonth() + (isCustomDuration ? Number(customDuration) : durationMonths)));
    return end.toLocaleDateString('en-GB'); // DD/MM/YYYY
  };

  const handleSave = async () => {
    if (!customerName || !phoneNumber || !address || !monthlyAmount) {
      alert('Please fill all required fields');
      return;
    }

    setLoading(true);
    try {
      const finalDuration = isCustomDuration ? Number(customDuration) : durationMonths;
      const start = new Date();
      const end = new Date();
      end.setMonth(start.getMonth() + finalDuration);

      const payload = {
        customerName,
        phoneNumber,
        address,
        monthlyAmount: Number(monthlyAmount),
        durationMonths: finalDuration,
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      };

      const response = await createChitCustomer(payload);
      if (response.success) {
        resetForm();
        onSuccess();
      }
    } catch (error) {
      console.error('Failed to create customer:', error);
      alert('Failed to save customer');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCustomerName('');
    setPhoneNumber('');
    setAddress('');
    setMonthlyAmount('');
    setDurationMonths(12);
    setIsCustomDuration(false);
    setCustomDuration('');
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Add Chit Customer</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.formScroll} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>Customer Name *</Text>
            <TextInput style={styles.input} placeholder="Enter name" value={customerName} onChangeText={setCustomerName} />

            <Text style={styles.label}>Phone Number *</Text>
            <TextInput style={styles.input} placeholder="Enter phone" keyboardType="phone-pad" value={phoneNumber} onChangeText={setPhoneNumber} />

            <Text style={styles.label}>Address *</Text>
            <TextInput style={styles.input} placeholder="Enter address" value={address} onChangeText={setAddress} />

            <Text style={styles.label}>Monthly Amount (₹) *</Text>
            <TextInput style={styles.input} placeholder="e.g. 5000" keyboardType="numeric" value={monthlyAmount} onChangeText={setMonthlyAmount} />

            <Text style={styles.label}>Number of Months *</Text>
            <View style={styles.durationGrid}>
              {DURATION_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[styles.durationBtn, !isCustomDuration && durationMonths === opt && styles.durationBtnActive]}
                  onPress={() => {
                    setDurationMonths(opt);
                    setIsCustomDuration(false);
                  }}
                >
                  <Text style={[styles.durationText, !isCustomDuration && durationMonths === opt && styles.durationTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.durationBtn, isCustomDuration && styles.durationBtnActive]}
                onPress={() => setIsCustomDuration(true)}
              >
                <Text style={[styles.durationText, isCustomDuration && styles.durationTextActive]}>Custom</Text>
              </TouchableOpacity>
            </View>
            
            {isCustomDuration && (
              <TextInput 
                style={[styles.input, { marginTop: 8 }]} 
                placeholder="Enter custom months" 
                keyboardType="numeric" 
                value={customDuration} 
                onChangeText={setCustomDuration} 
              />
            )}

            <View style={styles.previewBox}>
              <View style={styles.previewRow}>
                <Text style={styles.previewLabel}>End Date (Approx):</Text>
                <Text style={styles.previewValue}>{calculateEndDate()}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
              {loading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.saveBtnText}>Save Customer</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333' },
  formScroll: { paddingBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 8, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 12, padding: 12, fontSize: 16, color: '#333' },
  disabledInput: { backgroundColor: '#F5F5F5', color: '#8A8A8A' },
  durationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  durationBtn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#BFA85D', minWidth: 50, alignItems: 'center' },
  durationBtnActive: { backgroundColor: '#BFA85D' },
  durationText: { color: '#BFA85D', fontWeight: '600' },
  durationTextActive: { color: '#FFF' },
  previewBox: { backgroundColor: '#F9F5EC', padding: 16, borderRadius: 12, marginTop: 20 },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  previewLabel: { color: '#7A6B43', fontSize: 14 },
  previewValue: { color: '#333', fontSize: 14, fontWeight: 'bold' },
  saveBtn: { backgroundColor: '#BFA85D', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 24, marginBottom: 20 },
  saveBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
});
