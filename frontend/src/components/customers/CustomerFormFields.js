import React from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const LABEL_COLOR = '#8A6B3C';

function FieldLabel({ children, required }) {
  return (
    <Text style={styles.label}>
      {children}
      {required && <Text style={styles.required}> *</Text>}
    </Text>
  );
}

function IconInput({
  icon,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  multiline = false,
  editable = true,
  error,
}) {
  return (
    <View style={[styles.inputWrap, multiline && styles.inputWrapMulti, error && styles.inputWrapError]}>
      <MaterialCommunityIcons
        name={icon}
        size={18}
        color={GOLD}
        style={[styles.inputIcon, multiline && { marginTop: 2 }]}
      />
      <TextInput
        style={[styles.input, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#C4A97A"
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
        editable={editable}
        autoCorrect={false}
      />
    </View>
  );
}

export default function CustomerFormFields({
  customerType,
  values,
  onChange,
  errors = {},
}) {
  const set = (field) => (text) => onChange(field, text);

  return (
    <View style={styles.card}>

      {/* Customer Name */}
      <View style={styles.fieldGroup}>
        <FieldLabel required>Customer Name</FieldLabel>
        <IconInput
          icon="account-outline"
          value={values.customerName}
          onChangeText={set('customerName')}
          placeholder="e.g. Rajesh Kumar"
          error={errors.customerName}
        />
        {errors.customerName ? <Text style={styles.errorText}>{errors.customerName}</Text> : null}
      </View>

      {/* Phone Number */}
      <View style={styles.fieldGroup}>
        <FieldLabel required>Phone Number</FieldLabel>
        <IconInput
          icon="phone-outline"
          value={values.phoneNumber}
          onChangeText={set('phoneNumber')}
          placeholder="+91 00000 00000"
          keyboardType="phone-pad"
          error={errors.phoneNumber}
        />
        {errors.phoneNumber ? <Text style={styles.errorText}>{errors.phoneNumber}</Text> : null}
      </View>

      {/* Shop Name — B2B only */}
      {customerType === 'B2B' && (
        <View style={styles.fieldGroup}>
          <FieldLabel required>Shop Name</FieldLabel>
          <IconInput
            icon="store-outline"
            value={values.shopName}
            onChangeText={set('shopName')}
            placeholder="Enter business name"
            error={errors.shopName}
          />
          {errors.shopName ? <Text style={styles.errorText}>{errors.shopName}</Text> : null}
        </View>
      )}

      {/* Dealer Company — B2D only */}
      {customerType === 'B2D' && (
        <View style={styles.fieldGroup}>
          <FieldLabel required>Dealer Company Name</FieldLabel>
          <IconInput
            icon="office-building-outline"
            value={values.dealerCompanyName}
            onChangeText={set('dealerCompanyName')}
            placeholder="Enter dealer company name"
            error={errors.dealerCompanyName}
          />
          {errors.dealerCompanyName ? <Text style={styles.errorText}>{errors.dealerCompanyName}</Text> : null}
        </View>
      )}

      {/* GST (B2B & B2D optional) */}
      {(customerType === 'B2B' || customerType === 'B2D') && (
        <View style={styles.fieldGroup}>
          <FieldLabel>GST Number</FieldLabel>
          <IconInput
            icon="file-document-outline"
            value={values.gstNumber}
            onChangeText={set('gstNumber')}
            placeholder="GST Number (Optional)"
            error={errors.gstNumber}
          />
        </View>
      )}

      {/* Address */}
      <View style={styles.fieldGroup}>
        <FieldLabel required>Address</FieldLabel>
        <IconInput
          icon="map-marker-outline"
          value={values.address}
          onChangeText={set('address')}
          placeholder="Full billing address..."
          multiline
          error={errors.address}
        />
        {errors.address ? <Text style={styles.errorText}>{errors.address}</Text> : null}
      </View>

      {/* Old Balance & Advance — row */}
      <View style={styles.balanceRow}>
        <View style={[styles.fieldGroup, { flex: 1, marginRight: 8 }]}>
          <FieldLabel>Old Balance</FieldLabel>
          <View style={styles.balanceWrap}>
            <MaterialCommunityIcons name="currency-inr" size={16} color={GOLD} style={styles.currencyIcon} />
            <TextInput
              style={styles.balanceInput}
              value={values.oldBalance}
              onChangeText={set('oldBalance')}
              placeholder="0.00"
              placeholderTextColor="#C4A97A"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
        <View style={[styles.fieldGroup, { flex: 1, marginLeft: 8 }]}>
          <FieldLabel>Advance</FieldLabel>
          <View style={styles.balanceWrap}>
            <MaterialCommunityIcons name="cash-multiple" size={16} color={GOLD} style={styles.currencyIcon} />
            <TextInput
              style={styles.balanceInput}
              value={values.advance}
              onChangeText={set('advance')}
              placeholder="0.00"
              placeholderTextColor="#C4A97A"
              keyboardType="decimal-pad"
            />
          </View>
        </View>
      </View>

      {/* Remarks */}
      <View style={[styles.fieldGroup, { marginBottom: 0 }]}>
        <FieldLabel>Remarks</FieldLabel>
        <IconInput
          icon="text-box-outline"
          value={values.remarks}
          onChangeText={set('remarks')}
          placeholder="Optional remarks..."
          multiline
        />
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0E4CC',
  },
  fieldGroup: {
    marginBottom: 18,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: LABEL_COLOR,
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  required: {
    color: '#C0392B',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDFAF4',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8D8B8',
    paddingHorizontal: 12,
    height: 50,
  },
  inputWrapMulti: {
    height: 90,
    alignItems: 'flex-start',
    paddingTop: 12,
  },
  inputWrapError: {
    borderColor: '#E74C3C',
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '500',
    height: '100%',
  },
  inputMulti: {
    height: '100%',
    textAlignVertical: 'top',
  },
  balanceRow: {
    flexDirection: 'row',
    marginBottom: 18,
  },
  balanceWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FDFAF4',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8D8B8',
    paddingHorizontal: 12,
    height: 50,
  },
  currencyIcon: {
    marginRight: 8,
  },
  balanceInput: {
    flex: 1,
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 11,
    color: '#E74C3C',
    marginTop: 4,
    marginLeft: 4,
    fontWeight: '500',
  },
});
