import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, TextInput, ActivityIndicator, SafeAreaView, StatusBar, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getChitCustomers } from '../../services/chitService';
import ChitCard from './ChitCard';
import AddChitCustomerModal from './AddChitCustomerModal';
import PayInstallmentModal from './PayInstallmentModal';

// Current Gold Rate for the dashboard context
const MOCK_GOLD_RATE = 14400; // Will fetch from Dashboard service normally

export default function ChitFundScreen({ navigation }) {
  const [activeTab, setActiveTab] = useState('ACTIVE'); // 'ACTIVE' | 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  const [isAddModalVisible, setAddModalVisible] = useState(false);
  const [isPayModalVisible, setPayModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await getChitCustomers(activeTab, searchQuery);
      if (response.success) {
        setCustomers(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch chit customers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeTab, searchQuery]);

  useEffect(() => {
    setLoading(true);
    fetchCustomers();
  }, [fetchCustomers]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchCustomers();
  };

  const handlePayClick = (customer) => {
    setSelectedCustomer(customer);
    setPayModalVisible(true);
  };

  const handlePaymentSuccess = (transaction) => {
    setPayModalVisible(false);
    fetchCustomers();
    if (transaction) {
      navigation.navigate('ChitBillPreview', { transaction, customer: selectedCustomer });
    }
  };

  const handleAddSuccess = () => {
    setAddModalVisible(false);
    fetchCustomers();
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8F4E8" />
      
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <Ionicons name="arrow-back" size={24} color="#5C4033" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Chit Fund</Text>
        <TouchableOpacity onPress={onRefresh} style={styles.headerBtn}>
          <Ionicons name="refresh" size={24} color="#5C4033" />
        </TouchableOpacity>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color="#8A8A8A" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone or group ID..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#8A8A8A"
        />
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'ACTIVE' && styles.activeTab]}
          onPress={() => setActiveTab('ACTIVE')}
        >
          <Text style={[styles.tabText, activeTab === 'ACTIVE' && styles.activeTabText]}>Active Chits</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'COMPLETED' && styles.activeTab]}
          onPress={() => setActiveTab('COMPLETED')}
        >
          <Text style={[styles.tabText, activeTab === 'COMPLETED' && styles.activeTabText]}>Completed Chits</Text>
        </TouchableOpacity>
      </View>

      {/* List */}
      {loading && !refreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#D4AF37" />
        </View>
      ) : customers.length === 0 ? (
        <View style={styles.centerContainer}>
          <Text style={styles.emptyText}>No {activeTab.toLowerCase()} chits found.</Text>
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <ChitCard 
              customer={item} 
              onPayPress={() => handlePayClick(item)} 
              isCompleted={activeTab === 'COMPLETED'}
            />
          )}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#D4AF37" />
          }
        />
      )}

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab} onPress={() => setAddModalVisible(true)}>
        <Ionicons name="add" size={32} color="#FFF" />
      </TouchableOpacity>

      {/* Modals */}
      <AddChitCustomerModal
        visible={isAddModalVisible}
        onClose={() => setAddModalVisible(false)}
        onSuccess={handleAddSuccess}
      />
      
      {selectedCustomer && (
        <PayInstallmentModal
          visible={isPayModalVisible}
          onClose={() => setPayModalVisible(false)}
          onSuccess={handlePaymentSuccess}
          customer={selectedCustomer}
          currentGoldRate={MOCK_GOLD_RATE}
        />
      )}

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F4E8',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#BFA85D',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  headerBtn: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    margin: 16,
    borderRadius: 12,
    paddingHorizontal: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 16,
    color: '#333',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: '#EAE1C8',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#D4AF37',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#7A6B43',
  },
  activeTabText: {
    color: '#FFF',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#8A8A8A',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#D4AF37',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
});
