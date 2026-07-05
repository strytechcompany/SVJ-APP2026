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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCustomer } from '../../context/CustomerContext';
import CustomerFormFields from '../../components/customers/CustomerFormFields';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

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
  return errs;
}

export default function EditCustomerScreen({ navigation, route }) {
  const { customer } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const { updateCustomer } = useCustomer();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  const [values, setValues] = useState({
    customerName: customer.customerName || '',
    phoneNumber: customer.phoneNumber || '',
    shopName: customer.shopName || '',
    dealerCompanyName: customer.dealerCompanyName || '',
    gstNumber: customer.gstNumber || '',
    address: customer.address || '',
    oldBalance: String(customer.oldBalance ?? 0),
    advance: String(customer.advance ?? 0),
    remarks: customer.remarks || '',
  });

  const handleChange = useCallback((field, text) => {
    setValues((prev) => ({ ...prev, [field]: text }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: null }));
  }, [errors]);

  const handleUpdate = async () => {
    const errs = validate(values, customer.customerType);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const result = await updateCustomer(customer._id, {
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
        Alert.alert('✅ Updated', 'Customer updated successfully', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Error', result.message || 'Update failed');
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
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Edit Customer</Text>
          <Text style={styles.headerSub}>{customer.customerCode}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type Badge (read-only, cannot change type after creation) */}
          <View style={styles.typePill}>
            <MaterialCommunityIcons name="lock-outline" size={13} color={GOLD} />
            <Text style={styles.typePillText}>
              Customer Type: {customer.customerType} — cannot be changed
            </Text>
          </View>

          <CustomerFormFields
            customerType={customer.customerType}
            values={values}
            onChange={handleChange}
            errors={errors}
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.btnDisabled]}
            onPress={handleUpdate}
            activeOpacity={0.85}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color={BG} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save-edit-outline" size={20} color={BG} />
                <Text style={styles.saveBtnText}>Update Customer</Text>
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
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: '#A08850', fontSize: 11, fontWeight: '600', marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 20, paddingBottom: 40 },
  typePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3D2200',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginHorizontal: 16,
    marginBottom: 16,
  },
  typePillText: { color: GOLD, fontSize: 12, fontWeight: '600' },
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
  btnDisabled: { opacity: 0.6 },
  saveBtnText: { color: BG, fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
});
