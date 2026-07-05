import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { expenseAPI } from '../services/expenseService';
import { Alert } from 'react-native';

const ExpenseContext = createContext(null);

export const ExpenseProvider = ({ children }) => {
  const [expenses, setExpenses] = useState([]);
  const [summary, setSummary] = useState({ todayTotal: 0, monthTotal: 0, yearTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('All'); // 'All', 'Daily', 'Monthly'
  const [dateFilter, setDateFilter] = useState('All'); // 'All', 'Current Month', 'Current Year'

  const fetchExpenses = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const [listRes, summaryRes] = await Promise.all([
        expenseAPI.getAll({ type: typeFilter, filter: dateFilter, search: searchQuery }),
        expenseAPI.getSummary()
      ]);

      if (listRes.success) {
        setExpenses(listRes.data);
      }
      if (summaryRes.success) {
        setSummary(summaryRes.data);
      }
    } catch (error) {
      console.error('Failed to fetch expenses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [typeFilter, dateFilter, searchQuery]);

  // Initial load
  useEffect(() => {
    fetchExpenses();
  }, [fetchExpenses]);

  const addExpense = async (data) => {
    try {
      const res = await expenseAPI.create(data);
      if (res.success) {
        await fetchExpenses();
        return true;
      }
      return false;
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to add expense');
      return false;
    }
  };

  const editExpense = async (id, data) => {
    try {
      const res = await expenseAPI.update(id, data);
      if (res.success) {
        await fetchExpenses();
        return true;
      }
      return false;
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to update expense');
      return false;
    }
  };

  const removeExpense = async (id) => {
    try {
      const res = await expenseAPI.delete(id);
      if (res.success) {
        await fetchExpenses();
        return true;
      }
      return false;
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to delete expense');
      return false;
    }
  };

  return (
    <ExpenseContext.Provider
      value={{
        expenses,
        summary,
        loading,
        refreshing,
        searchQuery,
        setSearchQuery,
        typeFilter,
        setTypeFilter,
        dateFilter,
        setDateFilter,
        fetchExpenses,
        addExpense,
        editExpense,
        removeExpense
      }}
    >
      {children}
    </ExpenseContext.Provider>
  );
};

export const useExpense = () => useContext(ExpenseContext);
