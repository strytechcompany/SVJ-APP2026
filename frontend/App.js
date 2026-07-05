import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/context/AuthContext';
import { DashboardProvider } from './src/context/DashboardContext';
import { StockProvider } from './src/context/StockContext';
import { CustomerProvider } from './src/context/CustomerContext';
import { TransactionProvider } from './src/context/TransactionContext';
import { ExpenseProvider } from './src/context/ExpenseContext';
import { SettingsProvider } from './src/context/SettingsContext';
import { OrderProvider } from './src/context/OrderContext';
import AppNavigator from './src/navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <DashboardProvider>
            <StockProvider>
              <CustomerProvider>
                <TransactionProvider>
                  <ExpenseProvider>
                    <OrderProvider>
                      <AppNavigator />
                    </OrderProvider>
                  </ExpenseProvider>
                </TransactionProvider>
              </CustomerProvider>
            </StockProvider>
          </DashboardProvider>
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
