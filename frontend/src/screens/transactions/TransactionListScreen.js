import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  StatusBar,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import CustomerSearchCard from '../../components/transactions/CustomerSearchCard';
import TransactionCustomerCard from '../../components/transactions/TransactionCustomerCard';
import { customerAPI } from '../../services/api';
import { useTransaction } from '../../context/TransactionContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

export default function TransactionListScreen({ route, navigation }) {
  const { type } = route.params; // 'B2C', 'B2D'
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const { startTransaction } = useTransaction();

  const [searchQuery, setSearchQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const fetchCustomers = useCallback(async (query = '') => {
    setLoading(true);
    try {
      if (query.trim()) {
        const res = await customerAPI.search({ q: query, type });
        setCustomers(res.data?.data || []);
      } else {
        const res = await customerAPI.getByType(type, { limit: 10 });
        setCustomers(res.data?.data || []);
      }
    } catch (err) {
      console.error(`Error fetching ${type} customers:`, err);
    } finally {
      setLoading(false);
    }
  }, [type]);

  useFocusEffect(
    useCallback(() => {
      fetchCustomers(searchQuery);
    }, [fetchCustomers, searchQuery])
  );

  const handleSearch = (text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchCustomers(text);
    }, 400);
  };

  const handleCreateCustomer = () => {
    navigation.navigate('CreateCustomer', { defaultType: type });
  };

  const handleSelectCustomer = (customer) => {
    if (customer.customerType !== type) {
      return; // Security check
    }
    startTransaction(customer, type);
    navigation.navigate(`${type}Calculation`, { customerId: customer._id });
  };

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="account-search-outline" size={48} color="#D4C098" />
        <Text style={styles.emptyTitle}>No Customers Found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery
            ? 'Try a different search term.'
            : `Click 'Create Customer' to add your first ${type} customer.`}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type} Transactions</Text>
        <TouchableOpacity style={styles.createBtn} onPress={handleCreateCustomer}>
          <Text style={styles.createBtnText}>Create Customer</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrapper}>
        <CustomerSearchCard
          value={searchQuery}
          onChangeText={handleSearch}
          loading={loading && !!searchQuery}
        />
      </View>

      <View style={styles.listContainer}>
        <Text style={styles.sectionTitle}>
          {searchQuery ? 'Search Results' : `Recent ${type} Customers`}
        </Text>
        
        {loading && !searchQuery ? (
          <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={customers}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TransactionCustomerCard
                customer={item}
                onPress={handleSelectCustomer}
              />
            )}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmpty}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: DARK_BROWN,
    textAlign: 'center',
  },
  createBtn: {
    backgroundColor: DARK_BROWN,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  createBtnText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
  },
  searchWrapper: {
    paddingHorizontal: 16,
    marginBottom: 16,
    zIndex: 10,
  },
  listContainer: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A08850',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  empty: {
    alignItems: 'center',
    paddingTop: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: DARK_BROWN,
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#8A6822',
    marginTop: 4,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
