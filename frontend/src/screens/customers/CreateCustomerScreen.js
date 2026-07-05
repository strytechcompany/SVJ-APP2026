import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCustomer } from '../../context/CustomerContext';
import CustomerTypeSegment from '../../components/customers/CustomerTypeSegment';
import CustomerFormFields from '../../components/customers/CustomerFormFields';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const HEADER_BG = '#5C3A00';
const BG = '#F8F4E8';

const EMPTY_FORM = {
  customerName: '',
  phoneNumber: '',
  shopName: '',
  dealerCompanyName: '',
  gstNumber: '',
  address: '',
  oldBalance: '0',
  advance: '0',
  remarks: '',
};

function validate(values, customerType) {
  const errs = {};
  if (!values.customerName.trim()) errs.customerName = 'Customer name is required';
  const phone = values.phoneNumber.replace(/\s/g, '');
  if (!phone) errs.phoneNumber = 'Phone number is required';
  else if (!/^[6-9]\d{9}$/.test(phone) && !/^\+91[6-9]\d{9}$/.test(phone))
    errs.phoneNumber = 'Enter a valid 10-digit mobile number';
  if (!values.address.trim()) errs.address = 'Address is required';
  if (customerType === 'B2B' && !values.shopName.trim())
    errs.shopName = 'Shop name is required for B2B';
  if (customerType === 'B2D' && !values.dealerCompanyName.trim())
    errs.dealerCompanyName = 'Dealer company name is required for B2D';
  const ob = parseFloat(values.oldBalance);
  if (isNaN(ob) || ob < 0) errs.oldBalance = 'Must be >= 0';
  const adv = parseFloat(values.advance);
  if (isNaN(adv) || adv < 0) errs.advance = 'Must be >= 0';
  return errs;
}

export default function CreateCustomerScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const { createCustomer } = useCustomer();
  const { defaultType } = route.params || {};

  const [customerType, setCustomerType] = useState(defaultType || 'B2C');
  const [values, setValues] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setCustomerType(defaultType || 'B2C');
      setValues(EMPTY_FORM);
      setErrors({});
      setSaving(false);
    }, [defaultType])
  );

  const handleChange = useCallback((field, text) => {
    setValues((prev) => ({ ...prev, [field]: text }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }, [errors]);

  const handleTypeChange = (type) => {
    setCustomerType(type);
    setErrors({});
    // Clear type-specific fields when switching
    setValues((prev) => ({
      ...prev,
      shopName: '',
      dealerCompanyName: '',
      gstNumber: '',
    }));
  };

  const handleSave = async () => {
    const errs = validate(values, customerType);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const typeToSend = customerType === 'LINE STOCKER' ? 'LINE_STOCKER' : customerType;
      
      const result = await createCustomer({
        customerType: typeToSend,
        customerName: values.customerName.trim(),
        phoneNumber: values.phoneNumber.trim(),
        shopName: values.shopName.trim(),
        dealerCompanyName: values.dealerCompanyName.trim(),
        gstNumber: values.gstNumber.trim(),
        address: values.address.trim(),
        oldBalance: parseFloat(values.oldBalance) || 0,
        advance: parseFloat(values.advance) || 0,
        remarks: values.remarks.trim(),
      });

      if (result.success) {
        Alert.alert('✅ Success', 'Customer Created Successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Failed to create customer');
      }
    } catch (err) {
      Alert.alert('Error', err.response?.data?.message || 'Something went wrong');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />

      {/* ─── App Header ─── */}
      <View style={[styles.appHeader, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerIcon} activeOpacity={0.7}>
          <MaterialCommunityIcons name="menu" size={26} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.appName}>Sri Vaishnavi</Text>
          <Text style={styles.appName}>Jewellers</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      {/* ─── Page Body ─── */}
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
          {/* Page Title */}
          <Text style={styles.pageTitle}>Create Customer</Text>

          {/* Type Switcher */}
          <CustomerTypeSegment selected={customerType} onSelect={handleTypeChange} />

          {/* Form Card */}
          <CustomerFormFields
            customerType={customerType}
            values={values}
            onChange={handleChange}
            errors={errors}
          />

          {/* Save Button */}
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={BG} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-outline" size={20} color={BG} />
                <Text style={styles.saveBtnText}>Save Customer</Text>
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
  appHeader: {
    backgroundColor: HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 8,
  },
  headerIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  appName: {
    color: GOLD,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 20,
  },
  scroll: { flex: 1 },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 40,
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: DARK_BROWN,
    marginLeft: 16,
    marginBottom: 20,
    letterSpacing: 0.2,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DARK_BROWN,
    marginHorizontal: 16,
    marginTop: 24,
    borderRadius: 16,
    paddingVertical: 16,
    gap: 10,
    shadowColor: DARK_BROWN,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    color: BG,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
