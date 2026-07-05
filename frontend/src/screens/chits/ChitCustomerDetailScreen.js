import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getChitTransactions } from '../../services/chitService';

export default function ChitCustomerDetailScreen({ navigation, route }) {
  const { customer } = route.params;
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      const response = await getChitTransactions(customer.chitId);
      if (response.success) {
        setTransactions(response.data);
      }
    } catch (error) {
      console.error('Error fetching chit transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const renderTransaction = ({ item }) => (
    <TouchableOpacity 
      style={styles.transactionCard}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('ChitBillPreview', { transaction: item, customer })}
    >
      <View style={styles.txnHeader}>
        <Text style={styles.txnInstallment}>Installment {item.installmentNumber} / {item.totalInstallments}</Text>
        <Text style={styles.txnDate}>{new Date(item.paymentDate).toLocaleDateString('en-GB')}</Text>
      </View>
      <View style={styles.txnRow}>
        <Text style={styles.txnLabel}>Amount Paid</Text>
        <Text style={styles.txnAmount}>₹{item.amount.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.txnRow}>
        <Text style={styles.txnLabel}>Gold Rate</Text>
        <Text style={styles.txnValue}>₹{item.goldRate.toLocaleString('en-IN')}</Text>
      </View>
      <View style={styles.txnRow}>
        <Text style={styles.txnLabel}>Purchased Wt</Text>
        <Text style={styles.txnValue}>{item.purchasedWeight.toFixed(4)} g</Text>
      </View>
      <View style={[styles.txnRow, { borderTopWidth: 1, borderColor: '#EEE', paddingTop: 8, marginTop: 4 }]}>
        <Text style={[styles.txnLabel, { fontWeight: 'bold', color: '#5C3A00' }]}>Total Accumulated Wt</Text>
        <Text style={[styles.txnValue, { fontWeight: 'bold', color: '#D4AF37' }]}>{item.runningWeight.toFixed(4)} g</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F4E8" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#5C4033" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Customer Profile</Text>
        <View style={{ width: 40 }} />
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item._id}
        renderItem={renderTransaction}
        contentContainerStyle={styles.listContainer}
        ListHeaderComponent={
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{customer.customerName.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.profileHeaderRight}>
                <Text style={styles.customerName}>{customer.customerName}</Text>
                <Text style={styles.chitIdBadge}>{customer.chitId}</Text>
              </View>
            </View>

            <View style={styles.infoRow}>
              <Ionicons name="call-outline" size={16} color="#8A8A8A" />
              <Text style={styles.infoText}>{customer.phoneNumber}</Text>
            </View>
            <View style={styles.infoRow}>
              <Ionicons name="location-outline" size={16} color="#8A8A8A" />
              <Text style={styles.infoText}>{customer.address || 'No Address Provided'}</Text>
            </View>

            <View style={styles.statsGrid}>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Monthly Amt</Text>
                <Text style={styles.statValue}>₹{customer.monthlyAmount}</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Total Wt</Text>
                <Text style={[styles.statValue, { color: '#D4AF37' }]}>{customer.totalWeightAccumulated.toFixed(4)} g</Text>
              </View>
              <View style={styles.statBox}>
                <Text style={styles.statLabel}>Status</Text>
                <Text style={[styles.statValue, { color: customer.status === 'COMPLETED' ? '#2E7D32' : '#E65100' }]}>
                  {customer.completedMonths} / {customer.durationMonths}
                </Text>
              </View>
            </View>
            <Text style={styles.historyTitle}>Transaction History</Text>
          </View>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator size="large" color="#D4AF37" style={{ marginTop: 40 }} />
          ) : (
            <Text style={styles.emptyText}>No transactions found for this customer.</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F4E8' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#BFA85D',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerBtn: { padding: 8 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#FFF' },
  listContainer: { padding: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  avatar: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#D4AF37',
    justifyContent: 'center', alignItems: 'center', marginRight: 16
  },
  avatarText: { fontSize: 24, fontWeight: 'bold', color: '#5C3A00' },
  profileHeaderRight: { flex: 1 },
  customerName: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 4 },
  chitIdBadge: {
    backgroundColor: '#EAE1C8', color: '#5C3A00', alignSelf: 'flex-start',
    paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 12, fontWeight: 'bold'
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoText: { fontSize: 14, color: '#555', marginLeft: 8 },
  statsGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, borderTopWidth: 1, borderColor: '#EEE', paddingTop: 16 },
  statBox: { flex: 1, alignItems: 'center' },
  statLabel: { fontSize: 11, color: '#8A8A8A', textTransform: 'uppercase', marginBottom: 4 },
  statValue: { fontSize: 15, fontWeight: 'bold', color: '#333' },
  historyTitle: { fontSize: 16, fontWeight: 'bold', color: '#5C3A00', marginTop: 24, marginBottom: 8 },
  transactionCard: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#EAE1C8', elevation: 1
  },
  txnHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  txnInstallment: { fontSize: 14, fontWeight: 'bold', color: '#1565C0' },
  txnDate: { fontSize: 12, color: '#888' },
  txnRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  txnLabel: { fontSize: 13, color: '#666' },
  txnValue: { fontSize: 13, fontWeight: '600', color: '#333' },
  txnAmount: { fontSize: 14, fontWeight: 'bold', color: '#2E7D32' },
  emptyText: { textAlign: 'center', color: '#8A8A8A', marginTop: 40 },
});
