import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { customerAPI } from '../../services/api';
import { safeNumber } from '../../utils/safeNumber';
import { formatBalanceForCustomer } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function AdvanceBalanceSettlement({ route, navigation }) {
  const { customerId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);

  // Only one mode active at a time.
  const [settlementMode, setSettlementMode] = useState('CASH');
  const [cashAmount, setCashAmount] = useState('');
  // Gram Mode: Settlement Gram is always auto-calculated (Cash Amount ÷ Gold
  // Rate) — never entered directly.
  const [gramCashAmount, setGramCashAmount] = useState('');
  const [gramGoldRate, setGramGoldRate] = useState('');
  // Gram Entry Mode: admin types the settlement Gram directly, no cash calc.
  const [gramEntryInput, setGramEntryInput] = useState('');
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      try {
        // Always the latest balance from MongoDB — never a cached value.
        const res = await customerAPI.getById(customerId);
        if (res.data.success) setCustomer(res.data.data);
      } catch (e) {
        Alert.alert('Error', 'Failed to load customer details');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [customerId, navigation]);

  // Cash Mode settles using the Cash Amount directly (matching whatever unit
  // this customer's balance is actually stored in) — no Gold Rate conversion.
  // Gram Mode converts Cash Amount to gram via Gold Rate: Settlement Gram =
  // Cash Amount ÷ Gold Rate — recalculates live as either field changes.
  // Gram Entry Mode uses the typed Gram value directly — no cash calculation.
  const liveGram = settlementMode === 'CASH'
    ? safeNumber(parseFloat(cashAmount))
    : settlementMode === 'GRAM'
    ? (safeNumber(parseFloat(gramGoldRate)) > 0 ? safeNumber(safeNumber(parseFloat(gramCashAmount)) / safeNumber(parseFloat(gramGoldRate))) : 0)
    : safeNumber(parseFloat(gramEntryInput));

  const handleAddItem = () => {
    if (settlementMode === 'CASH') {
      if (!cashAmount) {
        Alert.alert('Error', 'Cash Amount is required.');
        return;
      }
      setItems(prev => [...prev, {
        id: Date.now().toString(), mode: 'CASH',
        cashAmount: safeNumber(parseFloat(cashAmount)), goldRate: 0,
        gram: liveGram,
      }]);
      setCashAmount('');
    } else if (settlementMode === 'GRAM') {
      if (!gramCashAmount || !gramGoldRate) {
        Alert.alert('Error', 'Cash Amount and Gold Rate are required.');
        return;
      }
      setItems(prev => [...prev, {
        id: Date.now().toString(), mode: 'GRAM',
        cashAmount: safeNumber(parseFloat(gramCashAmount)), goldRate: safeNumber(parseFloat(gramGoldRate)),
        gram: liveGram,
      }]);
      setGramCashAmount(''); setGramGoldRate('');
    } else {
      if (!gramEntryInput) {
        Alert.alert('Error', 'Gram is required.');
        return;
      }
      setItems(prev => [...prev, {
        id: Date.now().toString(), mode: 'GRAM_ENTRY',
        cashAmount: 0, goldRate: 0, gram: liveGram,
      }]);
      setGramEntryInput('');
    }
  };

  const handleRemoveItem = (id) => setItems(prev => prev.filter(i => i.id !== id));

  const totalSettlementGram = safeNumber(items.reduce((s, i) => s + i.gram, 0));
  const previousOldBalance = customer ? safeNumber(customer.oldBalance) : 0;
  const previousAdvanceBalance = customer ? safeNumber(customer.advance) : 0;

  const rawFinal = safeNumber(previousAdvanceBalance - totalSettlementGram);
  const finalAdvanceBalance = rawFinal < 0 ? 0 : rawFinal;
  const finalOldBalance = rawFinal < 0 ? safeNumber(previousOldBalance + Math.abs(rawFinal)) : previousOldBalance;

  // Cancel — discard this settlement in progress and go back. Nothing has
  // been saved yet.
  const handleCancel = () => {
    navigation.goBack();
  };

  // Preview — does NOT save anything. Hands the currently-entered items and
  // computed balances to the Preview screen as an unsaved preview; the actual
  // settlement is only created in MongoDB when the admin taps "Save Bill" there.
  const handlePreview = () => {
    if (items.length === 0) {
      Alert.alert('Validation Error', 'Please add at least one settlement item.');
      return;
    }
    const previewPayload = {
      customerId,
      customerName: customer?.customerName,
      customerPhone: customer?.phoneNumber,
      customerType: customer?.customerType,
      customerCategory: customer?.customerCategory,
      type: 'ADVANCE',
      settlementMode,
      items: items.map(({ mode, cashAmount, goldRate, gram }) => ({ mode, cashAmount, goldRate, gram })),
      totalSettlementGram,
      previousOldBalance,
      previousAdvanceBalance,
      finalOldBalance,
      finalAdvanceBalance,
    };
    navigation.navigate('AdvanceBalanceSettlementPreview', { previewPayload });
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Advance Balance Settlement</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Customer Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{customer?.customerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Phone Number:</Text><Text style={styles.value}>{customer?.phoneNumber}</Text></View>
          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.label}>Current Advance Balance:</Text><Text style={[styles.value, { color: '#2E7D32', fontSize: 15 }]}>{formatBalanceForCustomer(previousAdvanceBalance, customer)}</Text></View>
        </View>

        {/* Settlement Type Toggle */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settlement Type</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[styles.modeBtn, { backgroundColor: settlementMode === 'CASH' ? GOLD : '#F0E4CC' }]}
              onPress={() => setSettlementMode('CASH')}
            >
              <Text style={styles.modeBtnText}>Cash Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, { backgroundColor: settlementMode === 'GRAM' ? GOLD : '#F0E4CC' }]}
              onPress={() => setSettlementMode('GRAM')}
            >
              <Text style={styles.modeBtnText}>Gram Mode</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeBtn, { backgroundColor: settlementMode === 'GRAM_ENTRY' ? GOLD : '#F0E4CC' }]}
              onPress={() => setSettlementMode('GRAM_ENTRY')}
            >
              <Text style={styles.modeBtnText}>Gram Entry</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Cash / Gram Entry */}
        <View style={styles.section}>
          {settlementMode === 'CASH' ? (
            <>
              <Text style={styles.sectionTitle}>Cash Settlement</Text>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.label}>Cash Amount (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={cashAmount} onChangeText={setCashAmount} placeholder="0" />
              </View>
            </>
          ) : settlementMode === 'GRAM' ? (
            <>
              <Text style={styles.sectionTitle}>Gram Settlement</Text>
              <View style={styles.gridRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Cash Amount (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={gramCashAmount} onChangeText={setGramCashAmount} placeholder="0" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Gold Rate (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={gramGoldRate} onChangeText={setGramGoldRate} placeholder="0" />
                </View>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Settlement Gram:</Text>
                <Text style={styles.value}>{liveGram.toFixed(3)}g</Text>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Gram Entry</Text>
              <View style={{ marginBottom: 10 }}>
                <Text style={styles.label}>Gram (g)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={gramEntryInput} onChangeText={setGramEntryInput} placeholder="0.000" />
              </View>
            </>
          )}
          <TouchableOpacity style={styles.addItemBtn} onPress={handleAddItem}>
            <MaterialCommunityIcons name="plus" size={18} color="#FFF" />
            <Text style={styles.addItemBtnText}>Add Item</Text>
          </TouchableOpacity>
        </View>

        {/* Added Items */}
        {items.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Settlement Items ({items.length})</Text>
            {items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.mode === 'CASH' ? `Cash: ₹${item.cashAmount.toLocaleString('en-IN')}` : item.mode === 'GRAM' ? `₹${item.cashAmount.toLocaleString('en-IN')} @ ₹${item.goldRate}` : 'Gram Entry'}</Text>
                  <Text style={styles.itemSub}>{item.gram.toFixed(3)}g</Text>
                </View>
                <TouchableOpacity onPress={() => handleRemoveItem(item.id)}>
                  <MaterialCommunityIcons name="trash-can-outline" size={20} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Final Summary */}
        <View style={styles.summaryBox}>
          <Text style={styles.sectionTitle}>Final Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Settlement Gram</Text><Text style={styles.summaryValue}>{totalSettlementGram.toFixed(3)}g</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Current Advance Balance</Text><Text style={styles.summaryValue}>{formatBalanceForCustomer(previousAdvanceBalance, customer)}</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontWeight: '800' }]}>{finalAdvanceBalance > 0 ? 'Final Current Advance Balance' : 'Final Current Old Balance'}</Text>
            <Text style={[styles.summaryValue, { color: finalAdvanceBalance > 0 ? '#2E7D32' : '#D32F2F' }]}>
              {formatBalanceForCustomer(finalAdvanceBalance > 0 ? finalAdvanceBalance : finalOldBalance, customer)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1, backgroundColor: '#8A6B3C' }]}
            onPress={handleCancel}
          >
            <MaterialCommunityIcons name="close" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1, backgroundColor: '#2E7D32' }]}
            onPress={handlePreview}
          >
            <MaterialCommunityIcons name="eye-outline" size={20} color="#FFF" />
            <Text style={styles.submitBtnText}>Preview</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: HEADER_BG, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '800' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 12, color: '#8A6B3C', fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 10 },
  modeBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  modeBtnText: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  gridRow: { flexDirection: 'row', marginBottom: 10 },
  input: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: DARK_BROWN },
  addItemBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DARK_BROWN, paddingVertical: 12, borderRadius: 10, marginTop: 12 },
  addItemBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#F0E4CC', paddingBottom: 8 },
  itemName: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  itemSub: { fontSize: 12, color: '#8A6B3C', marginTop: 2 },
  summaryBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 24, borderWidth: 1, borderColor: GOLD },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: DARK_BROWN, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', backgroundColor: DARK_BROWN, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 4 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
