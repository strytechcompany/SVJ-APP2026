import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';

export default function ExpenseDetailScreen({ route, navigation }) {
  const { expense } = route.params;

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expense Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <View style={styles.topSection}>
            <Text style={styles.expenseName}>{expense.expenseName}</Text>
            <View style={[styles.badge, { backgroundColor: expense.expenseType === 'Daily' ? '#E3F2FD' : '#F3E5F5' }]}>
              <Text style={[styles.badgeText, { color: expense.expenseType === 'Daily' ? '#1565C0' : '#7B1FA2' }]}>
                {expense.expenseType}
              </Text>
            </View>
          </View>

          <Text style={styles.amount}>₹{expense.amount.toLocaleString('en-IN')}</Text>

          <View style={styles.divider} />

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="calendar" size={20} color="#888" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Expense Date</Text>
              <Text style={styles.infoValue}>{new Date(expense.expenseDate).toLocaleDateString('en-GB')}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="account" size={20} color="#888" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Created By</Text>
              <Text style={styles.infoValue}>{expense.createdBy?.name || 'System / Admin'}</Text>
            </View>
          </View>

          <View style={styles.infoRow}>
            <MaterialCommunityIcons name="clock-outline" size={20} color="#888" />
            <View style={styles.infoTextContainer}>
              <Text style={styles.infoLabel}>Created At</Text>
              <Text style={styles.infoValue}>
                {new Date(expense.createdAt).toLocaleDateString('en-GB')} {new Date(expense.createdAt).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}
              </Text>
            </View>
          </View>

          {expense.notes ? (
            <>
              <View style={styles.divider} />
              <View style={styles.notesContainer}>
                <Text style={styles.infoLabel}>Notes / Description</Text>
                <Text style={styles.notesValue}>{expense.notes}</Text>
              </View>
            </>
          ) : null}

        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: DARK_BROWN },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: GOLD },
  content: { padding: 16 },
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  topSection: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  expenseName: { fontSize: 22, fontWeight: '900', color: '#333', flex: 1, marginRight: 10 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  badgeText: { fontSize: 12, fontWeight: 'bold' },
  amount: { fontSize: 32, fontWeight: '900', color: '#D32F2F', marginBottom: 20 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 16 },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  infoTextContainer: { marginLeft: 12 },
  infoLabel: { fontSize: 12, color: '#888', marginBottom: 2 },
  infoValue: { fontSize: 16, fontWeight: '600', color: '#333' },
  notesContainer: { marginTop: 4 },
  notesValue: { fontSize: 15, color: '#555', marginTop: 8, lineHeight: 22, fontStyle: 'italic' },
});
