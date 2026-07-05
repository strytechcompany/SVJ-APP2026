import React, { createContext, useContext, useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';
import { Alert } from 'react-native';
import { useAuth } from './AuthContext';

const SettingsContext = createContext();

export function SettingsProvider({ children }) {
  const { token } = useAuth();
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchSettings = async ({ retry = true } = {}) => {
    setLoading(true);
    try {
      const res = await settingsAPI.getSettings();
      if (res.data && res.data.data) {
        setSettings(res.data.data);
      }
    } catch (error) {
      console.error('Failed to fetch global settings:', error);
      if (retry) {
        setTimeout(() => fetchSettings({ retry: true }), 10000);
      }
    } finally {
      setLoading(false);
    }
  };

  const updateSettings = async (updates) => {
    try {
      const res = await settingsAPI.updateSettings(updates);
      if (res.data && res.data.data) {
        setSettings(res.data.data);
        return true;
      }
    } catch (error) {
      console.error('Failed to update settings:', error);
      Alert.alert('Error', 'Failed to save settings.');
      return false;
    }
  };

  useEffect(() => {
    if (token) {
      fetchSettings();
    } else {
      setLoading(false);
    }
  }, [token]);

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, refreshSettings: fetchSettings, loading }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext);
}
