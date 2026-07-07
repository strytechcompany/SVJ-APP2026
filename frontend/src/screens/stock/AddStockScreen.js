import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStock } from '../../context/StockContext';
import { printJewelryLabel } from '../../services/UsbPrinterService.js';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

const CATEGORIES = ['Necklace', 'Bangle', 'Ring', 'Earring', 'Chain', 'Bracelet', 'Pendant', 'Coin'];
const PURITIES = ['18K (750)', '22K (916)', '24K (999)'];

function ChipGroup({ label, options, selected, onSelect }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.chipRow}>
        {options.map((opt) => (
          <TouchableOpacity
            key={opt}
            style={[styles.chip, selected === opt && styles.chipSelected]}
            onPress={() => onSelect(opt)}
            activeOpacity={0.75}
          >
            <Text style={[styles.chipText, selected === opt && styles.chipTextSelected]}>
              {opt}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

function FormField({ label, value, onChangeText, placeholder, keyboardType = 'default', multiline = false }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#B09878"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 4 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

export default function AddStockScreen({ navigation, route }) {
  const { createStock, updateStock } = useStock();
  const editItem = route.params?.editItem ?? null;
  const isEdit = !!editItem;

  const insets = useSafeAreaInsets();
  const topPadding = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [saving, setSaving] = useState(false);

  // ─── Form State ───────────────────────────────────────────────────────────
  const [category, setCategory] = useState(editItem?.category ?? '');
  const [designName, setDesignName] = useState(editItem?.designName ?? '');
  const [itemName, setItemName] = useState(editItem?.itemName ?? '');
  const [supplierName, setSupplierName] = useState(editItem?.supplierName ?? '');
  const [grossWeight, setGrossWeight] = useState(editItem?.grossWeight?.toString() ?? '');
  const [netWeight, setNetWeight] = useState(editItem?.netWeight?.toString() ?? '');
  const [purity, setPurity] = useState(editItem?.purity ?? '');
  const [buyingTouch, setBuyingTouch] = useState(editItem?.buyingTouch?.toString() ?? '');
  const [quantity, setQuantity] = useState(editItem?.quantity?.toString() ?? '1');
  const [itemNumber, setItemNumber] = useState(editItem?.itemNumber ?? '');
  const [itemNumberError, setItemNumberError] = useState('');
  const [notes, setNotes] = useState(editItem?.notes ?? '');
  const [barcode, setBarcode] = useState(editItem?.barcode ?? '');
  const [printing, setPrinting] = useState(false);

  // ─── Gross Weight → auto-sync Net Weight ──────────────────────────────────
  const handleGrossWeightChange = (text) => {
    setGrossWeight(text);
    setNetWeight(text); // Net weight = Gross weight
  };

  // ─── Print QR Label via thermal printer ────────────────────────────────────
  const printBarcode = async () => {
    if (!barcode) {
      Alert.alert('No QR Code', 'Please generate a QR code first.');
      return;
    }
    setPrinting(true);
    try {
      await printJewelryLabel({
        itemName: itemName || designName,
        itemNumber: barcode,
        purity,
        grossWeight,
        netWeight,
        barcode,
      });
      Alert.alert('Printed', 'QR label sent to thermal printer.');
    } catch (err) {
      Alert.alert('Print Failed', err.message || 'Could not print the barcode label.');
    } finally {
      setPrinting(false);
    }
  };

  // ─── Validate & Save ──────────────────────────────────────────────────────
  const handleSave = async () => {
    const inTrimmed = itemNumber.trim().toUpperCase();
    if (!inTrimmed) {
      setItemNumberError('Item Number is required.');
      return Alert.alert('Validation', 'Item Number is required.');
    }
    if (!/^[A-Z0-9]+$/.test(inTrimmed)) {
      setItemNumberError('Letters and numbers only (e.g. TH001, CH002).');
      return Alert.alert('Validation', 'Item Number must contain letters and numbers only.');
    }
    setItemNumberError('');
    if (!designName.trim()) return Alert.alert('Validation', 'Design Name is required.');
    if (!category) return Alert.alert('Validation', 'Please select a Category.');
    if (!purity) return Alert.alert('Validation', 'Please select a Purity.');
    if (!grossWeight || isNaN(parseFloat(grossWeight)))
      return Alert.alert('Validation', 'Enter a valid Gross Weight.');
    if (!netWeight || isNaN(parseFloat(netWeight)))
      return Alert.alert('Validation', 'Enter a valid Net Weight.');
    if (!quantity || isNaN(parseInt(quantity)) || parseInt(quantity) < 1)
      return Alert.alert('Validation', 'Quantity must be at least 1.');

    setSaving(true);
    try {
      const finalBarcode = barcode || `SVJ${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
      if (!barcode) {
        setBarcode(finalBarcode);
      }

      const payload = {
        itemNumber: inTrimmed,
        designName: designName.trim(),
        itemName: itemName.trim(),
        supplierName: supplierName.trim(),
        category,
        purity,
        grossWeight: parseFloat(grossWeight),
        netWeight: parseFloat(netWeight),
        buyingTouch: parseFloat(buyingTouch) || 0,
        quantity: parseInt(quantity),
        notes: notes.trim(),
        barcode: finalBarcode,
      };

      let result;
      if (isEdit) {
        result = await updateStock(editItem._id, payload);
      } else {
        result = await createStock(payload);
      }

      if (result.success) {
        Alert.alert('Success', isEdit ? 'Stock updated!' : 'Stock item added!', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Something went wrong.');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Failed to save. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />

      {/* ─── Header ─── */}
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isEdit ? 'Edit Stock Item' : 'Add New Stock'}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* ─── Form ─── */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* Item Number — alphanumeric, required */}
          <View style={styles.fieldGroup}>
            <Text style={styles.fieldLabel}>Item Number * (e.g. TH001, CH002)</Text>
            <TextInput
              style={[styles.input, itemNumberError ? styles.inputError : null]}
              value={itemNumber}
              onChangeText={(t) => {
                // Strip special characters, auto-uppercase
                setItemNumber(t.replace(/[^a-zA-Z0-9]/g, '').toUpperCase());
                if (itemNumberError) setItemNumberError('');
              }}
              placeholder="e.g. TH001, CH002, SVJ1001"
              placeholderTextColor="#B09878"
              keyboardType="default"
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {itemNumberError ? (
              <Text style={styles.errorNote}>{itemNumberError}</Text>
            ) : (
              <Text style={styles.autoNote}>Unique alphanumeric identifier — letters and numbers only</Text>
            )}
          </View>

          {/* Category */}
          <ChipGroup
            label="Category *"
            options={CATEGORIES}
            selected={category}
            onSelect={setCategory}
          />

          {/* Design Name */}
          <FormField
            label="Design Name *"
            value={designName}
            onChangeText={setDesignName}
            placeholder="e.g. THALI 01"
          />

          {/* Item Name */}
          <FormField
            label="Item Name"
            value={itemName}
            onChangeText={setItemName}
            placeholder="e.g. THALI 01 (Printed on barcode)"
          />

          {/* Supplier Name */}
          <FormField
            label="Supplier Name"
            value={supplierName}
            onChangeText={setSupplierName}
            placeholder="e.g. Kumar Jewels"
          />

          {/* Weights Row — Net Weight auto-mirrors Gross Weight */}
          <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.fieldLabel}>Gross Weight (g) *</Text>
              <TextInput
                style={styles.input}
                value={grossWeight}
                onChangeText={handleGrossWeightChange}
                placeholder="0.000"
                placeholderTextColor="#B09878"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.fieldLabel}>Net Weight (g)</Text>
              <View style={styles.readonlyField}>
                <Text style={styles.readonlyText} numberOfLines={1}>
                  {netWeight || '0.000'}
                </Text>
                <MaterialCommunityIcons name="link" size={14} color={GOLD} />
              </View>
              <Text style={styles.autoNote}>Same as Gross Weight</Text>
            </View>
          </View>

          {/* Purity */}
          <ChipGroup
            label="Purity *"
            options={PURITIES}
            selected={purity}
            onSelect={setPurity}
          />

          {/* Buying Touch & Quantity Row */}
          {/* <View style={styles.rowFields}>
            <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
              <Text style={styles.fieldLabel}>Buying Touch %</Text>
              <TextInput
                style={styles.input}
                value={buyingTouch}
                onChangeText={setBuyingTouch}
                placeholder="0.00"
                placeholderTextColor="#B09878"
                keyboardType="decimal-pad"
              />
            </View>
            <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
              <Text style={styles.fieldLabel}>Quantity *</Text>
              <TextInput
                style={styles.input}
                value={quantity}
                onChangeText={setQuantity}
                placeholder="1"
                placeholderTextColor="#B09878"
                keyboardType="number-pad"
              />
            </View>
          </View> */}

          {/* Barcode Section */}
          
          <View style={styles.fieldGroup}>
            {/* <Text style={styles.fieldLabel}>QR Code</Text> */}

            {barcode ? (
              <>
                <View style={styles.barcodePreview}>
                  <MaterialCommunityIcons name="barcode-scan" size={20} color={GOLD} />
                  <Text style={styles.barcodeValue} numberOfLines={1}>{barcode}</Text>
                </View>

                {/* Print Button */}
                <TouchableOpacity
                  style={[styles.printBtn, printing && styles.saveBtnDisabled]}
                  onPress={printBarcode}
                  activeOpacity={0.85}
                  disabled={printing}
                >
                  {printing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
                      <Text style={styles.printBtnText}>Print QR Label</Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            ) : null}
          </View>

          {/* Notes */}
          <FormField
            label="Notes (Optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Additional details..."
            multiline
          />

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={HEADER_BG} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons
                  name={isEdit ? 'content-save-edit' : 'content-save'}
                  size={20}
                  color={HEADER_BG}
                />
                <Text style={styles.saveBtnText}>
                  {isEdit ? 'Update Stock Item' : 'Save Stock Item'}
                </Text>
              </>
            )}
          </TouchableOpacity>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
    zIndex: 10,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: {
    flex: 1,
    color: GOLD,
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  scroll: { flex: 1 },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  fieldGroup: {
    marginBottom: 20,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: DARK_BROWN,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: DARK_BROWN,
    borderWidth: 1.5,
    borderColor: '#E5D8C0',
    fontWeight: '500',
  },
  inputMultiline: {
    height: 100,
    paddingTop: 12,
  },
  readonlyField: {
    backgroundColor: '#F0E8D0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5D8C0',
  },
  readonlyText: {
    fontSize: 13,
    color: DARK_BROWN,
    fontWeight: '600',
    flex: 1,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5D8C0',
  },
  chipSelected: {
    backgroundColor: GOLD,
    borderColor: GOLD,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: DARK_BROWN,
  },
  chipTextSelected: {
    color: HEADER_BG,
    fontWeight: '700',
  },
  rowFields: {
    flexDirection: 'row',
  },
  barcodePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: HEADER_BG,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginTop: 10,
    gap: 10,
  },
  barcodeValue: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 16,
    marginTop: 8,
    gap: 10,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    color: HEADER_BG,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  autoNote: {
    fontSize: 10,
    color: '#A08850',
    fontWeight: '600',
    marginTop: 5,
    fontStyle: 'italic',
  },
  inputError: {
    borderColor: '#C0392B',
    borderWidth: 1.5,
  },
  errorNote: {
    fontSize: 11,
    color: '#C0392B',
    fontWeight: '600',
    marginTop: 5,
  },
  printBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C6E49',
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 18,
    marginTop: 10,
    gap: 8,
    shadowColor: '#2C6E49',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 4,
  },
  printBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
