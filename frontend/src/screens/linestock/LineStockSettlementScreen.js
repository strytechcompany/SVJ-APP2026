import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineStockAPI, customerAPI } from '../../services/api';
import { useDashboard } from '../../context/DashboardContext';
import { resolveDisplayBalance } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function LineStockSettlementScreen({ route, navigation }) {
  const { transactionId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [loading, setLoading] = useState(true);
  const [savingItemId, setSavingItemId] = useState(null);

  const { goldRate: dashGoldRate } = useDashboard();
  const goldRatePerGram = dashGoldRate?.rate || 0;

  // Data
  const [transaction, setTransaction] = useState(null);
  const [customer, setCustomer] = useState(null);

  // Item Lists
  const [pendingItems, setPendingItems] = useState([]);
  const [soldItems, setSoldItems] = useState([]);
  const [returnedItems, setReturnedItems] = useState([]);

  // Payments & Remarks
  const [cash, setCash] = useState('');
  const [goldPayment, setGoldPayment] = useState('');
  const [remarks, setRemarks] = useState('');

  // Bill Style (Plus/Wastage print layout) — purely presentational, chosen
  // before saving so the settlement remembers it once created.
  const [billStyle, setBillStyle] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const txnRes = await lineStockAPI.getTransactionById(transactionId);

        if (txnRes.data.success) {
          const txn = txnRes.data.data;
          setTransaction(txn);

          let pending = txn.issuedProducts || [];

          // Restore any Sold Products already saved to a draft settlement,
          // so leaving and returning to this screen doesn't lose them.
          try {
            const draftRes = await lineStockAPI.getDraftSettlement(transactionId);
            const draft = draftRes.data.success ? draftRes.data.data : null;
            if (draft && draft.soldItems && draft.soldItems.length > 0) {
              const savedStockIds = new Set(draft.soldItems.map(s => String(s.stockId)));
              const restoredSold = pending
                .filter(p => savedStockIds.has(String(p.stockId)))
                .map(p => {
                  const draftItem = draft.soldItems.find(s => String(s.stockId) === String(p.stockId));
                  return { ...p, amount: String(draftItem.amount), saved: true };
                });
              pending = pending.filter(p => !savedStockIds.has(String(p.stockId)));
              setSoldItems(restoredSold);
            }
          } catch (e) {
            // Non-fatal — proceed without restoring a draft.
          }

          setPendingItems(pending);

          if (txn.customerId) {
            const custRes = await customerAPI.getById(txn.customerId._id || txn.customerId);
            if (custRes.data.success) setCustomer(custRes.data.data);
          }
        }
      } catch (err) {
        Alert.alert('Error', 'Failed to load settlement data');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [transactionId, navigation]);

  // Actions
  const handleMarkSold = (item) => {
    setPendingItems(prev => prev.filter(p => p._id !== item._id));
    setSoldItems(prev => [...prev, { ...item, amount: '', saved: false }]);
  };

  const handleMarkReturned = (item) => {
    setPendingItems(prev => prev.filter(p => p._id !== item._id));
    setReturnedItems(prev => [...prev, item]);
  };

  const handleRevert = async (item, fromList) => {
    if (fromList === 'sold') {
      setSoldItems(prev => prev.filter(p => p._id !== item._id));
      if (item.saved) {
        try {
          await lineStockAPI.deleteSoldItem(transactionId, item.stockId);
        } catch (e) {
          // Best-effort — local state is already reverted either way.
        }
      }
    }
    if (fromList === 'returned') setReturnedItems(prev => prev.filter(p => p._id !== item._id));
    setPendingItems(prev => [...prev, item]);
  };

  const handleSaveSoldItem = async (item) => {
    setSavingItemId(item._id);
    try {
      const res = await lineStockAPI.saveSoldItem({
        lineStockTransactionId: transactionId,
        customerId: customer._id,
        item: {
          stockId: item.stockId,
          itemNumber: item.itemNumber,
          barcode: item.barcode,
          itemName: item.itemName,
          weight: item.weight,
          purity: item.purity,
          count: item.count,
          amount: 0,
        },
      });
      if (res.data.success) {
        setSoldItems(prev => prev.map(p => p._id === item._id ? { ...p, saved: true } : p));
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save sold product.');
    } finally {
      setSavingItemId(null);
    }
  };

  // Auto-Calculations
  const totalIssuedCount = transaction?.totalItems || 0;
  const totalIssuedWeight = transaction?.totalGram || 0;

  const totalSoldItems = soldItems.reduce((sum, item) => sum + item.count, 0);
  const totalSoldWeight = soldItems.reduce((sum, item) => sum + item.weight, 0);

  const totalReturnedItems = returnedItems.reduce((sum, item) => sum + item.count, 0);
  const totalReturnedWeight = returnedItems.reduce((sum, item) => sum + item.weight, 0);

  const cashValue = parseFloat(cash) || 0;
  const goldValue = (parseFloat(goldPayment) || 0) * goldRatePerGram;
  const totalReceived = cashValue + goldValue;

  // The customer's TRUE current balance right now (already reflects Issue's
  // provisional "Previous + Full Issued Weight" commit) — shown at the top of
  // this screen so the admin sees what's really in MongoDB today.
  const liveOldBalance = customer ? customer.oldBalance : 0;
  const liveAdvanceBalance = customer ? customer.advance : 0;

  // The ORIGINAL pre-issue balance, frozen on the transaction at Issue time —
  // deliberately NOT the live value above. Settlement corrects from this
  // original snapshot using the real Sold/Return outcome, so it must never
  // compound on top of what Issue already added.
  const previousBalance = transaction ? (transaction.oldBalanceBefore || 0) : 0;
  const currentAdvance = transaction ? (transaction.advanceBalanceBefore || 0) : 0;

  // A Sold item draws down (or, if none, leaves untouched) the balance
  // recorded before this issue ever happened; a Returned item contributes
  // nothing (true no-op). An existing Advance Balance is drawn down first,
  // converting to Old Balance only once fully consumed by what's sold.
  let finalBalance, newAdvance;
  if (currentAdvance > 0 && previousBalance === 0) {
    const net = currentAdvance - totalSoldWeight;
    if (net < 0) { finalBalance = Math.abs(net); newAdvance = 0; }
    else { finalBalance = 0; newAdvance = net; }
  } else {
    const net = totalSoldWeight + previousBalance;
    if (net < 0) { finalBalance = 0; newAdvance = Math.abs(net); }
    else { finalBalance = net; newAdvance = 0; }
  }

  // Single-balance display rule (never show Old Balance and Advance together).
  const prevResolved = resolveDisplayBalance(previousBalance, currentAdvance);
  const finalResolved = resolveDisplayBalance(finalBalance, newAdvance);

  // Cancel — discard this settlement in progress and go back. Nothing has
  // been saved yet (Sold Products saved via the per-item Save icon are the
  // only thing already persisted, as an incremental draft).
  const handleCancel = () => {
    navigation.goBack();
  };

  // Preview — does NOT save anything. Hands the currently-entered items,
  // payments, remarks, and (mandatory) Bill Type to BillPreviewScreen as an
  // unsaved preview; the actual settlement is only created in MongoDB when
  // the admin taps "Save Bill" there.
  const handlePreview = () => {
    if (!billStyle) {
      Alert.alert('Bill Type Required', 'Please select a Bill Type.');
      return;
    }

    const goToPreview = () => {
      const previewPayload = {
        lineStockTransactionId: transactionId,
        customerId: customer._id,
        customerName: customer.customerName,
        customerPhone: customer.phoneNumber,
        soldItems: soldItems.map(s => ({
          stockId: s.stockId,
          itemNumber: s.itemNumber,
          barcode: s.barcode,
          itemName: s.itemName,
          weight: s.weight,
          purity: s.purity,
          count: s.count,
          amount: 0
        })),
        returnedItems: returnedItems.map(r => ({
          stockId: r.stockId,
          itemNumber: r.itemNumber,
          barcode: r.barcode,
          itemName: r.itemName,
          category: r.category,
          weight: r.weight,
          purity: r.purity,
          count: r.count
        })),
        paymentDetails: {
          cash: parseFloat(cash) || 0,
          online: 0,
          card: 0,
          gold: parseFloat(goldPayment) || 0,
          receivedGram: 0
        },
        remarks,
        billStyle,
        previousBalance,
        advanceBalanceBefore: currentAdvance,
        finalBalance,
        advanceBalance: newAdvance,
      };
      navigation.navigate('LineStockSettlementBillPreview', { previewPayload });
    };

    if (pendingItems.length > 0) {
      Alert.alert(
        'Partial Settlement',
        'You have items that are not marked as Sold or Returned. Are you sure you want to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: goToPreview }
        ]
      );
    } else {
      goToPreview();
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ marginTop: 12, color: DARK_BROWN, fontWeight: '600' }}>Loading Details...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Line Stock Settlement</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* Top Customer Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Transaction Details</Text>
          <View style={styles.row}><Text style={styles.label}>Transaction No:</Text><Text style={styles.value}>{transaction?.transactionNumber}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Stocker Name:</Text><Text style={styles.value}>{customer?.customerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{customer?.phoneNumber}</Text></View>
          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.label}>Current Old Balance:</Text><Text style={styles.value}>{Number(liveOldBalance).toFixed(3)}g</Text></View>
          <View style={styles.row}><Text style={styles.label}>Current Advance:</Text><Text style={styles.value}>{Number(liveAdvanceBalance).toFixed(3)}g</Text></View>
        </View>

        {/* Issued Products List */}
        {pendingItems.length > 0 && (
          <View style={[styles.section, { borderColor: '#F39C12', borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: '#F39C12' }]}>Pending Items ({pendingItems.length})</Text>
            {pendingItems.map((item, idx) => (
              <View key={item._id || idx} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text>
                  <Text style={styles.itemSub}>{item.barcode} | {item.purity}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: 12 }}>
                  <Text style={styles.itemWeight}>{Number(item.weight).toFixed(3)}g</Text>
                  <Text style={styles.itemSub}>{item.count} pcs</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity style={[styles.actionBtnSm, { backgroundColor: '#27AE60' }]} onPress={() => handleMarkSold(item)}>
                    <Text style={styles.actionBtnText}>Sold</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtnSm, { backgroundColor: '#E74C3C' }]} onPress={() => handleMarkReturned(item)}>
                    <Text style={styles.actionBtnText}>Ret</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* Sold Products Container */}
        {soldItems.length > 0 && (
          <View style={[styles.section, { borderColor: '#27AE60', borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: '#27AE60' }]}>Sold Products ({soldItems.length})</Text>
            {soldItems.map((item, idx) => (
              <View key={item._id || idx} style={styles.soldRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text>
                  <Text style={styles.itemSub}>{item.weight.toFixed(3)}g | {item.purity}</Text>
                </View>
                {item.saved ? (
                  <MaterialCommunityIcons name="check-circle" size={20} color="#27AE60" />
                ) : (
                  <TouchableOpacity
                    style={{ marginLeft: 8 }}
                    onPress={() => handleSaveSoldItem(item)}
                    disabled={savingItemId === item._id}
                  >
                    {savingItemId === item._id
                      ? <ActivityIndicator size="small" color="#27AE60" />
                      : <MaterialCommunityIcons name="content-save-outline" size={20} color="#27AE60" />}
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => handleRevert(item, 'sold')}>
                  <MaterialCommunityIcons name="undo" size={20} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Returned Products Container */}
        {returnedItems.length > 0 && (
          <View style={[styles.section, { borderColor: '#E74C3C', borderWidth: 1 }]}>
            <Text style={[styles.sectionTitle, { color: '#E74C3C' }]}>Returned Products ({returnedItems.length})</Text>
            {returnedItems.map((item, idx) => (
              <View key={item._id || idx} style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text>
                  <Text style={styles.itemSub}>{item.weight.toFixed(3)}g | {item.purity}</Text>
                </View>
                <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => handleRevert(item, 'returned')}>
                  <MaterialCommunityIcons name="undo" size={20} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* Payment Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Payments</Text>
          <View style={styles.paymentInputRow}>
            <Text style={styles.paymentLabel}>Cash (₹)</Text>
            <TextInput style={styles.paymentInput} keyboardType="numeric" value={cash} onChangeText={setCash} placeholder="0" />
          </View>
          <View style={styles.paymentInputRow}>
            <Text style={styles.paymentLabel}>Gold (g)</Text>
            <TextInput style={styles.paymentInput} keyboardType="numeric" value={goldPayment} onChangeText={setGoldPayment} placeholder="0.000" />
          </View>

          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.label}>Total Received:</Text><Text style={styles.value}>₹{totalReceived.toFixed(2)}</Text></View>
        </View>

        {/* Description Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Remarks</Text>
          <TextInput
            style={styles.textArea}
            placeholder="Settlement Remarks (e.g. Festival sales settlement)"
            placeholderTextColor="#C4A97A"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={remarks}
            onChangeText={setRemarks}
          />
        </View>

        {/* Bill Type — required before Save/Print, purely for print layout */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bill Type (Required)</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <TouchableOpacity
              style={[styles.actionBtnSm, { flex: 1, paddingVertical: 10, backgroundColor: billStyle === 'PLUS' ? GOLD : '#F0E4CC' }]}
              onPress={() => setBillStyle('PLUS')}
            >
              <Text style={[styles.actionBtnText, { color: DARK_BROWN, textAlign: 'center' }]}>Plus Bill</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtnSm, { flex: 1, paddingVertical: 10, backgroundColor: billStyle === 'WASTAGE' ? GOLD : '#F0E4CC' }]}
              onPress={() => setBillStyle('WASTAGE')}
            >
              <Text style={[styles.actionBtnText, { color: DARK_BROWN, textAlign: 'center' }]}>Wastage Bill</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Summary Table */}
        <View style={styles.summaryBox}>
          <Text style={styles.sectionTitle}>Settlement Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Issued Weight</Text><Text style={styles.summaryValue}>{totalIssuedWeight.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Sold Weight</Text><Text style={styles.summaryValue}>{totalSoldWeight.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Returned Weight</Text><Text style={styles.summaryValue}>{totalReturnedWeight.toFixed(3)}g</Text></View>
          
          <View style={styles.divider} />
          
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>{prevResolved.label === 'Current Balance' ? 'Previous Balance' : `Previous ${prevResolved.label}`}</Text><Text style={styles.summaryValue}>{prevResolved.value.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Sold Weight (Added to Balance)</Text><Text style={[styles.summaryValue, { color: '#E74C3C' }]}>+{totalSoldWeight.toFixed(3)}g</Text></View>
          {/* A fully returned item is a balance no-op (Outstanding = Issued - Returned = 0) — never deducted. */}
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Returned Deduction</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>0.000g</Text></View>

          <View style={styles.divider} />

          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Received (Cash + Gold)</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>₹{totalReceived.toFixed(2)}</Text></View>

          <View style={styles.divider} />

          {/* Single final balance — never shown alongside its counterpart. */}
          <View style={styles.summaryRow}><Text style={[styles.summaryLabel, {fontWeight: '800', color: DARK_BROWN}]}>{finalResolved.label}</Text><Text style={[styles.summaryValue, { color: finalResolved.value > 0 ? (finalResolved.label === 'Old Balance' ? '#E74C3C' : '#27AE60') : DARK_BROWN }]}>{finalResolved.value.toFixed(3)}g</Text></View>
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
  label: { fontSize: 12, color: '#8A6B3C', fontWeight: '600' },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 10 },
  itemRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0E4CC', paddingBottom: 8 },
  soldRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#F0E4CC', paddingBottom: 8 },
  itemName: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  itemSub: { fontSize: 11, color: '#8A6B3C' },
  itemWeight: { fontSize: 13, color: DARK_BROWN, fontWeight: '800' },
  actionBtnSm: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  actionBtnText: { color: '#FFF', fontSize: 11, fontWeight: '700' },
  amountInput: { width: 80, backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 8, height: 36, fontSize: 13, color: DARK_BROWN, textAlign: 'right' },
  paymentInputRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  paymentLabel: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  paymentInput: { width: 120, backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 12, height: 40, fontSize: 14, color: DARK_BROWN, textAlign: 'right' },
  textArea: { backgroundColor: '#FDFAF4', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', padding: 12, fontSize: 14, color: DARK_BROWN },
  summaryBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 24, borderWidth: 1, borderColor: GOLD },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  summaryValue: { fontSize: 15, color: DARK_BROWN, fontWeight: '800' },
  submitBtn: { flexDirection: 'row', backgroundColor: DARK_BROWN, paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 6, elevation: 4 },
  submitBtnText: { color: '#FFF', fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
});
