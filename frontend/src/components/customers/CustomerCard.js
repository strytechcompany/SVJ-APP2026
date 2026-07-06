import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

const TYPE_COLORS = {
  B2C: { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
  B2D: { bg: '#EDE7F6', text: '#4527A0', border: '#CE93D8' },
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomerCard({ customer, onView, onEdit, onDelete }) {
  const typeStyle = TYPE_COLORS[customer.customerType] || TYPE_COLORS.B2C;

  const confirmDelete = () => {
    Alert.alert(
      'Delete Customer',
      `Delete ${customer.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => onDelete(customer._id) },
      ]
    );
  };

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onView(customer)}
      activeOpacity={0.85}
    >
      {/* Top row */}
      <View style={styles.topRow}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>
            {customer.customerName.charAt(0).toUpperCase()}
          </Text>
        </View>

        <View style={styles.nameBlock}>
          <Text style={styles.name} numberOfLines={1}>{customer.customerName}</Text>
          <Text style={styles.code}>{customer.customerCode}</Text>
          {(customer.shopName || customer.dealerCompanyName) ? (
            <Text style={styles.subName} numberOfLines={1}>
              {customer.shopName || customer.dealerCompanyName}
            </Text>
          ) : null}
        </View>

        <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg, borderColor: typeStyle.border }]}>
          <Text style={[styles.typeText, { color: typeStyle.text }]}>
            {customer.customerType}
          </Text>
        </View>
      </View>

      {/* Phone */}
      <View style={styles.infoRow}>
        <MaterialCommunityIcons name="phone-outline" size={13} color={GOLD} />
        <Text style={styles.infoText}>{customer.phoneNumber}</Text>
      </View>

      {/* Balance Row */}
      <View style={styles.balanceRow}>
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Old Balance</Text>
          <Text style={styles.balanceValue}>₹ {Number(customer.oldBalance).toFixed(2)}</Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Advance</Text>
          <Text style={[styles.balanceValue, { color: '#2E7D32' }]}>
            ₹ {Number(customer.advance).toFixed(2)}
          </Text>
        </View>
        <View style={styles.balanceDivider} />
        <View style={styles.balanceItem}>
          <Text style={styles.balanceLabel}>Since</Text>
          <Text style={styles.balanceValue}>{formatDate(customer.createdAt)}</Text>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onView(customer)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="eye-outline" size={15} color={DARK_BROWN} />
          <Text style={styles.actionText}>View</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => onEdit(customer)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="pencil-outline" size={15} color={DARK_BROWN} />
          <Text style={styles.actionText}>Edit</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={confirmDelete} activeOpacity={0.7}>
          <MaterialCommunityIcons name="trash-can-outline" size={15} color="#FFFFFF" />
          <Text style={[styles.actionText, { color: '#FFFFFF' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 18,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F0E4CC',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: DARK_BROWN,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: GOLD,
    fontSize: 18,
    fontWeight: '800',
  },
  nameBlock: {
    flex: 1,
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: DARK_BROWN,
  },
  code: {
    fontSize: 11,
    color: '#A08850',
    fontWeight: '600',
    marginTop: 1,
  },
  subName: {
    fontSize: 12,
    color: '#8A6B3C',
    fontWeight: '500',
    marginTop: 2,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  typeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 13,
    color: '#6B5230',
    fontWeight: '500',
  },
  balanceRow: {
    flexDirection: 'row',
    backgroundColor: '#FDFAF4',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0E4CC',
  },
  balanceItem: {
    flex: 1,
    alignItems: 'center',
  },
  balanceLabel: {
    fontSize: 9,
    color: '#A08850',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  balanceValue: {
    fontSize: 12,
    fontWeight: '700',
    color: DARK_BROWN,
  },
  balanceDivider: {
    width: 1,
    backgroundColor: '#E8D8B8',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    backgroundColor: '#FFF8EC',
    borderWidth: 1,
    borderColor: '#E8D8B8',
  },
  editBtn: {
    backgroundColor: '#FFF3CD',
    borderColor: '#FFCC80',
  },
  deleteBtn: {
    backgroundColor: '#E74C3C',
    borderColor: '#C0392B',
  },
  actionText: {
    fontSize: 12,
    fontWeight: '700',
    color: DARK_BROWN,
  },
});
