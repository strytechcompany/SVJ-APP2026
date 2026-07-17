import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineStockAPI, customerAPI } from '../../services/api';
import { LineStockSettlementPrintService } from '../../services/PrintService';
import { useDashboard } from '../../context/DashboardContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function LineStockSettlementScreen({ route, navigation }) {
  const { transactionId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAndPrinting, setSavingAndPrinting] = useState(false);
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

  const updateSoldAmount = (itemId, amount) => {
    setSoldItems(prev => prev.map(p => p._id === itemId ? { ...p, amount } : p));
  };

  const handleSaveSoldItem = async (item) => {
    if (!item.amount || parseFloat(item.amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid sold amount.');
      return;
    }
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
          amount: parseFloat(item.amount) || 0,
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

  const handleEditSoldItem = (item) => {
    setSoldItems(prev => prev.map(p => p._id === item._id ? { ...p, saved: false } : p));
  };

  // Auto-Calculations
  const totalIssuedCount = transaction?.totalItems || 0;
  const totalIssuedWeight = transaction?.totalGram || 0;

  const totalSoldItems = soldItems.reduce((sum, item) => sum + item.count, 0);
  const totalSoldWeight = soldItems.reduce((sum, item) => sum + item.weight, 0);
  const totalSoldAmount = soldItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);

  const totalReturnedItems = returnedItems.reduce((sum, item) => sum + item.count, 0);
  const totalReturnedWeight = returnedItems.reduce((sum, item) => sum + item.weight, 0);

  const cashValue = parseFloat(cash) || 0;
  const goldValue = (parseFloat(goldPayment) || 0) * goldRatePerGram;
  const totalReceived = cashValue + goldValue;

  const previousBalance = customer ? customer.oldBalance : 0;
  const currentAdvance = customer ? customer.advance : 0;

  // As per user request: deduct BOTH sold weight and returned weight from the balance.
  let finalBalance = previousBalance - totalSoldWeight - totalReturnedWeight;
  let newAdvance = currentAdvance;

  if (finalBalance < 0) {
    newAdvance += Math.abs(finalBalance);
    finalBalance = 0;
  }

  // Submission
  const handleSettle = async (action = 'save') => {
    if (pendingItems.length > 0) {
      Alert.alert(
        'Partial Settlement',
        'You have items that are not marked as Sold or Returned. Are you sure you want to proceed?',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Proceed', onPress: () => submitSettlement(action) }
        ]
      );
    } else {
      submitSettlement(action);
    }
  };

  const submitSettlement = async (action) => {
    if (action === 'print') setSavingAndPrinting(true);
    else setSaving(true);
    
    try {
      const payload = {
        lineStockTransactionId: transactionId,
        customerId: customer._id,
        soldItems: soldItems.map(s => ({
          stockId: s.stockId,
          itemNumber: s.itemNumber,
          barcode: s.barcode,
          itemName: s.itemName,
          weight: s.weight,
          purity: s.purity,
          count: s.count,
          amount: parseFloat(s.amount) || 0
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
        remarks
      };

      const res = await lineStockAPI.settleStock(payload);
      if (res.data.success) {
        if (action === 'print') {
          await LineStockSettlementPrintService.printBill(res.data.data);
          navigation.navigate('LineStockDashboard');
        } else {
          Alert.alert('Settled', 'Settlement completed successfully!', [
            { text: 'View Bill', onPress: () => navigation.navigate('LineStockSettlementBillPreview', { settlementId: res.data.data._id }) }
          ]);
        }
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to settle stock');
    } finally {
      setSaving(false);
      setSavingAndPrinting(false);
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
          <View style={styles.row}><Text style={styles.label}>Current Old Balance:</Text><Text style={styles.value}>{Number(previousBalance).toFixed(3)}g</Text></View>
          <View style={styles.row}><Text style={styles.label}>Current Advance:</Text><Text style={styles.value}>{Number(currentAdvance).toFixed(3)}g</Text></View>
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
                  <>
                    <Text style={[styles.amountInput, { paddingTop: 8 }]}>₹{(parseFloat(item.amount) || 0).toFixed(2)}</Text>
                    <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => handleEditSoldItem(item)}>
                      <MaterialCommunityIcons name="pencil-outline" size={20} color={DARK_BROWN} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TextInput
                      style={styles.amountInput}
                      placeholder="₹ Amount"
                      keyboardType="numeric"
                      value={item.amount}
                      onChangeText={(val) => updateSoldAmount(item._id, val)}
                    />
                    <TouchableOpacity
                      style={{ marginLeft: 8 }}
                      onPress={() => handleSaveSoldItem(item)}
                      disabled={savingItemId === item._id}
                    >
                      {savingItemId === item._id
                        ? <ActivityIndicator size="small" color="#27AE60" />
                        : <MaterialCommunityIcons name="content-save-outline" size={20} color="#27AE60" />}
                    </TouchableOpacity>
                  </>
                )}
                <TouchableOpacity style={{ marginLeft: 8 }} onPress={() => handleRevert(item, 'sold')}>
                  <MaterialCommunityIcons name="undo" size={20} color="#E74C3C" />
                </TouchableOpacity>
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>Total Sold Amount:</Text><Text style={[styles.value, { color: '#27AE60' }]}>₹{totalSoldAmount.toFixed(2)}</Text></View>
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

        {/* Summary Table */}
        <View style={styles.summaryBox}>
          <Text style={styles.sectionTitle}>Settlement Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Issued Weight</Text><Text style={styles.summaryValue}>{totalIssuedWeight.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Sold Weight</Text><Text style={styles.summaryValue}>{totalSoldWeight.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Returned Weight</Text><Text style={styles.summaryValue}>{totalReturnedWeight.toFixed(3)}g</Text></View>
          
          <View style={styles.divider} />
          
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Previous Balance</Text><Text style={styles.summaryValue}>{previousBalance.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Sold Weight Deduction</Text><Text style={[styles.summaryValue, { color: '#E74C3C' }]}>-{totalSoldWeight.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Returned Deduction</Text><Text style={[styles.summaryValue, { color: '#E74C3C' }]}>-{totalReturnedWeight.toFixed(3)}g</Text></View>
          
          <View style={styles.divider} />
          
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Received (Cash + Gold)</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>₹{totalReceived.toFixed(2)}</Text></View>

          <View style={styles.divider} />
          
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Final Balance</Text><Text style={[styles.summaryValue, { color: finalBalance > 0 ? '#E74C3C' : '#27AE60' }]}>{finalBalance.toFixed(3)}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Advance Balance</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>{newAdvance.toFixed(3)}g</Text></View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity 
            style={[styles.submitBtn, { flex: 1 }, (saving || savingAndPrinting) && { opacity: 0.7 }]}
            disabled={saving || savingAndPrinting}
            onPress={() => handleSettle('save')}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="content-save" size={20} color="#FFF" />}
            <Text style={styles.submitBtnText}>{saving ? 'Saving...' : 'Save'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.submitBtn, { flex: 1, backgroundColor: '#2E7D32' }, (saving || savingAndPrinting) && { opacity: 0.7 }]}
            disabled={saving || savingAndPrinting}
            onPress={() => handleSettle('print')}
          >
            {savingAndPrinting ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.submitBtnText}>{savingAndPrinting ? 'Printing...' : 'Save & Print'}</Text>
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
