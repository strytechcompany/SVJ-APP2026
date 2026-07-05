import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useStock } from '../../context/StockContext';
import { printJewelryLabel } from '../../services/UsbPrinterService.js';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

function DetailRow({ icon, label, value }) {
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIconWrap}>
        <MaterialCommunityIcons name={icon} size={16} color={GOLD} />
      </View>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value ?? '—'}</Text>
      </View>
    </View>
  );
}

export default function StockDetailScreen({ navigation, route }) {
  const { itemId } = route.params;
  const { getStockById, deleteStock } = useStock();

  const insets = useSafeAreaInsets();
  const topPadding = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [printing, setPrinting] = useState(false);

  useEffect(() => {
    loadItem();
  }, [itemId]);

  const loadItem = async () => {
    try {
      setLoading(true);
      const res = await getStockById(itemId);
      if (res.success) setItem(res.data);
      else Alert.alert('Error', res.message || 'Item not found');
    } catch {
      Alert.alert('Error', 'Failed to load item details');
    } finally {
      setLoading(false);
    }
  };

  const handlePrintLabel = async () => {
    setPrinting(true);
    try {
      await printJewelryLabel({
        itemName: item.itemName || item.designName,
        itemNumber: item.itemNumber,
        purity: item.purity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        barcode: item.barcode || item.itemNumber,
      });
      Alert.alert('Printed', 'QR label sent to thermal printer.');
    } catch (err) {
      Alert.alert('Print Failed', err.message || 'Could not print the label.');
    } finally {
      setPrinting(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Item',
      `Delete ${item?.itemNumber} permanently?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteStock(item._id);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete. Try again.');
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={styles.loadingText}>Loading details...</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.container, styles.center]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#C9A227" />
        <Text style={styles.errorText}>Item not found</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => navigation.goBack()}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />

      {/* ─── Header ─── */}
      <View style={[styles.header, { paddingTop: topPadding }]}>
        <TouchableOpacity
          style={styles.headerBtn}
          onPress={() => navigation.goBack()}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Stock Details</Text>
          <Text style={styles.headerSub}>{item.itemNumber}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >

        {/* ─── Hero Card ─── */}
        <View style={styles.heroCard}>
          <View style={styles.heroIconCircle}>
            <MaterialCommunityIcons name="diamond" size={32} color={HEADER_BG} />
          </View>
          <Text style={styles.heroDesignName}>{item.designName.toUpperCase()}</Text>
          <View style={styles.heroBadgeRow}>
            <View style={styles.heroBadge}>
              <Text style={styles.heroBadgeText}>{item.category}</Text>
            </View>
            <View style={[styles.heroBadge, styles.heroBadgeGold]}>
              <Text style={[styles.heroBadgeText, { color: HEADER_BG }]}>{item.purity}</Text>
            </View>
          </View>
        </View>

        {/* ─── Details Card ─── */}
        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Item Information</Text>

          <DetailRow icon="identifier" label="Item Number" value={item.itemNumber} />
          <View style={styles.rowSep} />
          <DetailRow icon="diamond-stone" label="Design Name" value={item.designName} />
          <View style={styles.rowSep} />
          <DetailRow icon="tag-multiple" label="Category" value={item.category} />
          <View style={styles.rowSep} />
          <DetailRow icon="domain" label="Supplier" value={item.supplierName || 'N/A'} />
        </View>

        {/* ─── Weight & Purity Card ─── */}
        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Weight & Purity</Text>

          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{Number(item.grossWeight).toFixed(3)}</Text>
              <Text style={styles.statLabel}>Gross Wt (g)</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{Number(item.netWeight).toFixed(3)}</Text>
              <Text style={styles.statLabel}>Net Wt (g)</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{item.quantity}</Text>
              <Text style={styles.statLabel}>Qty</Text>
            </View>
          </View>

          <View style={styles.rowSep} />
          <DetailRow icon="gold" label="Purity" value={item.purity} />
          <View style={styles.rowSep} />
          <DetailRow
            icon="percent"
            label="Buying Touch"
            value={item.buyingTouch ? `${item.buyingTouch}%` : '0%'}
          />
        </View>

        {/* ─── Barcode Card ─── */}
        {item.barcode && (
          <View style={styles.barcodeCard}>
            <MaterialCommunityIcons name="qrcode" size={22} color={GOLD} />
            <Text style={styles.barcodeLabel}>QR Code</Text>
            <Text style={styles.barcodeValue}>{item.barcode}</Text>
          </View>
        )}

        {/* ─── Notes ─── */}
        {item.notes ? (
          <View style={styles.detailCard}>
            <Text style={styles.cardTitle}>Notes</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}

        {/* ─── Timestamps ─── */}
        <View style={styles.detailCard}>
          <Text style={styles.cardTitle}>Record Info</Text>
          <DetailRow icon="calendar-plus" label="Created" value={formatDate(item.createdAt)} />
          <View style={styles.rowSep} />
          <DetailRow icon="calendar-edit" label="Updated" value={formatDate(item.updatedAt)} />
          {item.createdBy?.name && (
            <>
              <View style={styles.rowSep} />
              <DetailRow icon="account" label="Added By" value={item.createdBy.name} />
            </>
          )}
        </View>

        {/* ─── Action Buttons ─── */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.printBtn, printing && styles.btnDisabled]}
            onPress={handlePrintLabel}
            activeOpacity={0.85}
            disabled={printing}
          >
            {printing ? (
              <ActivityIndicator color={HEADER_BG} size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="qrcode" size={18} color={HEADER_BG} />
                <Text style={styles.printBtnText}>Print QR Label</Text>
              </>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.deleteBtn, deleting && styles.btnDisabled]}
            onPress={handleDelete}
            activeOpacity={0.85}
            disabled={deleting}
          >
            {deleting ? (
              <ActivityIndicator color="#FFFFFF" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFFFFF" />
                <Text style={styles.deleteBtnText}>Delete Stock</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  center: { justifyContent: 'center', alignItems: 'center' },
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
    zIndex: 10,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: '#A08850', fontSize: 11, fontWeight: '600', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },

  heroCard: {
    backgroundColor: HEADER_BG,
    borderRadius: 20,
    paddingVertical: 28,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  heroIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  heroDesignName: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  heroBadgeRow: { flexDirection: 'row', gap: 8 },
  heroBadge: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A08850',
  },
  heroBadgeGold: { backgroundColor: GOLD, borderColor: GOLD },
  heroBadgeText: { fontSize: 12, fontWeight: '700', color: '#D4AF37' },

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#F0E6D0',
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A08850',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  detailIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF8E8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#A08850', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, color: DARK_BROWN, fontWeight: '700', marginTop: 1 },
  rowSep: { height: 1, backgroundColor: '#F5EDD8', marginVertical: 4 },

  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 14,
    backgroundColor: '#FDFAF3',
    borderRadius: 12,
    marginBottom: 10,
  },
  statBox: { alignItems: 'center', flex: 1 },
  statValue: { fontSize: 18, fontWeight: '800', color: DARK_BROWN },
  statLabel: { fontSize: 10, color: '#A08850', fontWeight: '600', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
  statDivider: { width: 1, height: 40, backgroundColor: '#E5D8C0' },

  barcodeCard: {
    backgroundColor: HEADER_BG,
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
  },
  barcodeLabel: { color: '#A08850', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 8 },
  barcodeValue: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1.5,
    marginTop: 6,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },

  notesText: { fontSize: 14, color: DARK_BROWN, lineHeight: 22, fontWeight: '500' },

  actionRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  editBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 15,
    gap: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  editBtnText: { color: HEADER_BG, fontSize: 15, fontWeight: '800' },
  printBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: GOLD,
    borderRadius: 16,
    paddingVertical: 15,
    gap: 8,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 5,
  },
  printBtnText: { color: HEADER_BG, fontSize: 15, fontWeight: '800' },
  deleteBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#C0392B',
    borderRadius: 16,
    paddingVertical: 15,
    gap: 8,
    shadowColor: '#C0392B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  deleteBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },

  loadingText: { color: '#A08850', marginTop: 12, fontSize: 14, fontWeight: '600' },
  errorText: { color: DARK_BROWN, fontSize: 18, fontWeight: '700', marginTop: 12 },
  backLink: { marginTop: 16 },
  backLinkText: { color: GOLD, fontWeight: '700', fontSize: 14 },
});
