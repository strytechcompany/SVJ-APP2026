import React from 'react';
import { View, TextInput, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';

export default function CustomerSearchBar({ value, onChangeText, onClear }) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder="Search name, phone, code..."
        placeholderTextColor="#C4A97A"
        returnKeyType="search"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {value.length > 0 && (
        <TouchableOpacity onPress={onClear} activeOpacity={0.7} style={styles.clearBtn}>
          <MaterialCommunityIcons name="close-circle" size={18} color="#C4A97A" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E8D8B8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  icon: { marginRight: 10 },
  input: {
    flex: 1,
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '500',
    height: '100%',
  },
  clearBtn: { padding: 4, marginLeft: 6 },
});
