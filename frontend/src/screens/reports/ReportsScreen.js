import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Platform, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { reportsAPI } from '../../services/api';
import { ReportPrintService } from '../../services/ReportPrintService';
import { safeNumber } from '../../utils/safeNumber';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function ReportsScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [printing, setPrinting] = useState(false);
  
  // Modes: TODAY, CUSTOM_DATE, MONTHLY
  const [mode, setMode] = useState('TODAY');
  
  // Date states
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);
  
  useEffect(() => {
    fetchReports('TODAY');
  }, []);

  const fetchReports = async (fetchMode, dateObj = selectedDate) => {
    setLoading(true);
    try {
      const params = { mode: fetchMode };
      if (fetchMode === 'CUSTOM_DATE') {
        params.date = dateObj.toISOString();
      } else if (fetchMode === 'MONTHLY') {
        params.month = dateObj.getMonth() + 1;
        params.year = dateObj.getFullYear();
      }

      const res = await reportsAPI.getReports(params);
      if (res.data.success) {
        setData(res.data.data);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleModeChange = (newMode) => {
    setMode(newMode);
    fetchReports(newMode);
  };

  const onDateChange = (event, currDate) => {
    setShowPicker(false);
    if (currDate) {
      setSelectedDate(currDate);
      fetchReports(mode, currDate);
    }
  };

  const handleExportReport = async (actionType) => {
    if (!data) return;
    setPrinting(true);

    // Calculate the dynamic derived values to pass to print service
    let debtReceivable = 0; data.debtReceivable.forEach(c => debtReceivable += c.oldBalance);
    let debtPayable = 0; data.debtPayable.forEach(c => debtPayable += c.advance);
    let chitCollection = 0; data.chitFunds.forEach(c => chitCollection += c.purchasedWeight);
    let lineStockOutstanding = 0; data.lineStock.forEach(ls => lineStockOutstanding += ls.totalIssuedGram);

    let plusSummaryBValue = 0, plusSummarySValue = 0, plusSummaryProfit = 0;
    data.plusSummary.forEach(p => { plusSummaryBValue += safeNumber(p.bValue); plusSummarySValue += safeNumber(p.sValue); plusSummaryProfit += safeNumber(p.profit); });
    let wastageSummaryBValue = 0, wastageSummarySValue = 0, wastageSummaryProfit = 0;
    data.wastageSummary.forEach(w => { wastageSummaryBValue += safeNumber(w.bValue); wastageSummarySValue += safeNumber(w.sValue); wastageSummaryProfit += safeNumber(w.profit); });
    let expensesTotal = 0; data.expenses.forEach(e => expensesTotal += e.amount);

    const exportData = {
      ...data,
      metadata: {
        mode,
        selectedDate,
      },
      calculations: {
        debtReceivable, debtPayable, chitCollection, lineStockOutstanding,
        plusSummaryBValue, plusSummarySValue, plusSummaryProfit,
        wastageSummaryBValue, wastageSummarySValue, wastageSummaryProfit, expensesTotal,
      }
    };

    try {
      if (actionType === 'download') {
        await ReportPrintService.printReport(exportData);
      } else {
        await ReportPrintService.shareWhatsApp(exportData);
      }
    } catch (error) {
      if (!error?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Export Error', error.message || 'Failed to export report');
      }
    } finally {
      setPrinting(false);
    }
  };

  const renderSummaryCards = () => {
    if (!data) return null;
    const { summaryCards } = data;
    return (
      <View style={styles.summaryGrid}>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Total Stock Items</Text>
          <Text style={styles.cardValue}>{summaryCards.totalStockItems}</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Stock Weight</Text>
          <Text style={styles.cardValue}>{summaryCards.totalStockWeight.toFixed(3)}g</Text>
        </View>
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Total Sales Count</Text>
          <Text style={styles.cardValue}>{summaryCards.totalSalesCount}</Text>
        </View>
        <TouchableOpacity style={[styles.card, { backgroundColor: DARK_BROWN }]} onPress={() => navigation.navigate('CashLedger')}>
          <Text style={[styles.cardLabel, { color: GOLD }]}>Cash Amount (Edit)</Text>
          <Text style={[styles.cardValue, { color: '#FFF' }]}>₹{summaryCards.currentCashAmount}</Text>
        </TouchableOpacity>
      </View>
    );
  };

  const renderCalculations = () => {
    if (!data) return null;

    let debtReceivable = 0;
    data.debtReceivable.forEach(c => debtReceivable += c.oldBalance);

    let debtPayable = 0;
    data.debtPayable.forEach(c => debtPayable += c.advance);

    // Total Chit Fund Gram Purchased (Customers bought gold, so it's a liability)
    let chitCollection = 0;
    data.chitFunds.forEach(c => chitCollection += c.purchasedWeight);

    let lineStockOutstanding = 0;
    // Assuming outstandingGram is not readily available, for now using totalIssuedGram as placeholder
    // In a real app we'd map outstanding from LineStock transactions if available.
    data.lineStock.forEach(ls => lineStockOutstanding += ls.totalIssuedGram);

    // Profit Section
    let plusSummaryBValue = 0, plusSummarySValue = 0, plusSummaryProfit = 0;
    data.plusSummary.forEach(p => { plusSummaryBValue += safeNumber(p.bValue); plusSummarySValue += safeNumber(p.sValue); plusSummaryProfit += safeNumber(p.profit); });

    let wastageSummaryBValue = 0, wastageSummarySValue = 0, wastageSummaryProfit = 0;
    data.wastageSummary.forEach(w => { wastageSummaryBValue += safeNumber(w.bValue); wastageSummarySValue += safeNumber(w.sValue); wastageSummaryProfit += safeNumber(w.profit); });

    let expensesTotal = 0;
    data.expenses.forEach(e => expensesTotal += e.amount);

    return (
      <>
        {/* SECTION 1: CUSTOMER SALES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. CUSTOMER SALES (B2C, B2D, LINE STOCKER)</Text>
          {data.customerSales.map((sale, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{sale.customerName}</Text>
                <Text style={styles.rowSub}>{sale.phoneNumber} | {sale.billNumber || '-'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.rowValue}>{sale.itemName}</Text>
                <Text style={[styles.rowValue, { color: '#27AE60' }]}>{sale.weight}g{sale.sriPlus ? ` (+${sale.sriPlus}%)` : ''}</Text>
                <Text style={styles.sourceTag}>{sale.source}</Text>
              </View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Sales</Text><Text style={styles.calcValueTotal}>{data.customerSales.reduce((s,i)=>s+i.weight,0).toFixed(3)}g</Text></View>
        </View>

        {/* SECTION 2: PLUS SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. PLUS SUMMARY TABLE</Text>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeader, { flex: 1 }]}>B Value</Text>
            <Text style={[styles.tableHeader, { flex: 1, textAlign: 'center' }]}>S Value</Text>
            <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>Profit</Text>
          </View>
          {data.plusSummary.map((p, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.rowValue, { flex: 1 }]}>{safeNumber(p.bValue).toFixed(3)}g</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'center' }]}>{safeNumber(p.sValue).toFixed(3)}g</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right', color: '#27AE60' }]}>{safeNumber(p.profit).toFixed(3)}g</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total B Value</Text><Text style={styles.calcValueTotal}>{plusSummaryBValue.toFixed(3)}g</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total S Value</Text><Text style={styles.calcValueTotal}>{plusSummarySValue.toFixed(3)}g</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Profit</Text><Text style={[styles.calcValueTotal, { color: '#27AE60' }]}>{plusSummaryProfit.toFixed(3)}g</Text></View>
        </View>

        {/* SECTION 3: WASTAGE SUMMARY */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. WASTAGE SUMMARY TABLE</Text>
          <View style={styles.tableHeaderRow}>
            <Text style={[styles.tableHeader, { flex: 1 }]}>B Value</Text>
            <Text style={[styles.tableHeader, { flex: 1, textAlign: 'center' }]}>S Value</Text>
            <Text style={[styles.tableHeader, { flex: 1, textAlign: 'right' }]}>Profit</Text>
          </View>
          {data.wastageSummary.map((w, idx) => (
            <View key={idx} style={styles.tableRow}>
              <Text style={[styles.rowValue, { flex: 1 }]}>₹{safeNumber(w.bValue).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'center' }]}>₹{safeNumber(w.sValue).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
              <Text style={[styles.rowValue, { flex: 1, textAlign: 'right', color: '#27AE60' }]}>₹{safeNumber(w.profit).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total B Value</Text><Text style={styles.calcValueTotal}>₹{safeNumber(wastageSummaryBValue).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total S Value</Text><Text style={styles.calcValueTotal}>₹{safeNumber(wastageSummarySValue).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Profit</Text><Text style={[styles.calcValueTotal, { color: '#27AE60' }]}>₹{safeNumber(wastageSummaryProfit).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
        </View>

        {/* SECTION 4: DEBT PAYABLE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. DEBT PAYABLE (Advance > 0)</Text>
          {data.debtPayable.map((c, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{c.customerName}</Text><Text style={styles.rowSub}>{c.phoneNumber}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={[styles.rowValue, { color: '#E74C3C' }]}>{c.advance.toFixed(3)}g</Text></View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Payable</Text><Text style={[styles.calcValueTotal, { color: '#E74C3C' }]}>{debtPayable.toFixed(3)}g</Text></View>
        </View>

        {/* SECTION 5: DEBT RECEIVABLE */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>5. DEBT RECEIVABLE (Old Bal > 0)</Text>
          {data.debtReceivable.map((c, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{c.customerName}</Text><Text style={styles.rowSub}>{c.phoneNumber}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={[styles.rowValue, { color: '#27AE60' }]}>{c.oldBalance.toFixed(3)}g</Text></View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Receivable</Text><Text style={[styles.calcValueTotal, { color: '#27AE60' }]}>{debtReceivable.toFixed(3)}g</Text></View>
        </View>

        {/* SECTION 6: EXPENSES */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. EXPENSES</Text>
          {data.expenses.map((e, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{e.expenseName}</Text><Text style={styles.rowSub}>{e.expenseType}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={[styles.rowValue, { color: '#E74C3C' }]}>₹{e.amount}</Text></View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Expenses</Text><Text style={[styles.calcValueTotal, { color: '#E74C3C' }]}>₹{expensesTotal}</Text></View>
        </View>

        {/* SECTION 7: CHIT FUNDS */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>7. CHIT FUNDS REPORT</Text>
          {data.chitFunds.map((c, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{c.customerId?.customerName}</Text><Text style={styles.rowSub}>Rate: ₹{c.goldRate}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.rowValue}>₹{c.amount}</Text><Text style={[styles.rowValue, { color: '#27AE60' }]}>{c.purchasedWeight}g</Text></View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Cash Collected</Text><Text style={[styles.calcValueTotal, { color: '#27AE60' }]}>₹{data.chitFunds.reduce((s,i)=>s+i.amount,0)}</Text></View>
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Purchased Gram</Text><Text style={styles.calcValueTotal}>{chitCollection.toFixed(3)}g</Text></View>
        </View>

        {/* SECTION 8: LINE STOCKER */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>8. LINE STOCKER REPORT</Text>
          {data.lineStock.map((ls, idx) => (
            <View key={idx} style={styles.tableRow}>
              <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{ls.customerName}</Text><Text style={styles.rowSub}>{ls.status}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={[styles.rowValue, { color: ls.status==='SETTLED' ? '#27AE60' : '#E74C3C' }]}>{ls.totalIssuedGram.toFixed(3)}g</Text></View>
            </View>
          ))}
          <View style={styles.divider} />
          <View style={styles.calcRow}><Text style={styles.calcLabelTotal}>Total Issued</Text><Text style={styles.calcValueTotal}>{lineStockOutstanding.toFixed(3)}g</Text></View>
        </View>

      </>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      <View style={[styles.header, { paddingTop: topPad }]}>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Reports & Analytics</Text>
        </View>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, mode === 'TODAY' && styles.activeTab]} onPress={() => handleModeChange('TODAY')}>
          <Text style={[styles.tabText, mode === 'TODAY' && styles.activeTabText]}>Today</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'CUSTOM_DATE' && styles.activeTab]} onPress={() => handleModeChange('CUSTOM_DATE')}>
          <Text style={[styles.tabText, mode === 'CUSTOM_DATE' && styles.activeTabText]}>Custom</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, mode === 'MONTHLY' && styles.activeTab]} onPress={() => handleModeChange('MONTHLY')}>
          <Text style={[styles.tabText, mode === 'MONTHLY' && styles.activeTabText]}>Month</Text>
        </TouchableOpacity>
      </View>

      {mode !== 'TODAY' && (
        <View style={styles.datePickerContainer}>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPicker(true)}>
            <MaterialCommunityIcons name="calendar" size={20} color={DARK_BROWN} />
            <Text style={styles.dateBtnText}>
              {mode === 'CUSTOM_DATE' 
                ? selectedDate.toLocaleDateString('en-GB')
                : `${selectedDate.toLocaleString('default', { month: 'long' })} ${selectedDate.getFullYear()}`
              }
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {showPicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display="default"
          onChange={onDateChange}
        />
      )}

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 100 }}>
        {loading ? (
          <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 50 }} />
        ) : (
          <>
            {renderSummaryCards()}
            {renderCalculations()}
            
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <TouchableOpacity 
                style={[styles.pdfBtn, { flex: 1 }]} 
                disabled={printing}
                onPress={() => handleExportReport('download')}
              >
                {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="download" size={20} color="#FFF" />}
                <Text style={styles.pdfBtnText}>{printing ? 'Generating...' : 'Download PDF'}</Text>
              </TouchableOpacity>
              
              <TouchableOpacity 
                style={[styles.pdfBtn, { flex: 1, backgroundColor: '#25D366' }]} 
                disabled={printing}
                onPress={() => handleExportReport('whatsapp')}
              >
                {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />}
                <Text style={styles.pdfBtnText}>{printing ? 'Sharing...' : 'WhatsApp'}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: HEADER_BG, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 8 },
  headerCenter: { alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '800' },
  tabContainer: { flexDirection: 'row', backgroundColor: '#FFF', margin: 16, borderRadius: 8, elevation: 2, overflow: 'hidden' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  activeTab: { backgroundColor: DARK_BROWN },
  tabText: { color: '#666', fontWeight: '700', fontSize: 13 },
  activeTabText: { color: GOLD },
  datePickerContainer: { alignItems: 'center', marginBottom: 12 },
  dateBtn: { flexDirection: 'row', backgroundColor: '#FFF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, alignItems: 'center', elevation: 2 },
  dateBtnText: { marginLeft: 8, fontWeight: '700', color: DARK_BROWN },
  content: { flex: 1, paddingHorizontal: 16 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 16 },
  card: { backgroundColor: '#FFF', width: '48%', padding: 16, borderRadius: 12, marginBottom: 16, elevation: 2, alignItems: 'center' },
  cardLabel: { fontSize: 12, color: '#666', fontWeight: '600', textAlign: 'center' },
  cardValue: { fontSize: 18, color: DARK_BROWN, fontWeight: '800', marginTop: 8 },
  section: { backgroundColor: '#FFF', padding: 16, borderRadius: 12, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: DARK_BROWN, marginBottom: 12 },
  calcRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 12 },
  calcLabelTotal: { fontSize: 14, color: DARK_BROWN, fontWeight: '800' },
  calcValueTotal: { fontSize: 18, color: DARK_BROWN, fontWeight: '900' },
  tableRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  rowTitle: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  rowSub: { fontSize: 11, color: '#888', marginTop: 2 },
  rowValue: { fontSize: 14, fontWeight: '800', color: DARK_BROWN },
  sourceTag: { fontSize: 9, fontWeight: '700', color: '#A08850', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.3 },
  tableHeaderRow: { flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#EEE', paddingBottom: 6, marginBottom: 8 },
  tableHeader: { fontSize: 12, fontWeight: '800', color: '#888' },
  pdfBtn: { backgroundColor: '#C0392B', flexDirection: 'row', padding: 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', elevation: 4, marginTop: 8 },
  pdfBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800', marginLeft: 8 }
});
