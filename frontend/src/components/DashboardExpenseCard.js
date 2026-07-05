import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDashboard } from '../context/DashboardContext';

export default function DashboardExpenseCard({ navigation }) {
  const { expenseSummary } = useDashboard();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Expense Summary</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Expenses')}>
          <Text style={styles.linkText}>Manage <MaterialCommunityIcons name="chevron-right" size={14} /></Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.row}>
        <View style={styles.box}>
          <Text style={styles.label}>Today's Expense</Text>
          <Text style={styles.value}>₹{(expenseSummary?.todayTotal || 0).toLocaleString('en-IN')}</Text>
        </View>
        <View style={[styles.box, { borderLeftWidth: 1, borderColor: '#EEE' }]}>
          <Text style={styles.label}>This Month</Text>
          <Text style={styles.value}>₹{(expenseSummary?.monthTotal || 0).toLocaleString('en-IN')}</Text>
        </View>
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
    borderColor: '#F0E6D2'
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 16, fontWeight: '800', color: '#3D2200' },
  linkText: { fontSize: 13, fontWeight: 'bold', color: '#D4AF37' },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  box: { flex: 1, alignItems: 'center' },
  label: { fontSize: 11, color: '#888', textTransform: 'uppercase', marginBottom: 4 },
  value: { fontSize: 18, fontWeight: '900', color: '#D32F2F' }
});
