import React, { useEffect, useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, TextInput
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { transactionAPI, settlementAPI } from '../../services/api';
import { PrintService, SettlementPrintService } from '../../services/PrintService';
import { useDashboard } from '../../context/DashboardContext';
import { useAuth } from '../../context/AuthContext';
import { safeNumber } from '../../utils/safeNumber';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';

export default function BillPreviewScreen({ navigation, route }) {
  const { transactionId, type, previewPayload } = route.params || {};
  const insets = useSafeAreaInsets();
  
  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Wastage: Collect Cash / Add to Balance only select the payment option now —
  // the bill isn't saved until the separate "Save Bill" button is pressed.
  const [selectedPaymentOption, setSelectedPaymentOption] = useState(null);
  const printLockRef = useRef(false);
  const savingLockRef = useRef(false);
  const [tamilMsg, setTamilMsg] = useState('நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.');

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

  const { user } = useAuth();
  const { goldRate: dashboardGoldRate } = useDashboard();
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementMode, setSettlementMode] = useState('Cash');
  const [settling, setSettling] = useState(false);
  const [settlements, setSettlements] = useState([]);
  const [settlementPrinting, setSettlementPrinting] = useState({});

  const isPreviewMode = !!previewPayload;

  useEffect(() => {
    if (isPreviewMode) {
      setTransaction(previewPayload);
      setLoading(false);
      return;
    }

    if (!transactionId) {
      Alert.alert('Error', 'No transaction ID provided.');
      navigation.goBack();
      return;
    }
    
    const fetchTxn = async () => {
      try {
        const res = await transactionAPI.getById(transactionId);
        if (res.data.success) {
          setTransaction(res.data.data);
        } else {
          Alert.alert('Error', 'Failed to load transaction.');
        }
      } catch (e) {
        console.error(e);
        Alert.alert('Error', 'Failed to load transaction details.');
      } finally {
        setLoading(false);
      }
    };

    fetchTxn();
  }, [transactionId, isPreviewMode, previewPayload, navigation]);

  const fetchSettlements = async (txnId) => {
    try {
      const res = await settlementAPI.getByBill(txnId);
      if (res.data.success) setSettlements(res.data.data);
    } catch (_) {}
  };

  useEffect(() => {
    if (!isPreviewMode && transaction?._id) {
      fetchSettlements(transaction._id);
    }
  }, [transaction?._id, isPreviewMode]);

  if (loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ marginTop: 10, color: DARK_BROWN }}>Loading Bill...</Text>
      </View>
    );
  }

  if (!transaction) return null;

  const {
    _id, createdAt, transactionType, customerId, issueItems = [], receiptItems = [],
    paymentMode, paymentDetails, description,
    issueTotalWeight, issueTotalPurity, issueTotalAmount, receiptTotalWeight, receiptTotalPurity, receiptTotalAmount,
    finalAmount, goldRate, goldPaymentWeight, goldPaymentPurity, goldConvertedAmount,
    oldBalanceBefore, oldBalanceAfter, advanceBalanceBefore, advanceBalanceAfter, convertedGram, gstDetails,
    commonBillNo, isWastage, status, paymentOption,
  } = transaction;

  // In preview mode customerId is a plain ID string; use transaction.customer instead
  const customerInfo = (customerId && typeof customerId === 'object')
    ? customerId
    : (transaction.customer || {});

  const dateStr = new Date(createdAt).toLocaleDateString('en-GB');
  const timeStr = new Date(createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const collectedAmount = paymentMode === 'Gold' ? goldConvertedAmount : (paymentDetails?.amount || 0);
  // B2D is a gram-only ledger (no money): Issue/Receipt Gram, Outstanding Balance.
  // Wastage uses a cash model (WW × Rate) and is handled separately below.
  const isB2DBill = transactionType === 'B2D';
  const isGramOnly = isB2DBill;
  // Plus: every non-Wastage B2C bill — a Pure-weight (gram) ledger, no cash/GST involved.
  const isPlusBill = transactionType === 'B2C' && !isWastage;
  // Sanitized wastage cash fields — never let Infinity/-Infinity/NaN reach the bill.
  const safeIssueTotalAmount = safeNumber(issueTotalAmount);
  const safeReceiptTotalAmount = safeNumber(receiptTotalAmount);
  const safeFinalAmount = safeNumber(finalAmount);

  // Navigates into the same edit-in-place flow already used from Customer
  // Details / Transaction Management — updates the existing bill by
  // editTransactionId rather than creating a duplicate.
  const handleEditBill = () => {
    const customerId = typeof transaction.customerId === 'object' ? transaction.customerId._id : transaction.customerId;
    navigation.navigate(`${transaction.transactionType}Calculation`, {
      type: transaction.transactionType,
      customerId,
      editTransactionId: transaction._id,
      prefilledData: transaction,
    });
  };

  // Wastage: Collect Cash / Add to Balance only choose the payment option
  // (below). The bill is saved to MongoDB only when this is called, which
  // happens exclusively from the separate "Save Bill" button.
  const handleSaveWastageBill = async () => {
    if (!selectedPaymentOption) return;
    if (savingLockRef.current) return;
    savingLockRef.current = true;
    setSaving(true);
    try {
      const isCollectCash = selectedPaymentOption === 'COLLECT_CASH';
      const newCollectedAmount = isCollectCash ? safeFinalAmount : 0;
      const newOutstandingAmount = isCollectCash ? 0 : safeFinalAmount;
      const newOldBalanceAfter = isCollectCash ? 0 : safeNumber(safeNumber(oldBalanceBefore) + safeFinalAmount);
      const newStatus = isCollectCash ? 'PAID' : 'PARTIAL';

      let res;
      if (transaction.editTransactionId) {
        res = await transactionAPI.update(transaction.editTransactionId, {
          newIssueItems: transaction.issueItems || [],
          newReceiptItems: transaction.receiptItems || [],
          newWastageProfit: transaction.wastageProfit || [],
          paymentOption: selectedPaymentOption,
          paymentMode: transaction.paymentMode || 'Cash',
          paymentDetails: { mode: transaction.paymentMode || 'Cash', amount: newCollectedAmount },
        });
      } else {
        res = await transactionAPI.create({
          ...transaction,
          paymentOption: selectedPaymentOption,
          collectedAmount: newCollectedAmount,
          outstandingAmount: newOutstandingAmount,
          outstandingGram: 0,
          oldBalanceAfter: newOldBalanceAfter,
          advanceBalanceAfter: safeNumber(advanceBalanceBefore),
          status: newStatus,
          paymentDetails: { mode: transaction.paymentMode || 'Cash', amount: newCollectedAmount },
        });
      }
      if (res.data.success) {
        Alert.alert(
          'Success',
          'Bill Saved Successfully',
          [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }]
        );
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', err.response?.data?.message || 'Failed to save transaction.');
      savingLockRef.current = false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.popToTop()}>
          <MaterialCommunityIcons name="home" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        
        {/* THERMAL PAPER CONTAINER (Simulates 58mm roll) */}
        <View style={styles.thermalPaper}>
          <Text style={[styles.brandTitle, {fontSize: 20, marginBottom: 2}]}>Sri Vaishnavi Jewellers</Text>
          <Text style={[styles.centerText, {fontSize: 12}]}>No 370, Big Bazaar Street</Text>
          <Text style={[styles.centerText, {fontSize: 12}]}>(Opp - B.G. Naidu Sweets)</Text>
          <Text style={[styles.centerText, {fontSize: 12}]}>Phone: 8248134521</Text>
          
          <Text style={styles.divider}>--------------------------------</Text>

          <View style={[styles.row, {alignItems: 'flex-start'}]}>
            <View>
              {commonBillNo ? <Text style={[styles.mono, {fontWeight: 'bold'}]}>Bill No: {commonBillNo}</Text> : null}
            </View>
            <View style={{alignItems: 'flex-end'}}>
              <Text style={styles.mono}>{dateStr}</Text>
              <Text style={styles.mono}>{timeStr}</Text>
            </View>
          </View>

          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
          <View style={styles.row}><Text style={styles.mono}>Name:</Text><Text style={styles.mono}>{customerInfo.customerName || '—'}</Text></View>
          <View style={styles.row}><Text style={styles.mono}>Phone:</Text><Text style={styles.mono}>{customerInfo.phoneNumber || '—'}</Text></View>
          <View style={styles.row}><Text style={styles.mono}>Old Bal:</Text><Text style={styles.mono}>{isWastage ? `₹${safeNumber(oldBalanceBefore).toLocaleString('en-IN', {maximumFractionDigits:2})}` : `${Number(oldBalanceBefore).toFixed(3)}g`}</Text></View>
          {!isWastage && <View style={styles.row}><Text style={styles.mono}>Advance:</Text><Text style={styles.mono}>{Number(advanceBalanceBefore).toFixed(3)}g</Text></View>}

          <Text style={styles.divider}>--------------------------------</Text>
          <View style={styles.rateBox}>
            <Text style={styles.rateText}>GOLD RATE TODAY: ₹{goldRate}</Text>
          </View>

          {issueItems.length > 0 && (
            <>
              <Text style={styles.divider}>--------------------------------</Text>
              <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
              {isWastage ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Item</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>WW(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Rate(₹)</Text>
                    <Text style={[styles.th, {flex: 1.5, textAlign: 'right'}]}>Cash(₹)</Text>
                  </View>
                  {issueItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.itemName || item.itemNumber || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.value1 || 0).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(2)}</Text>
                        <Text style={[styles.td, {flex: 1.5, textAlign: 'right'}]}>{safeNumber(item.amount).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total WW:</Text><Text style={styles.monoBold}>{issueItems.reduce((s,i)=>s+(i.value1||0),0).toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Cash:</Text><Text style={styles.monoBold}>₹{safeIssueTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                </>
              ) : isB2DBill ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Item</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Wt(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>A.Tch%</Text>
                    <Text style={[styles.th, {flex: 1.2, textAlign: 'right'}]}>Purity</Text>
                  </View>
                  {issueItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.itemName || item.itemNumber || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.actualTouch || 0).toFixed(2)}</Text>
                        <Text style={[styles.td, {flex: 1.2, textAlign: 'right'}]}>{Number(item.purity).toFixed(3)}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Wt:</Text><Text style={styles.monoBold}>{issueTotalWeight.toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Purity:</Text><Text style={styles.monoBold}>{issueTotalPurity.toFixed(3)}g</Text></View>
                </>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Item</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Wt(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>SRI Bill</Text>
                    <Text style={[styles.th, {flex: 1.2, textAlign: 'right'}]}>Pure</Text>
                  </View>
                  {issueItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.itemName || item.itemNumber || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.sriBill || 0)}</Text>
                        <Text style={[styles.td, {flex: 1.2, textAlign: 'right'}]}>{safeNumber(item.purity).toFixed(3)}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Wt:</Text><Text style={styles.monoBold}>{issueTotalWeight.toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Pure:</Text><Text style={styles.monoBold}>{safeNumber(issueTotalPurity).toFixed(3)}g</Text></View>
                </>
              )}
            </>
          )}

          {receiptItems.length > 0 && (
            <>
              <Text style={styles.divider}>--------------------------------</Text>
              <Text style={styles.sectionTitle}>RECEIVED ITEMS</Text>
              {isWastage ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Type</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Wt(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Rate(₹)</Text>
                    <Text style={[styles.th, {flex: 1.5, textAlign: 'right'}]}>Cash(₹)</Text>
                  </View>
                  {receiptItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.receiptType || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{safeNumber(item.rate).toFixed(2)}</Text>
                        <Text style={[styles.td, {flex: 1.5, textAlign: 'right'}]}>{safeNumber(item.amount).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Wt:</Text><Text style={styles.monoBold}>{receiptTotalWeight.toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Cash:</Text><Text style={styles.monoBold}>₹{safeReceiptTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                </>
              ) : isB2DBill ? (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Item</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Wt(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>SRI%</Text>
                    <Text style={[styles.th, {flex: 1.2, textAlign: 'right'}]}>Purity</Text>
                  </View>
                  {receiptItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.receiptType || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.sriCost || 0).toFixed(2)}</Text>
                        <Text style={[styles.td, {flex: 1.2, textAlign: 'right'}]}>{Number(item.purity).toFixed(3)}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Wt:</Text><Text style={styles.monoBold}>{receiptTotalWeight.toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Purity:</Text><Text style={styles.monoBold}>{receiptTotalPurity.toFixed(3)}g</Text></View>
                </>
              ) : (
                <>
                  <View style={styles.tableHeader}>
                    <Text style={[styles.th, {flex: 2.5}]}>Type</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Wt(g)</Text>
                    <Text style={[styles.th, {flex: 1.2}]}>Buying %</Text>
                    <Text style={[styles.th, {flex: 1.2, textAlign: 'right'}]}>Pure</Text>
                  </View>
                  {receiptItems.map((item, index) => (
                    <View key={item._id || index} style={{borderBottomWidth: 1, borderColor: '#EEE', paddingVertical: 3}}>
                      <View style={styles.tr}>
                        <Text style={[styles.td, {flex: 2.5}]}>{item.receiptType || '-'}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.weight).toFixed(3)}</Text>
                        <Text style={[styles.td, {flex: 1.2}]}>{Number(item.actualTouch || 0)}</Text>
                        <Text style={[styles.td, {flex: 1.2, textAlign: 'right'}]}>{safeNumber(item.purity).toFixed(3)}</Text>
                      </View>
                    </View>
                  ))}
                  <Text style={styles.dividerDotted}>................................</Text>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Wt:</Text><Text style={styles.monoBold}>{receiptTotalWeight.toFixed(3)}g</Text></View>
                  <View style={styles.row}><Text style={styles.monoBold}>Total Pure:</Text><Text style={styles.monoBold}>{safeNumber(receiptTotalPurity).toFixed(3)}g</Text></View>
                </>
              )}
            </>
          )}

          {!isGramOnly && !isPlusBill && collectedAmount > 0 && (
            <>
              <Text style={styles.divider}>--------------------------------</Text>
              <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
              <View style={styles.row}><Text style={styles.mono}>Mode:</Text><Text style={styles.mono}>{paymentMode}</Text></View>
              {paymentMode === 'Gold' && <View style={styles.row}><Text style={styles.mono}>Gold Wt:</Text><Text style={styles.mono}>{goldPaymentWeight}g</Text></View>}
              <View style={styles.row}><Text style={styles.mono}>Collected Amt:</Text><Text style={styles.mono}>₹{collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              {description ? <View style={styles.row}><Text style={styles.mono}>Desc:</Text><Text style={[styles.mono, {maxWidth:'60%', textAlign:'right'}]}>{description}</Text></View> : null}
            </>
          )}

          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={styles.sectionTitle}>SUMMARY</Text>
          {isWastage ? (
            <>
              <View style={styles.row}><Text style={styles.mono}>Issue Cash:</Text><Text style={styles.mono}>₹{safeIssueTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              <View style={styles.row}><Text style={styles.mono}>Receipt Cash:</Text><Text style={styles.mono}>- ₹{safeReceiptTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              <View style={styles.row}><Text style={styles.monoBold}>FINAL CASH:</Text><Text style={styles.monoBold}>₹{safeFinalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              <View style={styles.row}><Text style={styles.mono}>Payment Type:</Text><Text style={styles.mono}>{paymentMode}</Text></View>
              {(() => {
                // In preview mode, reflect the locally selected (not-yet-saved) option;
                // once saved, reflect the transaction's actual stored status.
                const previewStatus = isPreviewMode
                  ? (selectedPaymentOption === 'COLLECT_CASH' ? 'PAID' : selectedPaymentOption === 'ADD_TO_BALANCE' ? 'PARTIAL' : null)
                  : (status || null);
                if (!previewStatus) return null;
                const previewBalance = isPreviewMode
                  ? safeNumber(safeNumber(oldBalanceBefore) + safeFinalAmount)
                  : safeNumber(oldBalanceAfter);
                return (
                  <>
                    <Text style={styles.dividerDotted}>................................</Text>
                    <View style={styles.row}><Text style={styles.mono}>Payment Status:</Text><Text style={styles.monoBold}>{previewStatus === 'PAID' ? 'Paid' : 'Balance'}</Text></View>
                    {previewStatus === 'PARTIAL' && (
                      <View style={styles.row}><Text style={styles.monoBold}>Balance Amount:</Text><Text style={styles.monoBold}>₹{previewBalance.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                    )}
                  </>
                );
              })()}
            </>
          ) : isPlusBill ? (
            <>
              <View style={styles.row}><Text style={styles.mono}>Total Issue Pure:</Text><Text style={styles.mono}>{safeNumber(issueTotalPurity).toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.mono}>Total Receipt Pure:</Text><Text style={styles.mono}>- {safeNumber(receiptTotalPurity).toFixed(3)}g</Text></View>
              <View style={styles.row}>
                <Text style={styles.monoBold}>DIFFERENCE:</Text>
                <Text style={styles.monoBold}>{Math.abs(safeNumber(issueTotalPurity) - safeNumber(receiptTotalPurity)).toFixed(3)}g</Text>
              </View>
              <Text style={styles.dividerDotted}>................................</Text>
              <View style={styles.row}><Text style={styles.mono}>Old Balance (Before):</Text><Text style={styles.mono}>{Number(oldBalanceBefore).toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.mono}>Advance Balance (Before):</Text><Text style={styles.mono}>{Number(advanceBalanceBefore).toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.monoBold}>Old Balance (After):</Text><Text style={styles.monoBold}>{Number(oldBalanceAfter).toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.monoBold}>Advance Balance (After):</Text><Text style={styles.monoBold}>{Number(advanceBalanceAfter).toFixed(3)}g</Text></View>
            </>
          ) : isGramOnly ? (
            <>
              <View style={styles.row}><Text style={styles.mono}>Issue Gram:</Text><Text style={styles.mono}>{issueTotalPurity.toFixed(3)}g</Text></View>
              <View style={styles.row}><Text style={styles.mono}>Receipt Gram:</Text><Text style={styles.mono}>- {receiptTotalPurity.toFixed(3)}g</Text></View>
              <View style={styles.row}>
                <Text style={styles.monoBold}>OUTSTANDING BALANCE:</Text>
                <Text style={styles.monoBold}>{Math.abs(transaction.balanceAmount || (issueTotalPurity - receiptTotalPurity)).toFixed(3)}g</Text>
              </View>
            </>
          ) : (
            <>
              {issueTotalAmount > 0 && <View style={styles.row}><Text style={styles.mono}>Issue Amount:</Text><Text style={styles.mono}>₹{issueTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>}
              {gstDetails?.isOn && issueTotalAmount > 0 && (
                <>
                  {gstDetails.hsnCode ? <View style={styles.row}><Text style={styles.mono}>HSN Code:</Text><Text style={styles.mono}>{gstDetails.hsnCode}</Text></View> : null}
                  <View style={styles.row}><Text style={styles.mono}>CGST ({gstDetails.cgstPercent}%):</Text><Text style={styles.mono}>₹{gstDetails.cgstAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                  <View style={styles.row}><Text style={styles.mono}>SGST ({gstDetails.sgstPercent}%):</Text><Text style={styles.mono}>₹{gstDetails.sgstAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
                </>
              )}
              {receiptTotalAmount > 0 && <View style={styles.row}><Text style={styles.mono}>Receipt Amount:</Text><Text style={styles.mono}>- ₹{receiptTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>}
              {(issueTotalAmount > 0 || receiptTotalAmount > 0) && (
                <View style={styles.row}><Text style={styles.monoBold}>SUBTOTAL AMOUNT:</Text><Text style={styles.monoBold}>₹{finalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              )}
              {collectedAmount > 0 && (
                <View style={styles.row}><Text style={styles.monoBold}>COLLECTED AMOUNT:</Text><Text style={styles.monoBold}>- ₹{collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text></View>
              )}

              <View style={styles.row}>
                <Text style={styles.monoBold}>OUTSTANDING AMOUNT:</Text>
                <Text style={styles.monoBold}>₹{Math.abs(transaction.outstandingAmount || (finalAmount - collectedAmount)).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
              </View>
            </>
          )}

          {!isPlusBill && (
            <>
              <Text style={styles.divider}>--------------------------------</Text>
              <Text style={styles.sectionTitle}>TRANSACTION SUMMARY</Text>
              {!isGramOnly && (
                <>
                  <View style={styles.row}><Text style={styles.mono}>Converted Gram:</Text><Text style={styles.mono}>{Number(convertedGram).toFixed(3)}g</Text></View>
                  {((transaction.outstandingAmount || (finalAmount - collectedAmount)) > 0) && (
                    <View style={styles.row}>
                      <Text style={styles.monoBold}>Outstanding Gram:</Text>
                      <Text style={[styles.monoBold, {color:'#D32F2F'}]}>
                        {safeNumber(transaction.outstandingGram != null
                          ? transaction.outstandingGram
                          : (goldRate ? Math.max(0, finalAmount - collectedAmount) / goldRate : 0)
                        ).toFixed(3)}g
                      </Text>
                    </View>
                  )}
                </>
              )}
              <View style={styles.row}><Text style={styles.mono}>New Old Bal:</Text><Text style={styles.mono}>{Number(oldBalanceAfter).toFixed(3)}g</Text></View>
              {!isGramOnly && (
                <View style={styles.row}><Text style={styles.mono}>New Advance:</Text><Text style={styles.mono}>{Number(advanceBalanceAfter).toFixed(3)}g</Text></View>
              )}
            </>
          )}

          <Text style={styles.divider}>--------------------------------</Text>
          <View style={{ marginTop: 15, marginBottom: 10 }}>
            <TextInput
              style={styles.tamilInput}
              multiline
              value={tamilMsg}
              onChangeText={setTamilMsg}
              placeholder="Enter message here"
            />
          </View>
          <Text style={[styles.footerMsg, {marginBottom: 4}]}>Thank You For Visiting</Text>
          <Text style={[styles.brandTitle, {fontSize: 16, marginBottom: 4}]}>Sri Vaishnavi Jewellers</Text>
          <Text style={styles.footerMsg}>Visit Again</Text>
          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={[styles.mono, {textAlign: 'center', marginTop: 4}]}>Done by: {user?.name || 'SVJ'}</Text>
        </View>

        {/* SETTLEMENT MODULE FOR READ-ONLY OUTSTANDING BILLS */}
        {!isPreviewMode && transaction.outstandingAmount > 0 && (
          <View style={styles.settlementCard}>
            <Text style={styles.settlementTitle}>Outstanding Settlement</Text>
            
            <View style={styles.settlementRow}>
              <Text style={styles.settlementLabel}>Outstanding Amount:</Text>
              <Text style={styles.settlementVal}>₹ {transaction.outstandingAmount.toLocaleString('en-IN')}</Text>
            </View>
            <View style={styles.settlementRow}>
              <Text style={styles.settlementLabel}>Outstanding Gram:</Text>
              <Text style={styles.settlementVal}>{transaction.outstandingGram.toFixed(3)} g</Text>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Payment Mode</Text>
              <View style={styles.modeRow}>
                {['Cash', 'Online Payment', 'Card'].map(mode => (
                  <TouchableOpacity
                    key={mode}
                    style={[styles.modeChip, settlementMode === mode && styles.modeChipActive]}
                    onPress={() => setSettlementMode(mode)}
                  >
                    <Text style={[styles.modeText, settlementMode === mode && styles.modeTextActive]}>{mode.split(' ')[0]}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount Paying Now (₹)</Text>
              <TextInput
                style={styles.settlementInput}
                keyboardType="numeric"
                value={settlementAmount}
                onChangeText={setSettlementAmount}
                placeholder="Enter amount..."
              />
            </View>

            {Number(settlementAmount) > 0 && (
              <View style={styles.liveSummary}>
                <Text style={styles.liveSummaryTitle}>Live Settlement Summary</Text>
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>Gram Settled:</Text>
                  <Text style={styles.settlementVal}>
                    {dashboardGoldRate?.rate ? (Number(settlementAmount) / dashboardGoldRate.rate).toFixed(3) : 0} g
                  </Text>
                </View>
                <View style={styles.settlementRow}>
                  <Text style={styles.settlementLabel}>Remaining Outstanding:</Text>
                  <Text style={styles.settlementVal}>
                    ₹ {Math.max(0, transaction.outstandingAmount - Number(settlementAmount)).toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>
            )}

            <TouchableOpacity 
              style={[styles.saveSettlementBtn, settling && {opacity: 0.7}]} 
              disabled={settling || !settlementAmount || Number(settlementAmount) <= 0}
              onPress={async () => {
                const amt = Math.round(Number(settlementAmount) * 100) / 100;
                const outstanding = Math.round(transaction.outstandingAmount * 100) / 100;
                if (amt > outstanding) {
                  Alert.alert('Error', 'Amount exceeds outstanding balance!');
                  return;
                }
                setSettling(true);
                try {
                  const res = await settlementAPI.create({
                    originalTransactionId: transaction._id,
                    customerId: transaction.customerId._id || transaction.customerId,
                    paymentMode: settlementMode,
                    amountPaid: amt,
                    goldRateAtSettlement: dashboardGoldRate?.rate || 0,
                    description: `Settlement for Bill ${transaction._id.slice(-6).toUpperCase()}`
                  });
                  if (res.data.success) {
                    Alert.alert('Success', 'Settlement completed!');
                    const [txRes] = await Promise.all([
                      transactionAPI.getById(transaction._id),
                      fetchSettlements(transaction._id),
                    ]);
                    setTransaction(txRes.data.data);
                    setSettlementAmount('');
                    navigation.navigate('SettlementPreview', { settlement: res.data.data, originalBillNumber: transaction._id.slice(-6).toUpperCase() });
                  }
                } catch(e) {
                  Alert.alert('Error', e.response?.data?.message || 'Failed to settle');
                } finally {
                  setSettling(false);
                }
              }}
            >
              {settling ? <ActivityIndicator color="#FFF"/> : (
                <Text style={styles.saveSettlementText}>Save & Print Settlement Bill</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
        {/* Settlement History */}
        {!isPreviewMode && settlements.length > 0 && (
          <View style={styles.settlementHistoryCard}>
            <Text style={styles.settlementHistoryTitle}>Settlement History</Text>
            {settlements.map((s, idx) => {
              const sDate = new Date(s.createdAt).toLocaleDateString('en-GB');
              const sTime = new Date(s.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
              const originalBillNo = transaction._id.slice(-6).toUpperCase();
              const isPrinting = settlementPrinting[s._id] === 'print';
              const isSharing = settlementPrinting[s._id] === 'share';

              const lockPrint = async (key, fn) => {
                if (settlementPrinting[s._id]) return;
                setSettlementPrinting(prev => ({ ...prev, [s._id]: key }));
                try { await fn(); } catch (e) {
                  if (!e?.message?.toLowerCase().includes('cancel'))
                    Alert.alert('Error', e?.message || 'Action failed');
                } finally {
                  setSettlementPrinting(prev => ({ ...prev, [s._id]: null }));
                }
              };

              return (
                <View key={s._id} style={[styles.settlementHistoryRow, idx > 0 && { borderTopWidth: 1, borderTopColor: '#F0E8D8', marginTop: 10, paddingTop: 10 }]}>
                  <View style={styles.settlementHistoryLeft}>
                    <Text style={styles.settlementBillNo}>{s.settlementBillNumber}</Text>
                    <Text style={styles.settlementMeta}>{sDate} {sTime} · {s.paymentMode}</Text>
                    <View style={styles.settlementAmtRow}>
                      <Text style={styles.settlementAmtLabel}>Paid</Text>
                      <Text style={styles.settlementAmtVal}>₹{s.amountPaid.toLocaleString('en-IN')}</Text>
                      <Text style={[styles.settlementAmtLabel, { marginLeft: 12 }]}>Remaining</Text>
                      <Text style={[styles.settlementAmtVal, { color: s.outstandingAfter > 0 ? '#D32F2F' : '#2E7D32' }]}>
                        ₹{s.outstandingAfter.toLocaleString('en-IN')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settlementHistoryActions}>
                    <TouchableOpacity
                      style={[styles.settlementActionBtn, isPrinting && { opacity: 0.6 }]}
                      disabled={!!settlementPrinting[s._id]}
                      onPress={() => lockPrint('print', () => SettlementPrintService.printReceipt(s, originalBillNo))}
                    >
                      {isPrinting
                        ? <ActivityIndicator size="small" color={DARK_BROWN} />
                        : <MaterialCommunityIcons name="printer" size={18} color={DARK_BROWN} />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.settlementActionBtn, { backgroundColor: '#E8F5E9' }, isSharing && { opacity: 0.6 }]}
                      disabled={!!settlementPrinting[s._id]}
                      onPress={() => lockPrint('share', () => SettlementPrintService.shareWhatsApp(s, originalBillNo))}
                    >
                      {isSharing
                        ? <ActivityIndicator size="small" color="#25D366" />
                        : <MaterialCommunityIcons name="whatsapp" size={18} color="#25D366" />}
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.settlementActionBtn, { backgroundColor: '#E8EAF6' }]}
                      onPress={() => navigation.navigate('SettlementPreview', { settlement: s, originalBillNumber: originalBillNo })}
                    >
                      <MaterialCommunityIcons name="eye" size={18} color="#3949AB" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={styles.actionsContainer}>
        {isPreviewMode && isWastage ? (
          <View>
            <View style={[styles.actionsBar, { marginBottom: 8 }]}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { backgroundColor: '#2E7D32' },
                  selectedPaymentOption === 'COLLECT_CASH' && styles.actionBtnSelected,
                  (saving || printing || sharing) && { opacity: 0.6 },
                ]}
                disabled={saving || printing || sharing}
                onPress={() => setSelectedPaymentOption('COLLECT_CASH')}
              >
                <MaterialCommunityIcons
                  name={selectedPaymentOption === 'COLLECT_CASH' ? 'check-circle' : 'cash-check'}
                  size={18}
                  color="#FFF"
                />
                <Text style={styles.actionText}>Collect Cash</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  selectedPaymentOption === 'ADD_TO_BALANCE' && styles.actionBtnSelected,
                  (saving || printing || sharing) && { opacity: 0.6 },
                ]}
                disabled={saving || printing || sharing}
                onPress={() => setSelectedPaymentOption('ADD_TO_BALANCE')}
              >
                <MaterialCommunityIcons
                  name={selectedPaymentOption === 'ADD_TO_BALANCE' ? 'check-circle' : 'account-cash-outline'}
                  size={18}
                  color="#FFF"
                />
                <Text style={styles.actionText}>Add to Balance</Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.actionsBar, { marginBottom: 8 }]}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  styles.saveBillBtn,
                  (!selectedPaymentOption || saving || printing || sharing) && { opacity: 0.5 },
                ]}
                disabled={!selectedPaymentOption || saving || printing || sharing}
                onPress={handleSaveWastageBill}
              >
                {saving ? <ActivityIndicator size="small" color={DARK_BROWN} /> : (
                  <>
                    <MaterialCommunityIcons name="content-save" size={18} color={DARK_BROWN} />
                    <Text style={[styles.actionText, { color: DARK_BROWN }]}>Save Bill</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.actionsBar}>
              <TouchableOpacity
                style={[styles.actionBtn, (printing || sharing || saving) && { opacity: 0.6 }]}
                disabled={printing || sharing || saving}
                onPress={() => withPrintLock(setPrinting, () =>
                  PrintService.printThermal(
                    { ...transaction, createdAt: transaction.createdAt || new Date().toISOString(), createdByName: user?.name || 'SVJ' },
                    tamilMsg
                  )
                )}
              >
                {printing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <MaterialCommunityIcons name="printer-pos" size={18} color="#FFF" />}
                <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#25D366' }, (printing || sharing || saving) && { opacity: 0.6 }]}
                disabled={printing || sharing || saving}
                onPress={() => withPrintLock(setSharing, () =>
                  PrintService.shareWhatsApp(
                    { ...transaction, createdAt: transaction.createdAt || new Date().toISOString(), createdByName: user?.name || 'SVJ' },
                    tamilMsg
                  )
                )}
              >
                {sharing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <MaterialCommunityIcons name="whatsapp" size={18} color="#FFF" />}
                <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : isPreviewMode ? (
          <View style={styles.actionsBar}>
            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#2E7D32' }, (saving || printing || sharing) && { opacity: 0.6 }]}
              disabled={saving || printing || sharing}
              onPress={async () => {
                if (savingLockRef.current) return;
                savingLockRef.current = true;
                setSaving(true);
                try {
                  let res;
                  if (transaction.editTransactionId) {
                    res = await transactionAPI.update(transaction.editTransactionId, {
                      newIssueItems: transaction.issueItems || [],
                      newReceiptItems: transaction.receiptItems || [],
                      newWastageProfit: transaction.wastageProfit || [],
                      newPlusProfit: transaction.plusProfit || [],
                      receiptTotalWeight: transaction.receiptTotalWeight || 0,
                      receiptTotalAmount: transaction.receiptTotalAmount || 0,
                      collectedAmount: transaction.collectedAmount || 0,
                      paymentMode: transaction.paymentMode || 'Cash',
                      paymentDetails: transaction.paymentDetails || {},
                      goldPaymentWeight: transaction.goldPaymentWeight || 0,
                      goldPaymentPurity: transaction.goldPaymentPurity || '22K (916)',
                      goldConvertedAmount: transaction.goldConvertedAmount || 0,
                      convertedGram: transaction.convertedGram || 0,
                    });
                  } else {
                    res = await transactionAPI.create(transaction);
                  }
                  if (res.data.success) {
                    Alert.alert(
                      'Success',
                      transaction.editTransactionId ? 'Bill Updated Successfully' : 'Transaction Saved Successfully',
                      [{ text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) }]
                    );
                  }
                } catch (err) {
                  console.error(err);
                  Alert.alert('Error', err.response?.data?.message || 'Failed to save transaction.');
                  savingLockRef.current = false;
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? <ActivityIndicator size="small" color="#FFF" /> : (
                <>
                  <MaterialCommunityIcons name="content-save" size={18} color="#FFF" />
                  <Text style={styles.actionText}>Save Bill</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, (printing || sharing || saving) && { opacity: 0.6 }]}
              disabled={printing || sharing || saving}
              onPress={() => withPrintLock(setPrinting, () =>
                PrintService.printThermal(
                  { ...transaction, createdAt: transaction.createdAt || new Date().toISOString(), createdByName: user?.name || 'SVJ' },
                  tamilMsg
                )
              )}
            >
              {printing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <MaterialCommunityIcons name="printer-pos" size={18} color="#FFF" />}
              <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print'}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, { backgroundColor: '#25D366' }, (printing || sharing || saving) && { opacity: 0.6 }]}
              disabled={printing || sharing || saving}
              onPress={() => withPrintLock(setSharing, () =>
                PrintService.shareWhatsApp(
                  { ...transaction, createdAt: transaction.createdAt || new Date().toISOString(), createdByName: user?.name || 'SVJ' },
                  tamilMsg
                )
              )}
            >
              {sharing
                ? <ActivityIndicator size="small" color="#FFF" />
                : <MaterialCommunityIcons name="whatsapp" size={18} color="#FFF" />}
              <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View>
            <View style={[styles.actionsBar, { marginBottom: 8 }]}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: GOLD }]}
                onPress={handleEditBill}
              >
                <MaterialCommunityIcons name="pencil-outline" size={20} color={DARK_BROWN} />
                <Text style={[styles.actionText, { color: DARK_BROWN }]}>Edit Bill</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.actionsBar}>
              <TouchableOpacity
                style={[styles.actionBtn, (printing || sharing) && { opacity: 0.6 }]}
                disabled={printing || sharing}
                onPress={() => withPrintLock(setPrinting, () => PrintService.printThermal({ ...transaction, createdByName: user?.name || 'SVJ' }, tamilMsg).then(() => {
                  try { transactionAPI.markPrinted(transaction._id); } catch(e){}
                }))}
              >
                {printing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <MaterialCommunityIcons name="printer-pos" size={20} color="#FFF" />}
                <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print Bill'}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, {backgroundColor: '#25D366'}, (printing || sharing) && { opacity: 0.6 }]}
                disabled={printing || sharing}
                onPress={() => withPrintLock(setSharing, () => PrintService.shareWhatsApp({ ...transaction, createdByName: user?.name || 'SVJ' }, tamilMsg))}
              >
                {sharing
                  ? <ActivityIndicator size="small" color="#FFF" />
                  : <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />}
                <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  centered: { alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', elevation: 2 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DARK_BROWN, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 100, alignItems: 'center' },
  
  // Thermal Paper Wrapper
  thermalPaper: {
    backgroundColor: '#FFFFFF', // pure white like receipt paper
    width: '100%',
    maxWidth: 260,
    alignSelf: 'center',
    padding: 12,
    paddingBottom: 40,
    elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { height: 3, width: 0 }
  },
  
  // Text Styles inside thermal
  footerMsg: { textAlign: 'center', fontSize: 13, color: '#333', marginTop: 10, fontStyle: 'italic' },
  brandTitle: { textAlign: 'center', fontSize: 15, fontWeight: 'bold', color: '#000', marginTop: 5 },
  
  settlementCard: { backgroundColor: '#FFF', margin: 16, marginTop: 0, borderRadius: 12, padding: 16, elevation: 4, borderWidth: 1, borderColor: '#F0E4CC' },
  settlementTitle: { fontSize: 16, fontWeight: 'bold', color: '#D32F2F', marginBottom: 12, textAlign: 'center' },
  settlementRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  settlementLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  settlementVal: { fontSize: 14, color: '#000', fontWeight: 'bold' },
  
  inputGroup: { marginTop: 12 },
  inputLabel: { fontSize: 12, color: DARK_BROWN, fontWeight: '700', marginBottom: 6 },
  modeRow: { flexDirection: 'row', gap: 8 },
  modeChip: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: '#F0F0F0', borderRadius: 8 },
  modeChipActive: { backgroundColor: GOLD },
  modeText: { fontSize: 12, fontWeight: '600', color: '#666' },
  modeTextActive: { color: DARK_BROWN },
  
  settlementInput: { backgroundColor: '#F8F9FA', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 16, color: '#000', fontWeight: 'bold' },
  
  liveSummary: { backgroundColor: '#FFF3E0', padding: 12, borderRadius: 8, marginTop: 16 },
  liveSummaryTitle: { fontSize: 12, fontWeight: 'bold', color: '#E65100', marginBottom: 8 },
  
  saveSettlementBtn: { backgroundColor: '#2E7D32', padding: 16, borderRadius: 10, alignItems: 'center', marginTop: 16 },
  saveSettlementText: { color: '#FFF', fontSize: 15, fontWeight: 'bold' },

  divider: { textAlign: 'center', color: '#000', marginVertical: 4 },
  dividerDotted: { textAlign: 'center', color: '#000', letterSpacing: 2, marginVertical: 4 },
  sectionTitle: { fontWeight: 'bold', fontSize: 12, color: '#000', marginBottom: 4 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#000' },
  monoBold: { fontFamily: 'monospace', fontSize: 12, color: '#000', fontWeight: 'bold' },
  
  rateBox: { borderWidth: 1, borderStyle: 'dashed', borderColor: '#000', padding: 6, alignItems: 'center', marginVertical: 4 },
  rateText: { fontWeight: 'bold', fontSize: 13, color: '#000' },

  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderStyle: 'dashed', borderBottomColor: '#000', paddingBottom: 4, marginBottom: 4 },
  th: { fontWeight: 'bold', fontSize: 11, color: '#000' },
  tr: { flexDirection: 'row', marginVertical: 2 },
  td: { fontFamily: 'monospace', fontSize: 10, color: '#000' },

  tamilInput: { textAlign: 'center', fontSize: 11, color: '#000', fontStyle: 'italic', borderWidth: 1, borderStyle: 'dashed', borderColor: '#ccc', padding: 8, borderRadius: 4 },
  footerMsg: { textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#000', marginTop: 10 },

  // Actions Bar
  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 12, elevation: 10, borderTopWidth: 1, borderColor: '#EEE' },
  actionsBar: { flexDirection: 'row', justifyContent: 'space-around' },
  actionBtn: { flex: 1, backgroundColor: DARK_BROWN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginHorizontal: 4, borderRadius: 8, gap: 6 },
  actionBtnSelected: { borderWidth: 2, borderColor: '#FFF' },
  saveBillBtn: { backgroundColor: GOLD },
  saveBtn: { backgroundColor: DARK_BROWN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: 8, gap: 6 },
  actionText: { color: '#FFF', fontWeight: '700', fontSize: 13 },

  // Settlement History
  settlementHistoryCard: { backgroundColor: '#FFF', margin: 16, marginTop: 0, borderRadius: 12, padding: 16, elevation: 4, borderWidth: 1, borderColor: '#F0E4CC' },
  settlementHistoryTitle: { fontSize: 14, fontWeight: '800', color: DARK_BROWN, marginBottom: 12, textAlign: 'center', letterSpacing: 0.5 },
  settlementHistoryRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  settlementHistoryLeft: { flex: 1 },
  settlementBillNo: { fontSize: 13, fontWeight: '800', color: DARK_BROWN },
  settlementMeta: { fontSize: 11, color: '#888', marginTop: 2 },
  settlementAmtRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4 },
  settlementAmtLabel: { fontSize: 10, color: '#888', marginRight: 4 },
  settlementAmtVal: { fontSize: 12, fontWeight: '700', color: '#333' },
  settlementHistoryActions: { flexDirection: 'row', gap: 6, marginLeft: 8 },
  settlementActionBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#F5EFE0', alignItems: 'center', justifyContent: 'center' },
});
