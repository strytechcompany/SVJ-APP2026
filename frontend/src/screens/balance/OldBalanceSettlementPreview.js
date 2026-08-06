import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { balanceSettlementAPI } from '../../services/api';
import { BalanceSettlementPrintService } from '../../services/PrintService';
import { formatBalanceForCustomer } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

// Two ways into this screen:
// - previewPayload (unsaved): came straight from OldBalanceSettlement's
//   "Preview" button. Nothing has been written to MongoDB yet — "Save Bill"
//   is the only action that creates the settlement record.
// - settlementId (already saved): came from Old Balance Settlement History —
//   loads the exact saved bill from MongoDB, never regenerates it. Save Bill
//   is pre-marked "Saved" since it already exists.
export default function OldBalanceSettlementPreview({ route, navigation }) {
  const { previewPayload, settlementId } = route.params || {};
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [loading, setLoading] = useState(!!settlementId);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [savedSettlement, setSavedSettlement] = useState(null);
  const [loadedPayload, setLoadedPayload] = useState(null);

  useEffect(() => {
    if (!settlementId) return;
    const load = async () => {
      try {
        const res = await balanceSettlementAPI.getSettlementById(settlementId);
        if (res.data.success) {
          const s = res.data.data;
          setSavedSettlement(s);
          setLoadedPayload({
            customerId: s.customerId?._id,
            customerName: s.customerId?.customerName,
            customerPhone: s.customerId?.phoneNumber,
            customerType: s.customerId?.customerType,
            customerCategory: s.customerId?.customerCategory,
            settlementMode: s.settlementMode,
            items: s.items,
            totalSettlementGram: s.totalSettlementGram,
            previousOldBalance: s.previousOldBalance,
            previousAdvanceBalance: s.previousAdvanceBalance,
            finalOldBalance: s.finalOldBalance,
            finalAdvanceBalance: s.finalAdvanceBalance,
          });
        } else {
          Alert.alert('Error', 'Settlement not found', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to load settlement bill.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [settlementId]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  const activePayload = previewPayload || loadedPayload;
  const {
    customerName, customerPhone, items, totalSettlementGram,
    previousOldBalance, finalOldBalance, finalAdvanceBalance,
    customerType, customerCategory,
  } = activePayload;
  const customerForUnit = { customerType, customerCategory };

  const saveSettlement = async () => {
    const payload = {
      customerId: activePayload.customerId,
      type: 'OLD',
      settlementMode: activePayload.settlementMode,
      items: activePayload.items,
    };
    const res = await balanceSettlementAPI.settle(payload);
    if (res.data.success) {
      setSavedSettlement(res.data.data);
      return res.data.data;
    }
    throw new Error(res.data.message || 'Failed to save settlement.');
  };

  const handleSaveBill = async () => {
    if (savedSettlement) return;
    setSaving(true);
    try {
      await saveSettlement();
      Alert.alert('Success', 'Settlement bill saved successfully.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to save settlement.');
    } finally {
      setSaving(false);
    }
  };

  const handlePrintBill = async () => {
    setPrinting(true);
    try {
      const bill = savedSettlement || await saveSettlement();
      await BalanceSettlementPrintService.printBill(bill);
      if (!settlementId) navigation.navigate('OldBalanceSettlementHistory');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || e.message || 'Failed to print settlement.');
    } finally {
      setPrinting(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Settlement Preview</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {savedSettlement && (
          <View style={styles.savedBanner}>
            <MaterialCommunityIcons name="check-circle" size={18} color="#2E7D32" />
            <Text style={styles.savedBannerText}>Bill No: {savedSettlement.billNumber} — Saved</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          <View style={styles.row}><Text style={styles.label}>Customer Name:</Text><Text style={styles.value}>{customerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Phone Number:</Text><Text style={styles.value}>{customerPhone}</Text></View>
          <View style={styles.divider} />
          <View style={styles.row}><Text style={styles.label}>Current Old Balance:</Text><Text style={[styles.value, { color: '#D32F2F', fontSize: 15 }]}>{formatBalanceForCustomer(previousOldBalance, customerForUnit)}</Text></View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settlement Items ({items.length})</Text>
          {items.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.mode === 'CASH' ? `Cash: ₹${Number(item.cashAmount).toLocaleString('en-IN')}` : item.mode === 'GRAM' ? `₹${Number(item.cashAmount).toLocaleString('en-IN')} @ ₹${item.goldRate}` : 'Gram Entry'}</Text>
                <Text style={styles.itemSub}>{Number(item.gram).toFixed(3)}g</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.summaryBox}>
          <Text style={styles.sectionTitle}>Final Summary</Text>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Settlement Gram</Text><Text style={styles.summaryValue}>{Number(totalSettlementGram).toFixed(3)}g</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Current Old Balance</Text><Text style={styles.summaryValue}>{formatBalanceForCustomer(previousOldBalance, customerForUnit)}</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, { fontWeight: '800' }]}>{finalOldBalance > 0 ? 'Final Current Old Balance' : 'Final Current Advance Balance'}</Text>
            <Text style={[styles.summaryValue, { color: finalOldBalance > 0 ? '#D32F2F' : '#2E7D32' }]}>
              {formatBalanceForCustomer(finalOldBalance > 0 ? finalOldBalance : finalAdvanceBalance, customerForUnit)}
            </Text>
          </View>
        </View>

        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1 }, (saving || printing || savedSettlement) && { opacity: 0.7 }]}
            disabled={saving || printing || !!savedSettlement}
            onPress={handleSaveBill}
          >
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="content-save" size={20} color="#FFF" />}
            <Text style={styles.submitBtnText}>{savedSettlement ? 'Saved' : saving ? 'Saving...' : 'Save Bill'}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.submitBtn, { flex: 1, backgroundColor: '#2E7D32' }, (saving || printing) && { opacity: 0.7 }]}
            disabled={saving || printing}
            onPress={handlePrintBill}
          >
            {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.submitBtnText}>{printing ? 'Printing...' : 'Print Bill'}</Text>
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
  savedBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginBottom: 16 },
  savedBannerText: { color: '#2E7D32', fontWeight: '700', fontSize: 13 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label: { fontSize: 12, color: '#8A6B3C', fontWeight: '600', marginBottom: 4 },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 10 },
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
