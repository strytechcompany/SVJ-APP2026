import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { transactionAPI } from '../../services/api';
import { getAllChitTransactions } from '../../services/chitService';
import { expenseAPI } from '../../services/expenseService';
import { useAuth } from '../../context/AuthContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';

export default function TransactionManagementScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isAdmin = user?.role === 'SuperAdmin' || user?.role === 'Admin';

  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  // Delete state
  const [deletingId, setDeletingId] = useState(null);
  const [loadingEditId, setLoadingEditId] = useState(null);

  const filters = ['All', 'B2B', 'B2C', 'B2D', 'LINE STOCK', 'CHIT FUND', 'EXPENSE', 'Today', 'This Week', 'This Month'];

  useEffect(() => {
    fetchTransactions();
  }, []);

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const [res, chitRes, expRes, lsRes] = await Promise.all([
        transactionAPI.getAll(),
        getAllChitTransactions(),
        expenseAPI.getAll(),
        require('../../services/api').lineStockAPI.getTransactions({ limit: 100 })
      ]);

      let allData = [];
      if (res.data && res.data.success) {
        allData = [...res.data.data];
      }

      if (chitRes && chitRes.success) {
        const chitData = chitRes.data.map(c => ({
          ...c,
          transactionType: 'CHIT FUND',
          transactionSubtype: 'CHIT_PAYMENT',
          finalAmount: c.amount,
          paymentMode: 'Cash',
          status: 'PAID',
          isChit: true,
          customerId: c.customerId || { customerName: 'Unknown', phoneNumber: '' }
        }));
        allData = [...allData, ...chitData];
      }

      if (expRes && expRes.success) {
        const expData = expRes.data.map(e => ({
          ...e,
          _id: e._id,
          transactionType: 'EXPENSE',
          transactionSubtype: e.expenseType.toUpperCase(),
          finalAmount: e.amount,
          paymentMode: 'Cash',
          status: 'PAID',
          isExpense: true,
          customerId: {
            customerName: e.expenseName,
            phoneNumber: e.createdBy?.name || 'System'
          },
          createdAt: e.expenseDate
        }));
        allData = [...allData, ...expData];
      }

      if (lsRes && lsRes.data && lsRes.data.success) {
        const lsData = lsRes.data.data.map(ls => ({
          ...ls,
          _id: ls._id,
          transactionType: 'LINE STOCK',
          transactionSubtype: 'ISSUE',
          finalAmount: ls.totalGram,
          paymentMode: 'Gram',
          status: ls.status,
          isLineStock: true,
          createdAt: ls.issueDate
        }));
        allData = [...allData, ...lsData];
      }

      allData.sort((a, b) => new Date(b.createdAt || b.paymentDate) - new Date(a.createdAt || a.paymentDate));

      setTransactions(allData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // ─── Edit Handler — navigate to calculation screen with pre-filled data ──

  const handleEditBill = async (item) => {
    setLoadingEditId(item._id);
    try {
      const res = await transactionAPI.getById(item._id);
      if (!res.data?.success) {
        Alert.alert('Error', 'Could not load bill details.');
        return;
      }
      const bill = res.data.data;
      const customerId = typeof bill.customerId === 'object' ? bill.customerId._id : bill.customerId;
      navigation.navigate(`${bill.transactionType}Calculation`, {
        type: bill.transactionType,
        customerId,
        editTransactionId: bill._id,
        prefilledData: bill,
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to load bill for editing.');
    } finally {
      setLoadingEditId(null);
    }
  };

  // ─── Delete Handler ───────────────────────────────────────────────────────

  const handleDeleteBill = (item) => {
    Alert.alert(
      'Delete Bill',
      `Delete bill #${item._id.slice(-6).toUpperCase()}? This will restore stock and reverse customer balance.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(item._id);
            try {
              const res = await transactionAPI.delete(item._id);
              if (res.data?.success) {
                setTransactions(prev => prev.filter(t => t._id !== item._id));
              } else {
                Alert.alert('Error', res.data?.message || 'Failed to delete bill.');
              }
            } catch (err) {
              Alert.alert('Error', err.response?.data?.message || 'Failed to delete bill.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  // ─── Filter ───────────────────────────────────────────────────────────────

  const getFilteredData = () => {
    let data = transactions;

    if (search) {
      const lowerSearch = search.toLowerCase();
      data = data.filter(t =>
        (t._id.slice(-6).toLowerCase().includes(lowerSearch)) ||
        (t.customerId?.customerName?.toLowerCase().includes(lowerSearch)) ||
        (t.customerId?.phoneNumber?.includes(lowerSearch))
      );
    }

    if (activeFilter !== 'All') {
      const now = new Date();
      if (['B2B', 'B2C', 'B2D', 'CHIT FUND', 'EXPENSE', 'LINE STOCK'].includes(activeFilter)) {
        data = data.filter(t => t.transactionType === activeFilter);
      } else if (activeFilter === 'Today') {
        data = data.filter(t => new Date(t.createdAt).toDateString() === now.toDateString());
      } else if (activeFilter === 'This Week') {
        const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()));
        data = data.filter(t => new Date(t.createdAt) >= startOfWeek);
      } else if (activeFilter === 'This Month') {
        data = data.filter(t => new Date(t.createdAt).getMonth() === now.getMonth() && new Date(t.createdAt).getFullYear() === now.getFullYear());
      }
    }

    return data;
  };

  // Whether this transaction supports edit/delete (regular bills only)
  const isEditableBill = (item) =>
    !item.isChit &&
    !item.isExpense &&
    !item.isLineStock &&
    item.transactionSubtype !== 'SETTLEMENT' &&
    item.transactionType !== 'LINE_STOCK_SETTLEMENT';

  // ─── Render ───────────────────────────────────────────────────────────────

  const renderTransaction = ({ item }) => {
    const collected = item.paymentMode === 'Gold'
      ? (item.goldConvertedAmount || 0)
      : (item.paymentDetails?.amount || 0);

    const outstanding = item.outstandingAmount || (item.finalAmount - collected) || 0;
    const status = item.status || (outstanding <= 0 ? 'PAID' : 'PARTIAL');
    const isDeleting = deletingId === item._id;
    const isLoadingEdit = loadingEditId === item._id;
    const canEdit = isAdmin && isEditableBill(item);

    return (
      <TouchableOpacity
        style={styles.card}
        onPress={() => {
          if (item.isLineStock) {
            navigation.navigate('LineStockBillPreview', { transactionId: item._id });
          } else if (item.isChit) {
            navigation.navigate('ChitBillPreview', { transaction: item, customer: item.customerId });
          } else if (item.isExpense) {
            navigation.navigate('ExpenseDetail', { expense: item });
          } else if (item.transactionType === 'LINE_STOCK_SETTLEMENT') {
            navigation.navigate('LineStockSettlementBillPreview', { settlementId: item.transactionNumber || item._id });
          } else {
            navigation.navigate('BillPreviewPlaceholder', { transactionId: item._id, type: item.transactionType });
          }
        }}
        activeOpacity={0.85}
      >
        <View style={styles.cardHeader}>
          <Text style={styles.billNo}>#{item._id.slice(-6).toUpperCase()}</Text>
          <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <View style={styles.typeBadge}><Text style={styles.typeText}>{item.transactionType}</Text></View>
            <View style={[styles.typeBadge, { backgroundColor: '#E3F2FD' }]}>
              <Text style={[styles.typeText, { color: '#1565C0' }]}>{(item.transactionSubtype || 'TRANSACTION').replace('_', ' ')}</Text>
            </View>
            <View style={[styles.typeBadge, { backgroundColor: status === 'PAID' ? '#E8F5E9' : '#FFF3E0' }]}>
              <Text style={[styles.typeText, { color: status === 'PAID' ? '#2E7D32' : '#E65100' }]}>{status}</Text>
            </View>
          </View>
        </View>

        <Text style={styles.customerName}>{item.customerId?.customerName || 'Unknown Customer'}</Text>

        <View style={styles.dateRow}>
          <MaterialCommunityIcons name="calendar-clock" size={14} color="#666" />
          <Text style={styles.dateText}>
            {new Date(item.createdAt || item.paymentDate).toLocaleDateString('en-GB')}{' '}
            {new Date(item.createdAt || item.paymentDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>

        <View style={styles.amountsRow}>
          <View style={styles.amtCol}>
            <Text style={styles.amtLabel}>Subtotal</Text>
            <Text style={styles.amtVal}>₹{item.finalAmount?.toLocaleString('en-IN') || 0}</Text>
          </View>
          <View style={styles.amtCol}>
            <Text style={styles.amtLabel}>Collected</Text>
            <Text style={styles.amtVal}>₹{collected.toLocaleString('en-IN')}</Text>
          </View>
          <View style={styles.amtCol}>
            <Text style={styles.amtLabel}>Outstanding</Text>
            <Text style={[styles.finalVal, { color: outstanding > 0 ? '#D32F2F' : '#2E7D32' }]}>
              ₹{outstanding.toLocaleString('en-IN')}
            </Text>
            {item.outstandingGram > 0 && (
              <Text style={{ fontSize: 10, color: '#D32F2F', fontWeight: 'bold' }}>
                {item.outstandingGram.toFixed(3)}g
              </Text>
            )}
          </View>
        </View>

        {/* Edit / Delete row — admin only, regular bills only */}
        {canEdit && (
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={[styles.editBtn, isLoadingEdit && { opacity: 0.6 }]}
              onPress={() => handleEditBill(item)}
              disabled={isLoadingEdit}
              activeOpacity={0.8}
            >
              {isLoadingEdit
                ? <ActivityIndicator size="small" color={DARK_BROWN} />
                : <MaterialCommunityIcons name="pencil-outline" size={14} color={DARK_BROWN} />}
              <Text style={styles.editBtnText}>{isLoadingEdit ? 'Loading...' : 'Edit'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.deleteBtn, isDeleting && { opacity: 0.6 }]}
              onPress={() => handleDeleteBill(item)}
              disabled={isDeleting}
              activeOpacity={0.8}
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFF" />
                  <Text style={styles.deleteBtnText}>Delete</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // ─── JSX ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Transactions</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={20} color="#888" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search Bill No, Customer Name, Phone"
          value={search}
          onChangeText={setSearch}
        />
      </View>

      <View style={styles.filtersWrapper}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={filters}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.filterChip, activeFilter === item && styles.activeFilterChip]}
              onPress={() => setActiveFilter(item)}
            >
              <Text style={[styles.filterText, activeFilter === item && styles.activeFilterText]}>{item}</Text>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingHorizontal: 16 }}
        />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : (
        <FlatList
          data={getFilteredData()}
          keyExtractor={item => item._id}
          renderItem={renderTransaction}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>No transactions found.</Text>}
        />
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FFF', elevation: 2, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: DARK_BROWN },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, height: 46, elevation: 2, marginBottom: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },

  filtersWrapper: { marginBottom: 10, height: 36 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', marginRight: 8, elevation: 1, borderWidth: 1, borderColor: '#EEE' },
  activeFilterChip: { backgroundColor: GOLD, borderColor: GOLD },
  filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
  activeFilterText: { color: '#FFF' },

  listContent: { padding: 16, paddingBottom: 100 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40 },

  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 12, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  billNo: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  typeBadge: { backgroundColor: 'rgba(212,175,55,0.15)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  typeText: { fontSize: 10, fontWeight: '700', color: DARK_BROWN },
  customerName: { fontSize: 15, fontWeight: '700', color: '#333', marginBottom: 4 },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12 },
  dateText: { fontSize: 12, color: '#666', marginLeft: 6 },
  amountsRow: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: '#F0F0F0', paddingTop: 12 },
  amtCol: { flex: 1, alignItems: 'center' },
  amtLabel: { fontSize: 10, color: '#888', marginBottom: 2 },
  amtVal: { fontSize: 13, fontWeight: '600', color: '#444' },
  finalVal: { fontSize: 14, fontWeight: '800', color: '#2E7D32' },

  // Action row
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F5EDD8',
    paddingTop: 10,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: GOLD,
    borderRadius: 8,
    paddingVertical: 8,
  },
  editBtnText: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#C0392B',
    borderRadius: 8,
    paddingVertical: 8,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '700', color: '#FFF' },

  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: GOLD,
    alignItems: 'center',
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: DARK_BROWN },
});
