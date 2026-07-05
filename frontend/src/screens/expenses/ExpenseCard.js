import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

export default function ExpenseCard({ expense, onEdit, onDelete }) {
  const navigation = useNavigation();

  return (
    <TouchableOpacity 
      style={styles.card}
      activeOpacity={0.8}
      onPress={() => navigation.navigate('ExpenseDetail', { expense })}
    >
      <View style={styles.headerRow}>
        <View style={styles.titleContainer}>
          <Text style={styles.title} numberOfLines={1}>{expense.expenseName}</Text>
          <View style={[styles.badge, { backgroundColor: expense.expenseType === 'Daily' ? '#E3F2FD' : '#F3E5F5' }]}>
            <Text style={[styles.badgeText, { color: expense.expenseType === 'Daily' ? '#1565C0' : '#7B1FA2' }]}>
              {expense.expenseType}
            </Text>
          </View>
        </View>
        <Text style={styles.amount}>₹{expense.amount.toLocaleString('en-IN')}</Text>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.dateContainer}>
          <MaterialCommunityIcons name="calendar" size={14} color="#888" />
          <Text style={styles.date}>{new Date(expense.expenseDate).toLocaleDateString('en-GB')}</Text>
        </View>
        
        <View style={styles.actionsContainer}>
          <TouchableOpacity onPress={() => onEdit(expense)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="pencil" size={18} color="#1565C0" />
          </TouchableOpacity>
          {/* Note: In a real app we check role here. For now we expose delete to test UI */}
          <TouchableOpacity onPress={() => onDelete(expense._id)} style={styles.iconBtn}>
            <MaterialCommunityIcons name="delete" size={18} color="#D32F2F" />
          </TouchableOpacity>
        </View>
      </View>

      {expense.notes ? (
        <Text style={styles.notes} numberOfLines={1}>{expense.notes}</Text>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#F0E6D2'
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 },
  titleContainer: { flex: 1, marginRight: 10 },
  title: { fontSize: 16, fontWeight: '800', color: '#333', marginBottom: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 10, fontWeight: 'bold' },
  amount: { fontSize: 16, fontWeight: '800', color: '#D32F2F' },
  detailsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dateContainer: { flexDirection: 'row', alignItems: 'center' },
  date: { fontSize: 12, color: '#666', marginLeft: 4 },
  actionsContainer: { flexDirection: 'row', gap: 12 },
  iconBtn: { padding: 4 },
  notes: { fontSize: 12, color: '#888', marginTop: 8, fontStyle: 'italic' }
});
