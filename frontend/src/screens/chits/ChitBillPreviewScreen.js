import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  SafeAreaView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ChitPrintService } from '../../services/ChitPrintService';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

export default function ChitBillPreviewScreen({ route, navigation }) {
  const { transaction, customer } = route.params;
  const [printing, setPrinting] = useState(false);
  const [sharing,  setSharing]  = useState(false);
  const [tamilMsg, setTamilMsg] = useState(
    'நீங்கள் வாங்கும் ஒவ்வொரு கிராம் தங்கமும், உங்கள் எதிர்காலத்தின் ஒளிமயமான சேமிப்பு.'
  );

  // Synchronous ref-lock — prevents double-tap before React state re-renders
  const printLockRef = useRef(false);

  const withPrintLock = async (stateSetter, fn) => {
    if (printLockRef.current) return; // silently ignore — already busy
    printLockRef.current = true;
    stateSetter(true);
    const timeout = setTimeout(() => {
      printLockRef.current = false;
      stateSetter(false);
    }, 60000);
    try {
      await fn();
    } catch (e) {
      if (!e?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Error', e?.message || 'Action failed. Please try again.');
      }
    } finally {
      clearTimeout(timeout);
      printLockRef.current = false;
      stateSetter(false);
    }
  };

  const handlePrint = () => withPrintLock(setPrinting, () =>
    ChitPrintService.printThermal(transaction, customer, tamilMsg)
  );

  const handleWhatsApp = () => withPrintLock(setSharing, () =>
    ChitPrintService.shareWhatsApp(transaction, customer, tamilMsg)
  );

  // Save = transaction already saved in DB; just navigate home
  const handleSave = () => {
    navigation.navigate('ChitFund');
  };

  const isCompleted = transaction.installmentNumber >= transaction.totalInstallments;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.closeBtn} onPress={() => navigation.navigate('ChitFund')}>
          <MaterialCommunityIcons name="close" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Bill Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ padding: 16 }}>
        <View style={styles.receiptCard}>
          <View style={styles.shopHeader}>
            <Text style={styles.shopName}>SRI VAISHNAVI JEWELLERS</Text>
            <Text style={styles.shopAddress}>No 370, Big Bazaar Street</Text>
            <Text style={styles.shopAddress}>(Opp - B.G. Naidu Sweets)</Text>
            <Text style={styles.shopPhone}>Phone: 8248134521</Text>
          </View>

          <View style={styles.dashedLine} />

          <View style={styles.row}>
            <Text style={styles.label}>Txn No:</Text>
            <Text style={styles.val}>{transaction.receiptNumber}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Date:</Text>
            <Text style={styles.val}>
              {new Date(transaction.paymentDate).toLocaleDateString('en-GB')}
            </Text>
          </View>

          <View style={styles.dashedLine} />
          <Text style={styles.receiptTitle}>CHIT INSTALLMENT RECEIPT</Text>
          <View style={styles.dashedLine} />

          <Text style={styles.sectionTitle}>CUSTOMER DETAILS</Text>
          <View style={styles.row}><Text style={styles.label}>Name:</Text><Text style={styles.val}>{customer.customerName}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Phone:</Text><Text style={styles.val}>{customer.phoneNumber}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Chit ID:</Text><Text style={styles.val}>{customer.chitId}</Text></View>
          <View style={styles.row}>
            <Text style={styles.label}>Installment:</Text>
            <Text style={styles.val}>{transaction.installmentNumber} / {transaction.totalInstallments}</Text>
          </View>

          <View style={styles.dashedLine} />

          <Text style={styles.sectionTitle}>CHIT DETAILS</Text>
          <View style={styles.row}><Text style={styles.label}>Monthly Amount:</Text><Text style={styles.val}>₹{transaction.amount.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Gold Rate:</Text><Text style={styles.val}>₹{transaction.goldRate.toLocaleString('en-IN')}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Previous Total Wt:</Text><Text style={styles.val}>{(transaction.previousWeight || 0).toFixed(4)} g</Text></View>
          <View style={styles.row}><Text style={styles.label}>Current Wt:</Text><Text style={styles.val}>{transaction.purchasedWeight.toFixed(4)} g</Text></View>
          <View style={styles.row}>
            <Text style={[styles.label, { fontWeight: 'bold' }]}>Total Weight:</Text>
            <Text style={[styles.val, { fontWeight: 'bold', color: DARK_BROWN }]}>
              {transaction.runningWeight.toFixed(4)} g
            </Text>
          </View>

          <View style={styles.dashedLine} />

          <Text style={styles.sectionTitle}>PAYMENT DETAILS</Text>
          <View style={styles.row}><Text style={styles.label}>Mode:</Text><Text style={styles.val}>{transaction.paymentMode || 'Cash'}</Text></View>

          <View style={styles.dashedLine} />

          <View style={styles.statusBox}>
            <Text style={styles.statusText}>
              STATUS: {isCompleted ? 'CHIT COMPLETED' : 'ACTIVE'}
            </Text>
          </View>

          {!isCompleted && (
            <View style={{ marginTop: 10 }}>
              <View style={styles.row}>
                <Text style={styles.label}>Next Installment:</Text>
                <Text style={styles.val}>{transaction.installmentNumber + 1}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Due Date:</Text>
                <Text style={styles.val}>
                  {new Date(
                    new Date(transaction.paymentDate).setMonth(
                      new Date(transaction.paymentDate).getMonth() + 1
                    )
                  ).toLocaleDateString('en-GB')}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.messageContainer}>
          <Text style={styles.sectionTitle}>Customer Message (Editable)</Text>
          <TextInput
            style={styles.messageInput}
            value={tamilMsg}
            onChangeText={setTamilMsg}
            multiline
          />
        </View>
      </ScrollView>

      {/* ── Bottom Action Bar ── */}
      <View style={styles.bottomBar}>
        {/* Print Thermal */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#E3F2FD' }, (printing || sharing) && styles.btnDisabled]}
          onPress={handlePrint}
          disabled={printing || sharing}
          activeOpacity={0.8}
        >
          {printing
            ? <ActivityIndicator size="small" color="#1565C0" />
            : <MaterialCommunityIcons name="printer" size={20} color="#1565C0" />}
          <Text style={[styles.actionText, { color: '#1565C0' }]}>
            {printing ? 'Printing…' : 'Print'}
          </Text>
        </TouchableOpacity>

        {/* WhatsApp Share */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#E8F5E9' }, (printing || sharing) && styles.btnDisabled]}
          onPress={handleWhatsApp}
          disabled={printing || sharing}
          activeOpacity={0.8}
        >
          {sharing
            ? <ActivityIndicator size="small" color="#2E7D32" />
            : <MaterialCommunityIcons name="whatsapp" size={20} color="#2E7D32" />}
          <Text style={[styles.actionText, { color: '#2E7D32' }]}>
            {sharing ? 'Sharing…' : 'WhatsApp'}
          </Text>
        </TouchableOpacity>

        {/* Save — navigate to ChitFund */}
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: '#FFF3E0' }]}
          onPress={handleSave}
          activeOpacity={0.8}
        >
          <MaterialCommunityIcons name="content-save-check" size={20} color="#E65100" />
          <Text style={[styles.actionText, { color: '#E65100' }]}>Save</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: BG },
  header:           { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#FFF', elevation: 2 },
  closeBtn:         { padding: 8, marginLeft: -8 },
  headerTitle:      { flex: 1, textAlign: 'center', fontSize: 18, fontWeight: '800', color: DARK_BROWN },
  content:          { flex: 1 },
  receiptCard:      { backgroundColor: '#FFF', margin: 16, padding: 20, borderRadius: 12, elevation: 4 },
  shopHeader:       { alignItems: 'center', marginBottom: 10 },
  shopName:         { fontSize: 18, fontWeight: '900', color: DARK_BROWN },
  shopAddress:      { fontSize: 12, color: '#666', marginTop: 2 },
  shopPhone:        { fontSize: 12, color: '#666', marginTop: 2, fontWeight: '700' },
  dashedLine:       { borderBottomWidth: 1, borderBottomColor: '#CCC', borderStyle: 'dashed', marginVertical: 12 },
  row:              { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  label:            { fontSize: 13, color: '#555' },
  val:              { fontSize: 13, fontWeight: '600', color: '#333' },
  receiptTitle:     { textAlign: 'center', fontSize: 15, fontWeight: '800', color: DARK_BROWN, letterSpacing: 0.5 },
  sectionTitle:     { fontSize: 12, fontWeight: '800', color: '#888', marginBottom: 8, marginTop: 4 },
  statusBox:        { backgroundColor: '#FFF9F0', padding: 12, alignItems: 'center', borderRadius: 8 },
  statusText:       { fontSize: 14, fontWeight: '800', color: GOLD },
  messageContainer: { marginHorizontal: 16, marginBottom: 20 },
  messageInput:     { backgroundColor: '#FFF', borderWidth: 1, borderColor: '#E0E0E0', borderRadius: 8, padding: 12, fontSize: 13, color: '#444', textAlignVertical: 'top', minHeight: 60 },
  bottomBar:        { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFF', elevation: 10, gap: 8 },
  actionBtn:        { flex: 1, paddingVertical: 12, borderRadius: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  actionText:       { fontSize: 13, fontWeight: '700' },
  btnDisabled:      { opacity: 0.5 },
});
