import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { orderAPI } from '../../services/api';
import { useOrders } from '../../context/OrderContext';
import { OrderPrintService } from '../../services/PrintService';
import { useAuth } from '../../context/AuthContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';
const HEADER_BG = '#3D2200';

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

  useEffect(() => {
    if (isPreviewMode) {
      setOrder(previewPayload);
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
        notes: order.notes || '',
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

  const handlePrint = async () => {
    if (printLockRef.current) return;
    printLockRef.current = true;
    setPrinting(true);
    try {
      const orderData = isPreviewMode
        ? { ...order, customer: order.customer || order.customerId }
        : { ...order, customer: order.customerId };
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

          {/* Order Items */}
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

          {notes ? (
            <>
              <Divider />
              <Text style={styles.notesText}>Note: {notes}</Text>
            </>
          ) : null}
        </View>

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
