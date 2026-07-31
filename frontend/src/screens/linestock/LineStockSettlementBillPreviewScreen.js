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
import { resolveDisplayBalance } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

// Mirrors backend/utils/wastageCashBalance.js exactly — the ONE cash-
// conversion formula for the Wastage Bill's balance section, used here for
// a live preview before Save Bill recomputes and persists it server-side.
// This is a derived cash VIEW only — it never touches the real gram-based
// settlement balance (previousBalance/advanceBalanceBefore/finalBalance/
// advanceBalance), which stays the single source of truth everywhere else.
function computeWastageCashBalance(previousOldGram, previousAdvanceGram, balanceRate, itemCash) {
  const isAdvanceCase = previousAdvanceGram > 0 && previousOldGram === 0;
  const previousGram = isAdvanceCase ? previousAdvanceGram : previousOldGram;
  const previousCash = safeNumber(previousGram * balanceRate);
  const net = safeNumber(itemCash - previousCash);
  if (isAdvanceCase) {
    return net >= 0
      ? { previousGram, previousCash, oldCash: 0, advanceCash: net }
      : { previousGram, previousCash, oldCash: safeNumber(Math.abs(net)), advanceCash: 0 };
  }
  return net >= 0
    ? { previousGram, previousCash, oldCash: net, advanceCash: 0 }
    : { previousGram, previousCash, oldCash: 0, advanceCash: safeNumber(Math.abs(net)) };
}

export default function LineStockSettlementBillPreviewScreen({ route, navigation }) {
  const { settlementId, previewPayload } = route.params;
  // Preview mode: nothing has been saved to MongoDB yet — this came straight
  // from LineStockSettlementScreen's "Preview" button. Save Bill here is what
  // actually creates the settlement for the first time.
  const isPreviewMode = !!previewPayload;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [settlement, setSettlement] = useState(null);
  const [loading, setLoading] = useState(true);
  // True once this bill exists in MongoDB (always true for the settlementId
  // flow; flips true the moment Save Bill succeeds in preview mode).
  const isSaved = !!settlement?._id;

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
  // (Issued) items only. Purely additive: never touches soldItems,
  // returnedItems, finalBalance, advanceBalance, or the real customer balance
  // already applied when the settlement was created. Sold items are never
  // returned, so this bill only ever shows Issued Products.
  const [pIssuedItems, setPIssuedItems] = useState([]); // [{itemName, weight}]

  // WASTAGE Bill structure — cash-based (Weight × manually-entered Rate = Cash).
  // Sold items are never returned, so this bill only ever shows Issued Products —
  // no Received/Receipt Items section.
  const [wIssuedItems, setWIssuedItems] = useState([]); // [{itemName, weight, wastage, rate}]
  // Admin-entered ₹ per gram used to convert the real gram-based Previous
  // Balance into cash for this Wastage Bill only.
  const [wBalanceRate, setWBalanceRate] = useState('');

  // Single source of truth for Previous/Current balance — computed exactly
  // once by createSettlement (backend) and saved on the settlement itself.
  // Never recalculated here, regardless of what the admin edits in the item
  // tables below (those are display-only corrections to Item Name/Weight/
  // Rate, e.g. fixing a typo — they must never perturb the balance already
  // applied to the customer).
  const realPreviousOld = safeNumber(settlement?.previousBalance || 0);
  const realPreviousAdvance = safeNumber(settlement?.advanceBalanceBefore || 0);
  const realFinalOld = safeNumber(settlement?.finalBalance || 0);
  const realFinalAdvance = safeNumber(settlement?.advanceBalance || 0);
  const prevResolved = resolveDisplayBalance(realPreviousOld, realPreviousAdvance);
  const finalResolved = resolveDisplayBalance(realFinalOld, realFinalAdvance);

  // Hydrates all the form state (billStyle, item tables, edit mode) from a
  // settlement-shaped object — used identically whether that object came
  // from MongoDB (settlementId flow) or is an unsaved preview payload
  // (previewPayload flow). Balance is NOT part of this hydration — it's
  // read directly off `settlement` (see realPreviousOld/realFinalOld above),
  // so it can never drift out of sync with what got saved.
  //
  // Item Name always comes from the settlement's own Sold + Returned items —
  // the single source of truth, straight from LineStockSettlement.js — NEVER
  // from a previously-saved plusBill/wastageBill sub-document. That guards
  // against a bill saved before this fix (or any other stale/mismatched save)
  // permanently showing a blank item list on every future reopen. Weight
  // (Plus, editable) and Wastage/Rate (Wastage, editable) ARE restored from
  // the saved sub-document when present, matched by position, so admin
  // edits persist.
  const hydrateFromSettlement = (s, { forceEditMode = false } = {}) => {
    setSettlement(s);
    setBillStyle(s.billStyle || null);
    setRemarksInput(s.remarks || '');

    // Only SOLD items belong in the Plus/Wastage bill's item table — these
    // calculations apply exclusively to SOLD settlements (per spec). A
    // Returned item never affects balance and must never appear as an
    // "Issued Product" here, even though it's part of the same settlement.
    const allSettlementItems = s.soldItems || [];

    if (s.plusBill) {
      const savedPlusItems = s.plusBill.issuedItems || [];
      setPIssuedItems(allSettlementItems.map((i, idx) => ({
        itemName: i.itemName,
        weight: savedPlusItems[idx]?.weight ?? i.weight,
      })));
    } else {
      setPIssuedItems(allSettlementItems.map(i => ({ itemName: i.itemName, weight: i.weight })));
    }

    if (s.wastageBill) {
      const savedWastageItems = s.wastageBill.issuedItems || [];
      setWIssuedItems(allSettlementItems.map((i, idx) => ({
        itemName: i.itemName,
        weight: i.weight,
        wastage: String(savedWastageItems[idx]?.wastage ?? ''),
        rate: String(savedWastageItems[idx]?.rate ?? ''),
      })));
      setWBalanceRate(String(s.wastageBill.balanceRate ?? ''));
    } else {
      setWIssuedItems(allSettlementItems.map(i => ({ itemName: i.itemName, weight: i.weight, wastage: '', rate: '' })));
      setWBalanceRate('');
    }

    // First time viewing the chosen style with no saved bill sub-document yet
    // (or nothing saved at all, in preview mode) — start in edit mode.
    if (forceEditMode || (s.billStyle === 'PLUS' && !s.plusBill) || (s.billStyle === 'WASTAGE' && !s.wastageBill)) {
      setEditingBill(true);
    }
  };

  useEffect(() => {
    if (isPreviewMode) {
      // Nothing to fetch — build a settlement-shaped object straight from
      // what the admin just entered on LineStockSettlementScreen.
      hydrateFromSettlement({
        settlementNumber: null,
        createdAt: new Date().toISOString(),
        customerId: { customerName: previewPayload.customerName, phoneNumber: previewPayload.customerPhone },
        soldItems: previewPayload.soldItems || [],
        returnedItems: previewPayload.returnedItems || [],
        paymentDetails: previewPayload.paymentDetails,
        previousBalance: previewPayload.previousBalance,
        advanceBalanceBefore: previewPayload.advanceBalanceBefore,
        finalBalance: previewPayload.finalBalance,
        advanceBalance: previewPayload.advanceBalance,
        remarks: previewPayload.remarks,
        billStyle: previewPayload.billStyle,
      }, { forceEditMode: true });
      setLoading(false);
      return;
    }

    const fetchBill = async () => {
      try {
        const res = await lineStockAPI.getSettlementById(settlementId);
        if (res.data.success) {
          hydrateFromSettlement(res.data.data);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settlementId, isPreviewMode, navigation]);

  // --- PLUS Bill item totals (display only — balance comes from settlement) ---
  const pIssuedComputed = pIssuedItems.map(it => ({ ...it, weight: parseFloat(it.weight) || 0 }));
  const pTotalIssueGram = safeNumber(pIssuedComputed.reduce((s, i) => s + i.weight, 0));

  // --- WASTAGE Bill item totals (display only — balance comes from settlement) ---
  // Cash = Weight × Rate. Wastage % is stored/shown for reference only, it
  // does not affect Cash.
  const wIssuedComputed = wIssuedItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const rate = parseFloat(it.rate) || 0;
    return { ...it, cash: safeNumber(weight * rate) };
  });
  const wTotalIssueCash = safeNumber(wIssuedComputed.reduce((s, i) => s + i.cash, 0));
  const wTotalIssueWeight = safeNumber(wIssuedComputed.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0));

  // Wastage Bill balance cash-conversion — the ONE calculation for this
  // section, mirrored exactly server-side on Save Bill. Never affects the
  // real gram-based settlement balance (realPreviousOld/realFinalOld above).
  const wBalanceRateVal = safeNumber(parseFloat(wBalanceRate) || 0);
  const wCashBalance = computeWastageCashBalance(realPreviousOld, realPreviousAdvance, wBalanceRateVal, wTotalIssueCash);
  const wPrevResolved = resolveDisplayBalance(realPreviousOld, realPreviousAdvance);
  const wFinalResolved = resolveDisplayBalance(wCashBalance.oldCash, wCashBalance.advanceCash);

  const updatePIssuedField = (idx, field, value) => setPIssuedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  const updateWIssuedField = (idx, field, value) => setWIssuedItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));

  // Creates the real settlement (first Save Bill in preview mode) — includes
  // the chosen Bill Type and its bill structure in the SAME atomic call, then
  // re-fetches it fully populated (customerId, etc.) so the screen displays
  // exactly like it would after a normal reopen.
  const createSettlementWithBill = async (billStyleToSave, plusBill, wastageBill) => {
    const createRes = await lineStockAPI.settleStock({
      lineStockTransactionId: previewPayload.lineStockTransactionId,
      customerId: previewPayload.customerId,
      soldItems: previewPayload.soldItems,
      returnedItems: previewPayload.returnedItems,
      paymentDetails: previewPayload.paymentDetails,
      remarks: remarksInput,
      billStyle: billStyleToSave,
      ...(plusBill && { plusBill }),
      ...(wastageBill && { wastageBill }),
    });
    if (!createRes.data.success) return createRes;
    return lineStockAPI.getSettlementById(createRes.data.data._id);
  };

  const handleSaveBill = async () => {
    setSavingBillStyle(true);
    try {
      const res = isSaved
        ? await lineStockAPI.updateSettlementBillStyle(settlement._id, { billStyle, remarks: remarksInput })
        : await createSettlementWithBill(billStyle);
      if (res.data.success) {
        hydrateFromSettlement(res.data.data);
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
        issuedItems: pIssuedComputed.map(({ itemName, weight }) => ({
          itemName, weight: parseFloat(weight) || 0,
        })),
        receivedItems: [],
        // Balance is never recalculated here — mirrors the ONE real
        // calculation already saved on the settlement (createSettlement).
        oldBalanceBefore: realPreviousOld,
        advanceBalanceBefore: realPreviousAdvance,
        oldBalanceAfter: realFinalOld,
        advanceBalanceAfter: realFinalAdvance,
      };
      const res = isSaved
        ? await lineStockAPI.saveSettlementPlusBill(settlement._id, payload)
        : await createSettlementWithBill('PLUS', payload, undefined);
      if (res.data.success) {
        hydrateFromSettlement(res.data.data);
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
        issuedItems: wIssuedComputed.map(({ itemName, weight, wastage, rate, cash }) => ({
          itemName, weight: parseFloat(weight) || 0, wastage: parseFloat(wastage) || 0, rate: parseFloat(rate) || 0, cash,
        })),
        receivedItems: [],
        // The server recomputes the cash conversion itself from the real
        // gram-based previous balance — only the Balance Rate travels here.
        balanceRate: wBalanceRateVal,
      };
      const res = isSaved
        ? await lineStockAPI.saveSettlementWastageBill(settlement._id, payload)
        : await createSettlementWithBill('WASTAGE', undefined, payload);
      if (res.data.success) {
        hydrateFromSettlement(res.data.data);
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
          issuedItems: pIssuedComputed.map(({ itemName, weight }) => ({
            itemName, weight: parseFloat(weight) || 0,
          })),
          receivedItems: [],
          oldBalanceBefore: realPreviousOld,
          advanceBalanceBefore: realPreviousAdvance,
          oldBalanceAfter: realFinalOld,
          advanceBalanceAfter: realFinalAdvance,
        },
      };
    }
    if (billStyle === 'WASTAGE') {
      return {
        ...settlement,
        billStyle,
        wastageBill: {
          issuedItems: wIssuedComputed.map(({ itemName, weight, wastage, rate, cash }) => ({
            itemName, weight: parseFloat(weight) || 0, wastage: parseFloat(wastage) || 0, rate: parseFloat(rate) || 0, cash,
          })),
          receivedItems: [],
          balanceRate: wBalanceRateVal,
          previousBalanceGram: wCashBalance.previousGram,
          previousBalanceCash: wCashBalance.previousCash,
          currentOldBalanceCash: wCashBalance.oldCash,
          currentAdvanceBalanceCash: wCashBalance.advanceCash,
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
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Bill No:</Text><Text style={styles.value}>{settlement.settlementNumber || 'Generating on save…'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Time:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
            <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber || 'N/A'}</Text></View>
            {/* Previous Balance is loaded from the saved settlement — never
                editable and never recalculated here. */}
            <View style={styles.row}>
              <Text style={styles.label}>{prevResolved.label === 'Current Balance' ? 'Previous Balance:' : `Previous ${prevResolved.label}:`}</Text>
              <Text style={styles.value}>{prevResolved.value.toFixed(3)}g</Text>
            </View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 2}]}>Item Name</Text>
              <Text style={[styles.tableHeaderText, {flex: 1, textAlign: 'right'}]}>Weight (g)</Text>
            </View>
            {pIssuedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 2}]}>{item.itemName || 'Item'}</Text>
                  <Text style={[styles.tableCellText, {flex: 1, textAlign: 'right'}]}>{Number(item.weight).toFixed(3)}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Weight (g)</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={String(item.weight ?? '')} onChangeText={(v) => updatePIssuedField(idx, 'weight', v)} placeholder="0" />
                  </View>
                )}
              </View>
            ))}
            {pIssuedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Issued Weight:</Text><Text style={styles.summaryValue}>{pTotalIssueGram.toFixed(3)}g</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>SUMMARY</Text>
            <View style={styles.row}><Text style={styles.label}>Issued Weight:</Text><Text style={styles.value}>{pTotalIssueGram.toFixed(3)}g</Text></View>
            <View style={styles.row}>
              <Text style={styles.label}>{prevResolved.label === 'Current Balance' ? 'Previous Balance:' : `Previous ${prevResolved.label}:`}</Text>
              <Text style={styles.value}>{prevResolved.value.toFixed(3)}g</Text>
            </View>
            {/* Current Balance — the ONE saved final balance, loaded from
                MongoDB. Never recalculated, and never shown alongside its
                counterpart (Old Balance XOR Advance, or 0 if both cleared). */}
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>{finalResolved.label}:</Text>
              <Text style={[styles.summaryValue, {color: finalResolved.label === 'Old Balance' ? '#D32F2F' : (finalResolved.label === 'Advance' ? '#27AE60' : DARK_BROWN)}]}>{finalResolved.value.toFixed(3)}g</Text>
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
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Bill No:</Text><Text style={styles.value}>{settlement.settlementNumber || 'Generating on save…'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Date:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Time:</Text><Text style={styles.value}>{new Date(settlement.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
            <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber || 'N/A'}</Text></View>

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
            <View style={styles.tableHeaderRow}>
              <Text style={[styles.tableHeaderText, {flex: 1.8}]}>Item</Text>
              <Text style={[styles.tableHeaderText, {flex: 0.9}]}>Wt(g)</Text>
              <Text style={[styles.tableHeaderText, {flex: 0.9}]}>Wst(%)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1}]}>Rate(₹)</Text>
              <Text style={[styles.tableHeaderText, {flex: 1.2, textAlign: 'right'}]}>Cash(₹)</Text>
            </View>
            {wIssuedComputed.map((item, idx) => (
              <View key={idx}>
                <View style={styles.tableDataRow}>
                  <Text style={[styles.tableCellText, {flex: 1.8}]}>{item.itemName || 'Item'}</Text>
                  <Text style={[styles.tableCellText, {flex: 0.9}]}>{Number(item.weight).toFixed(3)}</Text>
                  <Text style={[styles.tableCellText, {flex: 0.9}]}>{safeNumber(item.wastage).toFixed(1)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1}]}>{safeNumber(item.rate).toFixed(0)}</Text>
                  <Text style={[styles.tableCellText, {flex: 1.2, textAlign: 'right'}]}>{item.cash.toLocaleString('en-IN', {maximumFractionDigits:0})}</Text>
                </View>
                {editingBill && (
                  <View style={styles.editItemRow}>
                    <Text style={styles.editItemLabel}>Wastage (%)</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.wastage} onChangeText={(v) => updateWIssuedField(idx, 'wastage', v)} placeholder="0" />
                    <Text style={styles.editItemLabel}>Rate (₹)</Text>
                    <TextInput style={styles.smallInput} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateWIssuedField(idx, 'rate', v)} placeholder="Rate" />
                  </View>
                )}
              </View>
            ))}
            {wIssuedComputed.length === 0 && <Text style={styles.emptyText}>No items</Text>}
            <View style={styles.divider} />
            <View style={styles.row}><Text style={styles.label}>Total Weight:</Text><Text style={styles.value}>{wTotalIssueWeight.toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>Total Cash:</Text><Text style={styles.summaryValue}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            {/* Old Balance / Advance Balance conversion — Wastage Bill only.
                The real gram balance never changes; Balance Rate converts it
                to cash for this bill's own summary. */}
            <View style={styles.divider} />
            <View style={styles.row}>
              <Text style={styles.label}>{wPrevResolved.label === 'Current Balance' ? 'Previous Balance (g):' : `Previous ${wPrevResolved.label} (g):`}</Text>
              <Text style={styles.value}>{wPrevResolved.value.toFixed(3)}g</Text>
            </View>
            {editingBill ? (
              <View style={styles.row}>
                <Text style={styles.label}>Balance Rate (₹/g)</Text>
                <TextInput style={[styles.input, {flex: 1, marginLeft: 8}]} keyboardType="numeric" value={wBalanceRate} onChangeText={setWBalanceRate} placeholder="0" />
              </View>
            ) : (
              <View style={styles.row}><Text style={styles.label}>Balance Rate:</Text><Text style={styles.value}>₹{wBalanceRateVal.toLocaleString('en-IN')}</Text></View>
            )}
            <View style={styles.row}><Text style={styles.label}>Previous Balance Cash:</Text><Text style={styles.value}>₹{wCashBalance.previousCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>

            {(settlement.paymentDetails?.cash > 0 || settlement.paymentDetails?.gold > 0) && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
                {settlement.paymentDetails?.cash > 0 && (
                  <View style={styles.row}><Text style={styles.label}>Cash:</Text><Text style={styles.value}>₹{Number(settlement.paymentDetails.cash).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                )}
                {settlement.paymentDetails?.gold > 0 && (
                  <View style={styles.row}><Text style={styles.label}>Gold:</Text><Text style={styles.value}>{Number(settlement.paymentDetails.gold).toFixed(3)}g</Text></View>
                )}
              </>
            )}

            <View style={styles.divider} />
            <Text style={styles.sectionTitle}>SUMMARY</Text>
            <View style={styles.row}><Text style={styles.label}>Total Weight:</Text><Text style={styles.value}>{wTotalIssueWeight.toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Total Cash:</Text><Text style={styles.value}>₹{wTotalIssueCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Previous Balance Cash:</Text><Text style={styles.value}>₹{wCashBalance.previousCash.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
            {/* Current Old Balance OR Current Advance Balance — never both. */}
            <View style={styles.row}>
              <Text style={[styles.label, {fontWeight: '800', color: DARK_BROWN}]}>{wFinalResolved.label === 'Advance' ? 'Current Advance Balance:' : wFinalResolved.label === 'Old Balance' ? 'Current Old Balance:' : 'Current Balance:'}</Text>
              <Text style={[styles.summaryValue, {color: wFinalResolved.label === 'Old Balance' ? '#D32F2F' : (wFinalResolved.label === 'Advance' ? '#27AE60' : DARK_BROWN)}]}>₹{wFinalResolved.value.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
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
            <Text style={styles.billType}>LINE STOCK BILL</Text>
            <View style={styles.divider} />

            <View style={styles.row}>
              <Text style={styles.label}>Settlement No:</Text>
              <Text style={styles.value}>{settlement.settlementNumber || 'Generating on save…'}</Text>
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
            <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{settlement.customerId?.customerName || 'N/A'}</Text></View>
            <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{settlement.customerId?.phoneNumber || 'N/A'}</Text></View>

            {/* Sold Items */}
            {settlement.soldItems?.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={[styles.sectionTitle, { color: '#27AE60' }]}>SOLD PRODUCTS</Text>
                {settlement.soldItems.map((item, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName || 'Item'} ({item.itemNumber || 'N/A'})</Text><Text style={styles.itemSub}>{item.barcode} | {item.purity}</Text></View>
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
                    <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName || 'Item'} ({item.itemNumber || 'N/A'})</Text><Text style={styles.itemSub}>{item.barcode} | {item.purity}</Text></View>
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

            <View style={styles.row}>
              <Text style={styles.label}>{prevResolved.label === 'Current Balance' ? 'Previous Balance:' : `Previous ${prevResolved.label}:`}</Text>
              <Text style={styles.value}>{prevResolved.value.toFixed(3)}g</Text>
            </View>
            <View style={styles.row}><Text style={styles.label}>Total Sold Weight Deduct:</Text><Text style={[styles.value, { color: '#E74C3C' }]}>-{settlement.soldItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</Text></View>
            <View style={styles.row}><Text style={styles.label}>Returned Deduct:</Text><Text style={[styles.value, { color: '#E74C3C' }]}>-{settlement.returnedItems?.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</Text></View>

            <View style={styles.divider} />

            <View style={styles.row}><Text style={styles.label}>Total Cash Payments:</Text><Text style={[styles.value, { color: '#27AE60' }]}>₹{(settlement.paymentDetails?.cash || 0) + (settlement.paymentDetails?.online || 0) + (settlement.paymentDetails?.card || 0)}</Text></View>

            <View style={styles.divider} />
            {/* Single final balance — never shown alongside its counterpart. */}
            <View style={styles.row}><Text style={styles.label}>{finalResolved.label}:</Text><Text style={[styles.summaryValue, { color: finalResolved.label === 'Old Balance' ? '#E74C3C' : (finalResolved.label === 'Advance' ? '#27AE60' : DARK_BROWN) }]}>{finalResolved.value.toFixed(3)}g</Text></View>

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
            onPress={() => withPrintLock(setPrinting, async () => {
              await LineStockSettlementPrintService.printBill(buildPrintSettlement());
              // New-settlement flow: after a successful print, don't linger
              // on the Bill Preview page — return to Line Stock Settlement.
              if (isPreviewMode) navigation.goBack();
            })}
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
