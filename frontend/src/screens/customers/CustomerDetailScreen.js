import React, { useEffect, useState, useCallback } from 'react';
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
  Modal,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useCustomer } from '../../context/CustomerContext';
import { useAuth } from '../../context/AuthContext';
import { resolveDisplayBalance } from '../../utils/balanceDisplay';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const HEADER_BG = '#3D2200';
const BG = '#F8F4E8';

const TYPE_COLORS = {
  B2C: { bg: '#FFF3E0', text: '#E65100', border: '#FFCC80' },
  B2D: { bg: '#EDE7F6', text: '#4527A0', border: '#CE93D8' },
};

function DetailRow({ icon, label, value }) {
  if (!value) return null;
  return (
    <View style={styles.detailRow}>
      <View style={styles.detailIcon}>
        <MaterialCommunityIcons name={icon} size={15} color={GOLD} />
      </View>
      <View style={styles.detailText}>
        <Text style={styles.detailLabel}>{label}</Text>
        <Text style={styles.detailValue}>{value}</Text>
      </View>
    </View>
  );
}

function formatDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function CustomerDetailScreen({ navigation, route }) {
  const { customerId } = route.params;
  const { getCustomerById, deleteCustomer } = useCustomer();

  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [customer, setCustomer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [activeTab, setActiveTab] = useState('Profile');
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const { user: authUser } = useAuth();
  const isAdmin = authUser?.role === 'SuperAdmin' || authUser?.role === 'Admin';

  const [editingBill, setEditingBill] = useState(null);
  const [editItems, setEditItems] = useState([]);
  const [editSaving, setEditSaving] = useState(false);
  const [deletingBillId, setDeletingBillId] = useState(null);

  // Refetch on every focus (covers initial mount too) so a balance updated by
  // a B2C/B2D/Line Stock transaction elsewhere is always shown fresh from MongoDB.
  useFocusEffect(
    useCallback(() => {
      loadCustomer();
    }, [customerId])
  );

  const loadCustomer = async () => {
    try {
      setLoading(true);
      const res = await getCustomerById(customerId);
      if (res.success) setCustomer(res.data);
      else Alert.alert('Error', res.message || 'Customer not found');
    } catch {
      Alert.alert('Error', 'Failed to load customer details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'History' && customer && history.length === 0) {
      loadHistory();
    }
  }, [activeTab, customer]);

  const handleEditBill = (bill) => {
    const items = (bill.issueItems || []).map(item => ({
      ...item,
      originalCount: item.count || 1,
      unitWeight: (item.count || 1) > 0 ? (item.weight || 0) / (item.count || 1) : 0,
      unitAmount: (item.count || 1) > 0 ? (item.amount || 0) / (item.count || 1) : 0,
      unitPurity: (item.count || 1) > 0 ? (item.purity || 0) / (item.count || 1) : 0,
    }));
    setEditItems(items);
    setEditingBill(bill);
  };

  const handleEditItemCount = (idx, delta) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const newCount = Math.max(1, (item.count || 1) + delta);
      return {
        ...item,
        count: newCount,
        weight: parseFloat((item.unitWeight * newCount).toFixed(3)),
        amount: parseFloat((item.unitAmount * newCount).toFixed(2)),
        purity: parseFloat((item.unitPurity * newCount).toFixed(3)),
      };
    }));
  };

  const handleRemoveEditItem = (idx) => {
    if (editItems.length <= 1) {
      Alert.alert('Cannot Remove', 'At least one item must remain in the bill.');
      return;
    }
    setEditItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleSaveEdit = async () => {
    if (!editingBill || editItems.length === 0) return;
    setEditSaving(true);
    try {
      const { transactionAPI } = require('../../services/api');
      const newIssueItems = editItems.map(item => ({
        stockId: item.stockId,
        billNo: item.billNo,
        itemNumber: item.itemNumber,
        itemName: item.itemName,
        weight: item.weight,
        count: item.count,
        sriCost: item.sriCost,
        sriBill: item.sriBill,
        plus: item.plus,
        purity: item.purity,
        amount: item.amount,
      }));
      await transactionAPI.update(editingBill._id, { newIssueItems });
      setEditingBill(null);
      setEditItems([]);
      setHistory([]);
      await loadHistory();
      await loadCustomer();
      Alert.alert('Success', 'Bill updated successfully.');
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to update bill.');
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteBill = (bill) => {
    Alert.alert(
      'Delete Bill',
      `Delete bill #${bill._id.slice(-6).toUpperCase()}?\n\nAll sold items will be restored to stock. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeletingBillId(bill._id);
            try {
              const { transactionAPI } = require('../../services/api');
              await transactionAPI.delete(bill._id);
              setHistory(prev => prev.filter(h => h._id !== bill._id));
              await loadCustomer();
              Alert.alert('Deleted', 'Bill deleted and stock restored.');
            } catch (e) {
              Alert.alert('Error', e.response?.data?.message || 'Failed to delete bill.');
            } finally {
              setDeletingBillId(null);
            }
          },
        },
      ]
    );
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const { transactionAPI, lineStockAPI } = require('../../services/api');
      
      let combinedHistory = [];
      
      if (customer.customerType === 'LINE_STOCKER') {
        const lsRes = await lineStockAPI.getTransactions({ search: customer.customerName, limit: 100 });
        if (lsRes.data.success) {
          const lsData = lsRes.data.data
            .filter(ls => ls.customerId?._id === customerId)
            .map(ls => ({
              ...ls,
              historyType: 'LINE_STOCK',
              transactionType: 'LINE_STOCK',
              createdAt: ls.issueDate,
              status: ls.status,
            }));
          combinedHistory = [...combinedHistory, ...lsData];
        }
      } else {
        const res = await transactionAPI.getByCustomer(customerId);
        if (res.data.success) {
          combinedHistory = [...combinedHistory, ...res.data.data];
        }
      }
      
      // Sort desc by date
      combinedHistory.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      setHistory(combinedHistory);
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Customer',
      `Delete ${customer?.customerName}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteCustomer(customer._id);
              navigation.goBack();
            } catch {
              Alert.alert('Error', 'Failed to delete. Try again.');
            } finally { setDeleting(false); }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={GOLD} />
      </View>
    );
  }

  if (!customer) {
    return (
      <View style={[styles.container, styles.center]}>
        <MaterialCommunityIcons name="alert-circle-outline" size={48} color={GOLD} />
        <Text style={styles.errorText}>Customer not found</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}>
          <Text style={styles.backLinkText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const typeStyle = TYPE_COLORS[customer.customerType] || TYPE_COLORS.B2C;
  const financialBalance = resolveDisplayBalance(customer.oldBalance, customer.advance);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={HEADER_BG} />
      <View style={[styles.header, { paddingTop: topPad }]}>
        <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Customer Details</Text>
          <Text style={styles.headerSub}>{customer.customerCode}</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, activeTab === 'Profile' && styles.activeTab]} onPress={() => setActiveTab('Profile')}>
          <Text style={[styles.tabText, activeTab === 'Profile' && styles.activeTabText]}>Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'History' && styles.activeTab]} onPress={() => setActiveTab('History')}>
          <Text style={[styles.tabText, activeTab === 'History' && styles.activeTabText]}>History</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'Profile' ? (
          <>

        {/* Hero */}
        <View style={styles.heroCard}>
          <View style={styles.heroAvatar}>
            <Text style={styles.heroAvatarText}>{customer.customerName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.heroName}>{customer.customerName}</Text>
          <View style={[styles.typeBadge, { backgroundColor: typeStyle.bg, borderColor: typeStyle.border }]}>
            <Text style={[styles.typeText, { color: typeStyle.text }]}>{customer.customerType}</Text>
          </View>
          <Text style={styles.heroCode}>{customer.customerCode}</Text>
        </View>

        {/* Info Card */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Contact Information</Text>
          <DetailRow icon="account-outline" label="Customer Name" value={customer.customerName} />
          <View style={styles.sep} />
          <DetailRow icon="phone-outline" label="Phone Number" value={customer.phoneNumber} />
          {customer.shopName ? (
            <><View style={styles.sep} /><DetailRow icon="store-outline" label="Shop Name" value={customer.shopName} /></>
          ) : null}
          {customer.dealerCompanyName ? (
            <><View style={styles.sep} /><DetailRow icon="office-building-outline" label="Dealer Company" value={customer.dealerCompanyName} /></>
          ) : null}
          {customer.gstNumber ? (
            <><View style={styles.sep} /><DetailRow icon="file-document-outline" label="GST Number" value={customer.gstNumber} /></>
          ) : null}
          <View style={styles.sep} />
          <DetailRow icon="map-marker-outline" label="Address" value={customer.address} />
        </View>

        {/* Balance Card */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Financial</Text>
          <View style={styles.balanceRow}>
            <View style={styles.balBox}>
              <Text style={styles.balLabel}>{financialBalance.label}</Text>
              <Text style={[styles.balValue, financialBalance.label === 'Advance' && { color: '#2E7D32' }]}>
                ₹ {financialBalance.value.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Remarks */}
        {customer.remarks ? (
          <View style={styles.infoCard}>
            <Text style={styles.cardTitle}>Remarks</Text>
            <Text style={styles.remarksText}>{customer.remarks}</Text>
          </View>
        ) : null}

        {/* Timestamps */}
        <View style={styles.infoCard}>
          <Text style={styles.cardTitle}>Record Info</Text>
          <DetailRow icon="account-outline" label="Admin Name" value={customer.createdBy?.name || customer.createdBy || '—'} />
          <View style={styles.sep} />
          <DetailRow icon="calendar-plus" label="Created At" value={formatDate(customer.createdAt)} />
          <View style={styles.sep} />
          <DetailRow icon="calendar-edit" label="Updated At" value={formatDate(customer.updatedAt)} />
        </View>

        {/* Action Buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.editBtn}
            onPress={() => navigation.navigate('EditCustomer', { customer })}
            activeOpacity={0.85}
          >
            <MaterialCommunityIcons name="pencil-outline" size={18} color={BG} />
            <Text style={styles.editBtnText}>Edit Customer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.delBtn, deleting && styles.btnDisabled]}
            onPress={handleDelete}
            activeOpacity={0.85}
            disabled={deleting}
          >
            {deleting
              ? <ActivityIndicator color="#FFF" size="small" />
              : <>
                  <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFF" />
                  <Text style={styles.delBtnText}>Delete</Text>
                </>
            }
          </TouchableOpacity>
        </View>
        </>
        ) : (
          <View>
            <View style={styles.infoCard}>
              <Text style={styles.cardTitle}>Customer Ledger Summary</Text>
              <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:12}}>
                <View>
                  <Text style={styles.detailLabel}>Total Txns</Text>
                  <Text style={styles.detailValue}>{customer.transactionCount || 0}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Last Txn</Text>
                  <Text style={styles.detailValue}>{formatDate(customer.lastTransactionDate)}</Text>
                </View>
              </View>
              <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:12}}>
                <View>
                  <Text style={styles.detailLabel}>Total Purchase</Text>
                  <Text style={[styles.detailValue, {color:'#D32F2F'}]}>₹{customer.totalPurchaseAmount?.toLocaleString('en-IN') || 0}</Text>
                </View>
                <View>
                  <Text style={styles.detailLabel}>Total Receipt</Text>
                  <Text style={[styles.detailValue, {color:'#2E7D32'}]}>₹{customer.totalReceiptAmount?.toLocaleString('en-IN') || 0}</Text>
                </View>
              </View>
              <View style={styles.sep}/>
              <View style={styles.balanceRow}>
                <View style={styles.balBox}>
                  <Text style={styles.balLabel}>{financialBalance.label}</Text>
                  <Text style={[styles.balValue, financialBalance.label === 'Advance' && { color: '#2E7D32' }]}>
                    ₹ {financialBalance.value.toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>

            {loadingHistory ? (
              <ActivityIndicator color={GOLD} style={{marginTop: 20}}/>
            ) : history.length === 0 ? (
              <Text style={{textAlign:'center', color:'#888', marginTop: 20}}>No transactions found.</Text>
            ) : (
              history.map(item => {
                const isSettlement = item.historyType === 'SETTLEMENT';
                
                let finalVal = 0, collected = 0, outstanding = 0, status = 'PAID';
                if (!isSettlement) {
                  finalVal = item.finalAmount || 0;
                  collected = item.paymentMode === 'Gold' 
                    ? (item.goldConvertedAmount || 0) 
                    : (item.paymentDetails?.amount || 0);
                  
                  outstanding = item.outstandingAmount || (finalVal - collected) || 0;
                  
                  status = item.status || (outstanding <= 0 ? 'PAID' : 'PARTIAL');
                }

                return (
                  <TouchableOpacity 
                    key={item._id} 
                    style={[styles.infoCard, {padding:12, borderColor: isSettlement ? '#A5D6A7' : '#F0E4CC'}]}
                    onPress={() => {
                      if (item.historyType === 'LINE_STOCK') {
                        navigation.navigate('LineStockBillPreview', { transactionId: item._id });
                      } else if (isSettlement) {
                        navigation.navigate('SettlementPreview', { settlement: item, originalBillNumber: item.originalBillNumber });
                      } else if (item.transactionType === 'LINE_STOCK_SETTLEMENT') {
                        navigation.navigate('LineStockSettlementBillPreview', { settlementId: item.transactionNumber || item._id });
                      } else {
                        navigation.navigate('BillPreviewPlaceholder', { transactionId: item._id, type: item.transactionType });
                      }
                    }}
                  >
                    <View style={{flexDirection:'row', justifyContent:'space-between', marginBottom:6}}>
                      <Text style={{fontWeight:'800', color:DARK_BROWN}}>#{isSettlement ? item.settlementBillNumber : item._id.slice(-6).toUpperCase()}</Text>
                      <View style={{flexDirection: 'row', gap: 6}}>
                        {!isSettlement && item.transactionSubtype && (
                          <View style={[styles.typeBadge, {backgroundColor: '#E3F2FD'}]}>
                            <Text style={[styles.typeText, {color: '#1565C0'}]}>{item.transactionSubtype.replace('_', ' ')}</Text>
                          </View>
                        )}
                        <View style={[styles.typeBadge, { backgroundColor: isSettlement ? '#E8F5E9' : (status === 'PAID' ? '#E8F5E9' : '#FFF3E0') }]}>
                          <Text style={[styles.typeText, { color: isSettlement ? '#2E7D32' : (status === 'PAID' ? '#2E7D32' : '#E65100') }]}>
                            {isSettlement ? 'SETTLEMENT' : status}
                          </Text>
                        </View>
                      </View>
                    </View>
                    <Text style={{fontSize:12, color:'#666', marginBottom:6}}>{formatDate(item.createdAt)}</Text>
                    
                    {item.historyType === 'LINE_STOCK' ? (
                      <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4, borderTopWidth:1, borderColor:'#EEE', paddingTop:6}}>
                        <View>
                          <Text style={{fontSize:10, color:'#888'}}>Total Items</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>{item.totalItems}</Text>
                        </View>
                        <View>
                          <Text style={{fontSize:10, color:'#888'}}>Gram Issued</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color:'#D32F2F'}}>{item.totalGram?.toFixed(3)}g</Text>
                        </View>
                        <View style={{alignItems:'flex-end'}}>
                          <Text style={{fontSize:10, color:'#888'}}>Old Bal After</Text>
                          <Text style={{fontSize:13, fontWeight:'bold', color: '#2E7D32'}}>{item.oldBalanceAfter?.toFixed(3)}g</Text>
                        </View>
                      </View>
                    ) : isSettlement ? (
                      <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4, borderTopWidth:1, borderColor:'#EEE', paddingTop:6}}>
                        <View>
                          <Text style={{fontSize:10, color:'#888'}}>Amount Paid</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color:'#2E7D32'}}>₹{item.amountPaid?.toLocaleString('en-IN')||0}</Text>
                        </View>
                        <View>
                          <Text style={{fontSize:10, color:'#888'}}>Gram Settled</Text>
                          <Text style={{fontSize:12, fontWeight:'bold', color:'#2E7D32'}}>{item.gramSettled?.toFixed(3)||0}g</Text>
                        </View>
                        <View style={{alignItems:'flex-end'}}>
                          <Text style={{fontSize:10, color:'#888'}}>Outstanding</Text>
                          <Text style={{fontSize:13, fontWeight:'bold', color: item.outstandingAfter > 0 ? '#D32F2F' : '#2E7D32'}}>₹{item.outstandingAfter?.toLocaleString('en-IN')||0}</Text>
                        </View>
                      </View>
                    ) : (
                      <>
                        <View style={{flexDirection:'row', justifyContent:'space-between', marginTop:4, borderTopWidth:1, borderColor:'#EEE', paddingTop:6}}>
                          <View>
                            <Text style={{fontSize:10, color:'#888'}}>Subtotal</Text>
                            <Text style={{fontSize:12, fontWeight:'bold', color:'#333'}}>₹{finalVal.toLocaleString('en-IN')}</Text>
                          </View>
                          <View>
                            <Text style={{fontSize:10, color:'#888'}}>Collected</Text>
                            <Text style={{fontSize:12, fontWeight:'bold', color:'#2E7D32'}}>₹{collected.toLocaleString('en-IN')}</Text>
                          </View>
                          <View style={{alignItems:'flex-end'}}>
                            <Text style={{fontSize:10, color:'#888'}}>Outstanding</Text>
                            <Text style={{fontSize:13, fontWeight:'bold', color: outstanding > 0 ? '#D32F2F' : '#2E7D32'}}>₹{outstanding.toLocaleString('en-IN')}</Text>
                          </View>
                        </View>
                        {isAdmin && item.historyType === 'BILL' && (
                          <View style={styles.billActionRow}>
                            <TouchableOpacity
                              style={styles.billEditBtn}
                              onPress={() => {
                                if (item.isWastage) {
                                  navigation.navigate(`${item.transactionType}Calculation`, {
                                    type: item.transactionType,
                                    customerId: customer._id,
                                    editTransactionId: item._id,
                                    prefilledData: item,
                                  });
                                } else {
                                  handleEditBill(item);
                                }
                              }}
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={14} color={DARK_BROWN} />
                              <Text style={styles.billEditBtnText}>Edit</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.billDeleteBtn, deletingBillId === item._id && { opacity: 0.5 }]}
                              onPress={() => handleDeleteBill(item)}
                              disabled={deletingBillId === item._id}
                            >
                              {deletingBillId === item._id
                                ? <ActivityIndicator size="small" color="#FFF" />
                                : <>
                                    <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFF" />
                                    <Text style={styles.billDeleteBtnText}>Delete</Text>
                                  </>
                              }
                            </TouchableOpacity>
                          </View>
                        )}
                      </>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        )}
      </ScrollView>

      {/* ── Edit Bill Modal ──────────────────────────────────────── */}
      <Modal
        visible={!!editingBill}
        animationType="slide"
        transparent
        onRequestClose={() => { setEditingBill(null); setEditItems([]); }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHandle} />
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Edit Bill #{editingBill?._id?.slice(-6).toUpperCase()}
              </Text>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => { setEditingBill(null); setEditItems([]); }}
              >
                <MaterialCommunityIcons name="close" size={18} color={DARK_BROWN} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
              {editItems.map((item, idx) => (
                <View key={idx} style={styles.editItemCard}>
                  <Text style={styles.editItemName}>{item.itemName || item.category || 'Item'}</Text>
                  <Text style={styles.editItemSub}>{item.itemNumber} {item.billNo ? `· ${item.billNo}` : ''}</Text>
                  <View style={styles.editItemRow}>
                    <View style={styles.editItemMeta}>
                      <View>
                        <Text style={styles.editMetaLabel}>Weight</Text>
                        <Text style={styles.editMetaValue}>{(item.weight || 0).toFixed(3)}g</Text>
                      </View>
                      <View>
                        <Text style={styles.editMetaLabel}>Amount</Text>
                        <Text style={styles.editMetaValue}>₹{(item.amount || 0).toLocaleString('en-IN')}</Text>
                      </View>
                    </View>
                    <View style={styles.editCountRow}>
                      <TouchableOpacity
                        style={styles.editCountBtn}
                        onPress={() => handleEditItemCount(idx, -1)}
                        disabled={item.count <= 1}
                      >
                        <MaterialCommunityIcons name="minus" size={16} color={GOLD} />
                      </TouchableOpacity>
                      <Text style={styles.editCountText}>{item.count}</Text>
                      <TouchableOpacity
                        style={styles.editCountBtn}
                        onPress={() => handleEditItemCount(idx, 1)}
                      >
                        <MaterialCommunityIcons name="plus" size={16} color={GOLD} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.editRemoveBtn}
                        onPress={() => handleRemoveEditItem(idx)}
                      >
                        <MaterialCommunityIcons name="delete-outline" size={16} color="#C0392B" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}

              {/* Recalculated totals */}
              {(() => {
                const totalAmt = editItems.reduce((s, i) => s + (i.amount || 0), 0);
                const totalWt = editItems.reduce((s, i) => s + (i.weight || 0), 0);
                const gst = editingBill?.gstDetails?.isOn
                  ? totalAmt * ((editingBill.gstDetails.cgstPercent || 0) + (editingBill.gstDetails.sgstPercent || 0)) / 100
                  : 0;
                const finalAmt = totalAmt + gst - (editingBill?.receiptTotalAmount || 0);
                const outstanding = Math.max(0, finalAmt - (editingBill?.collectedAmount || 0));
                return (
                  <View style={styles.modalTotalsBox}>
                    <View style={styles.modalTotalsRow}>
                      <Text style={styles.modalTotalsLabel}>Total Weight</Text>
                      <Text style={styles.modalTotalsValue}>{totalWt.toFixed(3)}g</Text>
                    </View>
                    <View style={styles.modalTotalsRow}>
                      <Text style={styles.modalTotalsLabel}>Items Total</Text>
                      <Text style={styles.modalTotalsValue}>₹{totalAmt.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                    </View>
                    {gst > 0 && (
                      <View style={styles.modalTotalsRow}>
                        <Text style={styles.modalTotalsLabel}>GST</Text>
                        <Text style={styles.modalTotalsValue}>₹{gst.toFixed(2)}</Text>
                      </View>
                    )}
                    <View style={[styles.modalTotalsRow, {borderTopWidth:1, borderColor:'#D4AF3760', marginTop:6, paddingTop:6}]}>
                      <Text style={[styles.modalTotalsLabel, {fontWeight:'800'}]}>Final Amount</Text>
                      <Text style={[styles.modalTotalsValue, {fontSize:16, color: DARK_BROWN}]}>₹{finalAmt.toLocaleString('en-IN', {maximumFractionDigits:2})}</Text>
                    </View>
                    <View style={styles.modalTotalsRow}>
                      <Text style={styles.modalTotalsLabel}>Outstanding</Text>
                      <Text style={[styles.modalTotalsValue, {color: outstanding > 0 ? '#C0392B' : '#2E7D32'}]}>
                        ₹{outstanding.toLocaleString('en-IN', {maximumFractionDigits:2})}
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => { setEditingBill(null); setEditItems([]); }}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, editSaving && { opacity: 0.7 }]}
                onPress={handleSaveEdit}
                disabled={editSaving}
              >
                {editSaving
                  ? <ActivityIndicator size="small" color={GOLD} />
                  : <MaterialCommunityIcons name="check" size={18} color={GOLD} />
                }
                <Text style={styles.modalSaveBtnText}>{editSaving ? 'Saving...' : 'Save Changes'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { color: GOLD, fontSize: 17, fontWeight: '800', letterSpacing: 0.5 },
  headerSub: { color: '#A08850', fontSize: 11, fontWeight: '600', marginTop: 2 },

  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  
  tabContainer: { flexDirection: 'row', backgroundColor: '#FFF', elevation: 2 },
  tab: { flex: 1, paddingVertical: 14, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: GOLD },
  tabText: { fontSize: 14, fontWeight: '600', color: '#888' },
  activeTabText: { color: DARK_BROWN, fontWeight: '700' },

  heroCard: {
    backgroundColor: DARK_BROWN,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  heroAvatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  heroAvatarText: { color: DARK_BROWN, fontSize: 28, fontWeight: '900' },
  heroName: { color: GOLD, fontSize: 20, fontWeight: '800', marginBottom: 10, textAlign: 'center' },
  typeBadge: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  typeText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  heroCode: { color: '#A08850', fontSize: 12, fontWeight: '600' },

  infoCard: {
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
    borderColor: '#F0E4CC',
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A08850',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 14,
  },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6 },
  detailIcon: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: '#FFF8E8',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  detailText: { flex: 1 },
  detailLabel: { fontSize: 11, color: '#A08850', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.4 },
  detailValue: { fontSize: 14, color: DARK_BROWN, fontWeight: '700', marginTop: 1 },
  sep: { height: 1, backgroundColor: '#F5EDD8', marginVertical: 4 },

  balanceRow: {
    flexDirection: 'row',
    backgroundColor: '#FDFAF3',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  balBox: { flex: 1, alignItems: 'center' },
  balLabel: { fontSize: 10, color: '#A08850', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  balValue: { fontSize: 18, fontWeight: '800', color: DARK_BROWN },

  remarksText: { fontSize: 14, color: DARK_BROWN, lineHeight: 22, fontWeight: '500' },

  actionRow: { flexDirection: 'row', gap: 12, marginTop: 8 },
  editBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: DARK_BROWN, borderRadius: 16, paddingVertical: 15, gap: 8,
    shadowColor: DARK_BROWN,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  editBtnText: { color: BG, fontSize: 15, fontWeight: '800' },
  delBtn: {
    flex: 0.6, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#C0392B', borderRadius: 16, paddingVertical: 15, gap: 8,
    shadowColor: '#C0392B',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 8, elevation: 5,
  },
  delBtnText: { color: '#FFF', fontSize: 15, fontWeight: '800' },
  btnDisabled: { opacity: 0.6 },

  errorText: { color: DARK_BROWN, fontSize: 18, fontWeight: '700', marginTop: 12 },
  backLink: { marginTop: 16 },
  backLinkText: { color: GOLD, fontWeight: '700', fontSize: 14 },

  billActionRow: {
    flexDirection: 'row', gap: 8, marginTop: 10,
    borderTopWidth: 1, borderColor: '#F0E4CC', paddingTop: 10,
  },
  billEditBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, borderRadius: 10,
    borderWidth: 1.5, borderColor: DARK_BROWN, backgroundColor: '#FDFAF4',
  },
  billEditBtnText: { fontSize: 12, fontWeight: '700', color: DARK_BROWN },
  billDeleteBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 5, paddingVertical: 7, borderRadius: 10, backgroundColor: '#C0392B',
  },
  billDeleteBtnText: { fontSize: 12, fontWeight: '700', color: '#FFF' },

  // Edit Bill Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFF', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    maxHeight: '88%', paddingBottom: 32,
  },
  modalHandle: {
    width: 40, height: 4, borderRadius: 2, backgroundColor: '#DDD',
    alignSelf: 'center', marginTop: 12, marginBottom: 4,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: '#F0E4CC',
  },
  modalTitle: { fontSize: 16, fontWeight: '800', color: DARK_BROWN },
  modalCloseBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: '#F5EDD8',
    alignItems: 'center', justifyContent: 'center',
  },
  modalBody: { paddingHorizontal: 16, paddingTop: 12 },
  editItemCard: {
    backgroundColor: '#FDFAF4', borderRadius: 14, padding: 12,
    marginBottom: 10, borderWidth: 1, borderColor: '#F0E4CC',
  },
  editItemName: { fontSize: 14, fontWeight: '700', color: DARK_BROWN, marginBottom: 2 },
  editItemSub: { fontSize: 11, color: '#A08850', marginBottom: 8 },
  editItemRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editItemMeta: { flexDirection: 'row', gap: 16 },
  editMetaLabel: { fontSize: 10, color: '#888' },
  editMetaValue: { fontSize: 13, fontWeight: '700', color: DARK_BROWN },
  editCountRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editCountBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: DARK_BROWN,
    alignItems: 'center', justifyContent: 'center',
  },
  editCountText: { fontSize: 16, fontWeight: '800', color: DARK_BROWN, minWidth: 24, textAlign: 'center' },
  editRemoveBtn: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: '#FDECEA',
    alignItems: 'center', justifyContent: 'center', marginLeft: 4,
  },
  modalTotalsBox: {
    margin: 16, padding: 14, backgroundColor: '#F5EDD8',
    borderRadius: 14, borderWidth: 1, borderColor: GOLD,
  },
  modalTotalsRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  modalTotalsLabel: { fontSize: 12, color: DARK_BROWN, fontWeight: '600' },
  modalTotalsValue: { fontSize: 13, fontWeight: '800', color: DARK_BROWN },
  modalFooter: {
    flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 8,
  },
  modalCancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    borderWidth: 1.5, borderColor: DARK_BROWN,
  },
  modalCancelText: { fontSize: 14, fontWeight: '700', color: DARK_BROWN },
  modalSaveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 14, alignItems: 'center',
    backgroundColor: DARK_BROWN, flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  modalSaveBtnText: { fontSize: 14, fontWeight: '800', color: GOLD },
});
