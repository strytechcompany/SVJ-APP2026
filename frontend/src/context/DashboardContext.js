import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { dashboardAPI } from '../services/api';
import { expenseAPI } from '../services/expenseService';
import { useSettings } from './SettingsContext';

const DashboardContext = createContext();

export const DashboardProvider = ({ children }) => {
  const { settings, updateSettings } = useSettings();
  const [goldRate, setGoldRate] = useState(null);
  const [recentIssued, setRecentIssued] = useState([]);
  const [expenseSummary, setExpenseSummary] = useState({ todayTotal: 0, monthTotal: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (settings && settings.goldRate) {
      setGoldRate({
        rate: settings.goldRate.ratePerGram,
        date: settings.goldRate.updatedAt,
      });
    }
  }, [settings]);

  const fetchGoldRate = useCallback(async () => {
    // Handled by SettingsContext now
  }, []);

  const updateGoldRate = useCallback(async (rate, effectiveDate) => {
    await updateSettings({ goldRate: { ratePerGram: rate } });
    return { success: true };
  }, [updateSettings]);

  const fetchRecentIssued = useCallback(async () => {
    try {
      const res = await dashboardAPI.getRecentIssued();
      if (res.data.success) {
        setRecentIssued(res.data.data);
      }
    } catch (err) {
      console.error('fetchRecentIssued error:', err.message);
    }
  }, []);

  const fetchExpenseSummary = useCallback(async () => {
    try {
      const res = await expenseAPI.getSummary();
      if (res.success) {
        setExpenseSummary(res.data);
      }
    } catch (err) {
      console.error('fetchExpenseSummary error:', err.message);
    }
  }, []);

  const fetchDashboardData = useCallback(async ({ retry = true } = {}) => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([fetchGoldRate(), fetchRecentIssued(), fetchExpenseSummary()]);
    } catch (err) {
      setError(err.message);
      if (retry) {
        setTimeout(() => fetchDashboardData({ retry: true }), 10000);
      }
    } finally {
      setLoading(false);
    }
  }, [fetchGoldRate, fetchRecentIssued, fetchExpenseSummary]);

  return (
    <DashboardContext.Provider
      value={{
        goldRate,
        recentIssued,
        expenseSummary,
        loading,
        error,
        fetchDashboardData,
        fetchGoldRate,
        updateGoldRate,
        fetchRecentIssued,
        fetchExpenseSummary,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = () => useContext(DashboardContext);
