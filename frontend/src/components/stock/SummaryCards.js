import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const CARD_W = width * 0.42;

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#3D2200';

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/,/g, '').trim();
  const match = normalized.match(/-?\d*\.?\d+/);
  if (!match) return 0;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : 0;
};

const CARDS = [
  {
    key: 'totalDesigns',
    label: 'Designs',
    icon: 'diamond-stone',
    unit: '',
    color: '#D4AF37',
    bg: HEADER_BG,
  },
  {
    key: 'totalQuantity',
    label: 'Quantity',
    icon: 'package-variant-closed',
    unit: 'pcs',
    color: '#D4AF37',
    bg: '#2C1810',
  },
  {
    key: 'totalStockWeight',
    label: 'Total Stock Weight',
    icon: 'scale',
    unit: 'g',
    color: '#D4AF37',
    bg: '#1A2C10',
  },
];

export default function SummaryCards({ summary = {} }) {
  const formatValue = (key, value) => {
    if (key === 'totalNetWeight' || key === 'totalStockWeight') return parseNumericValue(value).toFixed(3);
    return parseNumericValue(value).toLocaleString('en-IN');
  };

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
    >
      {CARDS.map((card) => (
        <View key={card.key} style={[styles.card, { backgroundColor: card.bg }]}>
          <View style={styles.iconRow}>
            <View style={styles.iconCircle}>
              <MaterialCommunityIcons name={card.icon} size={20} color={HEADER_BG} />
            </View>
          </View>
          <Text style={styles.value}>
            {formatValue(card.key, summary[card.key])}
            {card.unit ? (
              <Text style={styles.unit}> {card.unit}</Text>
            ) : null}
          </Text>
          <Text style={styles.label}>{card.label}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  card: {
    width: CARD_W,
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 6,
  },
  iconRow: {
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 26,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 0.5,
  },
  unit: {
    fontSize: 13,
    fontWeight: '500',
    color: '#B89A2A',
  },
  label: {
    fontSize: 12,
    color: '#A08850',
    fontWeight: '600',
    marginTop: 4,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
});
