import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform, TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineStockAPI } from '../../services/api';
import { LineStockSettlementPrintService } from '../../services/PrintService';
import { safeNumber } from '../../utils/safeNumber';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

// Case 1 (Old Balance active, or neither): Final = (Issue Total + Previous Old) - Receipt Total.
// Case 2 (Advance active): Final = Issue Total - (Previous Advance + Receipt Total).
// Either case auto-converts a sign flip instead of ever leaving the result negative.
// Shared by both the PLUS (gram) and WASTAGE (cash) bill structures — same shape,
// different totals. Mirrors backend/controllers/transactionController.js's computePlusOutstanding.
const computeCase1Case2Balance = (oldBefore, advanceBefore, issueTotal, receiptTotal) => {
  if (advanceBefore > 0 && oldBefore === 0) {
    const final = safeNumber(issueTotal - (advanceBefore + receiptTotal));
    return final < 0
      ? { oldAfter: safeNumber(Math.abs(final)), advanceAfter: 0 }
      : { oldAfter: 0, advanceAfter: final };
  }
  const final = safeNumber((issueTotal + oldBefore) - receiptTotal);
  return final < 0
    ? { oldAfter: 0, advanceAfter: safeNumber(Math.abs(final)) }
    : { oldAfter: final, advanceAfter: 0 };
};

export default function LineStockSettlementBillPreviewScreen({ route, navigation }) {
  const { settlementId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [settlement, setSettlement] = useState(null);
  const [loading, setLoading] = useState(true);

  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const printLockRef = useRef(false);

  // Bill Style (Plus/Wastage) — chosen (compulsory) before this settlement was
  // created; kept editable here only for backward compatibility with older
  // settlements that predate the compulsory requirement.
  const [billStyle, setBillStyle] = useState(null);
  const [editingBill, setEditingBill] = useState(false);
  const [remarksInput, setRemarksInput] = useState('');
  const [savingBillStyle, setSavingBillStyle] = useState(false);

  // PLUS Bill structure — gram-based, built from the settlement's own Sold
  // (Issued) / Returned (Received) items. Purely additive: never touches
  // soldItems, returnedItems, finalBalance, advanceBalance, or the real
  // customer balance already applied when the settlement was created.
  const [pIssuedItems, setPIssuedItems] = useState([]); // [{itemName, weight, actualTouch}]
  const [pReceivedItems, setPReceivedItems] = useState([]); // [{itemName, weight, buyingTouch}]
  const [pPreviousOld, setPPreviousOld] = useState('0');
  const [pPreviousAdvance, setPPreviousAdvance] = useState('0');

  // WASTAGE Bill structure — cash-based (Weight × manually-entered Rate = Cash).
  const [wIssuedItems, setWIssuedItems] = useState([]); // [{itemName, weight, rate}]
  const [wReceivedItems, setWReceivedItems] = useState([]); // [{itemName, weight, rate}]
  const [wPreviousOld, setWPreviousOld] = useState('0');
  const [wPreviousAdvance, setWPreviousAdvance] = useState('0');

  useEffect(() => {
    const fetchBill = async () => {
      try {
        const res = await lineStockAPI.getSettlementById(settlementId);
        if (res.data.success) {
          const s = res.data.data;
          setSettlement(s);
          setBillStyle(s.billStyle || null);
          setRemarksInput(s.remarks || '');

          if (s.plusBill) {
            setPIssuedItems((s.plusBill.issuedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, actualTouch: String(i.actualTouch ?? '') })));
            setPReceivedItems((s.plusBill.receivedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, buyingTouch: String(i.buyingTouch ?? '') })));
            setPPreviousOld(String(s.plusBill.oldBalanceBefore || 0));
            setPPreviousAdvance(String(s.plusBill.advanceBalanceBefore || 0));
          } else {
            setPIssuedItems((s.soldItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, actualTouch: '' })));
            setPReceivedItems((s.returnedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, buyingTouch: '' })));
            setPPreviousOld(String(s.previousBalance || 0));
            setPPreviousAdvance('0');
          }

          if (s.wastageBill) {
            setWIssuedItems((s.wastageBill.issuedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, rate: String(i.rate ?? '') })));
            setWReceivedItems((s.wastageBill.receivedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, rate: String(i.rate ?? '') })));
            setWPreviousOld(String(s.wastageBill.oldBalanceBefore || 0));
            setWPreviousAdvance(String(s.wastageBill.advanceBalanceBefore || 0));
          } else {
            setWIssuedItems((s.soldItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, rate: '' })));
            setWReceivedItems((s.returnedItems || []).map(i => ({ itemName: i.itemName, weight: i.weight, rate: '' })));
            setWPreviousOld(String(s.previousBalance || 0));
            setWPreviousAdvance('0');
          }

          // First time viewing the chosen style with no saved bill sub-document yet — start in edit mode.
          if ((s.billStyle === 'PLUS' && !s.plusBill) || (s.billStyle === 'WASTAGE' && !s.wastageBill)) {
            setEditingBill(true);
          }
        } else {
          Alert.alert('Error', 'Settlement not found', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load settlement details');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [settlementId, navigation]);

  // --- PLUS Bill live calculations ---
  const pIssuedComputed = pIssuedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const actualTouch = parseFloat(it.actualTouch) || 0;
    return { ...it, purity: safeNumber(weight * (actualTouch / 100)) };
  });
  const pTotalIssueGram = safeNumber(pIssuedComputed.reduce((s, i) => s + i.purity, 0));
  const pReceivedComputed = pReceivedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const buyingTouch = parseFloat(it.buyingTouch) || 0;
    return { ...it, purity: safeNumber(weight * (buyingTouch / 100)) };
  });
  const pTotalReceiptGram = safeNumber(pReceivedComputed.reduce((s, i) => s + i.purity, 0));
  const pPreviousOldVal = safeNumber(parseFloat(pPreviousOld) || 0);
  const pPreviousAdvanceVal = safeNumber(parseFloat(pPreviousAdvance) || 0);
  const pBalResult = computeCase1Case2Balance(pPreviousOldVal, pPreviousAdvanceVal, pTotalIssueGram, pTotalReceiptGram);

  // --- WASTAGE Bill live calculations ---
  const wIssuedComputed = wIssuedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const rate = parseFloat(it.rate) || 0;
    return { ...it, cash: safeNumber(weight * rate) };
  });
  const wTotalIssueCash = safeNumber(wIssuedComputed.reduce((s, i) => s + i.cash, 0));
  const wReceivedComputed = wReceivedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const rate = parseFloat(it.rate) || 0;
    return { ...it, cash: safeNumber(weight * rate) };
  });
  const wTotalReceiptCash = safeNumber(wReceivedComputed.reduce((s, i) => s + i.cash, 0));
  const wPreviousOldVal = safeNumber(parseFloat(wPreviousOld) || 0);
  const wPreviousAdvanceVal = safeNumber(parseFloat(wPreviousAdvance) || 0);
  const wBalResult = computeCase1Case2Balance(wPreviousOldVal, wPreviousAdvanceVal, wTotalIssueCash, wTotalReceiptCash);

  const updatePIssuedField = (idx, field, value) => setPIssuedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const updatePReceivedField = (idx, field, value) => setPReceivedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const updateWIssuedField = (idx, field, value) => setWIssuedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const updateWReceivedField = (idx, field, value) => setWReceivedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  const handleSaveBill = async () => {
    setSavingBillStyle(true);
    try {
      const res = await lineStockAPI.updateSettlementBillStyle(settlementId, { billStyle, remarks: remarksInput });
      if (res.data.success) {
        setSettlement(res.data.data);
        setEditingBill(false);
        Alert.alert('Success', 'Bill Saved Successfully');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save bill.');
    } finally {
      setSavingBillStyle(false);
    }
  };

  const handleSavePlusBill = async () => {
    setSavingBillStyle(true);
    try {
      const payload = {
        issuedItems: pIssuedComputed.map(({ itemName, weight, actualTouch, purity }) => ({
          itemName, weight: parseFloat(weight) || 0, actualTouch: parseFloat(actualTouch) || 0, purity,
        })),
        receivedItems: pReceivedComputed.map(({ itemName, weight, buyingTouch, purity }) => ({
          itemName, weight: parseFloat(weight) || 0, buyingTouch: parseFloat(buyingTouch) || 0, purity,
        })),
        oldBalanceBefore: pPreviousOldVal,
        advanceBalanceBefore: pPreviousAdvanceVal,
        oldBalanceAfter: pBalResult.oldAfter,
        advanceBalanceAfter: pBalResult.advanceAfter,
      };
      const res = await lineStockAPI.saveSettlementPlusBill(settlementId, payload);
      if (res.data.success) {
        setSettlement(res.data.data);
        setEditingBill(false);
        Alert.alert('Success', 'Bill Saved Successfully');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save bill.');
    } finally {
      setSavingBillStyle(false);
    }
  };

  const handleSaveWastageBill = async () => {
    setSavingBillStyle(true);
    try {
      const payload = {
        issuedItems: wIssuedComputed.map(({ itemName, weight, rate, cash }) => ({
          itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash,
        })),
        receivedItems: wReceivedComputed.map(({ itemName, weight, rate, cash }) => ({
          itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash,
        })),
        oldBalanceBefore: wPreviousOldVal,
        advanceBalanceBefore: wPreviousAdvanceVal,
        oldBalanceAfter: wBalResult.oldAfter,
        advanceBalanceAfter: wBalResult.advanceAfter,
      };
      const res = await lineStockAPI.saveSettlementWastageBill(settlementId, payload);
      if (res.data.success) {
        setSettlement(res.data.data);
        setEditingBill(false);
        Alert.alert('Success', 'Bill Saved Successfully');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save bill.');
    } finally {
      setSavingBillStyle(false);
    }
  };

  // Builds the object to print/share — reflects the live on-screen state
  // (including unsaved edits) so Print always matches what's currently shown.
  const buildPrintSettlement = () => {
    if (billStyle === 'PLUS') {
      return {
        ...settlement,
        billStyle,
        plusBill: {
          issuedItems: pIssuedComputed.map(({ itemName, weight, actualTouch, purity }) => ({
            itemName, weight: parseFloat(weight) || 0, actualTouch: parseFloat(actualTouch) || 0, purity,
          })),
          receivedItems: pReceivedComputed.map(({ itemName, weight, buyingTouch, purity }) => ({
            itemName, weight: parseFloat(weight) || 0, buyingTouch: parseFloat(buyingTouch) || 0, purity,
          })),
          oldBalanceBefore: pPreviousOldVal,
          advanceBalanceBefore: pPreviousAdvanceVal,
          oldBalanceAfter: pBalResult.oldAfter,
          advanceBalanceAfter: pBalResult.advanceAfter,
        },
      };
    }
    if (billStyle === 'WASTAGE') {
      return {
        ...settlement,
        billStyle,
        wastageBill: {
          issuedItems: wIssuedComputed.map(({ itemName, weight, rate, cash }) => ({
            itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash,
          })),
          receivedItems: wReceivedComputed.map(({ itemName, weight, rate, cash }) => ({
            itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash,
          })),
          oldBalanceBefore: wPreviousOldVal,
          advanceBalanceBefore: wPreviousAdvanceVal,
          oldBalanceAfter: wBalResult.oldAfter,
          advanceBalanceAfter: wBalResult.advanceAfter,
        },
      };
    }
    return { ...settlement, billStyle };
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

  if (!settlement) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => {
          // If we came from Settlement screen, reset to Dashboard
          const routes = navigation.getState().routes;
          const prevRoute = routes[routes.length - 2];
          if (prevRoute && prevRoute.name === 'LineStockSettlement') {
            navigation.popToTop();
          } else {
            navigation.goBack();
          }
        }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Settlement Bill</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {billStyle === 'PLUS' ? (
          <View style={styles.billCard}>
            <Text style={styles.shopName}>SRI VAISHNAVI JEWELLERS</Text>
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Bill No:</Text><Text style={styles.value}>{settlement.settlementNumber}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Time:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
            <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber}</Text></View>
            {editingBill ? (
              <View style={styles.gridRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Previous Old Balance (g)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={pPreviousOld} onChangeText={setPPreviousOld} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Previous Advance (g)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={pPreviousAdvance} onChangeText={setPPreviousAdvance} />
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <Text style={styles.label}>{pPreviousAdvanceVal > 0 && pPreviousOldVal === 0 ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</Text>
                <Text style={styles.value}>{(pPreviousAdvanceVal > 0 && pPreviousOldVal === 0 ? pPreviousAdvanceVal : pPreviousOldVal).toFixed(3)}g</Text>
              </View>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 2}]}>Item</Text>
              <Text style={[styles.tableHeaderText, {flex: 1}]}>Wt(g)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>A.Tch%</Text>
              <Text style={[styles.tableHeaderText, {flex: 1, textAlign: 'right'}]}>Purity</Text>
            </View>
            {pIssuedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 2}]}>{item.itemName}</Text>
                  <Text style={[styles.tableCellText, {flex: 1}]}>{Number(item.weight).toFixed(3)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.actualTouch).toFixed(2)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1, textAlign: 'right'}]}>{item.purity.toFixed(3)}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Actual Touch %</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.actualTouch} onChangeText={(v) => updatePIssuedField(idx, 'actualTouch', v)} placeholder="0" />
                  </View>
                )}
              </View>
            ))}
            {pIssuedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Total Issue Gram:</Text><Text style={styles.summaryValue}>{pTotalIssueGram.toFixed(3)}g</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>RECEIVED ITEMS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 2}]}>Item</Text>
              <Text style={[styles.tableHeaderText, {flex: 1}]}>Wt(g)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>B.Tch%</Text>
              <Text style={[styles.tableHeaderText, {flex: 1, textAlign: 'right'}]}>Purity</Text>
            </View>
            {pReceivedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 2}]}>{item.itemName}</Text>
                  <Text style={[styles.tableCellText, {flex: 1}]}>{Number(item.weight).toFixed(3)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.buyingTouch).toFixed(2)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1, textAlign: 'right'}]}>{item.purity.toFixed(3)}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Buying Touch %</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.buyingTouch} onChangeText={(v) => updatePReceivedField(idx, 'buyingTouch', v)} placeholder="0" />
                  </View>
                )}
              </View>
            ))}
            {pReceivedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Total Receipt Gram:</Text><Text style={styles.summaryValue}>{pTotalReceiptGram.toFixed(3)}g</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>SUMMARY</Text>
            <View style={styles.row}><Text style={styles.label}>Total Issue Gram:</Text><Text style={styles.value}>{pTotalIssueGram.toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Receipt Gram:</Text><Text style={styles.value}>- {pTotalReceiptGram.toFixed(3)}g</Text></View>
            <View style={styles.row}>
              <Text style={styles.label}>{pPreviousAdvanceVal > 0 && pPreviousOldVal === 0 ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</Text>
              <Text style={styles.value}>{(pPreviousAdvanceVal > 0 && pPreviousOldVal === 0 ? pPreviousAdvanceVal : pPreviousOldVal).toFixed(3)}g</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>{pBalResult.oldAfter > 0 ? 'Current Old Balance:' : 'Current Advance Balance:'}</Text>
              <Text style={[styles.summaryValue, {color: pBalResult.oldAfter > 0 ? '#D32F2F' : '#27AE60'}]}>{(pBalResult.oldAfter > 0 ? pBalResult.oldAfter : pBalResult.advanceAfter).toFixed(3)}g</Text>
            </View>

            {editingBill && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>REMARKS</Text>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  value={remarksInput}
                  onChangeText={setRemarksInput}
                  placeholder="Add remarks for this bill..."
                />
              </>
            )}
          </View>
        ) : billStyle === 'WASTAGE' ? (
          <View style={styles.billCard}>
            <Text style={styles.shopName}>SRI VAISHNAVI JEWELLERS</Text>
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Bill No:</Text><Text style={styles.value}>{settlement.settlementNumber}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Time:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
            <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber}</Text></View>
            {editingBill ? (
              <View style={styles.gridRow}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.label}>Previous Old Balance (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={wPreviousOld} onChangeText={setWPreviousOld} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Previous Advance (₹)</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={wPreviousAdvance} onChangeText={setWPreviousAdvance} />
                </View>
              </View>
            ) : (
              <View style={styles.row}>
                <Text style={styles.label}>{wPreviousAdvanceVal > 0 && wPreviousOldVal === 0 ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</Text>
                <Text style={styles.value}>₹{(wPreviousAdvanceVal > 0 && wPreviousOldVal === 0 ? wPreviousAdvanceVal : wPreviousOldVal).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
              </View>
            )}

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
                  <Text style={[styles.tableCellText, {flex: 2.2}]}>{item.itemName}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(0)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.4, textAlign: 'right'}]}>{item.cash.toLocaleString('en-IN', {maximumFractionDigits:0})}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Rate (₹)</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateWIssuedField(idx, 'rate', v)} placeholder="Rate" />
                  </View>
                )}
              </View>
            ))}
            {wIssuedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Total Issue Cash:</Text><Text style={styles.summaryValue}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>RECEIVED ITEMS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 2.2}]}>Item</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>Wt(g)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2}]}>Rate(₹)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.4, textAlign: 'right'}]}>Cash(₹)</Text>
            </View>
            {wReceivedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 2.2}]}>{item.itemName}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(0)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.4, textAlign: 'right'}]}>{item.cash.toLocaleString('en-IN', {maximumFractionDigits:0})}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Rate (₹)</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateWReceivedField(idx, 'rate', v)} placeholder="Rate" />
                  </View>
                )}
              </View>
            ))}
            {wReceivedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Total Receipt Cash:</Text><Text style={styles.summaryValue}>₹{wTotalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>SUMMARY</Text>
            <View style={styles.row}><Text style={styles.label}>Total Issue Cash:</Text><Text style={styles.value}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Receipt Cash:</Text><Text style={styles.value}>- ₹{wTotalReceiptCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}>
              <Text style={styles.label}>{wPreviousAdvanceVal > 0 && wPreviousOldVal === 0 ? 'Previous Advance Balance:' : 'Previous Old Balance:'}</Text>
              <Text style={styles.value}>₹{(wPreviousAdvanceVal > 0 && wPreviousOldVal === 0 ? wPreviousAdvanceVal : wPreviousOldVal).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>{wBalResult.oldAfter > 0 ? 'Current Old Balance:' : 'Current Advance Balance:'}</Text>
              <Text style={[styles.summaryValue, {color: wBalResult.oldAfter > 0 ? '#D32F2F' : '#27AE60'}]}>₹{(wBalResult.oldAfter > 0 ? wBalResult.oldAfter : wBalResult.advanceAfter).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>

            {editingBill && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>REMARKS</Text>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  value={remarksInput}
                  onChangeText={setRemarksInput}
                  placeholder="Add remarks for this bill..."
                />
              </>
            )}
          </View>
        ) : (
          <View style={styles.billCard}>
            <Text style={styles.shopName}>SRI VAISHNAVI JEWELLERS</Text>
            <Text style={styles.billType}>LINE STOCK SETTLEMENT</Text>
            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.label}>Settlement No:</Text>
              <Text style={styles.value}>{settlement.settlementNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Issue Txn No:</Text>
              <Text style={styles.value}>{settlement.lineStockTransactionId?.transactionNumber}</Text>
            </View>
            <View style={styles.row}>
              <Text style={styles.label}>Date:</Text>
              <Text style={styles.value}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')}</Text>
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>LINE STOCKER</Text>
            <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber}</Text></View>

            {/* Sold Items */}
            {settlement.soldItems?.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={[styles.sectionTitle, { color: '#27AE60' }]}>SOLD PRODUCTS</Text>
                {settlement.soldItems.map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text><Text style={styles.itemSub}>{item.barcode} | {item.purity}</Text></View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={styles.itemCount}>{item.count} pcs</Text><Text style={styles.itemWeight}>{Number(item.weight).toFixed(3)} g</Text><Text style={styles.itemSub}>₹{item.amount || 0}</Text></View>
                  </View>
                ))}
              </>
            )}

            {/* Returned Items */}
            {settlement.returnedItems?.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={[styles.sectionTitle, { color: '#E74C3C' }]}>RETURNED PRODUCTS</Text>
                {settlement.returnedItems.map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text><Text style={styles.itemSub}>{item.barcode} | {item.purity}</Text></View>
                    <View style={{ alignItems: 'flex-end' }}><Text style={styles.itemCount}>{item.count} pcs</Text><Text style={styles.itemWeight}>{Number(item.weight).toFixed(3)} g</Text></View>
                  </View>
                ))}
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>PAYMENTS</Text>
            <View style={styles.row}><Text style={styles.label}>Cash:</Text><Text style={styles.value}>₹{settlement.paymentDetails?.cash || 0}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Online:</Text><Text style={styles.value}>₹{settlement.paymentDetails?.online || 0}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Card:</Text><Text style={styles.value}>₹{settlement.paymentDetails?.card || 0}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Gold:</Text><Text style={styles.value}>{Number(settlement.paymentDetails?.gold || 0).toFixed(3)}g</Text></View>

            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Previous Balance:</Text><Text style={styles.value}>{Number(settlement.previousBalance).toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Sold Weight Deduct:</Text><Text style={[styles.value, { color: '#E74C3C' }]}>-{settlement.soldItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Returned Deduct:</Text><Text style={[styles.value, { color: '#E74C3C' }]}>-{settlement.returnedItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</Text></View>

            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Total Cash Payments:</Text><Text style={[styles.value, { color: '#27AE60' }]}>₹{(settlement.paymentDetails?.cash || 0) + (settlement.paymentDetails?.online || 0) + (settlement.paymentDetails?.card || 0)}</Text></View>

            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>Final Balance:</Text><Text style={[styles.summaryValue, { color: settlement.finalBalance > 0 ? '#E74C3C' : '#27AE60' }]}>{Number(settlement.finalBalance).toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Advance Balance:</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>{Number(settlement.advanceBalance).toFixed(3)}g</Text></View>

            {editingBill && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>REMARKS</Text>
                <TextInput
                  style={styles.notesInput}
                  multiline
                  value={remarksInput}
                  onChangeText={setRemarksInput}
                  placeholder="Add remarks for this bill..."
                />
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.tamilMsg}>நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.</Text>
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
            onPress={() => setBillStyle('WASTAGE')}
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
              style={[styles.actionBtn, { backgroundColor: '#2E7D32' }, savingBillStyle && { opacity: 0.6 }]}
              disabled={savingBillStyle}
              onPress={billStyle === 'PLUS' ? handleSavePlusBill : billStyle === 'WASTAGE' ? handleSaveWastageBill : handleSaveBill}
            >
              {savingBillStyle ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />}
              <Text style={styles.actionText}>{savingBillStyle ? 'Saving…' : 'Save Bill'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={[styles.actionBtn, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setPrinting, () => LineStockSettlementPrintService.printBill(buildPrintSettlement()))}
          >
            {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print Bill'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, {backgroundColor: '#25D366'}, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setSharing, () => LineStockSettlementPrintService.shareWhatsApp(buildPrintSettlement()))}
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
          <Text style={styles.actionText}>Finish</Text>
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
  emptyText: { fontSize: 12, color: '#B0A48A', fontStyle: 'italic', marginVertical: 6 },
  tamilMsg: { fontSize: 10, color: '#8A6B3C', textAlign: 'center', marginTop: 10, fontWeight: '700' },
  notesInput: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', padding: 10, fontSize: 13, color: DARK_BROWN, minHeight: 60, textAlignVertical: 'top' },
  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 16, elevation: 20, borderTopWidth: 1, borderTopColor: '#F0E4CC' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: DARK_BROWN, paddingVertical: 14, borderRadius: 12, gap: 8 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  // PLUS / WASTAGE bill structure
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E8D8B8', paddingBottom: 6, marginBottom: 6 },
  tableHeaderText: { fontSize: 11, fontWeight: '800', color: '#8A6B3C', textTransform: 'uppercase' },
  tableDataRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4, borderBottomWidth: 1, borderColor: '#F5EFE6' },
  tableCellText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  editItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8, paddingLeft: 4 },
  editItemLabel: { fontSize: 11, color: '#8A6B3C', fontWeight: '600', width: 90 },
  smallInput: { flex: 1, backgroundColor: '#FDFAF4', borderRadius: 6, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 8, paddingVertical: 6, fontSize: 12, color: DARK_BROWN },
  input: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: DARK_BROWN },
  gridRow: { flexDirection: 'row' },
});
