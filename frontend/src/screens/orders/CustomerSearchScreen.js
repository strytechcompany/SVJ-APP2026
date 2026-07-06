import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { customerAPI } from '../../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';
const HEADER_BG = '#3D2200';

const TYPE_META = {
  B2C:         { label: 'B2C',  color: '#1565C0', bg: '#E3F2FD' },
  B2D:         { label: 'B2D',  color: '#6A1B9A', bg: '#F3E5F5' },
  LINE_STOCKER:{ label: 'LS',   color: '#E65100', bg: '#FFF3E0' },
};

export default function CustomerSearchScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const mergeUniqueCustomers = (existing, incoming) => {
    const seen = new Set();
    return [...existing, ...incoming].filter((customer) => {
      const key = customer._id || `${customer.phoneNumber || ''}-${customer.customerName || ''}`;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  };

  const uniqueCustomers = (items) => mergeUniqueCustomers([], items);

  const doSearch = useCallback(async (text, resetPage = true, pageOverride = null) => {
    try {
      setLoading(true);
      const currentPage = pageOverride ?? (resetPage ? 1 : page);
      const res = await customerAPI.getAll({ search: text, page: currentPage, limit: 30 });
      if (res.data.success) {
        const incoming = res.data.data;
        if (resetPage) {
          setCustomers(uniqueCustomers(incoming));
          setPage(currentPage);
        } else {
          setCustomers((prev) => mergeUniqueCustomers(prev, incoming));
          setPage(currentPage);
        }
        setHasMore(res.data.pagination.page < res.data.pagination.pages);
      }
    } catch {
      // silent — user can retry by re-typing
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    doSearch('', true);
  }, []);

  const onChangeText = (text) => {
    setSearch(text);
    doSearch(text, true);
  };

  const loadMore = () => {
    if (!loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      doSearch(search, false, nextPage);
    }
  };

  const renderCustomer = ({ item }) => {
    const meta = TYPE_META[item.customerType] || { label: item.customerType, color: '#555', bg: '#EEE' };
    const displayName = item.shopName || item.dealerCompanyName || item.customerName;
    return (
      <TouchableOpacity
        style={styles.customerCard}
        onPress={() => navigation.navigate('CreateOrder', { customer: item })}
        activeOpacity={0.8}
      >
        <View style={styles.customerAvatar}>
          <Text style={styles.avatarText}>
            {(item.customerName || '?').charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.customerInfo}>
          <Text style={styles.customerName}>{item.customerName}</Text>
          {displayName !== item.customerName ? (
            <Text style={styles.shopName}>{displayName}</Text>
          ) : null}
          <Text style={styles.phoneText}>{item.phoneNumber}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: meta.bg, borderColor: meta.color }]}>
          <Text style={[styles.typeBadgeText, { color: meta.color }]}>{meta.label}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Select Customer</Text>
      </View>

      <View style={styles.searchContainer}>
        <View style={styles.searchBox}>
          <MaterialCommunityIcons name="magnify" size={20} color="#888" style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by name or phone..."
            placeholderTextColor="#AAA"
            value={search}
            onChangeText={onChangeText}
            autoFocus
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => onChangeText('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#AAA" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <FlatList
        data={customers}
        keyExtractor={(item) => item._id}
        renderItem={renderCustomer}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color={GOLD} />
              <Text style={styles.emptyText}>
                {search ? 'No customers found' : 'No customers yet'}
              </Text>
            </View>
          ) : null
        }
        ListFooterComponent={loading ? <ActivityIndicator color={GOLD} style={{ margin: 16 }} /> : null}
        contentContainerStyle={{ padding: 12, paddingBottom: 40 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 14,
  },
  backBtn: { marginRight: 10, padding: 2 },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '700' },
  searchContainer: { padding: 12, paddingBottom: 4 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    borderWidth: 1, borderColor: '#E5D8C0',
  },
  searchInput: { flex: 1, fontSize: 15, color: DARK_BROWN },
  customerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', borderRadius: 12,
    marginBottom: 8, padding: 12,
    borderWidth: 1, borderColor: '#F0E4CC',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 2, elevation: 1,
  },
  customerAvatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: DARK_BROWN,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: GOLD, fontSize: 18, fontWeight: '700' },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 15, fontWeight: '700', color: DARK_BROWN },
  shopName: { fontSize: 12, color: '#666', marginTop: 1 },
  phoneText: { fontSize: 13, color: '#555', marginTop: 2 },
  typeBadge: {
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, marginLeft: 8,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  emptyBox: { alignItems: 'center', paddingTop: 60 },
  emptyText: { marginTop: 10, fontSize: 15, color: '#888' },
});
