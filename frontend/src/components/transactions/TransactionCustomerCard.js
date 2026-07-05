import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';

export default function TransactionCustomerCard({ customer, onPress }) {
  const {
    customerName,
    phoneNumber,
    oldBalance,
    advance,
    lastTransactionDate,
  } = customer;

  const formattedDate = lastTransactionDate
    ? new Date(lastTransactionDate).toLocaleDateString()
    : 'N/A';

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(customer)}
      activeOpacity={0.8}
    >
      <View style={styles.leftContent}>
        <View style={styles.nameRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {customerName.charAt(0).toUpperCase()}
            </Text>
          </View>
          <View>
            <Text style={styles.nameText}>{customerName}</Text>
            <Text style={styles.phoneText}>+91 {phoneNumber}</Text>
          </View>
        </View>

        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Old Balance</Text>
            <Text style={styles.balanceValRed}>
              ₹{Number(oldBalance || 0).toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.balanceItem}>
            <Text style={styles.balanceLabel}>Advance</Text>
            <Text style={styles.balanceValGreen}>
              ₹{Number(advance || 0).toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        <Text style={styles.dateText}>Last Transaction: {formattedDate}</Text>
      </View>

      <View style={styles.rightAction}>
        <MaterialCommunityIcons name="chevron-right" size={24} color={GOLD} />
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F5EFE6',
  },
  leftContent: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F8F4E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#E8DCC4',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '800',
    color: GOLD,
  },
  nameText: {
    fontSize: 16,
    fontWeight: '700',
    color: DARK_BROWN,
    letterSpacing: 0.3,
  },
  phoneText: {
    fontSize: 12,
    color: '#8A6822',
    fontWeight: '600',
    marginTop: 2,
  },
  balanceRow: {
    flexDirection: 'row',
    backgroundColor: '#FCFAF5',
    padding: 10,
    borderRadius: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F0E6D0',
  },
  balanceItem: {
    flex: 1,
  },
  divider: {
    width: 1,
    backgroundColor: '#E5D8C0',
    marginHorizontal: 12,
  },
  balanceLabel: {
    fontSize: 10,
    color: '#A08850',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceValRed: {
    fontSize: 14,
    color: '#D32F2F',
    fontWeight: '800',
    marginTop: 2,
  },
  balanceValGreen: {
    fontSize: 14,
    color: '#2E7D32',
    fontWeight: '800',
    marginTop: 2,
  },
  dateText: {
    fontSize: 11,
    color: '#B09878',
    fontWeight: '500',
  },
  rightAction: {
    paddingLeft: 12,
    justifyContent: 'center',
  },
});
