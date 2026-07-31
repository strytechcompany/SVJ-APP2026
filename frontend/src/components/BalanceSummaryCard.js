import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function BalanceSummaryCard({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Balance Summary</Text>
      <View style={styles.row}>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#FDECEA' }]}
          onPress={() => navigation.navigate('OldBalanceCustomerList')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="cash-minus" size={22} color="#D32F2F" />
          <Text style={[styles.btnText, { color: '#D32F2F' }]}>Old Balance</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#E8F5E9' }]}
          onPress={() => navigation.navigate('AdvanceBalanceCustomerList')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="cash-plus" size={22} color="#2E7D32" />
          <Text style={[styles.btnText, { color: '#2E7D32' }]}>Advance Balance</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 16,
    marginTop: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#F0E6D2',
  },
  title: { fontSize: 16, fontWeight: '800', color: '#3D2200', marginBottom: 14 },
  row: { flexDirection: 'row', gap: 12 },
  btn: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16, borderRadius: 12, gap: 6 },
  btnText: { fontSize: 13, fontWeight: '700' },
});
