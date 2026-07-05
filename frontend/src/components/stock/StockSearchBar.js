import React from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

export default function StockSearchBar({ value, onChangeText, onClear }) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={styles.icon} />
      <TextInput
        style={styles.input}
        placeholder="Search Design / Item Number"
        placeholderTextColor="#B09878"
        value={value}
        onChangeText={onChangeText}
        returnKeyType="search"
        clearButtonMode="never"
        autoCorrect={false}
        autoCapitalize="none"
      />
      {(value?.length > 0) && (
        <TouchableOpacity onPress={onClear} activeOpacity={0.7} style={styles.clearBtn}>
          <MaterialCommunityIcons name="close-circle" size={18} color="#B09878" />
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
    borderColor: '#E5D8C0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
  },
  icon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '500',
    height: '100%',
  },
  clearBtn: {
    padding: 4,
    marginLeft: 6,
  },
});
