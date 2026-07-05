import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform, Modal
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { customerAPI, lineStockAPI, stockAPI } from '../../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function IssueLineStockScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  // Form State
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  
  const [expectedReturnDate, setExpectedReturnDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)); // Default 7 days
  const [showDatePicker, setShowDatePicker] = useState(false);
  
  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [issuedProducts, setIssuedProducts] = useState([]);
  const [stockSearchResults, setStockSearchResults] = useState([]);
  const [isSearchingStock, setIsSearchingStock] = useState(false);
  const searchTimeout = useRef(null);
  
  useEffect(() => {
    if (barcodeSearch.length < 2) {
      setStockSearchResults([]);
      return;
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    
    searchTimeout.current = setTimeout(async () => {
      setIsSearchingStock(true);
      try {
        const res = await stockAPI.getAll({ search: barcodeSearch });
        if (res.data && res.data.success) {
          let allStocks = [];
          res.data.data.forEach(group => {
            if (group.records) allStocks = [...allStocks, ...group.records];
          });
          setStockSearchResults(allStocks.filter(item => item.isAvailable && item.quantity > 0));
        }
      } catch (e) {
        console.error(e);
      } finally {
        setIsSearchingStock(false);
      }
    }, 300);
    
    return () => clearTimeout(searchTimeout.current);
  }, [barcodeSearch]);
  
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  
  const [showScanner, setShowScanner] = useState(false);
  const [scannerTorch, setScannerTorch] = useState(false);
  const [pendingScan, setPendingScan] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();

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

  const lookupAndAddStock = async (query) => {
    const q = normalizeScanValue(query);
    if (!q) return;

    const candidates = buildScanCandidates(q);

    // Step 1: barcode/itemNumber exact lookup — backend searches all fields, no availability filter
    for (const candidate of candidates) {
      try {
        const res = await stockAPI.getByBarcode(candidate);
        if (res?.data?.success && res.data.data) {
          addStockItem(res.data.data);
          setBarcodeSearch('');
          setStockSearchResults([]);
          return;
        }
      } catch (err) {
        console.log('[lookupAndAddStock] getByBarcode error:', err?.response?.status, err?.message);
      }
    }

    // Step 2: full-text search fallback — scan=true bypasses isAvailable filter
    try {
      for (const candidate of candidates) {
        const res = await stockAPI.getAll({ search: candidate, scan: 'true' });
        if (!res?.data?.success) continue;

        const flat = [];
        (res.data.data || []).forEach(g => (g.records || []).forEach(r => flat.push(r)));
        const lc = candidate.toLowerCase();
        const match =
          flat.find(item => (item.barcode || '').toLowerCase() === lc) ||
          flat.find(item => (item.itemNumber || '').toLowerCase() === lc) ||
          (flat.length === 1 ? flat[0] : null);

        if (match) {
          addStockItem(match);
          setBarcodeSearch('');
          setStockSearchResults([]);
          return;
        }

        if (flat.length > 0) {
          setStockSearchResults(flat.slice(0, 10));
          return;
        }
      }
      Alert.alert('Not Found', `Scanned: "${q}"\n\nNo stock item found. Please check the item exists in stock.`);
    } catch (e) {
      console.log('[lookupAndAddStock] getAll error:', e?.message);
      Alert.alert('Scan Error', `Could not fetch stock for "${q}".\nCheck server connection.`);
    }
  };

  // Handle scan via state to avoid stale-closure issues with native callbacks
  useEffect(() => {
    if (!pendingScan) return;
    const val = pendingScan;
    setPendingScan(null);
    lookupAndAddStock(val);
  }, [pendingScan]);

  const handleBarcodeSubmitDirect = (code) => lookupAndAddStock(code);
  const handleBarcodeSubmit = () => lookupAndAddStock(barcodeSearch);

  const openScanner = async () => {
    if (!permission?.granted) {
      const { granted } = await requestPermission();
      if (!granted) {
        Alert.alert('Permission Required', 'Camera permission is needed to scan barcodes.');
        return;
      }
    }
    setScannerTorch(false);
    setShowScanner(true);
  };

  const handleBarCodeScanned = ({ data }) => {
    setShowScanner(false);
    setScannerTorch(false);
    const normalized = normalizeScanValue(data);
    setBarcodeSearch(normalized);
    setPendingScan(normalized);
  };

  useEffect(() => {
    // Load LINE_STOCKER customers
    const loadCustomers = async () => {
      try {
        const res = await customerAPI.getByType('LINE_STOCKER', { limit: 100 });
        if (res.data.success) {
          setCustomers(res.data.data);
        }
      } catch (e) {
        console.error(e);
      }
    };
    loadCustomers();
  }, []);

  const addStockItem = (item) => {
    if (!item.isAvailable || item.quantity <= 0) {
      Alert.alert('Out of Stock', 'This item is out of stock.');
      return;
    }
    
    const exists = issuedProducts.find(p => p.stockId === item._id);
    if (exists) {
      if (exists.count >= item.quantity) {
        Alert.alert('Stock Limit', 'Cannot issue more than available quantity.');
        return;
      }
      setIssuedProducts(prev => prev.map(p => 
        p.stockId === item._id ? { ...p, count: p.count + 1, weight: p.weight + item.netWeight } : p
      ));
    } else {
      setIssuedProducts(prev => [...prev, {
        stockId: item._id,
        itemNumber: item.itemNumber,
        barcode: item.barcode,
        itemName: item.itemName,
        category: item.category,
        purity: item.purity,
        count: 1,
        weight: item.netWeight,
      }]);
    }
  };

  const removeProduct = (idx) => {
    setIssuedProducts(prev => prev.filter((_, i) => i !== idx));
  };

  const totalItems = issuedProducts.reduce((sum, p) => sum + p.count, 0);
  const totalGram = issuedProducts.reduce((sum, p) => sum + p.weight, 0);

  const handleIssue = async () => {
    if (!selectedCustomer) {
      Alert.alert('Validation Error', 'Please select a Line Stocker.');
      return;
    }
    if (issuedProducts.length === 0) {
      Alert.alert('Validation Error', 'Please scan or select products to issue.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        customerId: selectedCustomer._id,
        issueDate: new Date(),
        expectedReturnDate,
        issuedProducts,
        description,
      };

      const res = await lineStockAPI.issueStock(payload);
      if (res.data.success) {
        Alert.alert('Success', 'Line Stock Issued Successfully', [
          { text: 'View Bill', onPress: () => navigation.navigate('LineStockBillPreview', { transactionId: res.data.data._id }) }
        ]);
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to issue stock.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Issue Line Stock</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* Customer Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Line Stocker</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.customerScroll}>
            {customers.map(c => (
              <TouchableOpacity 
                key={c._id}
                style={[styles.customerChip, selectedCustomer?._id === c._id && styles.customerChipActive]}
                onPress={() => setSelectedCustomer(c)}
              >
                <Text style={[styles.customerChipText, selectedCustomer?._id === c._id && { color: DARK_BROWN }]}>{c.customerName}</Text>
                <Text style={styles.customerChipSub}>{c.phoneNumber}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          {selectedCustomer && (
            <View style={styles.selectedCustomerInfo}>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Current Old Balance:</Text><Text style={styles.infoValue}>{Number(selectedCustomer.oldBalance).toFixed(3)}g</Text></View>
              <View style={styles.infoRow}><Text style={styles.infoLabel}>Current Advance:</Text><Text style={styles.infoValue}>{Number(selectedCustomer.advance).toFixed(3)}g</Text></View>
            </View>
          )}
        </View>

        {/* Dates */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Expected Return Date</Text>
          <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowDatePicker(true)}>
            <MaterialCommunityIcons name="calendar" size={20} color={GOLD} style={{ marginRight: 8 }} />
            <Text style={styles.dateText}>{expectedReturnDate.toLocaleDateString('en-GB')}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={expectedReturnDate}
              mode="date"
              display="default"
              onChange={(e, date) => {
                setShowDatePicker(false);
                if (date) setExpectedReturnDate(date);
              }}
            />
          )}
        </View>

        {/* Product Scan */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Scan / Add Product</Text>
          <View style={{ zIndex: 10 }}>
            <View style={styles.scanRow}>
              <View style={styles.scanInputWrap}>
                <TouchableOpacity onPress={openScanner} style={{ padding: 4 }}>
                  <MaterialCommunityIcons name="barcode-scan" size={24} color={GOLD} />
                </TouchableOpacity>
                <TextInput
                  style={styles.scanInput}
                  placeholder="Scan QR Code or Search by Name..."
                  placeholderTextColor="#C4A97A"
                  value={barcodeSearch}
                  onChangeText={setBarcodeSearch}
                  onSubmitEditing={handleBarcodeSubmit}
                  returnKeyType="search"
                />
                {isSearchingStock && <ActivityIndicator size="small" color={GOLD} />}
              </View>
              <TouchableOpacity style={styles.scanBtn} onPress={handleBarcodeSubmit}>
                <Text style={styles.scanBtnText}>ADD</Text>
              </TouchableOpacity>
            </View>

            {/* Autocomplete Dropdown */}
            {stockSearchResults.length > 0 && barcodeSearch.length >= 2 && (
              <View style={styles.autocompleteDropdown}>
                {stockSearchResults.map(item => (
                  <TouchableOpacity 
                    key={item._id} 
                    style={styles.autocompleteItem}
                    onPress={() => {
                      addStockItem(item);
                      setBarcodeSearch('');
                      setStockSearchResults([]);
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.autocompleteTitle}>{item.itemName} - {item.itemNumber}</Text>
                      <Text style={styles.autocompleteSub}>Barcode: {item.barcode} | Wt: {item.netWeight}g</Text>
                    </View>
                    <MaterialCommunityIcons name="plus-circle" size={20} color={GOLD} />
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Issued Products Table */}
          {issuedProducts.length > 0 && (
            <View style={styles.table}>
              <View style={styles.tableHeader}>
                <Text style={[styles.th, { flex: 2 }]}>Item</Text>
                <Text style={[styles.th, { flex: 1 }]}>Purity</Text>
                <Text style={[styles.th, { flex: 1, textAlign: 'right' }]}>Wt(g)</Text>
                <View style={{ width: 30 }} />
              </View>
              {issuedProducts.map((p, idx) => (
                <View key={idx} style={styles.tr}>
                  <View style={{ flex: 2 }}>
                    <Text style={styles.tdText}>{p.itemName || p.category}</Text>
                    <Text style={styles.tdSub}>{p.itemNumber} | {p.barcode}</Text>
                  </View>
                  <Text style={[styles.tdText, { flex: 1 }]}>{p.purity}</Text>
                  <Text style={[styles.tdText, { flex: 1, textAlign: 'right', fontWeight: '800' }]}>{p.weight.toFixed(3)}</Text>
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeProduct(idx)}>
                    <MaterialCommunityIcons name="close" size={16} color="#E74C3C" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* Remarks */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Issue Remarks</Text>
          <TextInput
            style={styles.textArea}
            placeholder="e.g. Weekly Sales, Outside Sales"
            placeholderTextColor="#C4A97A"
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={description}
            onChangeText={setDescription}
          />
        </View>

        {/* Summary */}
        <View style={styles.summaryBox}>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Items Issued</Text><Text style={styles.summaryValue}>{totalItems}</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Total Gram Issued</Text><Text style={styles.summaryValue}>{totalGram.toFixed(3)}g</Text></View>
          <View style={styles.divider} />
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Old Balance Before</Text><Text style={styles.summaryValue}>{selectedCustomer ? Number(selectedCustomer.oldBalance).toFixed(3) : '0.000'}g</Text></View>
          <View style={styles.summaryRow}><Text style={styles.summaryLabel}>Old Balance After</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>{selectedCustomer ? (Number(selectedCustomer.oldBalance) + totalGram).toFixed(3) : '0.000'}g</Text></View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity 
          style={[styles.submitBtn, saving && { opacity: 0.7 }]}
          disabled={saving}
          onPress={handleIssue}
        >
          {saving ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="check" size={24} color="#FFF" />}
          <Text style={styles.submitBtnText}>{saving ? 'Issuing...' : 'Issue Line Stock'}</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Scanner Modal */}
      <Modal visible={showScanner} animationType="slide" onRequestClose={() => setShowScanner(false)}>
        <View style={styles.scannerContainer}>
          <View style={[styles.scannerHeader, { paddingTop: topPad }]}>
            <TouchableOpacity onPress={() => setShowScanner(false)} style={{ padding: 8 }}>
              <MaterialCommunityIcons name="close" size={28} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Scan QR Code</Text>
            <View style={{ width: 44 }} />
          </View>
          <CameraView
            style={StyleSheet.absoluteFillObject}
            facing="back"
            enableTorch={scannerTorch}
            barcodeScannerSettings={{
              barcodeTypes: ["qr", "code128", "code39", "ean13", "ean8", "itf14"],
            }}
            onBarcodeScanned={handleBarCodeScanned}
          />
          <View pointerEvents="box-none" style={styles.scannerOverlay}>
            <View style={styles.scannerTarget} />
            <View style={styles.scannerControls}>
              <TouchableOpacity style={styles.scannerControlBtn} onPress={() => setScannerTorch((prev) => !prev)}>
                <MaterialCommunityIcons name={scannerTorch ? 'flashlight' : 'flashlight-off'} size={22} color="#FFF" />
                <Text style={styles.scannerControlText}>{scannerTorch ? 'Torch On' : 'Torch Off'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  customerScroll: { flexDirection: 'row', marginBottom: 12 },
  customerChip: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', marginRight: 12, backgroundColor: '#FDFAF4' },
  customerChipActive: { backgroundColor: GOLD, borderColor: GOLD },
  customerChipText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  customerChipSub: { fontSize: 11, color: '#8A6B3C', marginTop: 2 },
  selectedCustomerInfo: { padding: 12, backgroundColor: '#F0E4CC', borderRadius: 10 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  infoLabel: { fontSize: 12, color: DARK_BROWN, fontWeight: '600' },
  infoValue: { fontSize: 13, color: DARK_BROWN, fontWeight: '800' },
  datePickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDFAF4', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8' },
  dateText: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  scanRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  scanInputWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDFAF4', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 12, height: 48 },
  scanInput: { flex: 1, marginLeft: 8, fontSize: 14, color: DARK_BROWN, fontWeight: '600' },
  scanBtn: { backgroundColor: DARK_BROWN, borderRadius: 12, paddingHorizontal: 20, justifyContent: 'center', alignItems: 'center' },
  scanBtnText: { color: GOLD, fontSize: 13, fontWeight: '800' },
  autocompleteDropdown: { backgroundColor: '#FFF', borderRadius: 12, elevation: 4, borderWidth: 1, borderColor: '#E8D8B8', maxHeight: 200, marginTop: -10, marginBottom: 16, zIndex: 100 },
  autocompleteItem: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#F0E4CC' },
  autocompleteTitle: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  autocompleteSub: { fontSize: 11, color: '#8A6B3C', marginTop: 2 },
  table: { marginTop: 8 },
  tableHeader: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#F0E4CC', paddingBottom: 8, marginBottom: 8 },
  th: { fontSize: 11, color: '#8A6B3C', fontWeight: '700' },
  tr: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  tdText: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  tdSub: { fontSize: 10, color: '#A08850' },
  removeBtn: { width: 30, alignItems: 'flex-end', justifyContent: 'center' },
  textArea: { backgroundColor: '#FDFAF4', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', padding: 12, fontSize: 14, color: DARK_BROWN },
  summaryBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 24, borderWidth: 1, borderColor: GOLD },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, alignItems: 'center' },
  summaryLabel: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  summaryValue: { fontSize: 16, color: DARK_BROWN, fontWeight: '800' },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 12 },
  submitBtn: { flexDirection: 'row', backgroundColor: DARK_BROWN, paddingVertical: 16, borderRadius: 16, alignItems: 'center', justifyContent: 'center', gap: 8, elevation: 4 },
  submitBtnText: { color: GOLD, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
  
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16, backgroundColor: 'rgba(0,0,0,0.5)' },
  scannerTitle: { color: '#FFF', fontSize: 18, fontWeight: '800' },
  scannerOverlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  scannerTarget: { width: 220, height: 220, borderWidth: 2, borderColor: GOLD, backgroundColor: 'rgba(255,255,255,0.1)' },
  scannerControls: { position: 'absolute', bottom: 40, alignSelf: 'center', pointerEvents: 'auto' },
  scannerControlBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,0,0,0.65)', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  scannerControlText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
});
