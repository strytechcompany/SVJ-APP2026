import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, FlatList,
  StatusBar, ActivityIndicator, TextInput, Alert, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { stockMasterAPI } from '../../services/api';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#4B2E05';
const BG = '#F8F4E8';

// Simplified, name-based stock pool used for B2C Plus/Wastage and B2D bill
// deduction — a separate system from the barcode/Item Number Stock Master
// used by Line Stock, QR printing, and category/purity Reports (untouched).
export default function StockMasterScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const topPad = insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44);

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [editingId, setEditingId] = useState(null);
  const [itemName, setItemName] = useState('');
  const [totalWeight, setTotalWeight] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchItems = useCallback(async (query = '') => {
    try {
      const res = await stockMasterAPI.getAll(query ? { search: query } : {});
      if (res.data.success) setItems(res.data.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { fetchItems(search); }, [fetchItems]));

  const handleSearch = (text) => {
    setSearch(text);
    fetchItems(text);
  };

  const resetForm = () => {
    setEditingId(null);
    setItemName('');
    setTotalWeight('');
    setDescription('');
  };

  const handleEdit = (item) => {
    setEditingId(item._id);
    setItemName(item.itemName);
    setTotalWeight(String(item.totalWeight));
    setDescription(item.description || '');
  };

  const handleDelete = (item) => {
    Alert.alert('Delete Stock', `Remove "${item.itemName}" from Stock Master?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          try {
            await stockMasterAPI.remove(item._id);
            if (editingId === item._id) resetForm();
            fetchItems(search);
          } catch (e) {
            Alert.alert('Error', 'Failed to delete stock item.');
          }
        },
      },
    ]);
  };

  const handleSave = async () => {
    if (!itemName.trim()) {
      Alert.alert('Validation', 'Item Name is required.');
      return;
    }
    const weight = parseFloat(totalWeight);
    if (!totalWeight || isNaN(weight) || weight < 0) {
      Alert.alert('Validation', 'Enter a valid Total Weight.');
      return;
    }
    setSaving(true);
    try {
      const payload = { itemName: itemName.trim(), totalWeight: weight, description: description.trim() };
      const res = editingId
        ? await stockMasterAPI.update(editingId, payload)
        : await stockMasterAPI.create(payload);
      if (res.data.success) {
        resetForm();
        fetchItems(search);
      } else {
        Alert.alert('Error', res.data.message || 'Failed to save stock.');
      }
    } catch (e) {
      Alert.alert('Error', e.response?.data?.message || 'Failed to save stock.');
    } finally {
      setSaving(false);
    }
  };

  const renderItem = ({ item }) => (
    <View style={styles.card}>
      <View style={{ flex: 1 }}>
        <Text style={styles.cardName}>{item.itemName}</Text>
        <Text style={styles.cardWeight}>{Number(item.totalWeight).toFixed(3)}g</Text>
        {item.description ? <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text> : null}
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={[styles.actionBtn, styles.editBtn]} onPress={() => handleEdit(item)}>
          <MaterialCommunityIcons name="pencil-outline" size={16} color={HEADER_BG} />
        </TouchableOpacity>
        <TouchableOpacity style={[styles.actionBtn, styles.deleteBtn]} onPress={() => handleDelete(item)}>
          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFF" />
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
          <Text style={styles.headerTitle}>Stock Master</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
        {/* Add / Edit Stock */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>{editingId ? 'Edit Stock' : 'Add Stock'}</Text>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Item Name</Text>
            <TextInput style={styles.input} value={itemName} onChangeText={setItemName} placeholder="e.g. Chain" />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Total Weight (g)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={totalWeight} onChangeText={setTotalWeight} placeholder="0.000" />
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Description</Text>
            <TextInput style={[styles.input, styles.inputMulti]} value={description} onChangeText={setDescription} placeholder="e.g. 22K Chain" multiline />
          </View>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {editingId && (
              <TouchableOpacity style={[styles.saveBtn, { flex: 1, backgroundColor: '#8A6B3C' }]} onPress={resetForm}>
                <Text style={styles.saveBtnText}>Cancel</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.saveBtn, { flex: 1 }]} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFF" size="small" /> : (
                <>
                  <MaterialCommunityIcons name={editingId ? 'content-save-edit' : 'content-save'} size={18} color="#FFF" />
                  <Text style={styles.saveBtnText}>{editingId ? 'Update Stock' : 'Save Stock'}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <MaterialCommunityIcons name="magnify" size={20} color={GOLD} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search by item name..."
            placeholderTextColor="#C4A97A"
            value={search}
            onChangeText={handleSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => handleSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#C4A97A" />
            </TouchableOpacity>
          )}
        </View>

        {/* List */}
        {loading ? (
          <ActivityIndicator size="large" color={GOLD} style={{ marginTop: 30 }} />
        ) : items.length === 0 ? (
          <Text style={styles.emptyText}>No stock items found.</Text>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item._id}
            renderItem={renderItem}
            scrollEnabled={false}
          />
        )}
      </ScrollView>
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
  scrollContent: { padding: 16, paddingBottom: 40 },
  section: { backgroundColor: '#FFF', borderRadius: 16, padding: 16, marginBottom: 16, elevation: 2 },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#8A6B3C', marginBottom: 12, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldGroup: { marginBottom: 12 },
  label: { fontSize: 12, color: '#8A6B3C', fontWeight: '600', marginBottom: 4 },
  input: { backgroundColor: '#FDFAF4', borderRadius: 8, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: DARK_BROWN },
  inputMulti: { height: 70, textAlignVertical: 'top' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: DARK_BROWN, paddingVertical: 12, borderRadius: 10 },
  saveBtnText: { color: '#FFF', fontSize: 13, fontWeight: '700' },
  searchWrap: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, borderWidth: 1, borderColor: '#E8D8B8', paddingHorizontal: 14, height: 46, marginBottom: 16 },
  searchInput: { flex: 1, fontSize: 14, color: DARK_BROWN },
  emptyText: { textAlign: 'center', color: '#8A6B3C', marginTop: 30, fontStyle: 'italic' },
  card: { flexDirection: 'row', backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, borderWidth: 1, borderColor: '#F0E6D0', alignItems: 'center' },
  cardName: { fontSize: 14, fontWeight: '800', color: DARK_BROWN },
  cardWeight: { fontSize: 13, fontWeight: '700', color: '#8A6B3C', marginTop: 2 },
  cardDesc: { fontSize: 12, color: '#A08850', marginTop: 4 },
  cardActions: { flexDirection: 'row', gap: 8, marginLeft: 10 },
  actionBtn: { width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  editBtn: { backgroundColor: GOLD },
  deleteBtn: { backgroundColor: '#C0392B' },
});
