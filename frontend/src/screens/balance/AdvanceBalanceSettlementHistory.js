import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, Platform, TextInput, Alert, Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { balanceSettlementAPI } from '../../services/api';
import { formatBalanceForCustomer } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatTime(d) {
  return new Date(d).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

// Global Advance Balance Settlement History — every saved settlement bill
// across all customers, newest first. Populated only when a bill is
// Saved/Printed from the Settlement Preview screen.
export default function AdvanceBalanceSettlementHistory({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingSettlement, setEditingSettlement] = useState(null);
  const [editMode, setEditMode] = useState('CASH');
  const [editCashAmount, setEditCashAmount] = useState('');
  const [editGoldRate, setEditGoldRate] = useState('');
  const [editGramInput, setEditGramInput] = useState('');
  const [editRemarks, setEditRemarks] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await balanceSettlementAPI.getHistory('ADVANCE');
      if (res.data.success) setSettlements(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchHistory(); }, [fetchHistory]));

  const filteredSettlements = settlements.filter(s => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const customer = s.customerId || {};
    return (
      (customer.customerName || '').toLowerCase().includes(q) ||
      (customer.phoneNumber || '').includes(q) ||
      (s.billNumber || '').toLowerCase().includes(q)
    );
  });

  const handleOpenEdit = (item) => {
    const firstItem = (item.items || [])[0] || {};
    setEditMode(firstItem.mode || item.settlementMode || 'CASH');
    setEditCashAmount(firstItem.cashAmount ? String(firstItem.cashAmount) : '');
    setEditGoldRate(firstItem.goldRate ? String(firstItem.goldRate) : '');
    setEditGramInput(firstItem.gram ? String(firstItem.gram) : '');
    setEditRemarks(item.remarks || '');
    setEditingSettlement(item);
  };

  const handleSaveEdit = async () => {
    if (!editingSettlement) return;
    let items;
    if (editMode === 'CASH') {
      if (!editCashAmount || !editGoldRate) {
        Alert.alert('Validation Error', 'Cash Amount and Gold Rate are required.');
        return;
      }
      items = [{ mode: 'CASH', cashAmount: parseFloat(editCashAmount) || 0, goldRate: parseFloat(editGoldRate) || 0 }];
    } else {
      if (!editGramInput) {
        Alert.alert('Validation Error', 'Gram is required.');
        return;
      }
      items = [{ mode: 'GRAM', gram: parseFloat(editGramInput) || 0 }];
    }
    setSavingEdit(true);
    try {
      const res = await balanceSettlementAPI.updateSettlement(editingSettlement._id, {
        items, remarks: editRemarks, settlementMode: editMode,
      });
      if (res.data.success) {
        setEditingSettlement(null);
        await fetchHistory();
        Alert.alert('Success', 'Settlement updated successfully.');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to update settlement.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDelete = (item) => {
    Alert.alert(
      'Delete Settlement Bill?',
      `This will restore ${item.customerId?.customerName || 'the customer'}'s balance to what it was before this settlement.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingId(item._id);
            try {
              await balanceSettlementAPI.deleteSettlement(item._id);
              setSettlements(prev => prev.filter(s => s._id !== item._id));
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Failed to delete settlement.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const renderItem = ({ item }) => {
    const customer = item.customerId || {};
    const cashSettlement = (item.items || []).reduce((s, i) => s + (i.mode === 'CASH' ? (i.cashAmount || 0) : 0), 0);
    const currentIsAdvance = item.finalAdvanceBalance > 0;
    const currentBalanceValue = currentIsAdvance ? item.finalAdvanceBalance : item.finalOldBalance;
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.8}
        onPress={() => navigation.navigate('AdvanceBalanceSettlementPreview', { settlementId: item._id })}
      >
        <View style={styles.row}>
          <Text style={styles.billNo}>#{item.billNumber}</Text>
          <View style={styles.statusBadge}><Text style={styles.statusBadgeText}>Settled</Text></View>
        </View>
        <Text style={styles.name}>{customer.customerName || 'N/A'}</Text>
        <Text style={styles.phone}>{customer.phoneNumber || 'N/A'}</Text>
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.label}>Date</Text><Text style={styles.value}>{formatDate(item.createdAt)}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Time</Text><Text style={styles.value}>{formatTime(item.createdAt)}</Text></View>
        <View style={styles.row}>
          <Text style={styles.label}>Settlement Amount</Text>
          <Text style={styles.value}>{cashSettlement > 0 ? `₹${cashSettlement.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : `${Number(item.totalSettlementGram).toFixed(3)}g`}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: '800' }]}>Current Balance</Text>
          <Text style={[styles.value, { color: currentIsAdvance ? '#2E7D32' : '#D32F2F', fontWeight: '800' }]}>
            {formatBalanceForCustomer(currentBalanceValue, customer)} ({currentIsAdvance ? 'Advance' : 'Old'})
          </Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.actionsRow}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={(e) => { e.stopPropagation(); handleOpenEdit(item); }}
          >
            <MaterialCommunityIcons name="pencil-outline" size={14} color={DARK_BROWN} />
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.deleteBtn, deletingId === item._id && { opacity: 0.6 }]}
            disabled={deletingId === item._id}
            onPress={(e) => { e.stopPropagation(); handleDelete(item); }}
          >
            {deletingId === item._id
              ? <ActivityIndicator size="small" color="#FFF" />
              : <><MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFF" /><Text style={styles.deleteBtnText}>Delete</Text></>}
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Advance Balance Settlement History</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone, or bill no..."
          placeholderTextColor="#C4A97A"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#C4A97A" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredSettlements}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color="#D4C098" />
              <Text style={styles.emptyText}>No Settlement History Found</Text>
            </View>
          }
        />
      )}

      <Modal
        visible={!!editingSettlement}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingSettlement(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Settlement #{editingSettlement?.billNumber}</Text>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setEditingSettlement(null)}>
                <MaterialCommunityIcons name="close" size={18} color={DARK_BROWN} />
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: editMode === 'CASH' ? GOLD : '#F0E4CC' }]}
                onPress={() => setEditMode('CASH')}
              >
                <Text style={styles.modeBtnText}>Cash Mode</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, { backgroundColor: editMode === 'GRAM' ? GOLD : '#F0E4CC' }]}
                onPress={() => setEditMode('GRAM')}
              >
                <Text style={styles.modeBtnText}>Gram Mode</Text>
              </TouchableOpacity>
            </View>

            {editMode === 'CASH' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Cash Amount (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={editCashAmount} onChangeText={setEditCashAmount} placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Gold Rate (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={editGoldRate} onChangeText={setEditGoldRate} placeholder="0" />
                </View>
              </View>
            ) : (
              <View style={{ marginBottom: 16 }}>
                <Text style={styles.inputLabel}>Gram</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={editGramInput} onChangeText={setEditGramInput} placeholder="0.000" />
              </View>
            )}

            <Text style={styles.inputLabel}>Remarks</Text>
            <TextInput
              style={[styles.input, { minHeight: 60, textAlignVertical: 'top', marginBottom: 16 }]}
              multiline
              value={editRemarks}
              onChangeText={setEditRemarks}
              placeholder="Remarks (optional)"
            />

            <TouchableOpacity
              style={[styles.saveEditBtn, savingEdit && { opacity: 0.7 }]}
              disabled={savingEdit}
              onPress={handleSaveEdit}
            >
              {savingEdit ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />}
              <Text style={styles.saveEditBtnText}>{savingEdit ? 'Saving...' : 'Save Changes'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: HEADER_BG, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: DARK_BROWN },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 2, borderWidth: 1, borderColor: '#F0E4CC' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  billNo: { fontSize: 14, fontWeight: '800', color: DARK_BROWN },
  statusBadge: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  statusBadgeText: { fontSize: 11, fontWeight: '700', color: '#2E7D32' },
  name: { fontSize: 15, fontWeight: '800', color: DARK_BROWN, marginTop: 2 },
  phone: { fontSize: 12, color: '#8A6B3C', marginBottom: 4 },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 8 },
  label: { fontSize: 13, color: '#8A6B3C', fontWeight: '600' },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 14, fontSize: 14, color: '#8A6B3C', fontWeight: '600' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  editBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F0E4CC' },
  editBtnText: { fontSize: 12, fontWeight: '700', color: DARK_BROWN },
  deleteBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 10, backgroundColor: '#E74C3C' },
  deleteBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: BG, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E8D8B8', alignSelf: 'center', marginBottom: 16 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  modalCloseBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F0E4CC', alignItems: 'center', justifyContent: 'center' },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  inputLabel: { fontSize: 12, color: '#8A6B3C', fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: DARK_BROWN },
  saveEditBtn: { flexDirection: 'row', backgroundColor: '#2E7D32', paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 4 },
  saveEditBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
