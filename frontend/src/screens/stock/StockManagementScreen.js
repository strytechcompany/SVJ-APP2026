import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl,
  Platform, StatusBar, Alert, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { useStock } from '../../context/StockContext';
import SummaryCards from '../../components/stock/SummaryCards';
import CategoryFilter from '../../components/stock/CategoryFilter';
import StockSearchBar from '../../components/stock/StockSearchBar';
import DesignCard from '../../components/stock/DesignCard';
import StockFAB from '../../components/stock/StockFAB';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

export default function StockManagementScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const debounceRef = useRef(null);

  const [activeTab, setActiveTab] = useState('Showroom'); // 'Showroom' | 'Received'

  const {
    stocks, summary, pagination, searchQuery, setSearchQuery, selectedCategory, setSelectedCategory,
    fetchStocks, fetchSummary, loadMoreStocks, deleteStock,
    
    receivedInventory, receivedSummary, receivedPagination, receivedFilter, setReceivedFilter,
    fetchReceivedInventory, fetchReceivedSummary, loadMoreReceived,

    loading, refreshing, error, onRefresh
  } = useStock();

  // Refresh every time this screen comes into focus (e.g., after a bill edit restores stock)
  useFocusEffect(
    useCallback(() => {
      fetchStocks({ search: '', category: 'All' }, true);
      fetchSummary();
      fetchReceivedInventory({ filter: 'All' }, true);
      fetchReceivedSummary();
    }, [])
  );

  // --- Showroom Handlers ---
  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchStocks({ search: text, category: selectedCategory }, true), 400);
  }, [selectedCategory]);

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
    fetchStocks({ search: '', category: selectedCategory }, true);
  }, [selectedCategory]);

  const handleCategorySelect = useCallback((cat) => {
    setSelectedCategory(cat);
    fetchStocks({ search: searchQuery, category: cat }, true);
  }, [searchQuery]);

  const handleDelete = useCallback(async (id) => {
    try { await deleteStock(id); } 
    catch { Alert.alert('Error', 'Failed to delete item.'); }
  }, [deleteStock]);

  const handleItemPress = useCallback((item) => {
    navigation.navigate('StockDetail', { itemId: item._id });
  }, [navigation]);

  const handleEdit = useCallback((item) => {
    navigation.navigate('AddStock', { editItem: item });
  }, [navigation]);

  // --- Received Handlers ---
  const handleFilterSelect = useCallback((f) => {
    setReceivedFilter(f);
    fetchReceivedInventory({ filter: f }, true);
  }, []);

  // --- Render Components ---
  const renderShowroomSummary = () => (
    <View style={styles.summaryContainer}>
      <SummaryCards summary={summary || {}} />
    </View>
  );

  const renderReceivedSummary = () => (
    <View style={styles.receivedSumRow}>
      <View style={styles.receivedSumBox}>
        <Text style={styles.rSumTitle}>Entries</Text>
        <Text style={styles.rSumValue}>{receivedSummary.totalEntries}</Text>
      </View>
      <View style={styles.receivedSumBox}>
        <Text style={styles.rSumTitle}>Weight (g)</Text>
        <Text style={styles.rSumValue}>{receivedSummary.totalWeight.toFixed(3)}</Text>
      </View>
      <View style={styles.receivedSumBox}>
        <Text style={styles.rSumTitle}>Purity</Text>
        <Text style={styles.rSumValue}>{receivedSummary.totalPurity.toFixed(3)}</Text>
      </View>
      <View style={styles.receivedSumBox}>
        <Text style={styles.rSumTitle}>Amount</Text>
        <Text style={[styles.rSumValue, {color: '#2E7D32'}]}>₹{receivedSummary.totalAmount >= 1000 ? (receivedSummary.totalAmount/1000).toFixed(1)+'k' : receivedSummary.totalAmount}</Text>
      </View>
    </View>
  );

  const renderReceivedItem = ({ item }) => (
    <View style={styles.receivedCard}>
      <View style={styles.rRow}>
        <Text style={styles.rTitle}>{item.receiptNumber}</Text>
        <Text style={styles.rDate}>{new Date(item.createdAt).toLocaleDateString('en-GB')}</Text>
      </View>
      <Text style={styles.rCustomer}>{item.customerId?.customerName || 'Unknown Customer'}</Text>
      <View style={styles.rDetailRow}>
        <Text style={styles.rDetailText}>Weight: {item.weight.toFixed(3)}g</Text>
        <Text style={styles.rDetailText}>Purity: {item.purity.toFixed(3)}g</Text>
      </View>
      <Text style={styles.rAmount}>₹ {item.amount.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + (Platform.OS === 'android' ? 10 : 0) }]}>
        <Text style={styles.headerTitle}>Inventory Dashboard</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabContainer}>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Showroom' && styles.activeTab]} 
          onPress={() => setActiveTab('Showroom')}
        >
          <MaterialCommunityIcons name="storefront-outline" size={20} color={activeTab === 'Showroom' ? GOLD : '#FFF'} />
          <Text style={[styles.tabText, activeTab === 'Showroom' && styles.activeTabText]}>Showroom Stock</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.tab, activeTab === 'Received' && styles.activeTab]} 
          onPress={() => setActiveTab('Received')}
        >
          <MaterialCommunityIcons name="gold" size={20} color={activeTab === 'Received' ? GOLD : '#FFF'} />
          <Text style={[styles.tabText, activeTab === 'Received' && styles.activeTabText]}>Received Gold</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content */}
      <View style={styles.content}>
        {activeTab === 'Showroom' ? (
          <FlatList
            data={stocks}
            keyExtractor={(item, index) => item.groupKey || item.designName || String(index)}
            ListHeaderComponent={
              <View>
                {renderShowroomSummary()}
                <StockSearchBar
                  value={searchQuery}
                  onChangeText={handleSearch}
                  onClear={handleClearSearch}
                />
                <View style={styles.filterWrapper}>
                  <CategoryFilter
                    selected={selectedCategory}
                    onSelect={handleCategorySelect}
                  />
                </View>
              </View>
            }
            renderItem={({ item }) => (
              <DesignCard
                group={item}
                onDelete={handleDelete}
                onEdit={handleEdit}
                onItemPress={handleItemPress}
              />
            )}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GOLD]} />}
            onEndReached={loadMoreStocks}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loading && pagination.page < pagination.pages ? <ActivityIndicator size="small" color={GOLD} /> : null}
            ListEmptyComponent={!loading && <Text style={styles.emptyText}>No Showroom Stock Found.</Text>}
          />
        ) : (
          <FlatList
            data={receivedInventory}
            keyExtractor={(item) => item._id}
            ListHeaderComponent={
              <View>
                {renderReceivedSummary()}
                <View style={styles.rFilterRow}>
                  {['Today', 'This Week', 'This Month', 'All'].map(f => (
                    <TouchableOpacity 
                      key={f} 
                      style={[styles.rFilterPill, receivedFilter === f && styles.rFilterPillActive]}
                      onPress={() => handleFilterSelect(f)}
                    >
                      <Text style={[styles.rFilterText, receivedFilter === f && styles.rFilterTextActive]}>{f}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            }
            renderItem={renderReceivedItem}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GOLD]} />}
            onEndReached={loadMoreReceived}
            onEndReachedThreshold={0.5}
            ListFooterComponent={loading && receivedPagination.page < receivedPagination.pages ? <ActivityIndicator size="small" color={GOLD} /> : null}
            ListEmptyComponent={!loading && <Text style={styles.emptyText}>No Received Gold Found.</Text>}
          />
        )}
      </View>

      {activeTab === 'Showroom' && (
        <StockFAB onPress={() => navigation.navigate('AddStock')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  headerTitle: {
    color: GOLD,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: HEADER_BG,
    paddingHorizontal: 10,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
    gap: 8,
  },
  activeTab: { borderBottomColor: GOLD },
  tabText: { color: '#FFF', fontSize: 14, fontWeight: '600' },
  activeTabText: { color: GOLD, fontWeight: '800' },
  content: { flex: 1 },
  listContent: { paddingBottom: 100 },
  summaryContainer: { padding: 16 },
  filterWrapper: { paddingHorizontal: 16, marginBottom: 16 },
  emptyText: { textAlign: 'center', color: '#666', marginTop: 40, fontSize: 16 },
  
  // Received Summary Styles
  receivedSumRow: { flexDirection: 'row', padding: 16, gap: 10 },
  receivedSumBox: { flex: 1, backgroundColor: '#FFF', borderRadius: 12, padding: 12, elevation: 2, borderWidth: 1, borderColor: '#F0E6D2', alignItems: 'center' },
  rSumTitle: { fontSize: 11, color: '#A08850', fontWeight: '700', textTransform: 'uppercase' },
  rSumValue: { fontSize: 16, color: DARK_BROWN, fontWeight: '800', marginTop: 4 },
  
  // Received Filter Styles
  rFilterRow: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 16, gap: 8 },
  rFilterPill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#E0D6C8' },
  rFilterPillActive: { backgroundColor: GOLD },
  rFilterText: { fontSize: 12, color: DARK_BROWN, fontWeight: '600' },
  rFilterTextActive: { color: '#FFF', fontWeight: '800' },

  // Received Card Styles
  receivedCard: { backgroundColor: '#FFF', marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#F5EFE6' },
  rRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  rTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  rDate: { fontSize: 12, color: '#888' },
  rCustomer: { fontSize: 14, color: '#666', marginBottom: 10 },
  rDetailRow: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#FAFAFA', padding: 10, borderRadius: 8, marginBottom: 10 },
  rDetailText: { fontSize: 13, color: DARK_BROWN, fontWeight: '600' },
  rAmount: { fontSize: 18, color: '#2E7D32', fontWeight: '800', textAlign: 'right' }
});
