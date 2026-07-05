import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useExpense } from '../../context/ExpenseContext';
import ExpenseCard from './ExpenseCard';
import AddExpenseModal from './AddExpenseModal';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';

export default function ExpenseScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    expenses,
    summary,
    loading,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    dateFilter,
    setDateFilter,
    fetchExpenses,
    removeExpense
  } = useExpense();

  const [modalVisible, setModalVisible] = useState(false);
  const [expenseToEdit, setExpenseToEdit] = useState(null);

  const handleDelete = (id) => {
    Alert.alert('Delete Expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => removeExpense(id) }
    ]);
  };

  const handleEdit = (expense) => {
    setExpenseToEdit(expense);
    setModalVisible(true);
  };

  const handleAdd = () => {
    setExpenseToEdit(null);
    setModalVisible(true);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Expenses</Text>
        <TouchableOpacity onPress={() => fetchExpenses(true)} style={styles.headerBtn}>
          <MaterialCommunityIcons name="refresh" size={24} color={GOLD} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={expenses}
        keyExtractor={item => item._id}
        renderItem={({ item }) => <ExpenseCard expense={item} onEdit={handleEdit} onDelete={handleDelete} />}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Summary Cards */}
            <View style={styles.summaryContainer}>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>Today's Expense</Text>
                <Text style={styles.summaryValue}>₹{summary.todayTotal?.toLocaleString('en-IN') || 0}</Text>
              </View>
              <View style={styles.summaryCard}>
                <Text style={styles.summaryLabel}>This Month</Text>
                <Text style={styles.summaryValue}>₹{summary.monthTotal?.toLocaleString('en-IN') || 0}</Text>
              </View>
            </View>

            {/* Search */}
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#888" style={styles.searchIcon} />
              <TextInput 
                style={styles.searchInput}
                placeholder="Search expense name..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                onSubmitEditing={() => fetchExpenses()}
              />
            </View>

            {/* Type Filters */}
            <View style={styles.filtersWrapper}>
              <FlatList 
                horizontal
                showsHorizontalScrollIndicator={false}
                data={['All', 'Daily', 'Monthly']}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.filterChip, typeFilter === item && styles.activeFilterChip]}
                    onPress={() => { setTypeFilter(item); fetchExpenses(); }}
                  >
                    <Text style={[styles.filterText, typeFilter === item && styles.activeFilterText]}>{item}</Text>
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              />
            </View>

            {/* Date Filters */}
            <View style={[styles.filtersWrapper, { marginBottom: 16 }]}>
              <FlatList 
                horizontal
                showsHorizontalScrollIndicator={false}
                data={['All', 'Current Month', 'Current Year']}
                keyExtractor={(item) => item}
                renderItem={({ item }) => (
                  <TouchableOpacity 
                    style={[styles.filterChip, dateFilter === item && styles.activeFilterChip]}
                    onPress={() => { setDateFilter(item); fetchExpenses(); }}
                  >
                    <Text style={[styles.filterText, dateFilter === item && styles.activeFilterText]}>{item}</Text>
                  </TouchableOpacity>
                )}
                contentContainerStyle={{ paddingHorizontal: 16 }}
              />
            </View>

            {loading && <ActivityIndicator size="large" color={GOLD} style={{marginTop: 20}} />}
          </>
        }
        ListEmptyComponent={
          !loading && <Text style={styles.emptyText}>No expenses found.</Text>
        }
      />

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={handleAdd} activeOpacity={0.8}>
        <MaterialCommunityIcons name="plus" size={30} color={DARK_BROWN} />
      </TouchableOpacity>

      {/* Modal */}
      <AddExpenseModal 
        visible={modalVisible} 
        onClose={() => setModalVisible(false)} 
        expenseToEdit={expenseToEdit} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, backgroundColor: DARK_BROWN },
  headerBtn: { padding: 4 },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: GOLD },
  
  summaryContainer: { flexDirection: 'row', padding: 16, gap: 12 },
  summaryCard: { flex: 1, backgroundColor: '#FFF', padding: 16, borderRadius: 12, elevation: 3, alignItems: 'center', borderWidth: 1, borderColor: '#F0E6D2' },
  summaryLabel: { fontSize: 12, color: '#888', fontWeight: 'bold', marginBottom: 4 },
  summaryValue: { fontSize: 18, fontWeight: '900', color: '#D32F2F' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, borderRadius: 12, paddingHorizontal: 12, height: 46, elevation: 2, marginBottom: 12 },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontSize: 14, color: '#333' },

  filtersWrapper: { marginBottom: 10, height: 36 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#FFF', marginRight: 8, elevation: 1, borderWidth: 1, borderColor: '#EEE' },
  activeFilterChip: { backgroundColor: GOLD, borderColor: GOLD },
  filterText: { fontSize: 12, fontWeight: '600', color: '#666' },
  activeFilterText: { color: DARK_BROWN },

  listContent: { paddingBottom: 100 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 40 },

  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: GOLD,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  }
});
