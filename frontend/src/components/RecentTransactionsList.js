import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { transactionAPI } from '../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

export default function RecentTransactionsList() {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigation = useNavigation();

  useEffect(() => {
    fetchRecent();
  }, []);

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
        <TouchableOpacity onPress={() => navigation.navigate('TransactionManagement')}>
          <Text style={styles.viewAll}>View All</Text>
        </TouchableOpacity>
      </View>

      {transactions.length === 0 ? (
        <Text style={styles.empty}>No recent transactions.</Text>
      ) : (
        transactions.map((item) => (
          <TouchableOpacity 
            key={item._id} 
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => navigation.navigate('BillPreviewPlaceholder', { transactionId: item._id, type: item.transactionType })}
          >
            <View style={styles.cardHeader}>
              <Text style={styles.billNo}>#{item._id.slice(-6).toUpperCase()}</Text>
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{item.transactionType}</Text>
              </View>
            </View>
            <Text style={styles.customerName}>{item.customerId?.customerName || 'Unknown Customer'}</Text>
            <View style={styles.row}>
              <Text style={styles.date}>{new Date(item.createdAt).toLocaleDateString('en-GB')}</Text>
              <Text style={styles.amt}>₹{item.finalAmount?.toLocaleString('en-IN')}</Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, marginTop: 16, marginBottom: 20 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: DARK_BROWN },
  viewAll: { fontSize: 13, color: GOLD, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#888', fontStyle: 'italic', marginTop: 10 },
  
  card: { backgroundColor: '#FFF', padding: 12, borderRadius: 10, marginBottom: 8, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  billNo: { fontWeight: 'bold', color: DARK_BROWN },
  typeBadge: { backgroundColor: 'rgba(212,175,55,0.1)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  typeText: { fontSize: 10, color: DARK_BROWN, fontWeight: '700' },
  customerName: { fontSize: 14, fontWeight: '600', color: '#333', marginBottom: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  date: { fontSize: 12, color: '#666' },
  amt: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' }
});
