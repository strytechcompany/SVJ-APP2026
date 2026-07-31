import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  StatusBar, ActivityIndicator, Platform,
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

function formatDate(d) {
  return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Read-only Old Balance settlement history for a single customer.
export default function OldBalanceHistory({ route, navigation }) {
  const { customerId, customerName } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [settlements, setSettlements] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await balanceSettlementAPI.getSettlementsByCustomer(customerId, 'OLD');
      if (res.data.success) setSettlements(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useFocusEffect(useCallback(() => { fetchHistory(); }, [fetchHistory]));

  const renderItem = ({ item }) => {
    const cashSettlement = (item.items || []).reduce((s, i) => s + (i.mode === 'CASH' ? (i.cashAmount || 0) : 0), 0);
    return (
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.billNo}>#{item.billNumber}</Text>
          <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
        </View>
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.label}>Cash Settlement</Text><Text style={styles.value}>₹{cashSettlement.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Gram Settlement</Text><Text style={styles.value}>{Number(item.totalSettlementGram).toFixed(3)}g</Text></View>
        <View style={styles.row}>
          <Text style={[styles.label, { fontWeight: '800' }]}>Final Balance</Text>
          <Text style={[styles.value, { color: item.finalOldBalance > 0 ? '#D32F2F' : '#2E7D32', fontWeight: '800' }]}>
            {formatBalanceForCustomer(item.finalOldBalance > 0 ? item.finalOldBalance : item.finalAdvanceBalance, item.customerId)} ({item.finalOldBalance > 0 ? 'Old' : 'Advance'})
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Old Balance History</Text>
          {customerName ? <Text style={styles.headerSub}>{customerName}</Text> : null}
        </View>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={settlements}
          keyExtractor={(item) => item._id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons name="folder-open-outline" size={56} color="#D4C098" />
              <Text style={styles.emptyText}>No Settlement History Found</Text>
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
  headerSub: { color: '#A08850', fontSize: 11, fontWeight: '600', marginTop: 2 },
  card: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 14, elevation: 2, borderWidth: 1, borderColor: '#F0E4CC' },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  billNo: { fontSize: 14, fontWeight: '800', color: DARK_BROWN },
  date: { fontSize: 12, color: '#8A6B3C', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 8 },
  label: { fontSize: 13, color: '#8A6B3C', fontWeight: '600' },
  value: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', marginTop: 60 },
  emptyText: { marginTop: 14, fontSize: 14, color: '#8A6B3C', fontWeight: '600' },
});
