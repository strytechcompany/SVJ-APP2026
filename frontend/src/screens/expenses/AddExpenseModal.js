import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useExpense } from '../../context/ExpenseContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';

export default function AddExpenseModal({ visible, onClose, expenseToEdit }) {
  const { addExpense, editExpense } = useExpense();
  
  const [expenseName, setExpenseName] = useState('');
  const [amount, setAmount] = useState('');
  const [expenseType, setExpenseType] = useState('Daily');
  const [notes, setNotes] = useState('');
  const [expenseDate, setExpenseDate] = useState(new Date());
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (visible) {
      if (expenseToEdit) {
        setExpenseName(expenseToEdit.expenseName);
        setAmount(String(expenseToEdit.amount));
        setExpenseType(expenseToEdit.expenseType);
        setNotes(expenseToEdit.notes || '');
        setExpenseDate(new Date(expenseToEdit.expenseDate));
      } else {
        setExpenseName('');
        setAmount('');
        setExpenseType('Daily');
        setNotes('');
        setExpenseDate(new Date());
      }
    }
  }, [visible, expenseToEdit]);

  const handleSave = async () => {
    if (!expenseName.trim() || !amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid expense name and amount > 0.');
      return;
    }

    setIsSubmitting(true);
    const data = {
      expenseName,
      expenseDate,
      expenseType,
      amount: Number(amount),
      notes
    };

    let success;
    if (expenseToEdit) {
      success = await editExpense(expenseToEdit._id, data);
    } else {
      success = await addExpense(data);
    }
    
    setIsSubmitting(false);
    if (success) onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.title}>{expenseToEdit ? 'Edit Expense' : 'Add Expense'}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color={DARK_BROWN} />
            </TouchableOpacity>
          </View>
          
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Expense Name *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. Electricity Bill, Tea..." 
              value={expenseName} 
              onChangeText={setExpenseName} 
            />

            <Text style={styles.label}>Amount (₹) *</Text>
            <TextInput 
              style={styles.input} 
              placeholder="e.g. 500" 
              value={amount} 
              onChangeText={setAmount} 
              keyboardType="numeric" 
            />

            <Text style={styles.label}>Expense Type *</Text>
            <View style={styles.typeRow}>
              {['Daily', 'Monthly'].map(type => (
                <TouchableOpacity 
                  key={type} 
                  style={[styles.typeBtn, expenseType === type && styles.typeBtnActive]}
                  onPress={() => setExpenseType(type)}
                >
                  <Text style={[styles.typeBtnText, expenseType === type && styles.typeBtnTextActive]}>{type}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Expense Date *</Text>
            <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
              <MaterialCommunityIcons name="calendar" size={20} color="#888" style={{marginRight: 8}} />
              <Text style={styles.dateText}>{expenseDate.toLocaleDateString('en-GB')}</Text>
            </TouchableOpacity>
            
            {showDatePicker && (
              <DateTimePicker
                value={expenseDate}
                mode="date"
                display="default"
                onChange={(event, selectedDate) => {
                  setShowDatePicker(false);
                  if (selectedDate) setExpenseDate(selectedDate);
                }}
              />
            )}

            <Text style={styles.label}>Notes / Description</Text>
            <TextInput 
              style={[styles.input, styles.textArea]} 
              placeholder="Optional description..." 
              value={notes} 
              onChangeText={setNotes} 
              multiline 
              numberOfLines={3} 
              textAlignVertical="top"
            />
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={isSubmitting}>
              <Text style={styles.saveBtnText}>{isSubmitting ? 'Saving...' : 'Save Expense'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderColor: '#EEE' },
  title: { fontSize: 18, fontWeight: '800', color: DARK_BROWN },
  closeBtn: { padding: 4 },
  body: { padding: 16 },
  label: { fontSize: 12, fontWeight: 'bold', color: '#666', marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#333' },
  textArea: { height: 80 },
  typeRow: { flexDirection: 'row', gap: 10 },
  typeBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, borderColor: '#DDD', alignItems: 'center' },
  typeBtnActive: { backgroundColor: 'rgba(212,175,55,0.1)', borderColor: GOLD },
  typeBtnText: { fontSize: 14, fontWeight: '600', color: '#666' },
  typeBtnTextActive: { color: DARK_BROWN },
  dateBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#DDD', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 12 },
  dateText: { fontSize: 15, color: '#333' },
  footer: { padding: 16, borderTopWidth: 1, borderColor: '#EEE', paddingBottom: 30 },
  saveBtn: { backgroundColor: GOLD, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnText: { color: DARK_BROWN, fontSize: 16, fontWeight: '800' }
});
