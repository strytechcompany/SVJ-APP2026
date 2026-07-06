import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, StatusBar, Platform, Switch, FlatList, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { customerAPI, stockAPI, transactionAPI, settingsAPI } from '../../services/api';
import { useDashboard } from '../../context/DashboardContext';
import { useTransaction } from '../../context/TransactionContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

export default function TransactionCalculationScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);
  const { type, customerId, editTransactionId = null, prefilledData = null } = route.params || {};
  const isB2D = type === 'B2D';
  const { clearTransaction } = useTransaction();
  const { goldRate: dashGoldRate } = useDashboard();

  // Current Date/Time
  const [currentTime, setCurrentTime] = useState(new Date());

  // Customer Data & Global Gold Rate
  const [customer, setCustomer] = useState(null);
  const [globalGoldRate, setGlobalGoldRate] = useState('');

  // Stock Search Dropdown & Scanner
  const [stockQuery, setStockQuery] = useState('');
  const [stockResults, setStockResults] = useState([]);
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scannerTorch, setScannerTorch] = useState(false);
  const [pendingScanValue, setPendingScanValue] = useState(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

  const normalizeScanValue = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return '';

    const lines = raw
      .split(/[\r\n]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    const primary = lines[0] || raw;
    return primary.replace(/\s+/g, ' ').trim();
  };

  const buildScanCandidates = (value) => {
    const raw = String(value || '').trim();
    if (!raw) return [];

    const normalized = normalizeScanValue(raw);
    const noSpaces = normalized.replace(/\s+/g, '');
    const compact = normalized.replace(/[^a-zA-Z0-9_-]/g, '');
    const parts = normalized
      .split(/[\s|,;:/\\]+/)
      .map((part) => part.trim())
      .filter(Boolean);

    return [...new Set([normalized, noSpaces, compact, raw, ...parts])];
  };

  // Issue Section
  const [issueStockId, setIssueStockId] = useState('');
  const [issueItemNo, setIssueItemNo] = useState('');
  const [issueItemName, setIssueItemName] = useState('');
  const [issueWeight, setIssueWeight] = useState('');
  const [issueCount, setIssueCount] = useState('1');
  const [issueSRICost, setIssueSRICost] = useState('');
  const [issueSRIBill, setIssueSRIBill] = useState('');
  const [issueAmountOverride, setIssueAmountOverride] = useState(''); // Allows manual amount

  // Receipt Section
  const [receiptType, setReceiptType] = useState('');
  const [receiptWeight, setReceiptWeight] = useState('');
  const [receiptLess, setReceiptLess] = useState('');
  const [receiptActualTouch, setReceiptActualTouch] = useState('');
  const [receiptTakenTouch, setReceiptTakenTouch] = useState('');
  const [receiptGoldRate, setReceiptGoldRate] = useState('');
  const [receiptAmountManual, setReceiptAmountManual] = useState('');

  // Arrays — lazy init from prefilledData so items are available on first render
  const [issueItems, setIssueItems] = useState(() => {
    if (!prefilledData?.issueItems?.length) return [];
    return prefilledData.issueItems.map((i, idx) => ({
      id: String(Date.now() + idx),
      stockId: typeof i.stockId === 'object' ? i.stockId?._id : i.stockId,
      itemNumber: i.itemNumber || '',
      itemName: i.itemName || '',
      weight: i.weight || 0,
      count: i.count || 1,
      sriCost: i.sriCost || 0,
      sriBill: i.sriBill || 0,
      plus: i.plus || 0,
      purity: i.purity || 0,
      amount: i.amount || 0,
    }));
  });
  const [receiptItems, setReceiptItems] = useState(() => {
    if (!prefilledData?.receiptItems?.length) return [];
    return prefilledData.receiptItems.map((i, idx) => ({
      id: String(Date.now() + idx + 10000),
      receiptType: i.receiptType || '',
      weight: i.weight || 0,
      less: i.less || 0,
      actualTouch: i.actualTouch || 0,
      takenTouch: i.takenTouch || 0,
      goldRate: i.goldRate || 0,
      purity: i.purity || 0,
      amount: i.amount || 0,
    }));
  });

  // Payment
  const [paymentMode, setPaymentMode] = useState('Cash'); // Cash, Online Payment, Card, Debt, Gold
  const [paymentAmount, setPaymentAmount] = useState('');
  const [confirmedPayment, setConfirmedPayment] = useState({ amount: 0, grams: 0, mode: '' });
  // Gold Payment specific
  const [goldPayWeight, setGoldPayWeight] = useState('');
  const [goldPayPurity, setGoldPayPurity] = useState('22K (916)');
  // Description
  const [description, setDescription] = useState('');

  // Editable customer balance overrides
  const [oldBalanceInput, setOldBalanceInput] = useState('');
  const [advanceInput, setAdvanceInput] = useState('');

  // Common Bill No
  const [commonBillNo, setCommonBillNo] = useState('');

  // GST
  const [gstOn, setGstOn] = useState(false);
  const [cgstPercent, setCgstPercent] = useState('1.5');
  const [sgstPercent, setSgstPercent] = useState('1.5');
  const [hsnCode, setHsnCode] = useState('');

  // Auto-generate a common bill number on mount
  useEffect(() => {
    const pad = (n) => String(n).padStart(2, '0');
    const now = new Date();
    const datePart = `${now.getFullYear().toString().slice(-2)}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const seq = Math.floor(Math.random() * 900) + 100;
    setCommonBillNo(`${(type || 'BILL').toUpperCase()}-${datePart}-${seq}`);
  }, []);

  // Pre-fill HSN code from admin settings when GST is turned on
  useEffect(() => {
    if (!gstOn || hsnCode) return;
    settingsAPI.getSettings()
      .then(res => {
        const hsn = res.data?.data?.billSettings?.hsnCode;
        if (hsn) setHsnCode(hsn);
      })
      .catch(() => {});
  }, [gstOn]);

  // Load customer & init gold rate
  useEffect(() => {
    const loadCustomer = async () => {
      try {
        const res = await customerAPI.getById(customerId);
        if (res.data.success) {
          setCustomer(res.data.data);
          setOldBalanceInput(String(res.data.data.oldBalance || 0));
          setAdvanceInput(String(res.data.data.advance || 0));
        }
      } catch (e) {
        Alert.alert('Error', 'Failed to load customer');
      }
    };
    if (customerId) loadCustomer();
    if (dashGoldRate?.rate) setGlobalGoldRate(dashGoldRate.rate.toString());
    
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, [customerId, dashGoldRate]);

  // Pre-fill all fields when opening an existing bill for editing
  useEffect(() => {
    if (!prefilledData) return;

    if (prefilledData.commonBillNo) setCommonBillNo(prefilledData.commonBillNo);
    if (prefilledData.goldRate) setGlobalGoldRate(String(prefilledData.goldRate));
    if (prefilledData.description) setDescription(prefilledData.description);

    if (prefilledData.paymentMode) {
      setPaymentMode(prefilledData.paymentMode);
      const collectedAmt = prefilledData.paymentMode === 'Gold'
        ? (prefilledData.goldConvertedAmount || 0)
        : (prefilledData.paymentDetails?.amount || 0);
      if (collectedAmt > 0) {
        setPaymentAmount(String(collectedAmt));
        setConfirmedPayment({
          amount: collectedAmt,
          grams: prefilledData.convertedGram || 0,
          mode: prefilledData.paymentMode,
        });
      }
      if (prefilledData.paymentMode === 'Gold') {
        setGoldPayWeight(String(prefilledData.goldPaymentWeight || ''));
        setGoldPayPurity(prefilledData.goldPaymentPurity || '22K (916)');
      }
    }

    if (prefilledData.gstDetails) {
      setGstOn(prefilledData.gstDetails.isOn || false);
      if (prefilledData.gstDetails.cgstPercent != null) setCgstPercent(String(prefilledData.gstDetails.cgstPercent));
      if (prefilledData.gstDetails.sgstPercent != null) setSgstPercent(String(prefilledData.gstDetails.sgstPercent));
      if (prefilledData.gstDetails.hsnCode) setHsnCode(prefilledData.gstDetails.hsnCode);
    }

    if (prefilledData.oldBalanceBefore != null) setOldBalanceInput(String(prefilledData.oldBalanceBefore));
    if (prefilledData.advanceBalanceBefore != null) setAdvanceInput(String(prefilledData.advanceBalanceBefore));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle Stock Dropdown Search
  useEffect(() => {
    const searchStock = async () => {
      const query = stockQuery.trim();
      if (!query) {
        setStockResults([]);
        return;
      }
      try {
        const res = await stockAPI.getAll({ search: query });
        if (res.data.success) {
          // Flatten the grouped design format to a simple list
          const flatList = [];
          (res.data.data || []).forEach(group => {
            (group.records || []).forEach(item => flatList.push(item));
          });
          setStockResults(flatList.slice(0, 10)); // max 10 results
        }
      } catch (e) {
        console.error(e);
      }
    };
    const timeoutId = setTimeout(searchStock, 300);
    return () => clearTimeout(timeoutId);
  }, [stockQuery]);

  // Shared fill helper — called by both scan and manual submit
  const fillStock = (s) => {
    setIssueStockId(s._id);
    setIssueItemNo(s.itemNumber);
    setIssueItemName(s.itemName || s.designName || '');
    setIssueWeight(s.netWeight != null ? String(s.netWeight) : '0');
    setIssueSRICost(s.buyingTouch ? String(s.buyingTouch) : '0');
    setStockQuery(s.itemNumber);
    setShowStockDropdown(false);
    setIssueSRIBill('');
    setIssueAmountOverride('');
  };

  const lookupStock = async (query) => {
    const normalizedQuery = normalizeScanValue(query);
    const candidates = buildScanCandidates(normalizedQuery);

    // Step 1: exact barcode / itemNumber lookup — no availability filter on backend
    for (const candidate of candidates) {
      try {
        const res = await stockAPI.getByBarcode(candidate);
        if (res?.data?.success && res.data.data) {
          fillStock(res.data.data);
          return true;
        }
      } catch (err) {
        console.log('[lookupStock] getByBarcode error:', err?.response?.status, err?.message);
      }
    }

    // Step 2: full-text search fallback — scan=true bypasses isAvailable filter
    try {
      for (const candidate of candidates) {
        const res = await stockAPI.getAll({ search: candidate, scan: 'true' });
        if (!res?.data?.success) continue;

        const flat = [];
        (res.data.data || []).forEach(g => (g.records || []).forEach(r => flat.push(r)));
        const lq = candidate.toLowerCase();
        const match =
          flat.find(item => (item.barcode || '').toLowerCase() === lq) ||
          flat.find(item => (item.itemNumber || '').toLowerCase() === lq) ||
          (flat.length === 1 ? flat[0] : null);

        if (match) {
          fillStock(match);
          return true;
        }
        if (flat.length > 0) {
          setStockResults(flat.slice(0, 10));
          setShowStockDropdown(true);
          return true;
        }
      }
    } catch (err) {
      console.log('[lookupStock] getAll error:', err?.response?.status, err?.message);
    }

    return false;
  };

  // Auto-fill when a QR/barcode is scanned
  useEffect(() => {
    if (!pendingScanValue) return;
    const query = normalizeScanValue(pendingScanValue);
    setPendingScanValue(null);
    if (!query) return;

    // Show scanned value in the search input so user can see what was read
    setStockQuery(query);

    lookupStock(query).then(found => {
      if (!found) {
        Alert.alert(
          'Not Found',
          `Scanned: "${query}"\n\nNo stock item matched this code. Check if the item exists in stock list.`
        );
      }
    });
  }, [pendingScanValue]);

  const selectStockItem = (s) => fillStock(s);

  const handleStockLookup = async (rawValue) => {
    const query = normalizeScanValue(rawValue);
    if (!query) { setStockResults([]); setShowStockDropdown(false); return; }
    setStockQuery(query);
    await lookupStock(query);
  };

  // --- Calculations for Issue ---
  const currentIssuePlus = useMemo(() => {
    const bill = parseFloat(issueSRIBill) || 0;
    const cost = parseFloat(issueSRICost) || 0;
    return bill > 0 ? (bill - cost) : 0;
  }, [issueSRIBill, issueSRICost]);

  const currentIssueProfit = useMemo(() => {
    const w = parseFloat(issueWeight) || 0;
    return w * (currentIssuePlus / 100);
  }, [issueWeight, currentIssuePlus]);

  const autoIssueAmount = useMemo(() => {
    const w = parseFloat(issueWeight) || 0;
    const bill = parseFloat(issueSRIBill) || 0;
    const rate = parseFloat(globalGoldRate) || 0;
    // Purity representation as percentage multiplier? 
    // Wait, the user asked: "Amount = Weight × SRI Bill × Gold Rate"
    // Usually SRI Bill is a percentage (e.g. 91.6%). So it should be / 100.
    return w * (bill / 100) * rate;
  }, [issueWeight, issueSRIBill, globalGoldRate]);

  // Actual amount is override if set, else auto amount
  const activeIssueAmount = issueAmountOverride !== '' ? parseFloat(issueAmountOverride) : autoIssueAmount;

  const handleAddIssue = () => {
    if (!issueWeight || !issueSRIBill) {
      Alert.alert('Error', 'Weight and SRI Bill are required.');
      return;
    }
    const newItem = {
      id: Date.now().toString(),
      stockId: issueStockId || null,
      itemNumber: issueItemNo || 'N/A',
      itemName: issueItemName || 'Manual Entry',
      weight: parseFloat(issueWeight),
      count: parseInt(issueCount) || 1,
      sriCost: parseFloat(issueSRICost) || 0,
      sriBill: parseFloat(issueSRIBill),
      plus: currentIssuePlus,
      purity: currentIssueProfit,
      amount: activeIssueAmount
    };
    setIssueItems([...issueItems, newItem]);
    
    // Clear Form
    setStockQuery('');
    setIssueStockId('');
    setIssueItemNo('');
    setIssueItemName('');
    setIssueWeight('');
    setIssueCount('1');
    setIssueSRICost('');
    setIssueSRIBill('');
    setIssueAmountOverride('');
  };

  const removeIssueItem = (id) => setIssueItems(issueItems.filter(i => i.id !== id));

  // --- Calculations for Receipt ---
  const currentReceiptPurity = useMemo(() => {
    const w = parseFloat(receiptWeight) || 0;
    const l = parseFloat(receiptLess) || 0;
    const t = parseFloat(receiptTakenTouch) || 0;
    return (w - l) * (t / 100);
  }, [receiptWeight, receiptLess, receiptTakenTouch]);

  const handleAddReceipt = () => {
    if (!receiptWeight) {
      Alert.alert('Error', 'Weight is required.');
      return;
    }
    const newItem = {
      id: Date.now().toString(),
      receiptType,
      weight: parseFloat(receiptWeight) || 0,
      less: parseFloat(receiptLess) || 0,
      actualTouch: parseFloat(receiptActualTouch) || 0,
      takenTouch: parseFloat(receiptTakenTouch) || 0,
      goldRate: parseFloat(receiptGoldRate) || 0,
      purity: currentReceiptPurity,
      amount: parseFloat(receiptAmountManual) || 0
    };
    setReceiptItems([...receiptItems, newItem]);
    
    // Clear
    setReceiptType('');
    setReceiptWeight('');
    setReceiptLess('');
    setReceiptActualTouch('');
    setReceiptTakenTouch('');
    setReceiptGoldRate('');
    setReceiptAmountManual('');
  };

  const removeReceiptItem = (id) => setReceiptItems(receiptItems.filter(i => i.id !== id));

  // --- Running Totals ---
  const issueTotalWeight = issueItems.reduce((acc, i) => acc + i.weight, 0);
  const issueTotalPurity = issueItems.reduce((acc, i) => acc + i.purity, 0);
  const issueTotalAmount = issueItems.reduce((acc, i) => acc + i.amount, 0);

  const receiptTotalWeight = receiptItems.reduce((acc, i) => acc + i.weight, 0);
  const receiptTotalPurity = receiptItems.reduce((acc, i) => acc + i.purity, 0);
  const receiptTotalAmount = receiptItems.reduce((acc, i) => acc + i.amount, 0);

  // --- GST ---
  const cgstVal = gstOn ? issueTotalAmount * (parseFloat(cgstPercent) / 100) : 0;
  const sgstVal = gstOn ? issueTotalAmount * (parseFloat(sgstPercent) / 100) : 0;
  
  // --- Subtotal & Final Math ---
  // finalAmount mathematically serves as the true "Subtotal Amount"
  const finalAmount = issueTotalAmount + cgstVal + sgstVal - receiptTotalAmount;

  // --- Advanced Payment & Balance Logic ---
  const activeGoldRate = parseFloat(globalGoldRate) || 0;
  const goldConvertedAmt = (paymentMode === 'Gold') ? ((parseFloat(goldPayWeight) || 0) * activeGoldRate) : 0;
  
  // Confirmed payment values
  const collectedAmount = confirmedPayment.amount;
  const collectedGrams = confirmedPayment.grams;

  // Handle Collect Payment Button
  const handleCollectPayment = () => {
    const amt = paymentMode === 'Gold' ? goldConvertedAmt : (parseFloat(paymentAmount) || 0);
    const grams = activeGoldRate > 0 ? (amt / activeGoldRate) : 0;
    setConfirmedPayment({ amount: amt, grams, mode: paymentMode });
  };

  // Calculate Balances Before and After based on confirmed payment
  const oldBalanceBefore = parseFloat(oldBalanceInput) || 0;
  const advanceBalanceBefore = parseFloat(advanceInput) || 0;

  let oldBalanceAfter = oldBalanceBefore;
  let advanceBalanceAfter = advanceBalanceBefore;

  // Outstanding = Subtotal - Collected
  const transactionOutstanding = finalAmount - collectedAmount;

  if (activeGoldRate > 0) {
    if (transactionOutstanding > 0) {
      // Underpaid: Add outstanding grams to old balance
      const outstandingGram = transactionOutstanding / activeGoldRate;
      oldBalanceAfter += outstandingGram;
    } else if (transactionOutstanding < 0) {
      // Overpaid: Customer pays extra. Convert extra to grams.
      const extraAmount = Math.abs(transactionOutstanding);
      const extraGram = extraAmount / activeGoldRate;

      // Use extra to clear old balance first, remainder goes to advance
      oldBalanceAfter -= extraGram;
      if (oldBalanceAfter < 0) {
        advanceBalanceAfter += Math.abs(oldBalanceAfter);
        oldBalanceAfter = 0;
      }
    }
  }

  const handlePreviewBill = () => {
    const hasIssue = issueItems.length > 0;
    const hasReceipt = receiptItems.length > 0;
    const hasPayment = collectedAmount > 0;

    if (!hasIssue && !hasReceipt && !hasPayment) {
      Alert.alert('Error', 'Transaction is completely empty.');
      return;
    }

    if (gstOn && !hsnCode.trim()) {
      Alert.alert('HSN Code Required', 'Please enter the HSN code in the GST section before proceeding.');
      return;
    }

    let subtype = '';
    if (hasIssue && !hasReceipt && !hasPayment) subtype = 'ISSUE_ONLY';
    else if (!hasIssue && hasReceipt && !hasPayment) subtype = 'RECEIPT_ONLY';
    else if (!hasIssue && !hasReceipt && hasPayment) subtype = 'PAYMENT_ONLY';
    else if (hasIssue && hasReceipt && !hasPayment) subtype = 'ISSUE_RECEIPT';
    else if (hasIssue && !hasReceipt && hasPayment) subtype = 'ISSUE_PAYMENT';
    else if (!hasIssue && hasReceipt && hasPayment) subtype = 'RECEIPT_PAYMENT';
    else if (hasIssue && hasReceipt && hasPayment) subtype = 'FULL_TRANSACTION';

    const payload = {
      transactionType: type,
      transactionSubtype: subtype,
      commonBillNo: commonBillNo.trim(),
      customerId: customer._id,
      customer: { // Pass customer details for preview
        customerName: customer.customerName,
        phoneNumber: customer.phoneNumber,
        address: customer.address,
      },
      issueItems,
      receiptItems,
      paymentDetails: {
        mode: paymentMode,
        amount: paymentMode === 'Gold' ? 0 : collectedAmount
      },
      gstDetails: {
        isOn: gstOn,
        hsnCode: hsnCode.trim(),
        cgstPercent: parseFloat(cgstPercent) || 0,
        sgstPercent: parseFloat(sgstPercent) || 0,
        cgstAmount: cgstVal,
        sgstAmount: sgstVal
      },
      issueTotalWeight,
      issueTotalPurity,
      issueTotalAmount,
      receiptTotalWeight,
      receiptTotalPurity,
      receiptTotalAmount,
      finalAmount,
      balanceAmount: transactionOutstanding,
      goldRate: activeGoldRate,
      
      description,
      paymentMode,
      goldPaymentWeight: parseFloat(goldPayWeight) || 0,
      goldPaymentPurity: goldPayPurity,
      goldConvertedAmount: goldConvertedAmt,
      oldBalanceBefore,
      oldBalanceAfter,
      advanceBalanceBefore,
      advanceBalanceAfter,
      convertedGram: collectedGrams,
      collectedAmount: collectedAmount,
      outstandingAmount: Math.max(0, transactionOutstanding),
      outstandingGram: activeGoldRate ? (Math.max(0, transactionOutstanding) / activeGoldRate) : 0,
      status: Math.max(0, transactionOutstanding) > 0 ? 'PARTIAL' : 'PAID',
      createdAt: new Date().toISOString(),
      editTransactionId: editTransactionId || undefined,
    };

    // Navigate to preview screen WITHOUT saving
    navigation.navigate('BillPreviewPlaceholder', { previewPayload: payload, type });
  };

  if (!customer) return <View style={styles.container} />;

  // Wastage-category B2C customers get a stripped-down calculation flow
  const isWastage = type === 'B2C' && customer.customerCategory === 'WASTAGE';

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => { clearTransaction(); navigation.goBack(); }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type} Calculation</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        
        {/* Customer Info & Gold Rate */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Customer Info</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Name:</Text>
            <Text style={styles.infoValue}>{customer.customerName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Phone:</Text>
            <Text style={styles.infoValue}>+91 {customer.phoneNumber}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Address:</Text>
            <Text style={styles.infoValue}>{customer.address || 'N/A'}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date / Time:</Text>
            <Text style={styles.infoValue}>{currentTime.toLocaleDateString('en-GB')} / {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</Text>
          </View>
          <View style={styles.balances}>
            <View style={styles.balBox}>
              <Text style={styles.balLabel}>Old Balance (g)</Text>
              <TextInput
                style={[styles.balValRed, { borderBottomWidth: 1, borderColor: '#D32F2F', minWidth: 70, textAlign: 'center', paddingVertical: 2 }]}
                keyboardType="numeric"
                value={oldBalanceInput}
                onChangeText={setOldBalanceInput}
              />
            </View>
            <View style={styles.balBox}>
              <Text style={styles.balLabel}>Advance (g)</Text>
              <TextInput
                style={[styles.balValGreen, { borderBottomWidth: 1, borderColor: '#2E7D32', minWidth: 70, textAlign: 'center', paddingVertical: 2 }]}
                keyboardType="numeric"
                value={advanceInput}
                onChangeText={setAdvanceInput}
              />
            </View>
          </View>

          {/* Gold Rate + Bill No */}
          <View style={{ marginTop: 12, borderTopWidth: 1, borderColor: '#E5D8C0', paddingTop: 12 }}>
            <View style={styles.gridRow}>
              <View style={styles.gridItem}>
                <Text style={styles.inputLabel}>Gold Rate (₹) [Editable]</Text>
                <TextInput
                  style={styles.inputHighlight}
                  keyboardType="numeric"
                  value={globalGoldRate}
                  onChangeText={setGlobalGoldRate}
                />
              </View>
              <View style={styles.gridItem}>
                <Text style={styles.inputLabel}>Bill No</Text>
                <TextInput
                  style={styles.inputHighlight}
                  value={commonBillNo}
                  onChangeText={setCommonBillNo}
                  autoCapitalize="characters"
                />
              </View>
            </View>
          </View>
        </View>

        {/* Issue Entry */}
        {isWastage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Issue Product</Text>
        </View>
        )}
        {!isB2D && !isWastage && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Issue Product</Text>

          <View style={{zIndex: 100}}>
            <Text style={styles.inputLabel}>Enter QR Code to Search Stock</Text>
            <View style={styles.barcodeRow}>
              <TextInput
                style={styles.barcodeInput}
                placeholder="Search by Item Number, Item Name, Barcode..."
                placeholderTextColor="#999"
                value={stockQuery}
                onChangeText={(t) => { setStockQuery(t); setShowStockDropdown(true); }}
                onFocus={() => setShowStockDropdown(true)}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={() => handleStockLookup(stockQuery)}
              />
              <TouchableOpacity style={styles.scanBtn} onPress={async () => {
                if (!cameraPermission?.granted) {
                  const res = await requestCameraPermission();
                  if (!res.granted) {
                    Alert.alert('Permission required', 'Camera permission is needed to scan barcodes.');
                    return;
                  }
                }
                setIsScanning(true);
              }}>
                <MaterialCommunityIcons name="barcode-scan" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
            
            {showStockDropdown && stockResults.length > 0 && (
              <View style={styles.dropdown}>
                {stockResults.map(s => (
                  <TouchableOpacity key={s._id} style={styles.dropItem} onPress={() => selectStockItem(s)}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                      <Text style={[styles.dropItemText, { fontWeight: '800', fontSize: 13 }]}>
                        {s.itemNumber}
                      </Text>
                      <View style={{ backgroundColor: s.quantity > 0 ? '#E8F5E9' : '#FDECEA', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: s.quantity > 0 ? '#2E7D32' : '#C0392B' }}>
                          Qty: {s.quantity}
                        </Text>
                      </View>
                    </View>
                    <Text style={{ fontSize: 11, color: '#555', marginBottom: 2 }}>
                      {s.itemName || s.designName}  ·  {s.category}  ·  {s.purity}
                    </Text>
                    <Text style={{ fontSize: 11, color: '#888' }}>
                      Barcode: {s.barcode}  ·  Wt: {s.netWeight}g
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Item Number</Text>
              <TextInput style={styles.inputDisabled} value={issueItemNo} editable={false} />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Item Name</Text>
              <TextInput style={styles.inputDisabled} value={issueItemName} editable={false} />
            </View>
          </View>
          
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Weight (g)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={issueWeight} onChangeText={setIssueWeight} />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>SRI Cost (%)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={issueSRICost} onChangeText={setIssueSRICost} />
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>SRI Bill (%)</Text>
              <TextInput style={styles.inputHighlight} keyboardType="numeric" value={issueSRIBill} onChangeText={setIssueSRIBill} />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput 
                style={styles.inputHighlight} 
                keyboardType="numeric" 
                value={issueAmountOverride !== '' ? issueAmountOverride : (autoIssueAmount ? autoIssueAmount.toFixed(2) : '')} 
                onChangeText={setIssueAmountOverride} 
                placeholder="Auto Calc"
              />
            </View>
          </View>

          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Plus (Auto)</Text>
              <Text style={styles.calcValue}>{currentIssuePlus.toFixed(3)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Profit</Text>
              <Text style={styles.calcValue}>{currentIssueProfit.toFixed(3)} g</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.actionBtn} onPress={handleAddIssue}>
            <Text style={styles.actionBtnText}>Issue Item</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Issue List */}
        {!isB2D && !isWastage && issueItems.map(item => (
          <View key={item.id} style={styles.listItem}>
            <View style={styles.listTextCol}>
              <Text style={styles.listTitle}>{item.itemName || 'Item'} ({item.weight.toFixed(3)}g)</Text>
              <Text style={styles.listSub}>SRI Bill: {item.sriBill}% | Plus: {item.plus.toFixed(3)} | Amt: ₹{item.amount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
            <TouchableOpacity onPress={() => removeIssueItem(item.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={24} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        ))}

        {/* Receipt Entry */}
        {isB2D ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Receipt</Text>
            <Text style={styles.inputLabel}>Item Name</Text>
          </View>
        ) : (
        <View style={[styles.card, {zIndex: -1}]}>
          <Text style={styles.cardTitle}>Receipt Entry</Text>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Receipt Type</Text>
              <TextInput style={styles.input} value={receiptType} onChangeText={setReceiptType} placeholder="Old Gold" />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Weight (g)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={receiptWeight} onChangeText={setReceiptWeight} />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Less (g)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={receiptLess} onChangeText={setReceiptLess} />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Actual Touch (%)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={receiptActualTouch} onChangeText={setReceiptActualTouch} />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Taken Touch (%)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={receiptTakenTouch} onChangeText={setReceiptTakenTouch} />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Gold Rate (₹)</Text>
              <TextInput style={styles.input} keyboardType="numeric" value={receiptGoldRate} onChangeText={setReceiptGoldRate} />
            </View>
          </View>
          <View style={styles.gridRow}>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput style={styles.inputHighlight} keyboardType="numeric" value={receiptAmountManual} onChangeText={setReceiptAmountManual} placeholder="Manual Entry" />
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.inputLabel}>Purity (Auto)</Text>
              <Text style={styles.calcValue}>{currentReceiptPurity.toFixed(3)} g</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.actionBtn, {backgroundColor: '#2E7D32'}]} onPress={handleAddReceipt}>
            <Text style={styles.actionBtnText}>+ Add Receipt Item</Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Receipt List */}
        {receiptItems.map(item => (
          <View key={item.id} style={styles.listItem}>
            <View style={styles.listTextCol}>
              <Text style={styles.listTitle}>{item.receiptType || 'Receipt'} ({item.weight.toFixed(3)}g)</Text>
              <Text style={styles.listSub}>Less: {item.less}g | T.Touch: {item.takenTouch}% | Amt: ₹{item.amount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
            <TouchableOpacity onPress={() => removeReceiptItem(item.id)}>
              <MaterialCommunityIcons name="trash-can-outline" size={24} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        ))}

        {receiptItems.length > 0 && (
          <View style={[styles.summaryCard, {backgroundColor: '#F5F9EC', borderColor: '#C8E6C9', zIndex: -1, marginTop: 8}]}>
            <Text style={[styles.cardTitle, {color: '#2E7D32'}]}>Received Inventory Summary</Text>
            <View style={styles.sumRow}>
              <Text style={[styles.sumLabel, {color: '#388E3C'}]}>Total Received Items:</Text>
              <Text style={[styles.sumVal, {color: '#1B5E20'}]}>{receiptItems.length}</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={[styles.sumLabel, {color: '#388E3C'}]}>Total Weight:</Text>
              <Text style={[styles.sumVal, {color: '#1B5E20'}]}>{receiptTotalWeight.toFixed(3)} g</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={[styles.sumLabel, {color: '#388E3C'}]}>Total Purity:</Text>
              <Text style={[styles.sumVal, {color: '#1B5E20'}]}>{receiptTotalPurity.toFixed(3)} g</Text>
            </View>
            <View style={styles.sumRow}>
              <Text style={[styles.sumLabel, {color: '#388E3C'}]}>Total Amount:</Text>
              <Text style={[styles.sumVal, {color: '#1B5E20'}]}>₹ {receiptTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
          </View>
        )}

        {/* GST */}
        {!isB2D && !isWastage && (
        <View style={[styles.card, {zIndex: -2}]}>
          <View style={styles.gridRow}>
            <View style={[styles.gridItem, {alignItems: 'center', justifyContent: 'center'}]}>
              <Text style={[styles.inputLabel, {fontSize: 14, color: DARK_BROWN}]}>Enable GST</Text>
              <Switch value={gstOn} onValueChange={setGstOn} trackColor={{ true: GOLD }} />
            </View>
          </View>

          {gstOn && (
            <View style={styles.gstBox}>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={[styles.inputLabel, { color: '#D32F2F' }]}>HSN Code *</Text>
                  <TextInput
                    style={[styles.inputHighlight, !hsnCode.trim() && { borderColor: '#D32F2F' }]}
                    value={hsnCode}
                    onChangeText={setHsnCode}
                    placeholder="e.g. 7113"
                    autoCapitalize="none"
                    keyboardType="default"
                  />
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>CGST %</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={cgstPercent} onChangeText={setCgstPercent} />
                </View>
              </View>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>SGST %</Text>
                  <TextInput style={styles.input} keyboardType="numeric" value={sgstPercent} onChangeText={setSgstPercent} />
                </View>
                <View style={styles.gridItem} />
              </View>
            </View>
          )}
        </View>
        )}

        {/* Payment Collection */}
        {!isB2D && !isWastage && (
        <View style={[styles.card, {zIndex: -3}]}>
          <Text style={styles.cardTitle}>Payment Collection</Text>
          <View style={{ marginBottom: 12 }}>
            <Text style={styles.inputLabel}>Payment Mode</Text>
            <View style={styles.paymentRow}>
              {['Cash', 'Online Payment', 'Card', 'Debt', 'Gold'].map(mode => (
                <TouchableOpacity
                  key={mode}
                  style={[styles.payBtn, paymentMode === mode && styles.payBtnActive]}
                  onPress={() => setPaymentMode(mode)}
                >
                  <Text style={[styles.payText, paymentMode === mode && styles.payTextActive]}>
                    {mode.split(' ')[0]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {paymentMode === 'Gold' ? (
            <View style={styles.gstBox}>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>Gold Weight (g)</Text>
                  <TextInput style={styles.inputHighlight} keyboardType="numeric" value={goldPayWeight} onChangeText={setGoldPayWeight} />
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>Purity</Text>
                  <TextInput style={styles.input} value={goldPayPurity} onChangeText={setGoldPayPurity} />
                </View>
              </View>
              <View style={styles.gridRow}>
                <View style={styles.gridItem}>
                  <Text style={styles.inputLabel}>Converted Amount</Text>
                  <Text style={styles.calcValue}>₹{goldConvertedAmt.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ marginBottom: 12 }}>
              <Text style={styles.inputLabel}>Amount (₹)</Text>
              <TextInput style={styles.inputHighlight} keyboardType="numeric" value={paymentAmount} onChangeText={setPaymentAmount} />
            </View>
          )}

          <View style={{ marginTop: 12 }}>
            <Text style={styles.inputLabel}>Description / Notes</Text>
            <TextInput 
              style={[styles.input, {height: 80, textAlignVertical: 'top'}]} 
              multiline 
              value={description} 
              onChangeText={setDescription} 
              placeholder="E.g., Customer advance payment, Old balance settlement..."
            />
          </View>

          <TouchableOpacity
            style={[styles.actionBtn, confirmedPayment.amount > 0 && styles.actionBtnConfirmed]}
            onPress={handleCollectPayment}
          >
            <MaterialCommunityIcons
              name={confirmedPayment.amount > 0 ? 'check-circle-outline' : 'cash-check'}
              size={18}
              color={confirmedPayment.amount > 0 ? '#FFF' : DARK_BROWN}
              style={{ marginRight: 6 }}
            />
            <Text style={[styles.actionBtnText, confirmedPayment.amount > 0 && { color: '#FFF' }]}>
              {confirmedPayment.amount > 0 ? 'Update Payment' : 'Collect Payment'}
            </Text>
          </TouchableOpacity>
        </View>
        )}

        {/* Confirmed Payment Card */}
        {!isB2D && !isWastage && confirmedPayment.amount > 0 && (
          <View style={styles.paymentConfirmedCard}>
            <View style={styles.paymentConfirmedLeft}>
              <View style={styles.paymentConfirmedIcon}>
                <MaterialCommunityIcons name="cash-check" size={22} color="#2E7D32" />
              </View>
              <View style={styles.listTextCol}>
                <Text style={styles.paymentConfirmedTitle}>
                  {confirmedPayment.mode} — Collected
                </Text>
                <Text style={styles.paymentConfirmedSub}>
                  ₹{confirmedPayment.amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                  {'  |  '}
                  {confirmedPayment.grams.toFixed(3)} g
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={() => setConfirmedPayment({ amount: 0, grams: 0, mode: '' })}
              style={styles.paymentDeleteBtn}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#D32F2F" />
            </TouchableOpacity>
          </View>
        )}

        {/* Live Payment Summary & Balances */}
        {!isB2D && !isWastage && (
        <View style={[styles.summaryCard, {backgroundColor: '#FAFAFA', borderColor: '#E5D8C0', zIndex: -4}]}>
          <Text style={styles.cardTitle}>Payment Summary</Text>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Collected Amount:</Text>
            <Text style={styles.sumVal}>₹ {collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Collected Grams:</Text>
            <Text style={styles.sumVal}>{collectedGrams.toFixed(3)} g</Text>
          </View>
          
          <View style={{borderTopWidth: 1, borderColor: '#E5D8C0', marginVertical: 10}} />
          
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Old Balance (Before):</Text>
            <Text style={styles.sumVal}>{oldBalanceBefore.toFixed(3)} g</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Old Balance (After):</Text>
            <Text style={[styles.sumVal, {color: '#D32F2F'}]}>{oldBalanceAfter.toFixed(3)} g</Text>
          </View>
          
          <View style={{borderTopWidth: 1, borderColor: '#E5D8C0', marginVertical: 10}} />

          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Advance (Before):</Text>
            <Text style={styles.sumVal}>{advanceBalanceBefore.toFixed(3)} g</Text>
          </View>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Advance (After):</Text>
            <Text style={[styles.sumVal, {color: '#2E7D32'}]}>{advanceBalanceAfter.toFixed(3)} g</Text>
          </View>
        </View>
        )}

        {/* Transaction Summary */}
        <View style={[styles.summaryCard, {zIndex: -5}]}>
          <Text style={styles.cardTitle}>Final Summary</Text>
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Issue Amount:</Text>
            <Text style={styles.sumVal}>₹ {issueTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
          </View>
          {gstOn && (
            <View style={styles.sumRow}>
              <Text style={styles.sumLabel}>Total GST ({parseFloat(cgstPercent||0)+parseFloat(sgstPercent||0)}%):</Text>
              <Text style={styles.sumVal}>₹ {(cgstVal + sgstVal).toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
            </View>
          )}
          <View style={styles.sumRow}>
            <Text style={styles.sumLabel}>Receipt Amount:</Text>
            <Text style={styles.sumVal}>- ₹ {receiptTotalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
          </View>
          
          <View style={{borderTopWidth: 1, borderColor: '#E5D8C0', marginVertical: 10}} />

          <View style={styles.sumRow}>
            <Text style={[styles.sumLabel, {fontWeight: '700', color: DARK_BROWN}]}>Subtotal Amount:</Text>
            <Text style={[styles.sumVal, {fontWeight: '800'}]}>₹ {finalAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
          </View>

          <View style={styles.sumRow}>
            <Text style={[styles.sumLabel, {color: '#2E7D32'}]}>Collected Amount:</Text>
            <Text style={[styles.sumVal, {color: '#2E7D32'}]}>₹ {collectedAmount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
          </View>
          <View style={[styles.sumRow, {borderTopWidth: 1, borderColor: '#E5D8C0', paddingTop: 10, marginTop: 5}]}>
            <Text style={[styles.sumLabel, {fontWeight: '800', color: DARK_BROWN}]}>Outstanding Amount:</Text>
            <Text style={[styles.sumVal, {fontWeight: '800', fontSize: 18, color: transactionOutstanding > 0 ? '#D32F2F' : '#2E7D32'}]}>
              ₹ {Math.abs(transactionOutstanding).toLocaleString('en-IN', {maximumFractionDigits:2})} {transactionOutstanding < 0 ? '(Overpaid)' : ''}
            </Text>
          </View>
          {transactionOutstanding > 0 && activeGoldRate > 0 && (
            <View style={styles.sumRow}>
              <Text style={[styles.sumLabel, {color: '#D32F2F'}]}>Outstanding Gram:</Text>
              <Text style={[styles.sumVal, {color: '#D32F2F'}]}>{(transactionOutstanding / activeGoldRate).toFixed(3)} g</Text>
            </View>
          )}
        </View>

        <TouchableOpacity style={styles.saveBtn} onPress={handlePreviewBill}>
          <Text style={styles.saveBtnText}>Preview Bill</Text>
        </TouchableOpacity>

      </ScrollView>

      {/* Barcode Scanner Modal */}
      {isScanning && (
        <Modal visible={isScanning} animationType="slide" transparent={false}>
          <View style={{ flex: 1, backgroundColor: '#000' }}>
            <CameraView
              style={{ flex: 1 }}
              facing="back"
              enableTorch={scannerTorch}
              barcodeScannerSettings={{ barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "itf14"] }}
              onBarcodeScanned={({ data }) => {
                setIsScanning(false);
                setScannerTorch(false);
                const normalized = normalizeScanValue(data);
                setPendingScanValue(normalized);
              }}
            >
              <View style={styles.scannerOverlay}>
                <View style={styles.scannerHeader}>
                  <Text style={styles.scannerTitle}>Scan QR Code</Text>
                  <View style={styles.scannerActions}>
                    <TouchableOpacity onPress={() => setScannerTorch((prev) => !prev)} style={styles.scannerAction}>
                      <MaterialCommunityIcons name={scannerTorch ? 'flashlight' : 'flashlight-off'} size={22} color="#FFF" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setScannerTorch(false); setIsScanning(false); }} style={styles.scannerClose}>
                      <MaterialCommunityIcons name="close" size={28} color="#FFF" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.scannerFrame} />
                <Text style={styles.scannerInstructions}>Position QR code inside the frame</Text>
              </View>
            </CameraView>
          </View>
        </Modal>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, zIndex: 100 },
  backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', elevation: 2 },
  headerTitle: { flex: 1, fontSize: 20, fontWeight: '800', color: DARK_BROWN, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 60 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 3, borderWidth: 1, borderColor: '#F5EFE6' },
  cardTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN, marginBottom: 12 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  infoLabel: { fontSize: 13, color: '#8A6822', fontWeight: '600' },
  infoValue: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  balances: { flexDirection: 'row', marginTop: 12, backgroundColor: '#FCFAF5', padding: 10, borderRadius: 8 },
  balBox: { flex: 1, alignItems: 'center' },
  balLabel: { fontSize: 10, color: '#A08850', textTransform: 'uppercase', fontWeight: '700' },
  balValRed: { fontSize: 14, color: '#D32F2F', fontWeight: '800', marginTop: 2 },
  balValGreen: { fontSize: 14, color: '#2E7D32', fontWeight: '800', marginTop: 2 },
  barcodeRow: { flexDirection: 'row', marginBottom: 12, position: 'relative' },
  barcodeInput: { flex: 1, backgroundColor: '#FCFAF5', borderWidth: 1, borderColor: '#E5D8C0', borderRadius: 8, paddingHorizontal: 12, height: 44, color: DARK_BROWN, fontWeight: '600' },
  scanBtn: { width: 44, height: 44, backgroundColor: '#2E7D32', borderRadius: 8, marginLeft: 8, alignItems: 'center', justifyContent: 'center' },
  dropdown: { position: 'absolute', top: 46, left: 0, right: 52, backgroundColor: '#FFF', borderRadius: 8, elevation: 5, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, maxHeight: 150, zIndex: 1000, borderWidth: 1, borderColor: '#DDD' },
  dropItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' },
  dropItemText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  gridRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  gridItem: { flex: 1 },
  inputLabel: { fontSize: 11, color: '#A08850', fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: '#FCFAF5', borderWidth: 1, borderColor: '#E5D8C0', borderRadius: 8, paddingHorizontal: 12, height: 40, color: DARK_BROWN, fontWeight: '600' },
  inputDisabled: { backgroundColor: '#EEEEEE', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, paddingHorizontal: 12, height: 40, color: '#666', fontWeight: '600' },
  inputHighlight: { backgroundColor: '#FFF9E6', borderWidth: 1, borderColor: GOLD, borderRadius: 8, paddingHorizontal: 12, height: 40, color: DARK_BROWN, fontWeight: '700' },
  calcValue: { fontSize: 16, color: DARK_BROWN, fontWeight: '800', marginTop: 8 },
  actionBtn: { backgroundColor: GOLD, borderRadius: 8, height: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  actionBtnConfirmed: { backgroundColor: '#2E7D32' },
  actionBtnText: { color: DARK_BROWN, fontWeight: '800', fontSize: 14 },
  paymentConfirmedCard: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F1F8F1', borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1.5, borderColor: '#A5D6A7', elevation: 2 },
  paymentConfirmedLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  paymentConfirmedIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#C8E6C9', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  paymentConfirmedTitle: { fontSize: 14, color: '#1B5E20', fontWeight: '700' },
  paymentConfirmedSub: { fontSize: 12, color: '#388E3C', marginTop: 2, fontWeight: '600' },
  paymentDeleteBtn: { padding: 6 },
  listItem: { flexDirection: 'row', backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, marginBottom: 8, alignItems: 'center', elevation: 2, borderWidth: 1, borderColor: '#F5EFE6' },
  listTextCol: { flex: 1 },
  listTitle: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  listSub: { fontSize: 12, color: '#8A6822', marginTop: 2 },
  paymentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  payBtn: { backgroundColor: '#F0F0F0', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  payBtnActive: { backgroundColor: '#2196F3' },
  payText: { fontSize: 12, color: '#666', fontWeight: '600' },
  payTextActive: { color: '#FFF' },
  gstBox: { backgroundColor: '#FCFAF5', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5D8C0', marginTop: 8 },
  summaryCard: { backgroundColor: '#FFFCF5', borderRadius: 16, padding: 16, marginBottom: 24, elevation: 3, borderWidth: 1, borderColor: GOLD },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  sumLabel: { fontSize: 13, color: '#8A6822', fontWeight: '600' },
  sumVal: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  saveBtn: { backgroundColor: DARK_BROWN, borderRadius: 12, height: 50, alignItems: 'center', justifyContent: 'center', marginBottom: 40 },
  saveBtnText: { color: GOLD, fontWeight: '800', fontSize: 16 },
  
  // Scanner Styles
  scannerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  scannerHeader: { position: 'absolute', top: 50, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  scannerTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
  scannerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  scannerAction: { padding: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 },
  scannerClose: { padding: 8, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 20 },
  scannerFrame: { width: 220, height: 130, borderWidth: 2, borderColor: GOLD, backgroundColor: 'transparent' },
  scannerInstructions: { color: '#FFF', marginTop: 30, fontSize: 16, backgroundColor: 'rgba(0,0,0,0.7)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
});
