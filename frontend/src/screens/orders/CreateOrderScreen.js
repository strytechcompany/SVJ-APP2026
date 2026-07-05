import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useDashboard } from '../../context/DashboardContext';
import { useOrders } from '../../context/OrderContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';
const HEADER_BG = '#3D2200';
const INPUT_BG = '#FCFAF5';
const BORDER = '#E5D8C0';

const PURITY_OPTIONS = ['24K (999)', '22K (916)', '18K (750)', '14K (585)', '92.5 Silver'];

function fmt3(v) { return Number(v || 0).toFixed(3); }

function fmtDate(date) {
  if (!date) return 'Select date';
  return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function SectionTitle({ title }) {
  return (
    <View style={styles.sectionTitleRow}>
      <View style={styles.sectionTitleBar} />
      <Text style={styles.sectionTitleText}>{title}</Text>
    </View>
  );
}

function InputRow({ label, required, children }) {
  return (
    <View style={styles.inputRow}>
      <Text style={styles.inputLabel}>
        {label}{required ? <Text style={{ color: '#D32F2F' }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export default function CreateOrderScreen({ navigation, route }) {
  const { customer } = route.params || {};
  const insets = useSafeAreaInsets();
  const { goldRate: dashboardGoldRate } = useDashboard();
  const { createOrder } = useOrders();

  const activeGoldRate = parseFloat(dashboardGoldRate?.rate || 0);

  // Order items state
  const [orderItems, setOrderItems] = useState([
    { itemName: '', itemWeight: '', deliveryDateByCustomer: null, deliveryDateByGiver: null, notes: '' },
  ]);

  // Date picker state
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [dateTarget, setDateTarget] = useState({ itemIndex: 0, field: 'deliveryDateByCustomer' });
  const [pickerDate, setPickerDate] = useState(new Date());

  // Payment state
  const [paymentMode, setPaymentMode] = useState('None');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [goldPayWeight, setGoldPayWeight] = useState('');
  const [goldPayPurity, setGoldPayPurity] = useState('22K (916)');
  const [showPurityPicker, setShowPurityPicker] = useState(false);
  const [confirmedPayment, setConfirmedPayment] = useState({ amount: 0, grams: 0, mode: '' });

  // Notes
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Calculated values
  const goldConvertedAmt = paymentMode === 'Gold'
    ? (parseFloat(goldPayWeight) || 0) * activeGoldRate
    : 0;
  const goldConvertedGram = paymentMode === 'Gold' ? (parseFloat(goldPayWeight) || 0) : 0;
  const cashGram = paymentMode === 'Cash' && activeGoldRate > 0
    ? (parseFloat(paymentAmount) || 0) / activeGoldRate
    : 0;

  const advanceTotalGram = confirmedPayment.grams;
  const oldBalanceBefore = parseFloat(customer?.oldBalance || 0);
  const advanceBalanceBefore = parseFloat(customer?.advance || 0);

  let oldBalanceAfter = oldBalanceBefore;
  let advanceBalanceAfter = advanceBalanceBefore;
  if (advanceTotalGram > 0) {
    if (oldBalanceBefore > 0) {
      const remaining = advanceTotalGram - oldBalanceBefore;
      if (remaining >= 0) {
        oldBalanceAfter = 0;
        advanceBalanceAfter = advanceBalanceBefore + remaining;
      } else {
        oldBalanceAfter = oldBalanceBefore - advanceTotalGram;
        advanceBalanceAfter = 0;
      }
    } else {
      advanceBalanceAfter = advanceBalanceBefore + advanceTotalGram;
    }
  }

  // ─── Order Item Helpers ────────────────────────────────────────────────────
  const addItem = () => {
    setOrderItems((prev) => [
      ...prev,
      { itemName: '', itemWeight: '', deliveryDateByCustomer: null, deliveryDateByGiver: null, notes: '' },
    ]);
  };

  const removeItem = (index) => {
    if (orderItems.length === 1) { Alert.alert('Info', 'At least one item is required.'); return; }
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const updateItem = (index, field, value) => {
    setOrderItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const openDatePicker = (itemIndex, field) => {
    const current = orderItems[itemIndex]?.[field];
    setPickerDate(current ? new Date(current) : new Date());
    setDateTarget({ itemIndex, field });
    setShowDatePicker(true);
  };

  const onDateChange = (event, selectedDate) => {
    if (Platform.OS === 'android') setShowDatePicker(false);
    if (event.type === 'dismissed') { setShowDatePicker(false); return; }
    if (selectedDate) {
      updateItem(dateTarget.itemIndex, dateTarget.field, selectedDate.toISOString());
      setPickerDate(selectedDate);
    }
    if (Platform.OS === 'ios') setShowDatePicker(false);
  };

  // ─── Payment Helpers ───────────────────────────────────────────────────────
  const handleCollectPayment = () => {
    if (paymentMode === 'None') {
      setConfirmedPayment({ amount: 0, grams: 0, mode: 'None' });
      return;
    }
    if (paymentMode === 'Gold') {
      const grams = parseFloat(goldPayWeight) || 0;
      if (grams <= 0) { Alert.alert('Error', 'Enter gold weight.'); return; }
      setConfirmedPayment({ amount: goldConvertedAmt, grams, mode: 'Gold' });
    } else {
      const amt = parseFloat(paymentAmount) || 0;
      if (amt <= 0) { Alert.alert('Error', 'Enter payment amount.'); return; }
      const grams = activeGoldRate > 0 ? amt / activeGoldRate : 0;
      setConfirmedPayment({ amount: amt, grams, mode: 'Cash' });
    }
  };

  // ─── Validation & Save ─────────────────────────────────────────────────────
  const validate = () => {
    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      if (!item.itemName.trim()) { Alert.alert('Error', `Item ${i + 1}: name is required.`); return false; }
      if (!item.itemWeight || parseFloat(item.itemWeight) <= 0) { Alert.alert('Error', `Item ${i + 1}: weight must be > 0.`); return false; }
      if (!item.deliveryDateByCustomer) { Alert.alert('Error', `Item ${i + 1}: customer delivery date required.`); return false; }
      if (!item.deliveryDateByGiver) { Alert.alert('Error', `Item ${i + 1}: giver delivery date required.`); return false; }
    }
    return true;
  };

  const buildPayload = () => ({
    customerId: customer._id,
    orderItems: orderItems.map((item) => ({
      itemName: item.itemName.trim(),
      itemWeight: parseFloat(item.itemWeight) || 0,
      deliveryDateByCustomer: item.deliveryDateByCustomer,
      deliveryDateByGiver: item.deliveryDateByGiver,
      notes: item.notes || '',
    })),
    paymentMode: confirmedPayment.mode || 'None',
    paymentAmount: confirmedPayment.amount || 0,
    goldPayWeight: paymentMode === 'Gold' ? (parseFloat(goldPayWeight) || 0) : 0,
    goldPayPurity: goldPayPurity,
    notes,
  });

  const handleBillPreview = () => {
    if (!validate()) return;
    const payload = buildPayload();
    navigation.navigate('OrderBillPreview', {
      previewPayload: {
        ...payload,
        customer,
        activeGoldRate,
        confirmedPayment,
        oldBalanceBefore,
        advanceBalanceBefore,
        oldBalanceAfter,
        advanceBalanceAfter,
        advanceTotalGram,
      },
    });
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const res = await createOrder(buildPayload());
      navigation.replace('OrderBillPreview', { orderId: res.data._id });
    } catch (err) {
      Alert.alert('Error', err.message || 'Failed to create order.');
    } finally {
      setSaving(false);
    }
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  const typeLabel = customer?.customerType === 'LINE_STOCKER' ? 'Line Stocker' : customer?.customerType;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>New Order</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Customer Card */}
        <View style={styles.customerCard}>
          <View style={styles.customerAvatarLarge}>
            <Text style={styles.avatarLargeText}>
              {(customer?.customerName || '?').charAt(0).toUpperCase()}
            </Text>
          </View>
          <View style={styles.customerDetails}>
            <Text style={styles.customerCardName}>{customer?.customerName}</Text>
            <Text style={styles.customerCardPhone}>{customer?.phoneNumber}</Text>
            {(customer?.shopName || customer?.dealerCompanyName) ? (
              <Text style={styles.customerCardShop}>{customer.shopName || customer.dealerCompanyName}</Text>
            ) : null}
            <View style={styles.balanceRow}>
              {oldBalanceBefore > 0 ? (
                <Text style={styles.balanceBadge}>
                  Old Bal: {fmt3(oldBalanceBefore)}g
                </Text>
              ) : null}
              {advanceBalanceBefore > 0 ? (
                <Text style={[styles.balanceBadge, { color: '#2E7D32', borderColor: '#2E7D32', backgroundColor: '#E8F5E9' }]}>
                  Advance: {fmt3(advanceBalanceBefore)}g
                </Text>
              ) : null}
              <Text style={styles.typePill}>{typeLabel}</Text>
            </View>
          </View>
        </View>

        {/* Order Items */}
        <SectionTitle title="Order Items" />
        {orderItems.map((item, index) => (
          <View key={index} style={styles.card}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemHeaderText}>Item {index + 1}</Text>
              <TouchableOpacity onPress={() => removeItem(index)} style={styles.removeBtn}>
                <MaterialCommunityIcons name="close-circle" size={20} color="#D32F2F" />
              </TouchableOpacity>
            </View>

            <InputRow label="Item Name" required>
              <TextInput
                style={styles.input}
                placeholder="e.g. Gold Chain, Ring, Bangle..."
                placeholderTextColor="#BBB"
                value={item.itemName}
                onChangeText={(v) => updateItem(index, 'itemName', v)}
              />
            </InputRow>

            <InputRow label="Item Weight (g)" required>
              <TextInput
                style={styles.input}
                placeholder="0.000"
                placeholderTextColor="#BBB"
                keyboardType="numeric"
                value={item.itemWeight}
                onChangeText={(v) => updateItem(index, 'itemWeight', v)}
              />
            </InputRow>

            <InputRow label="Expected Delivery (Customer)" required>
              <TouchableOpacity
                style={styles.datePicker}
                onPress={() => openDatePicker(index, 'deliveryDateByCustomer')}
              >
                <MaterialCommunityIcons name="calendar" size={16} color={DARK_BROWN} style={{ marginRight: 6 }} />
                <Text style={[styles.datePickerText, !item.deliveryDateByCustomer && { color: '#BBB' }]}>
                  {fmtDate(item.deliveryDateByCustomer)}
                </Text>
              </TouchableOpacity>
            </InputRow>

            <InputRow label="Expected Delivery (Ready by Giver)" required>
              <TouchableOpacity
                style={styles.datePicker}
                onPress={() => openDatePicker(index, 'deliveryDateByGiver')}
              >
                <MaterialCommunityIcons name="calendar-check" size={16} color={DARK_BROWN} style={{ marginRight: 6 }} />
                <Text style={[styles.datePickerText, !item.deliveryDateByGiver && { color: '#BBB' }]}>
                  {fmtDate(item.deliveryDateByGiver)}
                </Text>
              </TouchableOpacity>
            </InputRow>

            <InputRow label="Item Notes">
              <TextInput
                style={styles.input}
                placeholder="Optional design notes..."
                placeholderTextColor="#BBB"
                value={item.notes}
                onChangeText={(v) => updateItem(index, 'notes', v)}
              />
            </InputRow>
          </View>
        ))}

        <TouchableOpacity style={styles.addItemBtn} onPress={addItem}>
          <MaterialCommunityIcons name="plus-circle" size={20} color={DARK_BROWN} />
          <Text style={styles.addItemText}>Add Another Item</Text>
        </TouchableOpacity>

        {/* Payment Section */}
        <SectionTitle title="Payment Collection" />
        <View style={styles.card}>
          <Text style={styles.inputLabel}>Payment Mode</Text>
          <View style={styles.paymentRow}>
            {['None', 'Cash', 'Gold'].map((mode) => (
              <TouchableOpacity
                key={mode}
                style={[styles.payBtn, paymentMode === mode && styles.payBtnActive]}
                onPress={() => { setPaymentMode(mode); setConfirmedPayment({ amount: 0, grams: 0, mode: '' }); }}
              >
                <Text style={[styles.payText, paymentMode === mode && styles.payTextActive]}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {paymentMode === 'Cash' && (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput
                style={styles.inputHighlight}
                keyboardType="numeric"
                placeholder="0"
                placeholderTextColor="#BBB"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
              />
              {activeGoldRate > 0 && paymentAmount ? (
                <Text style={styles.calcValue}>
                  ≈ {fmt3(cashGram)}g  (at ₹{activeGoldRate.toLocaleString('en-IN')}/g)
                </Text>
              ) : null}
            </View>
          )}

          {paymentMode === 'Gold' && (
            <View style={{ marginTop: 12 }}>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>Gold Weight (g)</Text>
                  <TextInput
                    style={styles.inputHighlight}
                    keyboardType="numeric"
                    placeholder="0.000"
                    placeholderTextColor="#BBB"
                    value={goldPayWeight}
                    onChangeText={setGoldPayWeight}
                  />
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>Purity</Text>
                  <TouchableOpacity
                    style={styles.input}
                    onPress={() => setShowPurityPicker(!showPurityPicker)}
                  >
                    <Text style={{ color: DARK_BROWN, fontSize: 14 }}>{goldPayPurity}</Text>
                  </TouchableOpacity>
                </View>
              </View>
              {showPurityPicker && (
                <View style={styles.purityList}>
                  {PURITY_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[styles.purityItem, goldPayPurity === opt && styles.purityItemActive]}
                      onPress={() => { setGoldPayPurity(opt); setShowPurityPicker(false); }}
                    >
                      <Text style={[styles.purityItemText, goldPayPurity === opt && styles.purityItemTextActive]}>
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              {goldPayWeight ? (
                <Text style={styles.calcValue}>
                  ≈ ₹{goldConvertedAmt.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                  {'  '}({fmt3(goldConvertedGram)}g)
                </Text>
              ) : null}
            </View>
          )}

          {paymentMode !== 'None' && (
            <TouchableOpacity
              style={[styles.collectBtn, confirmedPayment.amount > 0 && styles.collectBtnConfirmed]}
              onPress={handleCollectPayment}
            >
              <MaterialCommunityIcons
                name={confirmedPayment.amount > 0 ? 'check-circle-outline' : 'cash-check'}
                size={18}
                color={confirmedPayment.amount > 0 ? '#FFF' : DARK_BROWN}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.collectBtnText, confirmedPayment.amount > 0 && { color: '#FFF' }]}>
                {confirmedPayment.amount > 0 ? 'Update Payment' : 'Confirm Payment'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Confirmed Payment Badge */}
        {confirmedPayment.amount > 0 && (
          <View style={styles.confirmedCard}>
            <View style={styles.confirmedIcon}>
              <MaterialCommunityIcons name="cash-check" size={22} color="#2E7D32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.confirmedTitle}>{confirmedPayment.mode} — Advance Received</Text>
              <Text style={styles.confirmedSub}>
                ₹{confirmedPayment.amount.toLocaleString('en-IN', { maximumFractionDigits: 0 })}
                {'  |  '}{fmt3(confirmedPayment.grams)}g
              </Text>
            </View>
            <TouchableOpacity onPress={() => setConfirmedPayment({ amount: 0, grams: 0, mode: '' })}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        )}

        {/* Summary */}
        {(confirmedPayment.grams > 0 || oldBalanceBefore > 0 || advanceBalanceBefore > 0) && (
          <View style={styles.summaryCard}>
            <Text style={styles.summaryTitle}>Balance Summary</Text>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Advance Received:</Text>
              <Text style={styles.sumVal}>{fmt3(advanceTotalGram)}g</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Old Balance (Before):</Text>
              <Text style={[styles.sumVal, { color: '#D32F2F' }]}>{fmt3(oldBalanceBefore)}g</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Old Balance (After):</Text>
              <Text style={[styles.sumVal, { color: '#D32F2F' }]}>{fmt3(oldBalanceAfter)}g</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Advance (Before):</Text>
              <Text style={[styles.sumVal, { color: '#2E7D32' }]}>{fmt3(advanceBalanceBefore)}g</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>New Advance Balance:</Text>
              <Text style={[styles.sumVal, { color: '#2E7D32', fontWeight: '700' }]}>{fmt3(advanceBalanceAfter)}g</Text>
            </View>
          </View>
        )}

        {/* Notes */}
        <SectionTitle title="Order Notes" />
        <View style={styles.card}>
          <TextInput
            style={[styles.input, { height: 72, textAlignVertical: 'top' }]}
            placeholder="Any special instructions, design preferences..."
            placeholderTextColor="#BBB"
            multiline
            value={notes}
            onChangeText={setNotes}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.previewBtn} onPress={handleBillPreview} disabled={saving}>
            <MaterialCommunityIcons name="eye-outline" size={18} color={DARK_BROWN} style={{ marginRight: 6 }} />
            <Text style={styles.previewBtnText}>Bill Preview</Text>
          </TouchableOpacity>
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
        </View>
      </ScrollView>

      {showDatePicker && (
        <DateTimePicker
          value={pickerDate}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onDateChange}
          minimumDate={new Date()}
        />
      )}
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
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '700' },
  scroll: { flex: 1 },

  customerCard: {
    flexDirection: 'row', backgroundColor: '#FFF',
    margin: 12, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  customerAvatarLarge: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: DARK_BROWN,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarLargeText: { color: GOLD, fontSize: 22, fontWeight: '700' },
  customerDetails: { flex: 1 },
  customerCardName: { fontSize: 17, fontWeight: '700', color: DARK_BROWN },
  customerCardPhone: { fontSize: 13, color: '#555', marginTop: 1 },
  customerCardShop: { fontSize: 12, color: '#888', marginTop: 1 },
  balanceRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  balanceBadge: {
    fontSize: 11, fontWeight: '600', color: '#D32F2F', borderColor: '#D32F2F',
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#FFEEF0',
  },
  typePill: {
    fontSize: 11, fontWeight: '700', color: DARK_BROWN,
    borderWidth: 1, borderColor: GOLD, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: 2, backgroundColor: '#FFF8DC',
  },

  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 16, marginBottom: 6 },
  sectionTitleBar: { width: 4, height: 18, borderRadius: 2, backgroundColor: GOLD, marginRight: 8 },
  sectionTitleText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },

  card: {
    backgroundColor: '#FFF', marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: BORDER,
  },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  itemHeaderText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  removeBtn: { padding: 2 },

  inputRow: { marginBottom: 10 },
  inputLabel: { fontSize: 12, fontWeight: '600', color: '#666', marginBottom: 4 },
  input: {
    backgroundColor: INPUT_BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: DARK_BROWN,
  },
  inputHighlight: {
    backgroundColor: '#FFF9E6', borderWidth: 1.5, borderColor: GOLD,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: DARK_BROWN,
  },
  datePicker: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: INPUT_BG, borderWidth: 1, borderColor: BORDER,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
  },
  datePickerText: { fontSize: 14, color: DARK_BROWN },

  addItemBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginHorizontal: 12, marginBottom: 4, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1.5, borderColor: DARK_BROWN,
    borderStyle: 'dashed', backgroundColor: '#FFF',
  },
  addItemText: { fontSize: 14, fontWeight: '600', color: DARK_BROWN, marginLeft: 6 },

  paymentRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  payBtn: {
    flex: 1, paddingVertical: 8, borderRadius: 8,
    backgroundColor: '#F0F0F0', alignItems: 'center', borderWidth: 1, borderColor: '#E0E0E0',
  },
  payBtnActive: { backgroundColor: '#2196F3', borderColor: '#1565C0' },
  payText: { fontSize: 13, fontWeight: '600', color: '#666' },
  payTextActive: { color: '#FFF' },

  gridRow: { flexDirection: 'row', gap: 10 },
  gridItem: { flex: 1 },
  calcValue: { fontSize: 12, color: '#2E7D32', fontWeight: '600', marginTop: 6, textAlign: 'right' },

  purityList: {
    marginTop: 4, backgroundColor: '#FFF', borderRadius: 8,
    borderWidth: 1, borderColor: BORDER, overflow: 'hidden',
  },
  purityItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  purityItemActive: { backgroundColor: '#FFF9E6' },
  purityItemText: { fontSize: 14, color: DARK_BROWN },
  purityItemTextActive: { fontWeight: '700', color: DARK_BROWN },

  collectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 14, paddingVertical: 12, borderRadius: 10, backgroundColor: GOLD,
  },
  collectBtnConfirmed: { backgroundColor: '#2E7D32' },
  collectBtnText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },

  confirmedCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12,
    borderWidth: 1, borderColor: '#A5D6A7',
  },
  confirmedIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#C8E6C9',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  confirmedTitle: { fontSize: 13, fontWeight: '700', color: '#1B5E20' },
  confirmedSub: { fontSize: 12, color: '#388E3C', marginTop: 2 },

  summaryCard: {
    backgroundColor: '#FAFAFA', marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14, borderWidth: 1, borderColor: BORDER,
  },
  summaryTitle: { fontSize: 14, fontWeight: '700', color: DARK_BROWN, marginBottom: 10 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  sumLabel: { fontSize: 13, color: '#555' },
  sumVal: { fontSize: 13, fontWeight: '600', color: DARK_BROWN },
  divider: { borderTopWidth: 1, borderColor: '#E0E0E0', marginVertical: 8 },

  actionRow: { flexDirection: 'row', marginHorizontal: 12, marginTop: 6, gap: 10 },
  previewBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12,
    borderWidth: 1.5, borderColor: DARK_BROWN, backgroundColor: '#FFF',
  },
  previewBtnText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  saveBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: 14, borderRadius: 12, backgroundColor: DARK_BROWN,
  },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: BG },
});
