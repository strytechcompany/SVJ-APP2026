import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, StatusBar, Alert, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SettlementPrintService } from '../../services/PrintService';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const BG = '#F8F4E8';

export default function SettlementPreviewScreen({ route, navigation }) {
  const { settlement, originalBillNumber } = route.params;
  const insets = useSafeAreaInsets();
  const [printing, setPrinting] = useState(false);
  const [sharing, setSharing] = useState(false);
  const printLockRef = useRef(false);

  const withPrintLock = async (stateSetter, fn) => {
    if (printLockRef.current) return;
    printLockRef.current = true;
    stateSetter(true);
    const timeout = setTimeout(() => { printLockRef.current = false; stateSetter(false); }, 60000);
    try {
      await fn();
    } catch (e) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Error', e?.message || 'Could not complete action.');
      }
    } finally {
      clearTimeout(timeout);
      printLockRef.current = false;
      stateSetter(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={DARK_BROWN} />
      <View style={[styles.header, { paddingTop: insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settlement Preview</Text>
        <View style={{width: 40}} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.thermalPaper}>
          <Text style={styles.brandTitle}>Sri Vaishnavi Jewellers</Text>
          <Text style={styles.centerText}>No 370, Big Bazaar Street</Text>
          <Text style={styles.centerText}>(Opp - B.G. Naidu Sweets)</Text>
          <Text style={styles.centerText}>Phone: 8248134521</Text>

          <Text style={styles.divider}>================================</Text>
          <Text style={styles.docType}>SETTLEMENT RECEIPT</Text>
          <Text style={styles.divider}>================================</Text>

          <View style={styles.row}>
            <Text style={styles.mono}>Receipt No:</Text>
            <Text style={styles.monoBold}>{settlement.settlementBillNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.mono}>Original Bill:</Text>
            <Text style={styles.monoBold}>{originalBillNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.mono}>Date:</Text>
            <Text style={styles.mono}>{new Date(settlement.createdAt).toLocaleDateString('en-GB')} {new Date(settlement.createdAt).toLocaleTimeString('en-US', {hour:'2-digit', minute:'2-digit'})}</Text>
          </View>

          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={styles.sectionTitle}>SETTLEMENT DETAILS</Text>
          <View style={styles.row}><Text style={styles.mono}>Payment Mode:</Text><Text style={styles.mono}>{settlement.paymentMode}</Text></View>
          <View style={styles.row}><Text style={styles.mono}>Gold Rate:</Text><Text style={styles.mono}>₹{settlement.goldRateAtSettlement?.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.monoBold}>Amount Paid:</Text><Text style={[styles.monoBold, {color: '#2E7D32'}]}>₹{settlement.amountPaid.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.monoBold}>Gram Settled:</Text><Text style={[styles.monoBold, {color: '#2E7D32'}]}>{settlement.gramSettled.toFixed(3)}g</Text></View>
          {settlement.description ? (
            <View style={styles.row}><Text style={styles.mono}>Desc:</Text><Text style={[styles.mono, {maxWidth:'60%', textAlign:'right'}]}>{settlement.description}</Text></View>
          ) : null}

          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={styles.sectionTitle}>BALANCE SUMMARY</Text>
          <View style={styles.row}><Text style={styles.mono}>Outstanding Before:</Text><Text style={styles.mono}>₹{settlement.outstandingBefore.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.mono}>Amount Paid:</Text><Text style={styles.mono}>- ₹{settlement.amountPaid.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.monoBold}>Outstanding After:</Text><Text style={styles.monoBold}>₹{settlement.outstandingAfter.toLocaleString('en-IN')}</Text></View>
          <View style={{marginTop: 8}} />
          <View style={styles.row}><Text style={styles.monoBold}>Status:</Text><Text style={styles.monoBold}>{settlement.outstandingAfter <= 0 ? 'PAID' : 'PARTIAL'}</Text></View>

          <Text style={styles.divider}>--------------------------------</Text>
          <Text style={styles.footerMsg}>Thank You For Your Payment</Text>
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions */}
      <View style={styles.actionsContainer}>
        <View style={styles.actionsBar}>
          <TouchableOpacity 
            style={[styles.actionBtn, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setPrinting, () => SettlementPrintService.printReceipt(settlement, originalBillNumber))}
          >
            {printing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <MaterialCommunityIcons name="printer" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{printing ? 'Printing…' : 'Print Receipt'}</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={[styles.actionBtn, { backgroundColor: '#25D366' }, (printing || sharing) && { opacity: 0.6 }]}
            disabled={printing || sharing}
            onPress={() => withPrintLock(setSharing, () => SettlementPrintService.shareWhatsApp(settlement, originalBillNumber))}
          >
            {sharing
              ? <ActivityIndicator size="small" color="#FFF" />
              : <MaterialCommunityIcons name="whatsapp" size={20} color="#FFF" />}
            <Text style={styles.actionText}>{sharing ? 'Sharing…' : 'WhatsApp'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: { backgroundColor: DARK_BROWN, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: GOLD, textAlign: 'center' },
  scroll: { padding: 16, paddingBottom: 100, alignItems: 'center' },
  
  thermalPaper: {
    backgroundColor: '#FFFFFF', 
    width: 320, 
    padding: 16,
    paddingBottom: 40,
    elevation: 5,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 5, shadowOffset: { height: 3, width: 0 }
  },
  
  brandTitle: { textAlign: 'center', fontWeight: '800', fontSize: 18, color: '#000', marginBottom: 4 },
  centerText: { textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#000', marginBottom: 2 },
  docType: { textAlign: 'center', fontWeight: 'bold', fontSize: 14, color: '#000', marginVertical: 4 },
  
  divider: { textAlign: 'center', color: '#000', marginVertical: 4 },
  sectionTitle: { fontWeight: 'bold', fontSize: 12, color: '#000', marginBottom: 4 },
  
  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 2 },
  mono: { fontFamily: 'monospace', fontSize: 11, color: '#000' },
  monoBold: { fontFamily: 'monospace', fontSize: 12, color: '#000', fontWeight: 'bold' },
  
  footerMsg: { textAlign: 'center', fontFamily: 'monospace', fontSize: 11, color: '#000', marginTop: 10 },

  actionsContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#FFF', padding: 12, elevation: 10, borderTopWidth: 1, borderColor: '#EEE' },
  actionsBar: { flexDirection: 'row', justifyContent: 'space-around' },
  actionBtn: { flex: 1, backgroundColor: DARK_BROWN, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginHorizontal: 4, borderRadius: 8, gap: 6 },
  actionText: { color: '#FFF', fontWeight: '700', fontSize: 13 }
});
