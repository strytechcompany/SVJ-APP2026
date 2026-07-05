import React, { useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, RefreshControl, Alert, TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useOrders } from '../../context/OrderContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';
const HEADER_BG = '#3D2200';

const STATUS_COLORS = {
  Pending:   { bg: '#FFF8E1', border: '#F9A825', text: '#F57F17' },
  Ready:     { bg: '#E8F5E9', border: '#43A047', text: '#1B5E20' },
  Delivered: { bg: '#E3F2FD', border: '#1E88E5', text: '#0D47A1' },
  Cancelled: { bg: '#FFEEF0', border: '#E53935', text: '#B71C1C' },
};

const STATUS_TABS = ['All', 'Pending', 'Ready', 'Delivered', 'Cancelled'];

function daysDiff(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
}

function DeliveryBadge({ date, label }) {
  const days = daysDiff(date);
  let color = '#555';
  let icon = 'calendar-clock';
  if (days < 0) { color = '#D32F2F'; icon = 'calendar-alert'; }
  else if (days <= 2) { color = '#E65100'; icon = 'calendar-alert'; }

  return (
    <View style={styles.deliveryRow}>
      <MaterialCommunityIcons name={icon} size={13} color={color} />
      <Text style={[styles.deliveryText, { color }]}>
        {' '}{label}: {new Date(date).toLocaleDateString('en-GB')}
        {days < 0 ? '  (Overdue)' : days === 0 ? '  (Today)' : days <= 2 ? `  (${days}d)` : ''}
      </Text>
    </View>
  );
}

function OrderCard({ order, onPress, onStatusChange, onDelete }) {
  const customer = order.customerId || {};
  const statusStyle = STATUS_COLORS[order.status] || STATUS_COLORS.Pending;
  const typeLabel = customer.customerType === 'LINE_STOCKER' ? 'LS' : customer.customerType;

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
      <View style={styles.cardTop}>
        <View style={styles.cardLeft}>
          <Text style={styles.orderNum}>{order.orderNumber}</Text>
          <Text style={styles.customerName}>{customer.customerName || '—'}</Text>
          <Text style={styles.customerPhone}>{customer.phoneNumber || ''}</Text>
          {typeLabel ? (
            <View style={styles.typeBadge}>
              <Text style={styles.typeBadgeText}>{typeLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.cardRight}>
          <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg, borderColor: statusStyle.border }]}>
            <Text style={[styles.statusText, { color: statusStyle.text }]}>{order.status}</Text>
          </View>
          <Text style={styles.dateText}>
            {new Date(order.createdAt).toLocaleDateString('en-GB')}
          </Text>
        </View>
      </View>

      {order.orderItems?.length > 0 && (
        <View style={styles.itemsRow}>
          <MaterialCommunityIcons name="diamond-stone" size={13} color={GOLD} />
          <Text style={styles.itemsText} numberOfLines={2}>
            {order.orderItems.map((i) => `${i.itemName} (${Number(i.itemWeight).toFixed(3)}g)`).join(', ')}
          </Text>
        </View>
      )}

      {order.orderItems?.map((item, idx) => (
        <View key={idx}>
          <DeliveryBadge date={item.deliveryDateByGiver} label="Ready by" />
          <DeliveryBadge date={item.deliveryDateByCustomer} label="Customer expects" />
        </View>
      )).slice(0, 1)}

      <View style={styles.cardActions}>
        <TouchableOpacity
          style={[styles.actionChip, { borderColor: '#43A047' }]}
          onPress={() => onStatusChange(order)}
        >
          <MaterialCommunityIcons name="swap-horizontal" size={14} color="#43A047" />
          <Text style={[styles.actionChipText, { color: '#43A047' }]}>Status</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionChip, { borderColor: '#D32F2F' }]}
          onPress={() => onDelete(order)}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#D32F2F" />
          <Text style={[styles.actionChipText, { color: '#D32F2F' }]}>Delete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function OrdersScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const {
    orders, loading, refreshing, error,
    statusFilter, setStatusFilter,
    searchQuery, setSearchQuery,
    fetchOrders, onRefresh, updateOrderStatus, deleteOrder, loadMore,
  } = useOrders();

  useEffect(() => {
    fetchOrders({ search: '', status: 'All' }, true);
  }, []);

  const handleSearch = useCallback((text) => {
    setSearchQuery(text);
    fetchOrders({ search: text, status: statusFilter }, true);
  }, [statusFilter]);

  const handleStatusTab = useCallback((tab) => {
    setStatusFilter(tab);
    fetchOrders({ search: searchQuery, status: tab }, true);
  }, [searchQuery]);

  const handleStatusChange = useCallback((order) => {
    Alert.alert('Update Status', `Current: ${order.status}`, [
      { text: 'Pending',   onPress: () => updateOrderStatus(order._id, 'Pending') },
      { text: 'Ready',     onPress: () => updateOrderStatus(order._id, 'Ready') },
      { text: 'Delivered', onPress: () => updateOrderStatus(order._id, 'Delivered') },
      { text: 'Cancelled', onPress: () => updateOrderStatus(order._id, 'Cancelled'), style: 'destructive' },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [updateOrderStatus]);

  const handleDelete = useCallback((order) => {
    Alert.alert(
      'Delete Order',
      `Delete ${order.orderNumber}? This will also reverse any advance balance added.\n\nThis cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteOrder(order._id);
            } catch (err) {
              Alert.alert('Error', err.message);
            }
          },
        },
      ]
    );
  }, [deleteOrder]);

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View style={styles.emptyBox}>
        <MaterialCommunityIcons name="clipboard-list-outline" size={56} color={GOLD} />
        <Text style={styles.emptyTitle}>No Orders</Text>
        <Text style={styles.emptyDesc}>Tap + to create a new order</Text>
      </View>
    );
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Orders</Text>
      </View>

      <View style={styles.searchBox}>
        <MaterialCommunityIcons name="magnify" size={18} color="#888" style={{ marginRight: 6 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, phone, item..."
          placeholderTextColor="#AAA"
          value={searchQuery}
          onChangeText={handleSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => handleSearch('')}>
            <MaterialCommunityIcons name="close-circle" size={16} color="#AAA" />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.filterRow}>
        {STATUS_TABS.map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.filterTab, statusFilter === tab && styles.filterTabActive]}
            onPress={() => handleStatusTab(tab)}
          >
            <Text style={[styles.filterTabText, statusFilter === tab && styles.filterTabTextActive]}>
              {tab}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading && orders.length === 0 ? (
        <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onPress={() => navigation.navigate('OrderBillPreview', { orderId: item._id })}
              onStatusChange={handleStatusChange}
              onDelete={handleDelete}
            />
          )}
          ListEmptyComponent={renderEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[GOLD]} tintColor={GOLD} />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          contentContainerStyle={orders.length === 0 ? { flex: 1 } : { paddingBottom: 100 }}
        />
      )}

      {error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : null}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() => navigation.navigate('OrderCustomerSearch')}
        activeOpacity={0.85}
      >
        <MaterialCommunityIcons name="plus" size={30} color="#FFF" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: { color: GOLD, fontSize: 20, fontWeight: '700', letterSpacing: 0.5 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF', margin: 12, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8,
    borderWidth: 1, borderColor: '#E5D8C0',
  },
  searchInput: { flex: 1, fontSize: 14, color: DARK_BROWN },
  filterRow: {
    flexDirection: 'row', paddingHorizontal: 12, marginBottom: 8, gap: 6,
  },
  filterTab: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16,
    borderWidth: 1, borderColor: '#E5D8C0', backgroundColor: '#FFF',
  },
  filterTabActive: { backgroundColor: DARK_BROWN, borderColor: DARK_BROWN },
  filterTabText: { fontSize: 12, color: '#666', fontWeight: '500' },
  filterTabTextActive: { color: GOLD, fontWeight: '700' },
  card: {
    backgroundColor: '#FFF', marginHorizontal: 12, marginBottom: 10,
    borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: '#F0E4CC',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07, shadowRadius: 3, elevation: 2,
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  cardLeft: { flex: 1, marginRight: 8 },
  cardRight: { alignItems: 'flex-end' },
  orderNum: { fontSize: 13, color: '#888', fontWeight: '600', marginBottom: 2 },
  customerName: { fontSize: 16, fontWeight: '700', color: DARK_BROWN },
  customerPhone: { fontSize: 12, color: '#666', marginTop: 1 },
  typeBadge: {
    marginTop: 4, alignSelf: 'flex-start',
    backgroundColor: '#FFF8DC', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
    borderWidth: 1, borderColor: GOLD,
  },
  typeBadgeText: { fontSize: 10, fontWeight: '700', color: DARK_BROWN },
  statusBadge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, marginBottom: 4,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  dateText: { fontSize: 11, color: '#999' },
  itemsRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  itemsText: { fontSize: 13, color: '#555', flex: 1, marginLeft: 4 },
  deliveryRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  deliveryText: { fontSize: 12 },
  cardActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  actionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, backgroundColor: '#FFF',
  },
  actionChipText: { fontSize: 12, fontWeight: '600' },
  emptyBox: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 80 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: DARK_BROWN, marginTop: 12 },
  emptyDesc: { fontSize: 14, color: '#888', marginTop: 4 },
  errorText: { textAlign: 'center', color: '#D32F2F', fontSize: 13, marginTop: 8 },
  fab: {
    position: 'absolute', right: 20,
    width: 58, height: 58, borderRadius: 29,
    backgroundColor: DARK_BROWN,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: DARK_BROWN, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4, shadowRadius: 8, elevation: 8,
  },
});
