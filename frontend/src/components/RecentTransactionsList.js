import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { transactionAPI } from '../services/api';
import { resolveDisplayBalance, formatBalanceForCustomer } from '../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

// PLUS = any non-Wastage B2C bill; other types show their own transactionType.
const getTransactionTypeLabel = (item) => {
  if (item.transactionType === 'B2C') return item.isWastage ? 'WASTAGE' : 'PLUS';
  return item.transactionType;
};

export default function RecentTransactionsList() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  // Refetch every time this screen regains focus so the list (and each
  // customer's balance) always reflects the latest saved bill.
  useFocusEffect(
    useCallback(() => {
      fetchRecent();
    }, [])
  );

  const fetchRecent = async () => {
    try {
      const res = await transactionAPI.getRecent();
      if (res.data.success) {
        setTransactions(res.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear Recent Transactions',
      'Do you want to clear all Recent Transactions?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes', style: 'destructive',
          onPress: async () => {
            try {
              await transactionAPI.clearAllRecent();
              setTransactions([]);
            } catch (e) {
              Alert.alert('Error', 'Failed to clear recent transactions.');
            }
          },
        },
      ]
    );
  };

  const handleClearOne = (id) => {
    transactionAPI.clearRecent(id).catch(() => {});
    setTransactions(prev => prev.filter(t => t._id !== id));
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator color={GOLD} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.sectionTitle}>Recent Transactions</Text>
        <View style={styles.headerActions}>
          {transactions.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} style={{ marginRight: 14 }}>
              <Text style={styles.clearAll}>Clear All</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={() => navigation.navigate('TransactionManagement')}>
            <Text style={styles.viewAll}>View All</Text>
          </TouchableOpacity>
        </View>
      </View>

      {transactions.length === 0 ? (
        <Text style={styles.empty}>No recent transactions.</Text>
      ) : (
        transactions.map((item) => {
          const { label: balanceLabel, value: balanceValue } = resolveDisplayBalance(
            item.customerId?.oldBalance,
            item.customerId?.advance
          );
          const isPaid = item.status === 'PAID';
          return (
            <TouchableOpacity
              key={item._id}
              style={styles.card}
              activeOpacity={0.7}
              onPress={() => navigation.navigate('BillPreviewPlaceholder', { transactionId: item._id, type: item.transactionType })}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.billNo}>{item.commonBillNo || `#${item._id.slice(-6).toUpperCase()}`}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{getTransactionTypeLabel(item)}</Text>
                  </View>
                  <TouchableOpacity
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={(e) => { e.stopPropagation(); handleClearOne(item._id); }}
                  >
                    <MaterialCommunityIcons name="close-circle-outline" size={18} color="#B0A48A" />
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.customerName}>{item.customerId?.customerName || 'Unknown Customer'}</Text>
              <View style={styles.row}>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('en-GB')}</Text>
                <Text style={styles.date}>{new Date(item.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
              </View>
              {item.isWastage ? (
                <>
                  <View style={styles.row}>
                    <Text style={styles.date}>Final Cash: ₹{(item.finalAmount || 0).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                    <Text style={[styles.amt, { color: isPaid ? '#2E7D32' : '#D32F2F' }]}>{isPaid ? 'Paid' : 'Balance'}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={[styles.amt, { color: balanceLabel === 'Advance' ? '#2E7D32' : (balanceValue > 0 ? '#D32F2F' : DARK_BROWN) }]}>
                      {balanceLabel}: {formatBalanceForCustomer(balanceValue, item.customerId)}
                    </Text>
                  </View>
                </>
              ) : (
                <View style={styles.row}>
                  <Text style={[styles.amt, { color: balanceLabel === 'Advance' ? '#2E7D32' : (balanceValue > 0 ? '#D32F2F' : DARK_BROWN) }]}>
                    {balanceLabel}: {formatBalanceForCustomer(balanceValue, item.customerId)}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 16, marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DARK_BROWN },
  viewAll: { fontSize: 13, color: GOLD, fontWeight: '600' },
  clearAll: { fontSize: 13, color: '#D32F2F', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', fontStyle: 'italic', marginTop: 10 },

  card: { backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  billNo: { fontWeight: 'bold', color: DARK_BROWN },
  typeBadge: { backgroundColor: 'rgba(212,175,55,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 10, color: DARK_BROWN, fontWeight: '700' },
  customerName: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 12, color: '#666' },
  amt: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' }
});
