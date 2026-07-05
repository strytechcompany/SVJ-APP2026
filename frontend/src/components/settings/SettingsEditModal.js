import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView, Switch, ActivityIndicator } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSettings } from '../../context/SettingsContext';

const GOLD = '#D4AF37';
const HEADER_BG = '#3D2200';

export default function SettingsEditModal({ visible, onClose, title, settingKey, fields }) {
  const { settings, updateSettings } = useSettings();
  const [formData, setFormData] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && settings && settings[settingKey]) {
      setFormData(settings[settingKey]);
    } else if (visible && settings && settingKey === 'ROOT') {
       // Root level like goldRate might just need the inner value
       setFormData(settings);
    }
  }, [visible, settings, settingKey]);

  const handleSave = async () => {
    setSaving(true);
    let updates = {};
    if (settingKey === 'ROOT') {
        updates = formData;
    } else {
        updates[settingKey] = formData;
    }
    
    const success = await updateSettings(updates);
    setSaving(false);
    if (success) onClose();
  };

  const renderField = (field) => {
    const value = formData[field.key] !== undefined ? formData[field.key] : field.default;

    if (field.type === 'boolean') {
      return (
        <View style={styles.switchRow} key={field.key}>
          <Text style={styles.label}>{field.label}</Text>
          <Switch 
            value={!!value}
            onValueChange={(val) => setFormData({ ...formData, [field.key]: val })}
            trackColor={{ false: '#CCC', true: GOLD }}
            thumbColor={value ? '#FFF' : '#F4F3F4'}
          />
        </View>
      );
    }

    return (
      <View style={styles.inputContainer} key={field.key}>
        <Text style={styles.label}>{field.label}</Text>
        <TextInput
          style={[styles.input, field.multiline && { height: 80, textAlignVertical: 'top' }]}
          value={value !== undefined && value !== null ? value.toString() : ''}
          onChangeText={(text) => {
            let parsed = text;
            if (field.type === 'number') {
              parsed = text === '' ? '' : Number(text);
            }
            setFormData({ ...formData, [field.key]: parsed });
          }}
          keyboardType={field.type === 'number' ? 'numeric' : 'default'}
          multiline={field.multiline}
        />
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={true}>
      <View style={styles.overlay}>
        <View style={styles.modalContainer}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} disabled={saving}>
              <MaterialCommunityIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {fields.map(renderField)}
          </ScrollView>

          <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
            {saving ? <ActivityIndicator size="small" color="#FFF" /> : <Text style={styles.saveBtnText}>Save Changes</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalContainer: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  headerTitle: { fontSize: 18, fontWeight: '800', color: HEADER_BG },
  content: { flex: 1 },
  inputContainer: { marginBottom: 16 },
  label: { fontSize: 13, color: '#666', fontWeight: '700', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#DDD', borderRadius: 8, padding: 12, fontSize: 15, color: '#333', backgroundColor: '#F9F9F9' },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F5F5F5' },
  saveBtn: { backgroundColor: HEADER_BG, padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  saveBtnText: { color: GOLD, fontSize: 16, fontWeight: '800' }
});
