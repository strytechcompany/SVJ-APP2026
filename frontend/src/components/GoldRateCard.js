import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  TouchableWithoutFeedback,
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useDashboard } from '../context/DashboardContext';

const CARD_BG = '#3D2200';
const GOLD = '#D4AF37';
const WHITE = '#FFFFFF';
const CREAM = '#F8F4E8';

// Returns "DD-MM-YYYY" for today
function todayFormatted() {
  const d = new Date();
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}-${month}-${year}`;
}

// Returns formatted "DD-MM-YYYY HH:MM:SS AM/PM" from a date string/object
function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  let hours = d.getHours();
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${day}-${month}-${year}  ${String(hours).padStart(2, '0')}:${minutes}:${seconds} ${ampm}`;
}

export default function GoldRateCard() {
  const { goldRate, updateGoldRate } = useDashboard();
  const [modalVisible, setModalVisible] = useState(false);
  const [inputRate, setInputRate] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Live clock
  const [liveTime, setLiveTime] = useState(new Date());
  
  React.useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const openEdit = () => {
    // Pre-fill with existing rate
    setInputRate(goldRate?.rate != null ? String(goldRate.rate) : '');
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!inputRate.trim() || isNaN(Number(inputRate))) {
      Alert.alert('Invalid Input', 'Please enter a valid gold rate number.');
      return;
    }
    setSaving(true);
    try {
      await updateGoldRate(Number(inputRate), todayFormatted());
      setModalVisible(false);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to update gold rate.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <View style={styles.card}>
        {/* Edit button */}
        <TouchableOpacity
          style={styles.editBtn}
          onPress={openEdit}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <MaterialCommunityIcons name="pencil" size={18} color={GOLD} />
        </TouchableOpacity>

        <Text style={styles.label}>GOLD RATE</Text>

        <Text style={styles.rate}>
          ₹{goldRate?.rate != null ? Number(goldRate.rate).toLocaleString('en-IN', { minimumFractionDigits: 2 }) : '0.00'}
        </Text>

        <View style={styles.divider} />

        <View style={styles.updatedRow}>
          <MaterialCommunityIcons name="clock-outline" size={14} color={GOLD} style={{ marginRight: 6 }} />
          <Text style={styles.updatedText}>
            {formatDateTime(liveTime)}
          </Text>
        </View>
      </View>

      {/* Edit Modal */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.overlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={styles.modalCard}>
                {/* Modal Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>Edit Gold Rate</Text>
                  <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close" size={22} color="#888" />
                  </TouchableOpacity>
                </View>

                {/* Rate Input */}
                <Text style={styles.inputLabel}>Gold Rate (₹ per gram)</Text>
                <View style={styles.inputWrapper}>
                  <Text style={styles.rupeePrefix}>₹</Text>
                  <TextInput
                    style={styles.input}
                    value={inputRate}
                    onChangeText={setInputRate}
                    keyboardType="numeric"
                    placeholder="e.g. 9500"
                    placeholderTextColor="#BBB"
                    autoFocus={true}
                    editable={true}
                    selectTextOnFocus={true}
                    returnKeyType="done"
                    onSubmitEditing={handleSave}
                  />
                </View>

                {/* Date is no longer editable */}
                
                {/* Buttons */}
                <View style={styles.modalBtns}>
                  <TouchableOpacity
                    style={[styles.btn, styles.cancelBtn]}
                    onPress={() => setModalVisible(false)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.btn, styles.saveBtn, saving && { opacity: 0.7 }]}
                    onPress={handleSave}
                    disabled={saving}
                    activeOpacity={0.8}
                  >
                    {saving ? (
                      <ActivityIndicator color={WHITE} size="small" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: CARD_BG,
    borderRadius: 20,
    marginHorizontal: 16,
    marginTop: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    position: 'relative',
  },
  editBtn: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(212,175,55,0.15)',
  },
  label: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 10,
  },
  rate: {
    color: WHITE,
    fontSize: 42,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 1,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(212,175,55,0.25)',
    marginVertical: 14,
  },
  updatedRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  updatedText: {
    color: GOLD,
    fontSize: 12,
    opacity: 0.85,
  },
  // Modal
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  keyboardView: {
    width: '100%',
  },
  modalCard: {
    backgroundColor: WHITE,
    borderRadius: 24,
    padding: 24,
    paddingBottom: 24,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 16,
    elevation: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 22,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: CARD_BG,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
    marginTop: 6,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#DDD',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 52,
    backgroundColor: CREAM,
    marginBottom: 16,
  },
  rupeePrefix: {
    fontSize: 18,
    color: CARD_BG,
    fontWeight: '700',
    marginRight: 6,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1A1A1A',
    height: 52,
    padding: 0,
  },
  modalBtns: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  btn: {
    flex: 1,
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtn: {
    backgroundColor: '#F0F0F0',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  cancelBtnText: {
    color: '#555',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    backgroundColor: CARD_BG,
  },
  saveBtnText: {
    color: GOLD,
    fontWeight: '700',
    fontSize: 15,
  },
});
