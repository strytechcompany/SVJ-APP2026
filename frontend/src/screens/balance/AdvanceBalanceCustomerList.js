import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, Platform, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { balanceSettlementAPI } from '../../services/api';
import { formatBalanceForCustomer } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function AdvanceBalanceCustomerList({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchCustomers = useCallback(async () => {
    try {
      const res = await balanceSettlementAPI.getAdvanceBalanceCustomers();
      if (res.data.success) setCustomers(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Always fetch fresh from MongoDB on focus — never a stale/cached balance.
  useFocusEffect(useCallback(() => { fetchCustomers(); }, [fetchCustomers]));

  const filteredCustomers = customers.filter(c => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (c.customerName || '').toLowerCase().includes(q) ||
      (c.phoneNumber || '').includes(q)
    );
  });

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <Text style={styles.name}>{item.customerName}</Text>
      <Text style={styles.phone}>{item.phoneNumber}</Text>
      <View style={styles.balanceRow}>
        <Text style={styles.balanceLabel}>Current Advance Balance</Text>
        <Text style={styles.balanceValue}>{formatBalanceForCustomer(item.advance, item)}</Text>
      </View>
      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={styles.historyBtn}
          onPress={() => navigation.navigate('AdvanceBalanceHistory', { customerId: item._id, customerName: item.customerName })}
        >
          <MaterialCommunityIcons name="history" size={16} color={DARK_BROWN} />
          <Text style={styles.historyBtnText}>View History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.settleBtn}
          onPress={() => navigation.navigate('AdvanceBalanceSettlement', { customerId: item._id })}
        >
          <MaterialCommunityIcons name="cash-check" size={16} color="#FFF" />
          <Text style={styles.settleBtnText}>Settlement</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Advance Balance</Text>
        </View>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.navigate('AdvanceBalanceSettlementHistory')}>
          <MaterialCommunityIcons name="history" size={22} color={GOLD} />
        </TouchableOpacity>
      </View>

      <View style={styles.searchWrap}>
        <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or phone..."
          placeholderTextColor="#C4A97A"
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={18} color="#C4A97A" />
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filteredCustomers}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color="#D4C098" />
              <Text style={styles.emptyText}>No customers with an Advance Balance</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: HEADER_BG, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '800' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', marginHorizontal: 16, marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: 14, color: DARK_BROWN },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 2, borderWidth: 1, borderColor: '#F0E4CC' },
  name: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  phone: { fontSize: 13, color: '#8A6B3C', marginTop: 2 },
  balanceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#E8F5E9', borderRadius: 10, padding: 12, marginTop: 12 },
  balanceLabel: { fontSize: 12, color: '#8A6B3C', fontWeight: '600' },
  balanceValue: { fontSize: 16, color: '#2E7D32', fontWeight: '800' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  historyBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: '#F0E4CC' },
  historyBtnText: { fontSize: 12, fontWeight: '700', color: DARK_BROWN },
  settleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10, backgroundColor: DARK_BROWN },
  settleBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 14, fontSize: 14, color: '#8A6B3C', fontWeight: '600' },
});
