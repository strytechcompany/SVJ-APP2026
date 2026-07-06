import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_SIZE = (width - 48) / 2;

const MODULES = [
  {
    key: 'B2C',
    label: 'B2C',
    icon: 'account-circle',
    bg: '#FFF3E0',
    iconBg: '#3D2200',
    iconColor: '#D4AF37',
    screen: 'B2C',
  },
  {
    key: 'B2D',
    label: 'B2D',
    icon: 'account-multiple',
    bg: '#EEEEEE',
    iconBg: '#4A235A',
    iconColor: '#FFFFFF',
    screen: 'B2D',
  },
  {
    key: 'ChitFund',
    label: 'Chit Fund',
    icon: 'piggy-bank',
    bg: '#FFCDD2',
    iconBg: '#7B1F2A',
    iconColor: '#FFFFFF',
    screen: 'ChitFund',
  },
  {
    key: 'Customers',
    label: 'Customers',
    icon: 'account-group',
    bg: '#EDE7F6',
    iconBg: '#3A1A6E',
    iconColor: '#FFFFFF',
    screen: 'Customers',
  },
  {
    key: 'Expenses',
    label: 'Expenses',
    icon: 'cash-minus',
    bg: '#E0F2F1',
    iconBg: '#1B5E20',
    iconColor: '#FFFFFF',
    screen: 'Expenses',
  },
  {
    key: 'LineStocker',
    label: 'Line Stocker',
    icon: 'truck-delivery',
    bg: '#FFF8E1',
    iconBg: '#3D2200',
    iconColor: '#D4AF37',
    screen: 'LineStockDashboard',
  },
];

export default function QuickAccessGrid({ navigation }) {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Quick Access</Text>
      <View style={styles.grid}>
        {MODULES.map((mod) => (
          <TouchableOpacity
            key={mod.key}
            style={[styles.card, { backgroundColor: mod.bg }]}
            onPress={() => navigation.navigate(mod.screen)}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: mod.iconBg }]}>
              <MaterialCommunityIcons name={mod.icon} size={28} color={mod.iconColor} />
            </View>
            <Text style={styles.cardLabel}>{mod.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 20,
    paddingHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  card: {
    width: CARD_SIZE,
    height: CARD_SIZE * 0.85,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  iconCircle: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  cardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
});
