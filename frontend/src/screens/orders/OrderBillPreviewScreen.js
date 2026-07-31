import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { orderAPI } from '../../services/api';
import { useOrders } from '../../context/OrderContext';
import { OrderPrintService } from '../../services/PrintService';
import { useAuth } from '../../context/AuthContext';
import { safeNumber } from '../../utils/safeNumber';
import { resolveDisplayBalance } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';
const HEADER_BG = '#3D2200';

// Mirrors backend/utils/wastageCashBalance.js exactly — the ONE cash-
// conversion formula for the Wastage Bill's balance section, used here for
// a live preview before Save Bill recomputes and persists it server-side.
// This is a derived cash VIEW only — it never touches the order's real
// gram-based balance (oldBalanceBefore/After, advanceBalanceBefore/After),
// which stays the single source of truth everywhere else.
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

const STATUS_COLORS = {
  Pending:   { bg: '#FFF8E1', border: '#F9A825', text: '#F57F17' },
  Ready:     { bg: '#E8F5E9', border: '#43A047', text: '#1B5E20' },
  Delivered: { bg: '#E3F2FD', border: '#1E88E5', text: '#0D47A1' },
  Cancelled: { bg: '#FFEEF0', border: '#E53935', text: '#B71C1C' },
};

function fmt3(v) { return Number(v || 0).toFixed(3); }
function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtMoney(v) { return Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 }); }

function BillRow({ label, value, bold, valueColor }) {
  return (
    <View style={styles.billRow}>
      <Text style={[styles.billLabel, bold && styles.boldText]}>{label}</Text>
      <Text style={[styles.billValue, bold && styles.boldText, valueColor && { color: valueColor }]}>{value}</Text>
    </View>
  );
}

function Divider() { return <View style={styles.divider} />; }

export default function OrderBillPreviewScreen({ navigation, route }) {
  const { orderId, previewPayload } = route.params || {};
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { createOrder, onRefresh } = useOrders();
  const printLockRef = useRef(false);

  const isPreviewMode = !!previewPayload;

  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [printing, setPrinting] = useState(false);

  // Bill Type (Plus/Wastage) — mandatory before Save Bill. Selecting it here
  // is what actually generates the corresponding bill structure below.
  const [billStyle, setBillStyle] = useState(null);
  const [notesInput, setNotesInput] = useState('');
  const [savingBill, setSavingBill] = useState(false);

  // PLUS Bill items — Item Name/Weight/Rate/Cash, all independently editable.
  const [plusItems, setPlusItems] = useState([]);
  // WASTAGE Bill items — Item Name/Weight/Wastage%/Rate editable; Cash always
  // recomputes as Weight × Rate.
  const [wastageItems, setWastageItems] = useState([]);
  // Admin-entered ₹ per gram used to convert the order's real gram-based
  // Previous Balance into cash for this Wastage Bill only.
  const [wBalanceRate, setWBalanceRate] = useState('');

  const seedBillItems = (ord) => {
    if (ord.plusBill?.items?.length) {
      setPlusItems(ord.plusBill.items.map(i => ({ itemName: i.itemName || '', weight: String(i.weight ?? ''), rate: String(i.rate ?? ''), cash: String(i.cash ?? '') })));
    } else {
      setPlusItems((ord.orderItems || []).map(i => ({ itemName: i.itemName || '', weight: String(i.itemWeight ?? ''), rate: '', cash: '' })));
    }
    if (ord.wastageBill?.items?.length) {
      setWastageItems(ord.wastageBill.items.map(i => ({ itemName: i.itemName || '', weight: String(i.weight ?? ''), wastage: String(i.wastage ?? ''), rate: String(i.rate ?? '') })));
      setWBalanceRate(String(ord.wastageBill.balanceRate ?? ''));
    } else {
      setWastageItems((ord.orderItems || []).map(i => ({ itemName: i.itemName || '', weight: String(i.itemWeight ?? ''), wastage: '', rate: '' })));
      setWBalanceRate('');
    }
  };

  useEffect(() => {
    if (isPreviewMode) {
      setOrder(previewPayload);
      setBillStyle(previewPayload.billStyle || null);
      setNotesInput(previewPayload.notes || '');
      seedBillItems(previewPayload);
      setLoading(false);
      return;
    }
    if (!orderId) {
      Alert.alert('Error', 'No order ID provided.');
      navigation.goBack();
      return;
    }
    const fetchOrder = async () => {
      try {
        const res = await orderAPI.getById(orderId);
        if (res.data.success) {
          setOrder(res.data.data);
          setBillStyle(res.data.data.billStyle || null);
          setNotesInput(res.data.data.notes || '');
          seedBillItems(res.data.data);
        } else {
          Alert.alert('Error', 'Failed to load order.');
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to load order details.');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [orderId]);

  const updatePlusItem = (idx, field, value) => {
    setPlusItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };
  const updateWastageItem = (idx, field, value) => {
    setWastageItems(items => items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)));
  };

  const wastageComputed = wastageItems.map(it => {
    const weight = parseFloat(it.weight) || 0;
    const rate = parseFloat(it.rate) || 0;
    return { ...it, cash: safeNumber(weight * rate) };
  });
  const wastageTotalWeight = safeNumber(wastageComputed.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0));
  const wastageTotalCash = safeNumber(wastageComputed.reduce((s, i) => s + i.cash, 0));

  const plusComputed = plusItems.map(it => ({ ...it, cash: safeNumber(parseFloat(it.cash) || 0) }));
  const plusTotalWeight = safeNumber(plusComputed.reduce((s, i) => s + (parseFloat(i.weight) || 0), 0));
  const plusTotalCash = safeNumber(plusComputed.reduce((s, i) => s + i.cash, 0));

  const handleSave = async () => {
    if (!order) return;
    setSaving(true);
    try {
      const res = await createOrder({
        customerId: order.customerId?._id || order.customerId,
        orderItems: order.orderItems,
        paymentMode: order.paymentMode || 'None',
        paymentAmount: order.paymentAmount || 0,
        goldPayWeight: order.goldPayWeight || 0,
        goldPayPurity: order.goldPayPurity,
        notes: notesInput || order.notes || '',
        billStyle,
      });
      setSaved(true);
      setOrder(res.data);
      await onRefresh();
      Alert.alert('Saved', 'Order saved successfully!');
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to save order.');
    } finally {
      setSaving(false);
    }
  };

  // The real "Save Bill" — mandatory Bill Type, saves the Plus/Wastage item
  // table to MongoDB, and transitions Pending -> Ready exactly once.
  const handleSaveBill = async () => {
    if (!billStyle) {
      Alert.alert('Bill Type Required', 'Please select Plus Bill or Wastage Bill.');
      return;
    }
    setSavingBill(true);
    try {
      const items = billStyle === 'PLUS'
        ? plusComputed.map(({ itemName, weight, rate, cash }) => ({ itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash }))
        : wastageComputed.map(({ itemName, weight, wastage, rate, cash }) => ({ itemName, weight: parseFloat(weight) || 0, wastage: parseFloat(wastage) || 0, rate: parseFloat(rate) || 0, cash }));
      const payload = { billStyle, notes: notesInput, items };
      // Server recomputes the cash conversion itself from the order's real
      // gram-based previous balance — only the Balance Rate travels here.
      if (billStyle === 'WASTAGE') payload.balanceRate = parseFloat(wBalanceRate) || 0;
      const res = await orderAPI.saveBill(order._id, payload);
      if (res.data.success) {
        setOrder(res.data.data);
        seedBillItems(res.data.data);
        await onRefresh();
        Alert.alert('Success', 'Bill Saved Successfully', [
          { text: 'OK', onPress: () => navigation.navigate('Orders') },
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save bill.');
    } finally {
      setSavingBill(false);
    }
  };

  // Print must NEVER read the original/last-fetched `order` object for the
  // bill-type-specific section — it always reflects the CURRENT on-screen
  // Bill Preview state (plusComputed/wastageComputed/notesInput), including
  // any unsaved edits, exactly like buildPrintSettlement does for Line Stock.
  const buildPrintOrder = () => {
    const base = isPreviewMode
      ? { ...order, customer: order.customer || order.customerId }
      : { ...order, customer: order.customerId };
    const liveItems = billStyle === 'PLUS'
      ? plusComputed.map(({ itemName, weight, rate, cash }) => ({ itemName, weight: parseFloat(weight) || 0, rate: parseFloat(rate) || 0, cash }))
      : billStyle === 'WASTAGE'
      ? wastageComputed.map(({ itemName, weight, wastage, rate, cash }) => ({ itemName, weight: parseFloat(weight) || 0, wastage: parseFloat(wastage) || 0, rate: parseFloat(rate) || 0, cash }))
      : [];
    return {
      ...base,
      billStyle,
      notes: notesInput,
      ...(billStyle === 'PLUS' && { plusBill: { items: liveItems } }),
      ...(billStyle === 'WASTAGE' && {
        wastageBill: {
          items: liveItems,
          balanceRate: wBalanceRateVal,
          previousBalanceGram: wCashBalance.previousGram,
          previousBalanceCash: wCashBalance.previousCash,
          currentOldBalanceCash: wCashBalance.oldCash,
          currentAdvanceBalanceCash: wCashBalance.advanceCash,
        },
      }),
    };
  };

  const handlePrint = async () => {
    if (printLockRef.current) return;
    printLockRef.current = true;
    setPrinting(true);
    try {
      const orderData = buildPrintOrder();
      await OrderPrintService.printThermal(orderData);
    } catch (e) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Print Error', e?.message || 'Could not complete print.');
      }
    } finally {
      printLockRef.current = false;
      setPrinting(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.screen, { paddingTop: insets.top, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  if (!order) return null;

  // Normalise data for both preview and saved modes
  const customer = order.customer || order.customerId || {};
  const orderItems = order.orderItems || [];
  const paymentMode = order.paymentMode || 'None';
  const paymentAmount = order.paymentAmount || 0;
  const goldPayWeight = order.goldPayWeight || 0;
  const goldPayPurity = order.goldPayPurity || '22K (916)';
  const advanceTotalGram = order.advanceTotalGram || order.confirmedPayment?.grams || 0;
  const oldBalanceBefore = order.oldBalanceBefore ?? order.advanceBalanceBefore ?? 0;
  const advanceBalanceBefore = order.advanceBalanceBefore ?? 0;
  const oldBalanceAfter = order.oldBalanceAfter ?? oldBalanceBefore;
  const advanceBalanceAfter = order.advanceBalanceAfter ?? advanceBalanceBefore;
  const orderNumber = order.orderNumber || 'Preview';
  const createdAt = order.createdAt || new Date().toISOString();
  const status = order.status || 'Pending';
  const notes = order.notes || '';
  const goldRate = order.goldRate || order.activeGoldRate || 0;

  // Wastage Bill balance cash-conversion. Once a Wastage Bill has been saved,
  // its balance section is loaded EXACTLY from MongoDB (order.wastageBill) —
  // never recalculated on screen, even while the admin is mid-edit toward a
  // future re-save. Only a brand-new, never-saved Wastage Bill computes it
  // live, purely so there's something to preview before the very first Save
  // Bill. This guarantees Bill Preview, Print, PDF, WhatsApp, and MongoDB can
  // never drift apart after a reload.
  const wBalanceRateVal = safeNumber(parseFloat(wBalanceRate) || 0);
  const savedWastageBill = (order.billStyle === 'WASTAGE' && order.wastageBill) ? order.wastageBill : null;
  const wCashBalance = savedWastageBill
    ? {
        previousGram: safeNumber(savedWastageBill.previousBalanceGram),
        previousCash: safeNumber(savedWastageBill.previousBalanceCash),
        oldCash: safeNumber(savedWastageBill.currentOldBalanceCash),
        advanceCash: safeNumber(savedWastageBill.currentAdvanceBalanceCash),
      }
    : computeWastageCashBalance(oldBalanceBefore, advanceBalanceBefore, wBalanceRateVal, wastageTotalCash);
  const wPrevResolved = resolveDisplayBalance(oldBalanceBefore, advanceBalanceBefore);
  const wFinalResolved = resolveDisplayBalance(wCashBalance.oldCash, wCashBalance.advanceCash);

  const statusStyle = STATUS_COLORS[status] || STATUS_COLORS.Pending;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Order Bill</Text>
        {!isPreviewMode && (
          <View style={[styles.statusChip, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusChipText, { color: statusStyle.text }]}>{status}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {/* Thermal paper style bill */}
        <View style={styles.billPaper}>
          {/* Header */}
          <Text style={styles.billTitle}>ORDER RECEIPT</Text>
          <Divider />

          {/* Bill Meta */}
          <BillRow label="Order #:" value={orderNumber} bold />
          <BillRow label="Date:" value={fmtDate(createdAt)} />
          <BillRow label="Time:" value={new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} />
          <Divider />

          {/* Customer */}
          <Text style={styles.sectionLabel}>CUSTOMER</Text>
          <BillRow label="Name:" value={customer.customerName || '—'} bold />
          <BillRow label="Phone:" value={customer.phoneNumber || '—'} />
          {(customer.shopName || customer.dealerCompanyName) ? (
            <BillRow label="Shop:" value={customer.shopName || customer.dealerCompanyName} />
          ) : null}
          <Divider />

          {/* Order Items — unchanged, existing structure */}
          <Text style={styles.sectionLabel}>ORDER ITEMS</Text>
          {orderItems.map((item, idx) => (
            <View key={idx} style={styles.orderItemBlock}>
              {idx > 0 && <View style={styles.itemDivider} />}
              <BillRow label="Item:" value={item.itemName} bold />
              <BillRow label="Weight:" value={`${fmt3(item.itemWeight)}g`} />
              <BillRow label="Cust. Delivery:" value={fmtDate(item.deliveryDateByCustomer)} />
              <BillRow label="Ready By:" value={fmtDate(item.deliveryDateByGiver)} />
              {item.notes ? <BillRow label="Notes:" value={item.notes} /> : null}
            </View>
          ))}
          <Divider />

          {/* Payment */}
          {paymentMode !== 'None' && (
            <>
              <Text style={styles.sectionLabel}>PAYMENT</Text>
              <BillRow label="Mode:" value={paymentMode} />
              {paymentMode === 'Cash' ? (
                <>
                  <BillRow label="Amount:" value={`₹${fmtMoney(paymentAmount)}`} />
                  {goldRate > 0 ? (
                    <BillRow label="Converted:" value={`${fmt3(advanceTotalGram)}g (₹${fmtMoney(goldRate)}/g)`} />
                  ) : null}
                </>
              ) : paymentMode === 'Gold' ? (
                <>
                  <BillRow label="Gold Weight:" value={`${fmt3(goldPayWeight)}g`} />
                  <BillRow label="Purity:" value={goldPayPurity} />
                </>
              ) : null}
              <Divider />
            </>
          )}

          {/* Summary */}
          <Text style={styles.sectionLabel}>SUMMARY</Text>
          <BillRow label="Old Balance (Before):" value={`${fmt3(oldBalanceBefore)}g`} valueColor={oldBalanceBefore > 0 ? '#D32F2F' : '#555'} />
          <BillRow label="Old Balance (After):" value={`${fmt3(oldBalanceAfter)}g`} valueColor={oldBalanceAfter > 0 ? '#D32F2F' : '#555'} />
          <BillRow label="Advance (Before):" value={`${fmt3(advanceBalanceBefore)}g`} valueColor="#2E7D32" />
          <BillRow label="Advance Given:" value={`+${fmt3(advanceTotalGram)}g`} valueColor="#2E7D32" />
          <BillRow label="New Advance Balance:" value={`${fmt3(advanceBalanceAfter)}g`} bold valueColor="#2E7D32" />

          {/* Bill Type specific structure — Plus or Wastage */}
          {billStyle === 'PLUS' && (
            <>
              <Divider />
              <Text style={styles.sectionLabel}>PLUS BILL — ISSUED PRODUCTS</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { flex: 2 }]}>Item Name</Text>
                <Text style={[styles.th, { flex: 1 }]}>Wt(g)</Text>
                <Text style={[styles.th, { flex: 1 }]}>Rate(₹)</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Cash(₹)</Text>
              </View>
              {plusComputed.map((item, idx) => (
                <View key={idx} style={styles.tableDataRow}>
                  <TextInput style={[styles.tdInput, { flex: 2 }]} value={item.itemName} onChangeText={(v) => updatePlusItem(idx, 'itemName', v)} placeholder="Item Name" />
                  <TextInput style={[styles.tdInput, { flex: 1 }]} keyboardType="numeric" value={item.weight} onChangeText={(v) => updatePlusItem(idx, 'weight', v)} placeholder="0" />
                  <TextInput style={[styles.tdInput, { flex: 1 }]} keyboardType="numeric" value={item.rate} onChangeText={(v) => updatePlusItem(idx, 'rate', v)} placeholder="0" />
                  <TextInput style={[styles.tdInput, { flex: 1.2, textAlign: 'right' }]} keyboardType="numeric" value={item.cash != null ? String(item.cash) : ''} onChangeText={(v) => updatePlusItem(idx, 'cash', v)} placeholder="0" />
                </View>
              ))}
              <View style={styles.row}><Text style={styles.boldText}>Total Weight:</Text><Text style={styles.boldText}>{plusTotalWeight.toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.boldText}>Total Cash:</Text><Text style={styles.boldText}>₹{fmtMoney(plusTotalCash)}</Text></View>
            </>
          )}

          {billStyle === 'WASTAGE' && (
            <>
              <Divider />
              <Text style={styles.sectionLabel}>WASTAGE BILL — ISSUED PRODUCTS</Text>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.th, { flex: 1.8 }]}>Item Name</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Wt(g)</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Wst(%)</Text>
                <Text style={[styles.th, { flex: 0.9 }]}>Rate(₹)</Text>
                <Text style={[styles.th, { flex: 1.2, textAlign: 'right' }]}>Cash(₹)</Text>
              </View>
              {wastageComputed.map((item, idx) => (
                <View key={idx} style={styles.tableDataRow}>
                  <TextInput style={[styles.tdInput, { flex: 1.8 }]} value={item.itemName} onChangeText={(v) => updateWastageItem(idx, 'itemName', v)} placeholder="Item Name" />
                  <TextInput style={[styles.tdInput, { flex: 0.9 }]} keyboardType="numeric" value={item.weight} onChangeText={(v) => updateWastageItem(idx, 'weight', v)} placeholder="0" />
                  <TextInput style={[styles.tdInput, { flex: 0.9 }]} keyboardType="numeric" value={item.wastage} onChangeText={(v) => updateWastageItem(idx, 'wastage', v)} placeholder="0" />
                  <TextInput style={[styles.tdInput, { flex: 0.9 }]} keyboardType="numeric" value={item.rate} onChangeText={(v) => updateWastageItem(idx, 'rate', v)} placeholder="0" />
                  <Text style={[styles.td, { flex: 1.2, textAlign: 'right' }]}>{item.cash.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text>
                </View>
              ))}
              <View style={styles.row}><Text style={styles.boldText}>Total Weight:</Text><Text style={styles.boldText}>{wastageTotalWeight.toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.boldText}>Total Cash:</Text><Text style={styles.boldText}>₹{fmtMoney(wastageTotalCash)}</Text></View>

              {/* Old Balance / Advance Balance conversion — Wastage Bill
                  only. The order's real gram balance never changes; Balance
                  Rate converts it to cash for this bill's own summary. */}
              <Divider />
              <View style={styles.row}>
                <Text style={styles.boldText}>{wPrevResolved.label === 'Current Balance' ? 'Previous Balance (g):' : `Previous ${wPrevResolved.label} (g):`}</Text>
                <Text style={styles.boldText}>{wPrevResolved.value.toFixed(3)}g</Text>
              </View>
              <View style={[styles.row, { alignItems: 'center' }]}>
                <Text style={styles.boldText}>Balance Rate (₹/g)</Text>
                <TextInput style={[styles.tdInput, { flex: 1, marginLeft: 8, textAlign: 'right' }]} keyboardType="numeric" value={wBalanceRate} onChangeText={setWBalanceRate} placeholder="0" />
              </View>
              <View style={styles.row}><Text style={styles.boldText}>Previous Balance Cash:</Text><Text style={styles.boldText}>₹{fmtMoney(wCashBalance.previousCash)}</Text></View>

              <Divider />
              <Text style={styles.sectionLabel}>SUMMARY (WASTAGE)</Text>
              <View style={styles.row}><Text style={styles.boldText}>Total Weight:</Text><Text style={styles.boldText}>{wastageTotalWeight.toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.boldText}>Total Cash:</Text><Text style={styles.boldText}>₹{fmtMoney(wastageTotalCash)}</Text></View>
              <View style={styles.row}><Text style={styles.boldText}>Previous Balance Cash:</Text><Text style={styles.boldText}>₹{fmtMoney(wCashBalance.previousCash)}</Text></View>
              {/* Current Old Balance OR Current Advance Balance — never both. */}
              <View style={styles.row}>
                <Text style={styles.boldText}>{wFinalResolved.label === 'Advance' ? 'Current Advance Balance:' : wFinalResolved.label === 'Old Balance' ? 'Current Old Balance:' : 'Current Balance:'}</Text>
                <Text style={[styles.boldText, { color: wFinalResolved.label === 'Old Balance' ? '#D32F2F' : (wFinalResolved.label === 'Advance' ? '#2E7D32' : DARK_BROWN) }]}>₹{fmtMoney(wFinalResolved.value)}</Text>
              </View>
            </>
          )}

          <Divider />
          <Text style={styles.sectionLabel}>NOTES</Text>
          <TextInput
            style={styles.notesEditInput}
            multiline
            value={notesInput}
            onChangeText={setNotesInput}
            placeholder="Add notes for this bill..."
          />
        </View>

        {/* Bill Type — mandatory before Save Bill */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.billStyleBtn, { backgroundColor: billStyle === 'PLUS' ? GOLD : '#F0E4CC' }]}
            onPress={() => setBillStyle('PLUS')}
          >
            {billStyle === 'PLUS' && <MaterialCommunityIcons name="check-circle" size={16} color={DARK_BROWN} style={{ marginRight: 4 }} />}
            <Text style={styles.billStyleBtnText}>Plus Bill</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.billStyleBtn, { backgroundColor: billStyle === 'WASTAGE' ? GOLD : '#F0E4CC' }]}
            onPress={() => setBillStyle('WASTAGE')}
          >
            {billStyle === 'WASTAGE' && <MaterialCommunityIcons name="check-circle" size={16} color={DARK_BROWN} style={{ marginRight: 4 }} />}
            <Text style={styles.billStyleBtnText}>Wastage Bill</Text>
          </TouchableOpacity>
        </View>

        {billStyle && !isPreviewMode && (
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSaveBill} disabled={savingBill}>
              {savingBill ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Save Bill</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          {isPreviewMode && !saved ? (
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save" size={18} color="#FFF" style={{ marginRight: 6 }} />
                  <Text style={styles.saveBtnText}>Save Order</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity style={styles.printBtn} onPress={handlePrint} disabled={printing}>
            {printing ? (
              <ActivityIndicator size="small" color={DARK_BROWN} />
            ) : (
              <>
                <MaterialCommunityIcons name="printer" size={18} color={DARK_BROWN} style={{ marginRight: 6 }} />
                <Text style={styles.printBtnText}>Print</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {!isPreviewMode && (
          <TouchableOpacity
            style={styles.backToListBtn}
            onPress={() => navigation.navigate('Orders')}
          >
            <Text style={styles.backToListText}>Back to Orders</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 14,
  },
  backBtn: { marginRight: 10, padding: 2 },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '700', flex: 1 },
  statusChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, borderWidth: 1,
  },
  statusChipText: { fontSize: 12, fontWeight: '700' },

  billPaper: {
    backgroundColor: '#FFF', borderRadius: 12, padding: 16,
    borderWidth: 1, borderColor: '#E0E0E0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 3,
  },
  billTitle: {
    textAlign: 'center', fontSize: 16, fontWeight: '800',
    color: DARK_BROWN, letterSpacing: 2, marginBottom: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  divider: { borderTopWidth: 1, borderColor: '#E0E0E0', borderStyle: 'dashed', marginVertical: 8 },
  itemDivider: { borderTopWidth: 1, borderColor: '#F0F0F0', marginVertical: 6 },
  sectionLabel: {
    fontSize: 10, fontWeight: '800', color: '#666', letterSpacing: 1.5,
    marginBottom: 6, marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  billRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 4,
  },
  billLabel: { fontSize: 13, color: '#333', flex: 1 },
  billValue: {
    fontSize: 13, color: '#2E1A00', textAlign: 'right', flex: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  boldText: { fontWeight: '700' },
  orderItemBlock: { marginBottom: 4 },
  notesText: { fontSize: 12, color: '#444', fontStyle: 'italic', marginTop: 4 },
  notesEditInput: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', padding: 10, fontSize: 13, color: '#2E1A00', minHeight: 60, textAlignVertical: 'top' },
  billStyleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, borderRadius: 12 },
  billStyleBtnText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E0E0E0', paddingBottom: 4, marginBottom: 4 },
  th: { fontSize: 10, fontWeight: '800', color: '#666' },
  tableDataRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  td: { fontSize: 12, color: '#2E1A00' },
  tdInput: { fontSize: 11, color: '#2E1A00', borderWidth: 1, borderColor: '#E8D8B8', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 3 },

  actionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, backgroundColor: DARK_BROWN,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: BG },
  printBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, backgroundColor: GOLD,
    borderWidth: 1, borderColor: '#C9A227',
  },
  printBtnText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  backToListBtn: {
    marginTop: 12, alignItems: 'center', paddingVertical: 10,
  },
  backToListText: { color: '#666', fontSize: 14, textDecorationLine: 'underline' },
});
