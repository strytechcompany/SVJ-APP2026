import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform, TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { lineStockAPI } from '../../services/api';
import { LineStockPrintService } from '../../services/PrintService';
import { safeNumber } from '../../utils/safeNumber';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

// Sign-aware balance conversion — mirrors backend/controllers/transactionController.js's
// computeSignAwareBalance / applyRemainderSubtraction so this preview matches what's saved.
const computeSignAwareBalance = (oldBefore, advanceBefore, delta) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    const newAdvance = safeNumber(advanceBefore - delta);
    return newAdvance < 0
      ? { oldAfter: safeNumber(Math.abs(newAdvance)), advanceAfter: 0 }
      : { oldAfter: 0, advanceAfter: newAdvance };
  }
  const newOld = safeNumber(oldBefore + delta);
  return newOld < 0
    ? { oldAfter: 0, advanceAfter: safeNumber(advanceBefore + Math.abs(newOld)) }
    : { oldAfter: newOld, advanceAfter: advanceBefore };
};
const applyRemainderSubtraction = (oldBalance, advanceBalance, subtraction) => {
  if (advanceBalance > 0 && oldBalance === 0) {
    const bal = safeNumber(advanceBalance - subtraction);
    return bal < 0
      ? { oldBalance: safeNumber(Math.abs(bal)), advanceBalance: 0 }
      : { oldBalance: 0, advanceBalance: bal };
  }
  const bal = safeNumber(oldBalance - subtraction);
  return bal < 0
    ? { oldBalance: 0, advanceBalance: safeNumber(advanceBalance + Math.abs(bal)) }
    : { oldBalance: bal, advanceBalance: advanceBalance };
};

export default function LineStockBillPreviewScreen({ route, navigation }) {
  const { transactionId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const printLockRef = useRef(false);

  // Bill Style (Plus/Wastage print layout) — purely presentational, saved
  // alongside the transaction so reopening the bill remembers the choice.
  const [billStyle, setBillStyle] = useState(null);
  const [editingBill, setEditingBill] = useState(false);
  const [notesInput, setNotesInput] = useState('');
  const [savingBillStyle, setSavingBillStyle] = useState(false);

  // WASTAGE Bill structure — a self-contained cash-based bill view built on
  // top of the real (gram-only) Line Stock issue. Never affects issuedProducts,
  // totalGram, stock, or the real oldBalanceBefore/After ledger.
  const [wIssuedItems, setWIssuedItems] = useState([]); // [{itemName, weight, wastage, rate}]
  const [wReceivedItems, setWReceivedItems] = useState([]); // [{id, receiptType, weight, rate}]
  const [wReceiptType, setWReceiptType] = useState('');
  const [wReceiptWeight, setWReceiptWeight] = useState('');
  const [wReceiptRate, setWReceiptRate] = useState('');
  const [wPaymentMode, setWPaymentMode] = useState('Cash');
  const [wCollectedAmount, setWCollectedAmount] = useState('');
  const [wPreviousOldBalance, setWPreviousOldBalance] = useState('0');
  const [wPreviousAdvanceBalance, setWPreviousAdvanceBalance] = useState('0');
  const [wSubtractionAmount, setWSubtractionAmount] = useState('');
  const [wReminderDate, setWReminderDate] = useState(null);
  const [showWReminderDatePicker, setShowWReminderDatePicker] = useState(false);
  const [savingWastageBill, setSavingWastageBill] = useState(false);

  useEffect(() => {
    const fetchBill = async () => {
      try {
        const res = await lineStockAPI.getTransactionById(transactionId);
        if (res.data.success) {
          const txn = res.data.data;
          setTransaction(txn);
          setBillStyle(txn.billStyle || null);
          setNotesInput(txn.description || '');

          if (txn.wastageBill) {
            setWIssuedItems((txn.wastageBill.issuedItems || []).map(i => ({
              itemName: i.itemName || 'Item', weight: i.weight, wastage: String(i.wastage ?? ''), rate: String(i.rate ?? ''),
            })));
            setWReceivedItems((txn.wastageBill.receivedItems || []).map((r, idx) => ({
              id: String(idx), receiptType: r.receiptType, weight: String(r.weight ?? ''), rate: String(r.rate ?? ''),
            })));
            setWPaymentMode(txn.wastageBill.paymentMode || 'Cash');
            setWCollectedAmount(String(txn.wastageBill.collectedAmount || ''));
            setWPreviousOldBalance(String(txn.wastageBill.oldBalanceBefore || 0));
            setWPreviousAdvanceBalance(String(txn.wastageBill.advanceBalanceBefore || 0));
            setWSubtractionAmount(String(txn.wastageBill.subtractionAmount || ''));
            setWReminderDate(txn.wastageBill.reminderDate ? new Date(txn.wastageBill.reminderDate) : null);
            setEditingBill(false);
          } else {
            // The underlying Stock item's own itemName is sometimes blank
            // (older stock records only had category/designName filled in) —
            // fall back through the other identifying fields so the bill
            // never shows an empty Item Name, matching the same fallback
            // IssueLineStockScreen.js's own product table already uses.
            setWIssuedItems((txn.issuedProducts || []).map(i => ({ itemName: i.itemName || i.category || i.itemNumber || 'Item', weight: i.weight, wastage: '', rate: '' })));
            // Live customer balance, never the stale Issue-time snapshot —
            // matches wPreviousAdvanceBalance below (same fetch).
            setWPreviousOldBalance(String(txn.customerId?.oldBalance || 0));
            setWPreviousAdvanceBalance(String(txn.customerId?.advance || 0));
            setEditingBill(true);
          }
        } else {
          Alert.alert('Error', 'Transaction not found', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load bill details');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [transactionId, navigation]);

  const handleSaveBill = async () => {
    setSavingBillStyle(true);
    try {
      const res = await lineStockAPI.updateBillStyle(transactionId, { billStyle, description: notesInput });
      if (res.data.success) {
        setTransaction(res.data.data);
        setEditingBill(false);
        Alert.alert('Success', 'Bill Saved Successfully');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save bill.');
    } finally {
      setSavingBillStyle(false);
    }
  };

  // --- WASTAGE Bill live calculations ---
  const wIssuedComputed = wIssuedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const wastage = parseFloat(it.wastage) || 0;
    const rate = parseFloat(it.rate) || 0;
    const ww = safeNumber(weight + wastage);
    const cash = safeNumber(ww * rate);
    return { ...it, ww, cash };
  });
  const wTotalWW = safeNumber(wIssuedComputed.reduce((s, i) => s + i.ww, 0));
  const wTotalIssueCash = safeNumber(wIssuedComputed.reduce((s, i) => s + i.cash, 0));

  const wReceivedComputed = wReceivedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const rate = parseFloat(it.rate) || 0;
    return { ...it, weight, rate, cash: safeNumber(weight * rate) };
  });
  const wTotalReceiptWeight = safeNumber(wReceivedComputed.reduce((s, i) => s + i.weight, 0));
  const wTotalReceiptCash = safeNumber(wReceivedComputed.reduce((s, i) => s + i.cash, 0));

  const wCollected = safeNumber(parseFloat(wCollectedAmount) || 0);
  const wFinalCash = safeNumber(wTotalIssueCash - wTotalReceiptCash - wCollected);
  const wPreviousOld = safeNumber(parseFloat(wPreviousOldBalance) || 0);
  const wPreviousAdvance = safeNumber(parseFloat(wPreviousAdvanceBalance) || 0);
  const wBalResult = computeSignAwareBalance(wPreviousOld, wPreviousAdvance, wFinalCash);
  const wSubtraction = safeNumber(parseFloat(wSubtractionAmount) || 0);
  const wFinalBalResult = applyRemainderSubtraction(wBalResult.oldAfter, wBalResult.advanceAfter, wSubtraction);
  const wPaymentStatus = wFinalCash > 0 ? 'Balance' : 'Paid';

  const updateWIssuedItemField = (idx, field, value) => {
    setWIssuedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const handleAddWReceivedItem = () => {
    if (!wReceiptType || !wReceiptWeight) {
      Alert.alert('Error', 'Type and Weight are required.');
      return;
    }
    setWReceivedItems(items => [...items, {
      id: Date.now().toString(), receiptType: wReceiptType, weight: wReceiptWeight, rate: wReceiptRate,
    }]);
    setWReceiptType(''); setWReceiptWeight(''); setWReceiptRate('');
  };
  const handleDeleteWReceivedItem = (id) => setWReceivedItems(items => items.filter(i => i.id !== id));

  // The actual MongoDB write for the Wastage bill — shared by "Save Bill" and
  // by Print/WhatsApp (which must never print an unsaved bill missing its
  // Bill Number; see saveWastageBillIfNeeded below).
  const saveWastageBillNow = async () => {
    const payload = {
      issuedItems: wIssuedComputed.map(({ itemName, weight, wastage, rate, ww, cash }) => ({
        itemName, weight: parseFloat(weight) || 0, wastage: parseFloat(wastage) || 0, rate: parseFloat(rate) || 0, ww, cash,
      })),
      receivedItems: wReceivedComputed.map(({ receiptType, weight, rate, cash }) => ({
        receiptType, weight, rate, cash,
      })),
      paymentMode: wPaymentMode,
      collectedAmount: wCollected,
      oldBalanceBefore: wPreviousOld,
      advanceBalanceBefore: wPreviousAdvance,
      oldBalanceAfter: wFinalBalResult.oldBalance,
      advanceBalanceAfter: wFinalBalResult.advanceBalance,
      subtractionAmount: wSubtraction,
      reminderDate: wReminderDate ? wReminderDate.toISOString() : null,
    };
    const res = await lineStockAPI.saveWastageBill(transactionId, payload);
    if (!res.data.success) throw new Error(res.data.message || 'Failed to save bill.');
    setTransaction(res.data.data);
    setEditingBill(false);
    return res.data.data;
  };

  const handleSaveWastageBill = async () => {
    setSavingWastageBill(true);
    try {
      await saveWastageBillNow();
      Alert.alert('Success', 'Bill Saved Successfully');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to save bill.');
    } finally {
      setSavingWastageBill(false);
    }
  };

  // Print/WhatsApp must always reflect what's actually saved in MongoDB — a
  // Wastage bill's Bill Number is only generated once it's saved, so printing
  // before Save Bill would show a blank Bill No (and any live-edited values
  // that never made it to the database). Save first (using whatever is
  // currently on screen) if it hasn't been saved yet, then build from the
  // confirmed saved transaction.
  const saveWastageBillIfNeeded = async () => {
    if (transaction.wastageBill) return transaction;
    return saveWastageBillNow();
  };

  // Builds the object to print/share from confirmed saved data — never from
  // empty/temporary in-memory variables.
  const buildPrintTransaction = async () => {
    if (billStyle !== 'WASTAGE') return { ...transaction, billStyle };
    const saved = await saveWastageBillIfNeeded();
    return { ...saved, billStyle };
  };

  const withPrintLock = async (stateSetter, fn) => {
    if (printLockRef.current) return;
    printLockRef.current = true;
    stateSetter(true);
    const timeout = setTimeout(() => { printLockRef.current = false; stateSetter(false); }, 60000);
    try {
      await fn();
    } catch (e) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Print Error', e?.message || 'Could not complete print action.');
      }
    } finally {
      clearTimeout(timeout);
      printLockRef.current = false;
      stateSetter(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ marginTop: 12, color: DARK_BROWN, fontWeight: '600' }}>Loading Bill...</Text>
      </View>
    );
  }

  if (!transaction) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => {
          // If we came from IssueLineStock, reset to Dashboard
          const routes = navigation.getState().routes;
          const prevRoute = routes[routes.length - 2];
          if (prevRoute && prevRoute.name === 'IssueLineStock') {
            navigation.popToTop();
          } else {
            navigation.goBack();
          }
        }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Bill Preview</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {billStyle === 'WASTAGE' ? (
          <View style={styles.billCard}>
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Bill No:</Text><Text style={styles.value}>{transaction.wastageBill?.billNo || 'Generating on save…'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{new Date(transaction.issueDate).toLocaleDateString('en-GB')}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Time:</Text><Text style={styles.value}>{new Date(transaction.issueDate).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
            <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{transaction.customerId?.customerName || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone Number:</Text><Text style={styles.value}>{transaction.customerId?.phoneNumber || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Old Balance:</Text><Text style={styles.value}>₹{wPreviousOld.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 2.2}]}>Item</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>WW(g)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>Rate(₹)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.4, textAlign: 'right'}]}>Cash(₹)</Text>
            </View>
            {wIssuedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 2.2}]}>{item.itemName || 'Item'}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{item.ww.toFixed(4)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(0)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.4, textAlign: 'right'}]}>{item.cash.toLocaleString('en-IN', {maximumFractionDigits:0})}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Wt: {Number(item.weight).toFixed(3)}g</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.wastage} onChangeText={(v) => updateWIssuedItemField(idx, 'wastage', v)} placeholder="Wastage" />
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateWIssuedItemField(idx, 'rate', v)} placeholder="Rate" />
                  </View>
                )}
              </View>
            ))}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>Total WW:</Text><Text style={styles.summaryValue}>{wTotalWW.toFixed(4)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Cash:</Text><Text style={styles.summaryValue}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>RECEIVED ITEMS</Text>
            {wReceivedComputed.length > 0 && (
              <>
                <View style={styles.tableHeaderRow}>
                  <Text style={[styles.tableHeaderText, {flex: 2.2}]}>Type</Text>
                  <Text style={[styles.tableHeaderText, {flex: 1.2}]}>Wt(g)</Text>
                  <Text style={[styles.tableHeaderText, {flex: 1.2}]}>Rate(₹)</Text>
                  <Text style={[styles.tableHeaderText, {flex: 1.4, textAlign: 'right'}]}>Cash(₹)</Text>
                </View>
                {wReceivedComputed.map((item, idx) => (
                  <View key={item.id || idx} style={styles.tableDataRow}>
                    <Text style={[styles.tableCellText, {flex: 2.2}]}>{item.receiptType}</Text>
                    <Text style={[styles.tableCellText, {flex: 1.2}]}>{Number(item.weight).toFixed(4)}</Text>
                    <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(0)}</Text>
                    <Text style={[styles.tableCellText, {flex: 1.3, textAlign: 'right'}]}>{item.cash.toLocaleString('en-IN', {maximumFractionDigits:0})}</Text>
                    {editingBill && (
                      <TouchableOpacity onPress={() => handleDeleteWReceivedItem(item.id)} style={{ marginLeft: 6 }}>
                        <MaterialCommunityIcons name="close-circle" size={16} color="#D32F2F" />
                      </TouchableOpacity>
                    )}
                  </View>
                ))}
              </>
            )}
            {editingBill && (
              <View style={styles.addItemRow}>
                <TextInput style={[styles.smallInput, {flex: 1.4}]} value={wReceiptType} onChangeText={setWReceiptType} placeholder="Type" />
                <TextInput style={styles.smallInput} keyboardType="numeric" value={wReceiptWeight} onChangeText={setWReceiptWeight} placeholder="Wt(g)" />
                <TextInput style={styles.smallInput} keyboardType="numeric" value={wReceiptRate} onChangeText={setWReceiptRate} placeholder="Rate" />
                <TouchableOpacity onPress={handleAddWReceivedItem} style={styles.addItemBtn}>
                  <MaterialCommunityIcons name="plus" size={18} color="#FFF" />
                </TouchableOpacity>
              </View>
            )}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>Total Weight:</Text><Text style={styles.summaryValue}>{wTotalReceiptWeight.toFixed(4)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Cash:</Text><Text style={styles.summaryValue}>₹{wTotalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
            {editingBill ? (
              <View style={styles.chipRow}>
                {['Cash', 'GPay', 'PhonePe', 'Card', 'UPI', 'Bank Transfer'].map(mode => (
                  <TouchableOpacity key={mode} style={[styles.chip, wPaymentMode === mode && styles.chipActive]} onPress={() => setWPaymentMode(mode)}>
                    <Text style={[styles.chipText, wPaymentMode === mode && styles.chipTextActive]}>{mode}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            ) : (
              <View style={styles.row}><Text style={styles.label}>Payment Mode:</Text><Text style={styles.value}>{wPaymentMode}</Text></View>
            )}
            {editingBill ? (
              <View style={{ marginTop: 8 }}>
                <Text style={styles.label}>Collected Amount (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={wCollectedAmount} onChangeText={setWCollectedAmount} placeholder="0" />
              </View>
            ) : (
              <View style={styles.row}><Text style={styles.label}>Collected Amount:</Text><Text style={styles.value}>₹{wCollected.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>SUMMARY</Text>
            <View style={styles.row}><Text style={styles.label}>Issue Cash:</Text><Text style={styles.value}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Receipt Cash:</Text><Text style={styles.value}>- ₹{wTotalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Collected Cash:</Text><Text style={styles.value}>- ₹{wCollected.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Final Cash:</Text><Text style={styles.summaryValue}>₹{wFinalCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Payment Type:</Text><Text style={styles.value}>{wPaymentMode}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Payment Status:</Text><Text style={[styles.value, {color: wPaymentStatus === 'Paid' ? '#27AE60' : '#E74C3C'}]}>{wPaymentStatus}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>BALANCE DETAILS</Text>
            {editingBill ? (
              <View style={styles.gridRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Previous Old Balance (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={wPreviousOldBalance} onChangeText={setWPreviousOldBalance} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Previous Advance (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={wPreviousAdvanceBalance} onChangeText={setWPreviousAdvanceBalance} />
                </View>
              </View>
            ) : (
              <>
                <View style={styles.row}><Text style={styles.label}>Previous Old Balance:</Text><Text style={styles.value}>₹{wPreviousOld.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                <View style={styles.row}><Text style={styles.label}>Previous Advance Balance:</Text><Text style={styles.value}>₹{wPreviousAdvance.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              </>
            )}
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>{wBalResult.oldAfter > 0 ? 'Current Old Balance:' : 'Current Advance Balance:'}</Text>
              <Text style={[styles.summaryValue, {color: wBalResult.oldAfter > 0 ? '#D32F2F' : '#27AE60'}]}>₹{(wBalResult.oldAfter > 0 ? wBalResult.oldAfter : wBalResult.advanceAfter).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>REMAINDER TABLE</Text>
            {editingBill ? (
              <View style={{ marginBottom: 8 }}>
                <Text style={styles.label}>Subtraction Amount (₹)</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={wSubtractionAmount} onChangeText={setWSubtractionAmount} placeholder="0" />
              </View>
            ) : (
              <View style={styles.row}><Text style={styles.label}>Subtraction Amount:</Text><Text style={styles.value}>₹{wSubtraction.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            )}
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Current Balance:</Text>
              <Text style={[styles.summaryValue, {color: wFinalBalResult.oldBalance > 0 ? '#D32F2F' : '#27AE60'}]}>₹{(wFinalBalResult.oldBalance > 0 ? wFinalBalResult.oldBalance : wFinalBalResult.advanceBalance).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
            {editingBill ? (
              <View style={{ marginTop: 4 }}>
                <Text style={styles.label}>Reminder Date (optional)</Text>
                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowWReminderDatePicker(true)}>
                  <MaterialCommunityIcons name="calendar" size={18} color={GOLD} style={{ marginRight: 8 }} />
                  <Text style={styles.dateText}>{wReminderDate ? wReminderDate.toLocaleDateString('en-GB') : 'Select a date'}</Text>
                </TouchableOpacity>
                {showWReminderDatePicker && (
                  <DateTimePicker
                    value={wReminderDate || new Date()}
                    mode="date"
                    display="default"
                    onChange={(e, date) => { setShowWReminderDatePicker(false); if (date) setWReminderDate(date); }}
                  />
                )}
              </View>
            ) : (
              <View style={styles.row}><Text style={styles.label}>Reminder Date:</Text><Text style={styles.value}>{wReminderDate ? wReminderDate.toLocaleDateString('en-GB') : '—'}</Text></View>
            )}
          </View>
        ) : (
          <View style={styles.billCard}>
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.label}>Transaction No:</Text>
              <Text style={styles.value}>{transaction.transactionNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Issue Date:</Text>
              <Text style={styles.value}>{new Date(transaction.issueDate).toLocaleDateString('en-GB')}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Expected Return:</Text>
              <Text style={[styles.value, { color: '#E74C3C' }]}>{new Date(transaction.expectedReturnDate).toLocaleDateString('en-GB')}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>LINE STOCKER</Text>
            <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{transaction.customerId?.customerName || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{transaction.customerId?.phoneNumber || 'N/A'}</Text></View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
            {transaction.issuedProducts?.map((item, idx) => (
              <View key={idx} style={styles.itemRow}>
                <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName || 'Item'} ({item.itemNumber || 'N/A'})</Text><Text style={styles.itemSub}>Barcode: {item.barcode || 'N/A'} | {item.category} | {item.purity}</Text></View>
                <View style={{ alignItems: 'flex-end' }}><Text style={styles.itemCount}>{item.count} pcs</Text><Text style={styles.itemWeight}>{Number(item.weight).toFixed(3)} g</Text></View>
              </View>
            ))}

            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Total Items:</Text><Text style={styles.summaryValue}>{transaction.totalItems}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Weight Issued:</Text><Text style={styles.summaryValue}>{Number(transaction.totalGram).toFixed(3)}g</Text></View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.label}>{transaction.advanceBalanceBefore > 0 ? 'Advance Balance Before:' : 'Old Balance Before:'}</Text>
              <Text style={styles.value}>{Number(transaction.advanceBalanceBefore > 0 ? transaction.advanceBalanceBefore : transaction.oldBalanceBefore).toFixed(3)}g</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>{transaction.advanceBalanceAfter > 0 ? 'Advance Balance After:' : 'Old Balance After:'}</Text>
              <Text style={[styles.summaryValue, { color: transaction.advanceBalanceAfter > 0 ? '#27AE60' : '#D32F2F' }]}>
                {Number(transaction.advanceBalanceAfter > 0 ? transaction.advanceBalanceAfter : transaction.oldBalanceAfter).toFixed(3)}g
              </Text>
            </View>

            {editingBill && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>NOTES</Text>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  value={notesInput}
                  onChangeText={setNotesInput}
                  placeholder="Add notes for this bill..."
                />
              </>
            )}
          </View>
        )}
      </ScrollView>

      {/* Fixed Actions Footer */}
      <View style={styles.actionsContainer}>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: billStyle === 'PLUS' ? GOLD : '#E8DCC4' }]}
            onPress={() => setBillStyle('PLUS')}
          >
            {billStyle === 'PLUS' && <MaterialCommunityIcons name="check-circle" size={16} color={DARK_BROWN} />}
            <Text style={[styles.actionText, { color: DARK_BROWN }]}>Plus Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { backgroundColor: billStyle === 'WASTAGE' ? GOLD : '#E8DCC4' }]}
            onPress={() => {
              setBillStyle('WASTAGE');
              if (!transaction.wastageBill) setEditingBill(true);
            }}
          >
            {billStyle === 'WASTAGE' && <MaterialCommunityIcons name="check-circle" size={16} color={DARK_BROWN} />}
            <Text style={[styles.actionText, { color: DARK_BROWN }]}>Wastage Bill</Text>
          </TouchableOpacity>
        </View>

        {billStyle && (
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#8A6B3C' }]}
              onPress={() => setEditingBill(v => !v)}
            >
              <MaterialCommunityIcons name="pencil-outline" size={18} color="#FFF" />
              <Text style={styles.actionText}>{editingBill ? 'Cancel Edit' : 'Edit Bill'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#2E7D32' }, (savingBillStyle || savingWastageBill) && { opacity: 0.6 }]}
              disabled={savingBillStyle || savingWastageBill}
              onPress={billStyle === 'WASTAGE' ? handleSaveWastageBill : handleSaveBill}
            >
              {(savingBillStyle || savingWastageBill) ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />}
              <Text style={styles.actionText}>{(savingBillStyle || savingWastageBill) ? 'Saving…' : 'Save Bill'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={[styles.actionBtn, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setPrinting, async () => LineStockPrintService.printBill(await buildPrintTransaction()))}
          >
            {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print Bill'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, {backgroundColor: '#25D366'}, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setSharing, async () => LineStockPrintService.shareWhatsApp(await buildPrintTransaction()))}
          >
            {sharing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.actionBtn, {backgroundColor: '#2E7D32', marginTop: 12}]}
          disabled={printing || sharing}
          onPress={() => navigation.navigate('LineStockDashboard')}
        >
          <MaterialCommunityIcons name="content-save-check" size={20} color="#FFF" />
          <Text style={styles.actionText}>Save Transaction</Text>
        </TouchableOpacity>
      </View>
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
  scrollContent: { padding: 16, paddingBottom: 160 },
  billCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, elevation: 3 },
  shopName: { fontSize: 18, fontWeight: '800', color: DARK_BROWN, textAlign: 'center' },
  billType: { fontSize: 13, fontWeight: '700', color: '#8A6B3C', textAlign: 'center', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: '#8A6B3C', fontWeight: '600' },
  value: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  summaryValue: { fontSize: 15, color: DARK_BROWN, fontWeight: '800' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  itemName: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  itemSub: { fontSize: 11, color: '#8A6B3C', marginTop: 2 },
  itemCount: { fontSize: 12, color: DARK_BROWN, fontWeight: '600' },
  itemWeight: { fontSize: 13, color: DARK_BROWN, fontWeight: '800', marginTop: 2 },
  notesInput: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', padding: 10, fontSize: 13, color: DARK_BROWN, minHeight: 60, textAlignVertical: 'top' },
  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 16, elevation: 20, borderTopWidth: 1, borderTopColor: '#F0E4CC' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: DARK_BROWN, paddingVertical: 14, borderRadius: 12, gap: 8 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  // WASTAGE bill structure
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E8D8B8', paddingBottom: 6, marginBottom: 6 },
  tableHeaderText: { fontSize: 11, fontWeight: '800', color: '#8A6B3C', textTransform: 'uppercase' },
  tableDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderColor: '#F5EFE6' },
  tableCellText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  editItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 4 },
  editItemLabel: { fontSize: 11, color: '#8A6B3C', fontWeight: '600', width: 60 },
  smallInput: { flex: 1, backgroundColor: '#FDFAF4', borderRadius: 6, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: DARK_BROWN },
  addItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4, marginBottom: 4 },
  addItemBtn: { backgroundColor: GOLD, width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F0E4CC' },
  chipActive: { backgroundColor: GOLD },
  chipText: { fontSize: 11, color: '#8A6B3C', fontWeight: '700' },
  chipTextActive: { color: DARK_BROWN },
  input: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: DARK_BROWN },
  gridRow: { flexDirection: 'row' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDFAF4', borderWidth: 1, borderColor: '#E8D8B8', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10 },
  dateText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
});
