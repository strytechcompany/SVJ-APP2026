import React, { useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { payInstallment } from '../../services/chitService';

export default function PayInstallmentModal({ visible, onClose, onSuccess, customer, currentGoldRate }) {
  const [loading, setLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState('Cash');

  if (!customer) return null;

  const installmentNumber = customer.completedMonths + 1;
  const calWeight = (customer.monthlyAmount / currentGoldRate).toFixed(4);

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const payload = {
        amount: customer.monthlyAmount,
        goldRate: currentGoldRate,
        paymentDate: new Date().toISOString(),
        paymentMode,
      };
      
      const response = await payInstallment(customer.chitId, payload);
      if (response.success) {
        onSuccess(response.data);
      }
    } catch (error) {
      console.error('Payment failed:', error);
      alert('Payment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Confirm Payment</Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <View style={styles.summaryCard}>
            <Text style={styles.customerName}>{customer.customerName}</Text>
            <Text style={styles.subtext}>{customer.chitId} • Installment #{installmentNumber}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Amount (₹) *</Text>
            <Text style={styles.value}>{customer.monthlyAmount}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Gold Rate (₹/g) *</Text>
            <Text style={styles.value}>{currentGoldRate}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Date</Text>
            <Text style={styles.value}>{new Date().toLocaleDateString('en-GB')}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.label}>Payment Mode *</Text>
            <View style={styles.modeContainer}>
              <TouchableOpacity style={[styles.modeBtn, paymentMode === 'Cash' && styles.modeActive]} onPress={() => setPaymentMode('Cash')}>
                <Text style={[styles.modeText, paymentMode === 'Cash' && styles.modeTextActive]}>Cash</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modeBtn, paymentMode === 'Online' && styles.modeActive]} onPress={() => setPaymentMode('Online')}>
                <Text style={[styles.modeText, paymentMode === 'Online' && styles.modeTextActive]}>Online</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.calculationBox}>
            <Text style={styles.calcLabel}>Cal.Wt = Amount ÷ Gold Rate</Text>
            <Text style={styles.calcValue}>{calWeight} g</Text>
          </View>

          <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirm} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={styles.confirmBtnText}>Confirm Payment</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 20 },
  modalContent: { backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
  summaryCard: { backgroundColor: '#F9F5EC', padding: 16, borderRadius: 12, marginBottom: 20 },
  customerName: { fontSize: 18, fontWeight: 'bold', color: '#7A6B43', marginBottom: 4 },
  subtext: { fontSize: 14, color: '#8A8A8A' },
  detailRow: { marginBottom: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#8A8A8A', marginBottom: 4 },
  value: { fontSize: 16, color: '#333', borderWidth: 1, borderColor: '#E0E0E0', padding: 12, borderRadius: 8 },
  calculationBox: { backgroundColor: '#FDFBF7', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#F0E6D2', marginTop: 10, marginBottom: 24 },
  calcLabel: { color: '#BFA85D', fontSize: 14, fontWeight: '600' },
  calcValue: { color: '#333', fontSize: 16, fontWeight: 'bold' },
  confirmBtn: { backgroundColor: '#BFA85D', padding: 16, borderRadius: 12, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  confirmBtnText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  modeContainer: { flexDirection: 'row', gap: 10 },
  modeBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center' },
  modeActive: { backgroundColor: '#BFA85D', borderColor: '#BFA85D' },
  modeText: { color: '#555', fontWeight: '600' },
  modeTextActive: { color: '#FFF' }
});
