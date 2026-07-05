import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, RefreshControl, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import { useDashboard } from '../../context/DashboardContext';
import AppHeader from '../../components/AppHeader';
import GoldRateCard from '../../components/GoldRateCard';
import QuickAccessGrid from '../../components/QuickAccessGrid';
import RecentTransactionsList from '../../components/RecentTransactionsList';
import DashboardExpenseCard from '../../components/DashboardExpenseCard';
import Sidebar from '../../components/Sidebar';

const BG = '#F8F4E8';

export default function DashboardScreen({ navigation }) {
  const { logout } = useAuth();
  const { fetchDashboardData, loading } = useDashboard();
  const [sidebarVisible, setSidebarVisible] = useState(false);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleLogout = async () => {
    await logout();
  };

  return (
    <View style={styles.container}>
      <Sidebar 
        visible={sidebarVisible} 
        onClose={() => setSidebarVisible(false)} 
        navigation={navigation}
        onLogout={handleLogout}
      />
      
      <AppHeader
        title="Sri Vaishnavi Jewellers"
        onMenuPress={() => setSidebarVisible(true)}
        onLogoutPress={handleLogout}
        onRefreshPress={fetchDashboardData}
      />

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={fetchDashboardData}
            colors={['#D4AF37']}
            tintColor="#D4AF37"
          />
        }
      >
        <GoldRateCard />
        <QuickAccessGrid navigation={navigation} />
        <DashboardExpenseCard navigation={navigation} />
        <RecentTransactionsList />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 16,
  },
});
