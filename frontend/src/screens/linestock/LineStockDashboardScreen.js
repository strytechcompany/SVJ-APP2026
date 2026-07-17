import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  ActivityIndicator,
  FlatList,
  Platform,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineStockAPI } from '../../services/api';
import CustomerSearchBar from '../../components/customers/CustomerSearchBar';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function LineStockDashboardScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [summary, setSummary] = useState({ active: 0, overdue: 0, completed: 0, issuedToday: 0 });
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All'); // All, ACTIVE, OVERDUE, SETTLED
  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState(null);
  const [clearingAll, setClearingAll] = useState(false);

  const searchTimeout = useRef(null);

  const fetchDashboardData = async (status = 'All', searchQuery = '') => {
    setLoading(true);
    try {
      const sumRes = await lineStockAPI.getDashboardSummary();
      if (sumRes.data.success) {
        setSummary(sumRes.data.data);
      }
      const txnRes = await lineStockAPI.getTransactions({ status, search: searchQuery, limit: 50 });
      if (txnRes.data.success) {
        setTransactions(txnRes.data.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchDashboardData(filter, search);
    }, [filter])
  );

  const handleSearch = (text) => {
    setSearch(text);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      fetchDashboardData(filter, text);
    }, 400);
  };

  const handleEdit = (item) => {
    navigation.navigate('IssueLineStock', { editTransactionId: item._id, prefilledData: item });
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Customer',
      'Are you sure you want to delete this customer?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item._id);
            try {
              const res = await lineStockAPI.deleteTransaction(item._id);
              if (res.data.success) {
                Alert.alert('Success', 'Line Stock Transaction Deleted Successfully');
                fetchDashboardData(filter, search);
              }
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Failed to delete transaction.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const handleClearAll = () => {
    Alert.alert(
      'Clear All Transactions',
      'This will permanently delete ALL Line Stock transactions (including settled ones), restore stock quantities, and reset every Line Stocker customer\'s balance to zero. This cannot be undone. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () => {
            Alert.alert(
              'Are you absolutely sure?',
              'This is your last chance to cancel. All Line Stock history will be permanently erased.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Clear All',
                  style: 'destructive',
                  onPress: async () => {
                    setClearingAll(true);
                    try {
                      const res = await lineStockAPI.clearAllTransactions();
                      if (res.data.success) {
                        Alert.alert('Success', res.data.message || 'All Line Stock transactions cleared successfully.');
                        fetchDashboardData(filter, search);
                      }
                    } catch (e) {
                      Alert.alert('Error', e.response?.data?.message || 'Failed to clear transactions.');
                    } finally {
                      setClearingAll(false);
                    }
                  },
                },
              ]
            );
          },
        },
      ]
    );
  };

  const renderTransactionCard = ({ item }) => {
    const isOverdue = item.status === 'ACTIVE' && new Date(item.expectedReturnDate) < new Date(new Date().setHours(0,0,0,0));
    const displayStatus = item.status === 'SETTLED' ? 'SETTLED' : (isOverdue ? 'OVERDUE' : 'ACTIVE');
    const statusColor = displayStatus === 'SETTLED' ? '#27AE60' : (displayStatus === 'OVERDUE' ? '#E74C3C' : '#F39C12');

    return (
      <TouchableOpacity 
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('LineStockBillPreview', { transactionId: item._id })}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.txnId}>{item.transactionNumber}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{displayStatus}</Text>
          </View>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.customerName}>{item.customerId?.customerName}</Text>
          <Text style={styles.customerPhone}>{item.customerId?.phoneNumber}</Text>
          <View style={styles.detailsRow}>
            <View>
              <Text style={styles.label}>Issued Date</Text>
              <Text style={styles.value}>{new Date(item.issueDate).toLocaleDateString('en-GB')}</Text>
            </View>
            <View>
              <Text style={styles.label}>Return Date</Text>
              <Text style={[styles.value, isOverdue && { color: '#E74C3C' }]}>{new Date(item.expectedReturnDate).toLocaleDateString('en-GB')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.label}>Total Items</Text>
              <Text style={styles.value}>{item.totalItems} ({Number(item.totalGram).toFixed(3)}g)</Text>
            </View>
          </View>
          <View style={styles.rowActions}>
            <TouchableOpacity style={styles.editBtn} onPress={() => handleEdit(item)}>
              <MaterialCommunityIcons name="pencil-outline" size={14} color={DARK_BROWN} />
              <Text style={styles.editBtnText}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.deleteBtn}
              onPress={() => handleDelete(item)}
              disabled={deletingId === item._id}
            >
              {deletingId === item._id ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFF" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
        {item.status !== 'SETTLED' && (
          <TouchableOpacity 
            style={styles.settleBtn}
            onPress={() => navigation.navigate('LineStockSettlement', { transactionId: item._id })}
          >
            <Text style={styles.settleBtnText}>Settle Line Stock</Text>
            <MaterialCommunityIcons name="chevron-right" size={20} color={GOLD} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Line Stocker</Text>
        </View>
        <TouchableOpacity
          style={styles.clearAllBtn}
          onPress={handleClearAll}
          disabled={clearingAll}
        >
          {clearingAll ? (
            <ActivityIndicator size="small" color="#E74C3C" />
          ) : (
            <MaterialCommunityIcons name="delete-sweep-outline" size={20} color="#E74C3C" />
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.createCustomerBtn}
          onPress={() => navigation.navigate('CreateCustomer', { defaultType: 'LINE STOCKER' })}
        >
          <MaterialCommunityIcons name="account-plus" size={20} color={HEADER_BG} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={transactions}
        keyExtractor={(item) => item._id}
        renderItem={renderTransactionCard}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListHeaderComponent={
          <>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { borderLeftColor: '#F39C12' }]}>
                  <Text style={styles.summaryLabel}>Total Active</Text>
                  <Text style={styles.summaryValue}>{summary.active}</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#E74C3C' }]}>
                  <Text style={styles.summaryLabel}>Total Overdue</Text>
                  <Text style={[styles.summaryValue, { color: '#E74C3C' }]}>{summary.overdue}</Text>
                </View>
              </View>
              <View style={styles.summaryRow}>
                <View style={[styles.summaryCard, { borderLeftColor: '#27AE60' }]}>
                  <Text style={styles.summaryLabel}>Settled</Text>
                  <Text style={styles.summaryValue}>{summary.completed}</Text>
                </View>
                <View style={[styles.summaryCard, { borderLeftColor: '#3498DB' }]}>
                  <Text style={styles.summaryLabel}>Issued Today</Text>
                  <Text style={styles.summaryValue}>{summary.issuedToday}</Text>
                </View>
              </View>
            </View>

            {/* Search and Filters */}
            <View style={{ marginTop: 10, paddingBottom: 10 }}>
              <CustomerSearchBar 
                value={search} 
                onChangeText={handleSearch} 
                onClear={() => handleSearch('')} 
                placeholder="Search Name, Phone, ID..."
              />
            </View>
          </>
        }
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="folder-open-outline" size={60} color="#D4C098" />
              <Text style={styles.emptyText}>No Line Stock Transactions Found</Text>
            </View>
          ) : (
            <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 50 }} />
          )
        }
      />

      {/* Floating Issue Button */}
      <TouchableOpacity 
        style={styles.fab}
        activeOpacity={0.85}
        onPress={() => navigation.navigate('IssueLineStock')}
      >
        <MaterialCommunityIcons name="cart-arrow-up" size={24} color={HEADER_BG} />
        <Text style={styles.fabText}>Issue Line Stock</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    elevation: 8,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '800' },
  createCustomerBtn: {
    backgroundColor: GOLD,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clearAllBtn: {
    backgroundColor: '#FFFFFF',
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  summaryContainer: { padding: 16, gap: 12 },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: {
    flex: 1,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
  },
  summaryLabel: { fontSize: 12, color: '#8A6B3C', fontWeight: '700', marginBottom: 4 },
  summaryValue: { fontSize: 24, color: DARK_BROWN, fontWeight: '800' },
  card: {
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0E4CC',
    backgroundColor: '#FDFAF4',
  },
  txnId: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 11, fontWeight: '800' },
  cardBody: { padding: 16 },
  customerName: { fontSize: 18, fontWeight: '800', color: DARK_BROWN },
  customerPhone: { fontSize: 14, color: '#8A6B3C', marginTop: 4 },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
  label: { fontSize: 11, color: '#8A6B3C', fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  rowActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  editBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#F0E4CC' },
  editBtnText: { fontSize: 12, fontWeight: '700', color: DARK_BROWN },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: '#E74C3C' },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  settleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#5C3A00',
    paddingVertical: 14,
    gap: 8,
  },
  settleBtnText: { color: GOLD, fontSize: 14, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  emptyContainer: { alignItems: 'center', marginTop: 40, paddingHorizontal: 20 },
  emptyText: { marginTop: 16, fontSize: 15, color: '#8A6B3C', fontWeight: '600', textAlign: 'center' },
  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    backgroundColor: GOLD,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 30,
    gap: 8,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: HEADER_BG, fontSize: 15, fontWeight: '800' },
});
