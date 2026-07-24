import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { transactionAPI } from '../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

export default function UpcomingRemindersList() {
  const [reminders, setReminders] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  // Refetch every time this screen regains focus so a reminder appears
  // automatically once its date has arrived.
  useFocusEffect(
    useCallback(() => {
      fetchReminders();
    }, [])
  );

  const fetchReminders = async () => {
    try {
      const res = await transactionAPI.getUpcomingReminders();
      if (res.data.success) {
        setReminders(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  if (reminders.length === 0) return null;

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Upcoming Reminders</Text>
      </View>

      {reminders.map((item) => {
        const isWastage = item.isWastage;
        const outstanding = isWastage ? (item.oldBalanceAfter || item.advanceBalanceAfter || 0) : Math.abs(item.plusOutstanding || 0);
        const balanceType = (item.oldBalanceAfter || 0) > 0 ? 'Old Balance' : 'Advance Balance';
        const reminderAmount = isWastage ? (item.wastageSubtractionAmount || 0) : (item.plusReminderPure || 0);
        return (
          <TouchableOpacity
            key={item._id}
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('BillPreviewPlaceholder', { transactionId: item._id, type: item.transactionType })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.billNo}>{item.commonBillNo || `#${item._id.slice(-6).toUpperCase()}`}</Text>
              <View style={styles.dateBadge}>
                <MaterialCommunityIcons name="calendar-clock" size={12} color={DARK_BROWN} />
                <Text style={styles.dateText}>{new Date(item.reminderDate).toLocaleDateString('en-GB')}</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{item.customerId?.customerName || 'Unknown Customer'}</Text>
            <View style={styles.row}>
              <Text style={styles.label}>Reminder Amount: {isWastage ? '₹' : ''}{reminderAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}{!isWastage ? 'g' : ''}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Outstanding: {isWastage ? '₹' : ''}{Number(outstanding).toLocaleString('en-IN', {maximumFractionDigits:2})}{!isWastage ? 'g' : ''}</Text>
              <Text style={[styles.amt, { color: balanceType === 'Advance Balance' ? '#2E7D32' : '#D32F2F' }]}>{balanceType}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 16, marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DARK_BROWN },

  card: { backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginBottom: 8, elevation: 1, borderLeftWidth: 3, borderLeftColor: GOLD },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  billNo: { fontWeight: 'bold', color: DARK_BROWN },
  dateBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(212,175,55,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  dateText: { fontSize: 10, color: DARK_BROWN, fontWeight: '700' },
  customerName: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontSize: 12, color: '#666' },
  amt: { fontSize: 12, fontWeight: 'bold' },
});
