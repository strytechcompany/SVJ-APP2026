import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, StatusBar, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { cashLedgerAPI } from '../../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function CashLedgerScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [history, setHistory] = useState([]);
  const [currentCash, setCurrentCash] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adjusting, setAdjusting] = useState(false);
  
  const [newAmount, setNewAmount] = useState('');
  const [reason, setReason] = useState('');

  const fetchLedger = async () => {
    setLoading(true);
    try {
      const res = await cashLedgerAPI.getHistory({ page: 1, limit: 100 });
      if (res.data.success) {
        setHistory(res.data.data);
        setCurrentCash(res.data.currentCash);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to load cash ledger');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLedger();
  }, []);

  const handleAdjust = async () => {
    if (!newAmount || isNaN(newAmount)) {
      return Alert.alert('Error', 'Please enter a valid amount');
    }
    setAdjusting(true);
    try {
      const res = await cashLedgerAPI.addAdjustment({
        amount: parseFloat(newAmount),
        description: reason || 'Admin Manual Override'
      });
      if (res.data.success) {
        Alert.alert('Success', 'Cash ledger updated!');
        setNewAmount('');
        setReason('');
        fetchLedger();
      }
    } catch (e) {
      Alert.alert('Error', 'Failed to adjust ledger');
    } finally {
      setAdjusting(false);
    }
  };

  const renderItem = ({ item }) => {
    const isPositive = item.type === 'IN' || item.type === 'INITIAL_BALANCE';
    const isAdj = item.type === 'ADJUSTMENT';
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <View style={styles.typeBadgeContainer}>
            <Text style={[styles.typeBadge, isPositive ? {color: '#27AE60'} : isAdj ? {color: '#3498DB'} : {color: '#E74C3C'}]}>
              {item.type}
            </Text>
            <Text style={styles.dateText}>{new Date(item.createdAt).toLocaleString('en-GB')}</Text>
          </View>
          <Text style={[styles.amountText, isPositive ? {color: '#27AE60'} : isAdj ? {color: '#3498DB'} : {color: '#E74C3C'}]}>
            {isPositive ? '+' : isAdj ? '=' : '-'} ₹{item.amount}
          </Text>
        </View>
        <Text style={styles.sourceText}>{item.source}</Text>
        {item.description ? <Text style={styles.descText}>{item.description}</Text> : null}
        <View style={styles.divider} />
        <View style={styles.cardBottom}>
          <Text style={styles.balLabel}>Balance After:</Text>
          <Text style={styles.balValue}>₹{item.balanceAfter}</Text>
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
          <Text style={styles.headerTitle}>Cash Ledger</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.summaryCard}>
          <MaterialCommunityIcons name="cash-multiple" size={32} color={GOLD} />
          <View style={{ marginLeft: 16 }}>
            <Text style={styles.summaryLabel}>Current Cash Balance</Text>
            <Text style={styles.summaryValue}>₹{currentCash}</Text>
          </View>
        </View>

        <View style={styles.adjustCard}>
          <Text style={styles.adjustTitle}>Manual Adjustment</Text>
          <TextInput 
            style={styles.input} 
            placeholder="New Target Amount (₹)" 
            keyboardType="numeric" 
            value={newAmount} 
            onChangeText={setNewAmount} 
          />
          <TextInput 
            style={styles.input} 
            placeholder="Reason (Optional)" 
            value={reason} 
            onChangeText={setReason} 
          />
          <TouchableOpacity style={styles.adjustBtn} onPress={handleAdjust} disabled={adjusting}>
            {adjusting ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.adjustBtnText}>Set Balance</Text>}
          </TouchableOpacity>
        </View>

        <Text style={styles.listTitle}>Transaction History</Text>
        {loading ? (
          <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            contentContainerStyle={{ paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: HEADER_BG, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, elevation: 8 },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 18, fontWeight: '800' },
  content: { flex: 1, padding: 16 },
  summaryCard: { backgroundColor: DARK_BROWN, borderRadius: 16, padding: 20, flexDirection: 'row', alignItems: 'center', elevation: 4, marginBottom: 16 },
  summaryLabel: { color: GOLD, fontSize: 13, fontWeight: '600' },
  summaryValue: { color: '#FFF', fontSize: 24, fontWeight: '800', marginTop: 4 },
  adjustCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, elevation: 2, marginBottom: 16 },
  adjustTitle: { fontSize: 14, fontWeight: '700', color: DARK_BROWN, marginBottom: 12 },
  input: { backgroundColor: '#F5F5F5', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: DARK_BROWN, marginBottom: 10 },
  adjustBtn: { backgroundColor: '#2E7D32', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  adjustBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  listTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN, marginBottom: 12 },
  card: { backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginBottom: 10, elevation: 1 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { fontSize: 12, fontWeight: '800' },
  dateText: { fontSize: 11, color: '#888' },
  amountText: { fontSize: 15, fontWeight: '800' },
  sourceText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  descText: { fontSize: 12, color: '#666', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#EEE', marginVertical: 10 },
  cardBottom: { flexDirection: 'row', justifyContent: 'space-between' },
  balLabel: { fontSize: 12, color: '#888' },
  balValue: { fontSize: 13, fontWeight: '700', color: DARK_BROWN }
});
