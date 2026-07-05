import React from 'react';
import { View, TextInput, StyleSheet, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';

export default function CustomerSearchCard({ value, onChangeText, loading }) {
  return (
    <View style={styles.searchCard}>
      <MaterialCommunityIcons name="magnify" size={24} color={GOLD} />
      <TextInput
        style={styles.searchInput}
        placeholder="Search Customer Name or Phone Number"
        placeholderTextColor="#B09878"
        value={value}
        onChangeText={onChangeText}
        autoCapitalize="none"
        autoCorrect={false}
      />
      {loading ? (
        <ActivityIndicator size="small" color={GOLD} />
      ) : value.length > 0 ? (
        <MaterialCommunityIcons
          name="close-circle"
          size={20}
          color="#B09878"
          onPress={() => onChangeText('')}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F5EFE6',
  },
  searchInput: {
    flex: 1,
    marginLeft: 10,
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '600',
  },
});
