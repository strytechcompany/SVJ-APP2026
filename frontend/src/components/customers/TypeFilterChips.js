import React from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';

const FILTERS = ['All', 'B2C', 'B2D', 'CHIT FUND', 'LINE STOCKER'];

export default function TypeFilterChips({ selected, onSelect }) {
  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {FILTERS.map((f) => {
          const isActive = selected === f;
          return (
            <TouchableOpacity
              key={f}
              style={[styles.chip, isActive && styles.chipActive]}
              onPress={() => onSelect(f)}
              activeOpacity={0.75}
            >
              <Text style={[styles.chipText, isActive && styles.chipTextActive]}>{f}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 10 },
  scroll: { paddingHorizontal: 16, gap: 8 },
  chip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E8D8B8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  chipActive: {
    backgroundColor: GOLD,
    borderColor: GOLD,
    shadowColor: GOLD,
    shadowOpacity: 0.35,
    elevation: 4,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: DARK_BROWN },
  chipTextActive: { color: DARK_BROWN, fontWeight: '700' },
});
