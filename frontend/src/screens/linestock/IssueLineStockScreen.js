import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { customerAPI, lineStockAPI, stockAPI } from '../../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function IssueLineStockScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);
  const { editTransactionId, prefilledData } = route?.params || {};
  const isEditMode = !!editTransactionId;

  // Form State
  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(() => prefilledData?.customerId || null);
  const [customerSearch, setCustomerSearch] = useState(() => prefilledData?.customerId?.customerName || '');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);

  const [expectedReturnDate, setExpectedReturnDate] = useState(() =>
    prefilledData?.expectedReturnDate ? new Date(prefilledData.expectedReturnDate) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  ); // Default 7 days
  const [showDatePicker, setShowDatePicker] = useState(false);

  const [barcodeSearch, setBarcodeSearch] = useState('');
  const [issuedProducts, setIssuedProducts] = useState(() =>
    (prefilledData?.issuedProducts || []).map(p => ({
      stockId: typeof p.stockId === 'object' ? p.stockId?._id : p.stockId,
      itemNumber: p.itemNumber || '',
      barcode: p.barcode || '',
      itemName: p.itemName || '',
      category: p.category || '',
      purity: p.purity || '',
      count: p.count || 1,
      weight: p.weight || 0,
    }))
  );
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
  
  const [description, setDescription] = useState(() => prefilledData?.description || '');
  const [saving, setSaving] = useState(false);

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

  const handleBarcodeSubmit = () => lookupAndAddStock(barcodeSearch);

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

  const filteredCustomers = customers.filter(c => {
    const q = customerSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.customerName || '').toLowerCase().includes(q) ||
      (c.phoneNumber || '').includes(q) ||
      (c.customerCode || '').toLowerCase().includes(q)
    );
  });

  const handleSelectCustomer = (c) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.customerName);
    setShowCustomerDropdown(false);
  };

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
      if (isEditMode) {
        const res = await lineStockAPI.updateTransaction(editTransactionId, {
          expectedReturnDate,
          issuedProducts,
          description,
        });
        if (res.data.success) {
          Alert.alert('Success', 'Line Stock Transaction Updated Successfully', [
            { text: 'OK', onPress: () => navigation.goBack() }
          ]);
        }
      } else {
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
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || `Failed to ${isEditMode ? 'update' : 'issue'} stock.`);
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
          <Text style={styles.headerTitle}>{isEditMode ? 'Edit Line Stock' : 'Issue Line Stock'}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        
        {/* Customer Selection */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Select Line Stocker</Text>
          {selectedCustomer ? (
            <View style={styles.selectedCustomerRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.selectedCustomerName}>{selectedCustomer.customerName}</Text>
                <Text style={styles.selectedCustomerSub}>{selectedCustomer.phoneNumber}{selectedCustomer.customerCode ? `  |  ${selectedCustomer.customerCode}` : ''}</Text>
              </View>
              {!isEditMode && (
                <TouchableOpacity
                  style={styles.changeCustomerBtn}
                  onPress={() => {
                    setSelectedCustomer(null);
                    setCustomerSearch('');
                    setShowCustomerDropdown(false);
                  }}
                >
                  <MaterialCommunityIcons name="pencil-outline" size={14} color={DARK_BROWN} />
                  <Text style={styles.changeCustomerBtnText}>Change</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View>
              <View style={styles.scanInputWrap}>
                <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={{ marginRight: 4 }} />
                <TextInput
                  style={styles.scanInput}
                  placeholder="Search by name, phone or code..."
                  placeholderTextColor="#C4A97A"
                  value={customerSearch}
                  onChangeText={(t) => {
                    setCustomerSearch(t);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                  returnKeyType="search"
                />
                {customerSearch.length > 0 && (
                  <TouchableOpacity
                    onPress={() => { setCustomerSearch(''); setShowCustomerDropdown(true); }}
                    style={{ padding: 4 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={18} color="#C4A97A" />
                  </TouchableOpacity>
                )}
              </View>

              {showCustomerDropdown && (
                <View style={styles.autocompleteDropdown}>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map(c => (
                      <TouchableOpacity
                        key={c._id}
                        style={styles.autocompleteItem}
                        onPress={() => handleSelectCustomer(c)}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={styles.autocompleteTitle}>{c.customerName}</Text>
                          <Text style={styles.autocompleteSub}>{c.phoneNumber}{c.customerCode ? `  |  ${c.customerCode}` : ''}</Text>
                        </View>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <View style={styles.autocompleteItem}>
                      <Text style={styles.autocompleteSub}>No Line Stocker matches your search.</Text>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}
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
                <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={{ marginRight: 4 }} />
                <TextInput
                  style={styles.scanInput}
                  placeholder="Search by Name or Item Number..."
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
          <Text style={styles.submitBtnText}>
            {saving ? (isEditMode ? 'Updating...' : 'Issuing...') : (isEditMode ? 'Update Line Stock' : 'Issue Line Stock')}
          </Text>
        </TouchableOpacity>
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
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  selectedCustomerRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FDFAF4', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 14, paddingVertical: 12 },
  selectedCustomerName: { fontSize: 15, fontWeight: '800', color: DARK_BROWN },
  selectedCustomerSub: { fontSize: 12, color: '#8A6B3C', marginTop: 2 },
  changeCustomerBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F0E4CC' },
  changeCustomerBtnText: { fontSize: 12, fontWeight: '700', color: DARK_BROWN },
  selectedCustomerInfo: { padding: 12, backgroundColor: '#F0E4CC', borderRadius: 10, marginTop: 12 },
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
  
});
