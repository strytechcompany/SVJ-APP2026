import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, StatusBar, Alert, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { lineStockAPI } from '../../services/api';
import { LineStockPrintService } from '../../services/PrintService';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

export default function LineStockBillPreviewScreen({ route, navigation }) {
  const { transactionId } = route.params;
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [transaction, setTransaction] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const printLockRef = useRef(false);

  useEffect(() => {
    const fetchBill = async () => {
      try {
        const res = await lineStockAPI.getTransactionById(transactionId);
        if (res.data.success) {
          setTransaction(res.data.data);
        } else {
          Alert.alert('Error', 'Transaction not found', [{ text: 'OK', onPress: () => navigation.goBack() }]);
        }
      } catch (err) {
        Alert.alert('Error', 'Could not load bill details');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };
    fetchBill();
  }, [transactionId, navigation]);

  const withPrintLock = async (stateSetter, fn) => {
    if (printLockRef.current) return;
    printLockRef.current = true;
    stateSetter(true);
    const timeout = setTimeout(() => { printLockRef.current = false; stateSetter(false); }, 60000);
    try {
      await fn();
    } catch (e) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Print Error', e?.message || 'Could not complete print action.');
      }
    } finally {
      clearTimeout(timeout);
      printLockRef.current = false;
      stateSetter(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={{ marginTop: 12, color: DARK_BROWN, fontWeight: '600' }}>Loading Bill...</Text>
      </View>
    );
  }

  if (!transaction) return null;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => {
          // If we came from IssueLineStock, reset to Dashboard
          const routes = navigation.getState().routes;
          const prevRoute = routes[routes.length - 2];
          if (prevRoute && prevRoute.name === 'IssueLineStock') {
            navigation.popToTop();
          } else {
            navigation.goBack();
          }
        }}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Bill Preview</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.billCard}>
          <Text style={styles.shopName}>SRI VAISHNAVI JEWELLERS</Text>
          <Text style={styles.billType}>LINE STOCK ISSUE BILL</Text>
          <View style={styles.divider} />

          <View style={styles.row}>
            <Text style={styles.label}>Transaction No:</Text>
            <Text style={styles.value}>{transaction.transactionNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Issue Date:</Text>
            <Text style={styles.value}>{new Date(transaction.issueDate).toLocaleDateString('en-GB')}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Expected Return:</Text>
            <Text style={[styles.value, { color: '#E74C3C' }]}>{new Date(transaction.expectedReturnDate).toLocaleDateString('en-GB')}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>LINE STOCKER</Text>
          <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.value}>{transaction.customerId?.customerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.value}>{transaction.customerId?.phoneNumber}</Text></View>
          
          <View style={styles.divider} />
          
          <Text style={styles.sectionTitle}>ISSUED PRODUCTS</Text>
          {transaction.issuedProducts?.map((item, idx) => (
            <View key={idx} style={styles.itemRow}>
              <View style={{ flex: 1 }}><Text style={styles.itemName}>{item.itemName} ({item.itemNumber})</Text><Text style={styles.itemSub}>Barcode: {item.barcode || 'N/A'} | {item.category} | {item.purity}</Text></View>
              <View style={{ alignItems: 'flex-end' }}><Text style={styles.itemCount}>{item.count} pcs</Text><Text style={styles.itemWeight}>{Number(item.weight).toFixed(3)} g</Text></View>
            </View>
          ))}
          
          <View style={styles.divider} />
          
          <View style={styles.row}><Text style={styles.label}>Total Items:</Text><Text style={styles.summaryValue}>{transaction.totalItems}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Total Weight Issued:</Text><Text style={styles.summaryValue}>{Number(transaction.totalGram).toFixed(3)}g</Text></View>
          
          <View style={styles.divider} />

          <View style={styles.row}><Text style={styles.label}>Old Balance Before:</Text><Text style={styles.value}>{Number(transaction.oldBalanceBefore).toFixed(3)}g</Text></View>
          <View style={styles.row}><Text style={styles.label}>Old Balance After:</Text><Text style={[styles.summaryValue, { color: '#27AE60' }]}>{Number(transaction.oldBalanceAfter).toFixed(3)}g</Text></View>
        </View>
      </ScrollView>

      {/* Fixed Actions Footer */}
      <View style={styles.actionsContainer}>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity 
            style={[styles.actionBtn, (printing || sharing) && { opacity: 0.6 }]} 
            disabled={printing || sharing}
            onPress={() => withPrintLock(setPrinting, () => LineStockPrintService.printBill(transaction))}
          >
            {printing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print Bill'}</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.actionBtn, {backgroundColor: '#25D366'}, (printing || sharing) && { opacity: 0.6 }]} 
            disabled={printing || sharing}
            onPress={() => withPrintLock(setSharing, () => LineStockPrintService.shareWhatsApp(transaction))}
          >
            {sharing ? <ActivityIndicator size="small" color="#FFF" /> : <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity 
          style={[styles.actionBtn, {backgroundColor: '#2E7D32', marginTop: 12}]} 
          disabled={printing || sharing}
          onPress={() => navigation.navigate('LineStockDashboard')}
        >
          <MaterialCommunityIcons name="content-save-check" size={20} color="#FFF" />
          <Text style={styles.actionText}>Save Transaction</Text>
        </TouchableOpacity>
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
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 160 },
  billCard: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, elevation: 3 },
  shopName: { fontSize: 18, fontWeight: '800', color: DARK_BROWN, textAlign: 'center' },
  billType: { fontSize: 13, fontWeight: '700', color: '#8A6B3C', textAlign: 'center', marginTop: 4 },
  divider: { height: 1, backgroundColor: '#F0E4CC', marginVertical: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  label: { fontSize: 13, color: '#8A6B3C', fontWeight: '600' },
  value: { fontSize: 14, color: DARK_BROWN, fontWeight: '700' },
  summaryValue: { fontSize: 15, color: DARK_BROWN, fontWeight: '800' },
  itemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  itemName: { fontSize: 13, color: DARK_BROWN, fontWeight: '700' },
  itemSub: { fontSize: 11, color: '#8A6B3C', marginTop: 2 },
  itemCount: { fontSize: 12, color: DARK_BROWN, fontWeight: '600' },
  itemWeight: { fontSize: 13, color: DARK_BROWN, fontWeight: '800', marginTop: 2 },
  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 16, elevation: 20, borderTopWidth: 1, borderTopColor: '#F0E4CC' },
  actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: DARK_BROWN, paddingVertical: 14, borderRadius: 12, gap: 8 },
  actionText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});
