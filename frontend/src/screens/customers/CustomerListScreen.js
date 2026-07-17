import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCustomer } from '../../context/CustomerContext';
import CustomerCard from '../../components/customers/CustomerCard';
import CustomerSearchBar from '../../components/customers/CustomerSearchBar';
import TypeFilterChips from '../../components/customers/TypeFilterChips';
import { getChitCustomers } from '../../services/chitService';
import ChitCard from '../chits/ChitCard';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

export default function CustomerListScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);
  const debounceRef = useRef(null);

  const {
    customers,
    loading,
    refreshing,
    pagination,
    searchQuery,
    setSearchQuery,
    typeFilter,
    setTypeFilter,
    fetchCustomers,
    onRefresh,
    deleteCustomer,
    loadMore,
  } = useCustomer();

  const [chitCustomers, setChitCustomers] = useState([]);
  const [loadingChits, setLoadingChits] = useState(false);

  const fetchChitCustomersData = useCallback(async (search = '') => {
    setLoadingChits(true);
    try {
      const res = await getChitCustomers('', search);
      if (res.success) {
        setChitCustomers(res.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChits(false);
    }
  }, []);

  // Refetch every time this screen regains focus, so a customer's balance
  // updated by any B2C/B2D/Line Stock transaction is always shown fresh from
  // MongoDB — never a stale value left over from a previous visit.
  useFocusEffect(
    useCallback(() => {
      if (typeFilter === 'CHIT FUND') {
        fetchChitCustomersData(searchQuery);
      } else {
        fetchCustomers({ search: searchQuery, type: typeFilter }, true);
      }
    }, [typeFilter, searchQuery, fetchCustomers, fetchChitCustomersData])
  );

  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (typeFilter === 'CHIT FUND') {
        fetchChitCustomersData(text);
      } else {
        fetchCustomers({ search: text, type: typeFilter }, true);
      }
    }, 400);
  }, [typeFilter, fetchChitCustomersData, fetchCustomers, setSearchQuery]);

  const handleClear = useCallback(() => {
    setSearchQuery('');
    if (typeFilter === 'CHIT FUND') {
      fetchChitCustomersData('');
    } else {
      fetchCustomers({ search: '', type: typeFilter }, true);
    }
  }, [typeFilter, fetchChitCustomersData, fetchCustomers, setSearchQuery]);

  const handleTypeFilter = useCallback((type) => {
    setTypeFilter(type);
    if (type === 'CHIT FUND') {
      fetchChitCustomersData(searchQuery);
    } else {
      fetchCustomers({ search: searchQuery, type }, true);
    }
  }, [searchQuery, fetchChitCustomersData, fetchCustomers, setTypeFilter]);

  const handleDelete = useCallback(async (id) => {
    try {
      await deleteCustomer(id);
    } catch {
      Alert.alert('Error', 'Failed to delete customer. Try again.');
    }
  }, [deleteCustomer]);

  const handleView = (customer) => {
    navigation.navigate('CustomerDetail', { customerId: customer._id });
  };

  const handleEdit = (customer) => {
    navigation.navigate('EditCustomer', { customer });
  };

  const renderItem = useCallback(({ item }) => {
    if (typeFilter === 'CHIT FUND') {
      return (
        <ChitCard 
          customer={item} 
          isCompleted={item.status === 'COMPLETED'}
        />
      );
    }
    return (
      <CustomerCard
        customer={item}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    );
  }, [typeFilter, handleView, handleEdit, handleDelete]);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.empty}>
        <MaterialCommunityIcons name="account-group-outline" size={64} color="#D4C098" />
        <Text style={styles.emptyTitle}>No Customers Found</Text>
        <Text style={styles.emptySubtitle}>
          {searchQuery ? 'Try a different search term' : 'Tap + to add your first customer'}
        </Text>
      </View>
    );
  };

  const renderFooter = () => {
    if (pagination.page >= pagination.pages) return <View style={{ height: 100 }} />;
    return <View style={styles.loadMore}><ActivityIndicator color={GOLD} size="small" /></View>;
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />

      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Customers</Text>
          {!loading && (
            <Text style={styles.headerSub}>{pagination.total} total</Text>
          )}
        </View>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreateCustomer')}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="plus" size={22} color={HEADER_BG} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={typeFilter === 'CHIT FUND' ? chitCustomers : customers}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        ListHeaderComponent={
          <>
            <View style={{ height: 16 }} />
            <CustomerSearchBar
              value={searchQuery}
              onChangeText={handleSearch}
              onClear={handleClear}
            />
            <TypeFilterChips 
              selected={typeFilter} 
              onSelect={handleTypeFilter} 
            />
            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>Customer List</Text>
              {(loading || loadingChits) && <ActivityIndicator size="small" color={GOLD} />}
              {!loading && !loadingChits && (
                <Text style={styles.sectionCount}>{typeFilter === 'CHIT FUND' ? chitCustomers.length : pagination.total} records</Text>
              )}
            </View>
          </>
        }
        ListEmptyComponent={renderEmpty}
        ListFooterComponent={renderFooter}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[GOLD]}
            tintColor={GOLD}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.3}
        showsVerticalScrollIndicator={false}
      />

      {/* FAB */}
      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('CreateCustomer')}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={28} color={HEADER_BG} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  headerBtn: {
    width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center', borderRadius: 20,
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: '#A08850', fontSize: 11, fontWeight: '600', marginTop: 2 },
  addBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: 'center', justifyContent: 'center',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 6,
    marginBottom: 10,
  },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  sectionCount: { fontSize: 12, color: '#A08850', fontWeight: '600' },
  chitFundContainer: { paddingHorizontal: 16, marginBottom: 12 },
  chitFundBtn: { backgroundColor: '#F0E6D2', padding: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', elevation: 2 },
  chitFundBtnText: { flex: 1, fontSize: 15, fontWeight: '700', color: DARK_BROWN },
  empty: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: DARK_BROWN, marginTop: 16 },
  emptySubtitle: { fontSize: 13, color: '#A08850', textAlign: 'center', marginTop: 8, lineHeight: 20 },
  loadMore: { paddingVertical: 20, alignItems: 'center', marginBottom: 80 },
  fab: {
    position: 'absolute',
    bottom: 28,
    right: 20,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
    elevation: 12,
  },
});
