import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';

// Auth
import LoginScreen from '../screens/LoginScreen';

// Main tabs
import DashboardScreen from '../screens/dashboard/DashboardScreen';
import SettingsScreen from '../screens/settings/SettingsScreen';
import {
  AddScreen,
  SuspenseScreen,
} from '../screens/placeholders/PlaceholderScreens';

// Reports Module
import ReportsScreen from '../screens/reports/ReportsScreen';
import CashLedgerScreen from '../screens/reports/CashLedgerScreen';

// Stock module
import StockManagementScreen from '../screens/stock/StockManagementScreen';
import AddStockScreen from '../screens/stock/AddStockScreen';
import StockDetailScreen from '../screens/stock/StockDetailScreen';

// Customer module
import CustomerListScreen from '../screens/customers/CustomerListScreen';
import CreateCustomerScreen from '../screens/customers/CreateCustomerScreen';
import CustomerDetailScreen from '../screens/customers/CustomerDetailScreen';
import EditCustomerScreen from '../screens/customers/EditCustomerScreen';

// Other placeholder modules
import ChitFundScreen from '../screens/chits/ChitFundScreen';
import ChitBillPreviewScreen from '../screens/chits/ChitBillPreviewScreen';
import ChitCustomerDetailScreen from '../screens/chits/ChitCustomerDetailScreen';
import ExpenseScreen from '../screens/expenses/ExpenseScreen';
import ExpenseDetailScreen from '../screens/expenses/ExpenseDetailScreen';
import { ExpensesScreen } from '../screens/placeholders/PlaceholderScreens';

// Transactions module
import TransactionListScreen from '../screens/transactions/TransactionListScreen';
import TransactionCalculationScreen from '../screens/transactions/TransactionCalculationScreen';
import BillPreviewScreen from '../screens/transactions/BillPreviewScreen';
import BillPreviewPlaceholderScreen from '../screens/transactions/BillPreviewPlaceholderScreen';
import TransactionManagementScreen from '../screens/transactions/TransactionManagementScreen';
import SettlementPreviewScreen from '../screens/transactions/SettlementPreviewScreen';

// Line Stock module

import LineStockDashboardScreen from '../screens/linestock/LineStockDashboardScreen';
import IssueLineStockScreen from '../screens/linestock/IssueLineStockScreen';
import LineStockBillPreviewScreen from '../screens/linestock/LineStockBillPreviewScreen';
import LineStockSettlementScreen from '../screens/linestock/LineStockSettlementScreen';
import LineStockSettlementBillPreviewScreen from '../screens/linestock/LineStockSettlementBillPreviewScreen';

// Settings sub-screens
import AddMemberScreen from '../screens/settings/AddMemberScreen';

// Orders module
import OrdersScreen from '../screens/orders/OrdersScreen';
import CustomerSearchScreen from '../screens/orders/CustomerSearchScreen';
import CreateOrderScreen from '../screens/orders/CreateOrderScreen';
import OrderBillPreviewScreen from '../screens/orders/OrderBillPreviewScreen';

// Balance Summary module (Old Balance / Advance Balance)
import OldBalanceCustomerList from '../screens/balance/OldBalanceCustomerList';
import OldBalanceHistory from '../screens/balance/OldBalanceHistory';
import OldBalanceSettlement from '../screens/balance/OldBalanceSettlement';
import OldBalanceSettlementPreview from '../screens/balance/OldBalanceSettlementPreview';
import OldBalanceSettlementHistory from '../screens/balance/OldBalanceSettlementHistory';
import AdvanceBalanceCustomerList from '../screens/balance/AdvanceBalanceCustomerList';
import AdvanceBalanceHistory from '../screens/balance/AdvanceBalanceHistory';
import AdvanceBalanceSettlement from '../screens/balance/AdvanceBalanceSettlement';
import AdvanceBalanceSettlementPreview from '../screens/balance/AdvanceBalanceSettlementPreview';
import AdvanceBalanceSettlementHistory from '../screens/balance/AdvanceBalanceSettlementHistory';

// Custom bottom bar
import BottomTabBar from '../components/BottomTabBar';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      tabBar={(props) => <BottomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Orders" component={OrdersScreen} />
      <Tab.Screen name="Add" component={AddScreen} />
      <Tab.Screen name="Stocks" component={StockManagementScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F8F4E8' }}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right' }}>
        {user ? (
          <>
            <Stack.Screen name="Main" component={MainTabs} />

            {/* ─── Stock Module ─── */}
            <Stack.Screen name="StockManagement" component={StockManagementScreen} />
            <Stack.Screen name="AddStock" component={AddStockScreen} />
            <Stack.Screen name="StockDetail" component={StockDetailScreen} />

            {/* Transactions */}
            <Stack.Screen name="TransactionManagement" component={TransactionManagementScreen} />
            <Stack.Screen name="TransactionList" component={TransactionListScreen} />
            <Stack.Screen name="TransactionCalculation" component={TransactionCalculationScreen} />
            {/* BillPreview = real bill screen; BillPreviewPlaceholder = redirect shim used by TransactionManagement */}
            <Stack.Screen name="BillPreview" component={BillPreviewScreen} />
            <Stack.Screen name="BillPreviewPlaceholder" component={BillPreviewPlaceholderScreen} />
            <Stack.Screen name="SettlementPreview" component={SettlementPreviewScreen} />
            <Stack.Screen name="EditCustomer" component={EditCustomerScreen} />

            {/* ─── Line Stock Module ─── */}
            <Stack.Screen name="LineStockDashboard" component={LineStockDashboardScreen} />
            <Stack.Screen name="IssueLineStock" component={IssueLineStockScreen} />
            <Stack.Screen name="LineStockBillPreview" component={LineStockBillPreviewScreen} />
            <Stack.Screen name="LineStockSettlement" component={LineStockSettlementScreen} />
            <Stack.Screen name="LineStockSettlementBillPreview" component={LineStockSettlementBillPreviewScreen} />

            {/* ─── Balance Summary Module ─── */}
            <Stack.Screen name="OldBalanceCustomerList" component={OldBalanceCustomerList} />
            <Stack.Screen name="OldBalanceHistory" component={OldBalanceHistory} />
            <Stack.Screen name="OldBalanceSettlement" component={OldBalanceSettlement} />
            <Stack.Screen name="OldBalanceSettlementPreview" component={OldBalanceSettlementPreview} />
            <Stack.Screen name="OldBalanceSettlementHistory" component={OldBalanceSettlementHistory} />
            <Stack.Screen name="AdvanceBalanceCustomerList" component={AdvanceBalanceCustomerList} />
            <Stack.Screen name="AdvanceBalanceHistory" component={AdvanceBalanceHistory} />
            <Stack.Screen name="AdvanceBalanceSettlement" component={AdvanceBalanceSettlement} />
            <Stack.Screen name="AdvanceBalanceSettlementPreview" component={AdvanceBalanceSettlementPreview} />
            <Stack.Screen name="AdvanceBalanceSettlementHistory" component={AdvanceBalanceSettlementHistory} />

            {/* ─── Other Modules ─── */}
            <Stack.Screen name="ChitFund" component={ChitFundScreen} />
            <Stack.Screen name="ChitBillPreview" component={ChitBillPreviewScreen} />
            <Stack.Screen name="ChitCustomerDetail" component={ChitCustomerDetailScreen} />
            <Stack.Screen name="Expenses" component={ExpenseScreen} />
            <Stack.Screen name="ExpenseDetail" component={ExpenseDetailScreen} />
            <Stack.Screen name="Suspense" component={SuspenseScreen} />

            {/* Reports Module */}
            <Stack.Screen name="ReportsStack" component={ReportsScreen} />
            <Stack.Screen name="CashLedger" component={CashLedgerScreen} />

            {/* Settings Sub-screens */}
            <Stack.Screen name="AddMember" component={AddMemberScreen} />

            {/* Orders Module */}
            <Stack.Screen name="Orders" component={OrdersScreen} />
            <Stack.Screen name="OrderCustomerSearch" component={CustomerSearchScreen} />
            <Stack.Screen name="CreateOrder" component={CreateOrderScreen} />
            <Stack.Screen name="OrderBillPreview" component={OrderBillPreviewScreen} />

            {/* Customers Module */}
            <Stack.Screen name="Customers" component={CustomerListScreen} />
            <Stack.Screen name="CreateCustomer" component={CreateCustomerScreen} />
            <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />

            {/* Transactions Module */}
            <Stack.Screen
              name="B2C"
              component={TransactionListScreen}
              initialParams={{ type: 'B2C' }}
            />
            <Stack.Screen
              name="B2CCalculation"
              component={TransactionCalculationScreen}
              initialParams={{ type: 'B2C' }}
            />
            <Stack.Screen
              name="B2D"
              component={TransactionListScreen}
              initialParams={{ type: 'B2D' }}
            />
            <Stack.Screen
              name="B2DCalculation"
              component={TransactionCalculationScreen}
              initialParams={{ type: 'B2D' }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
