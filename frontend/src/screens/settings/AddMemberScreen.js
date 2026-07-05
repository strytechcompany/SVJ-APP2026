import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { userAPI } from '../../services/api';

const HEADER_BG = '#3D2200';
const GOLD = '#D4AF37';
const BG = '#F8F4E8';
const WHITE = '#FFFFFF';
const TEXT_DARK = '#1A1A1A';
const TEXT_MUTED = '#888';
const ROLES = ['Admin', 'Manager', 'Staff'];

const ROLE_COLOR = { Admin: '#7B2D00', Manager: '#004D7B', Staff: '#2D5A00' };
const ROLE_BG = { Admin: '#FFF0E8', Manager: '#E8F4FF', Staff: '#EDFCE8' };

function RoleBadge({ role }) {
  return (
    <View style={[styles.roleBadge, { backgroundColor: ROLE_BG[role] || '#F0F0F0', borderColor: ROLE_COLOR[role] || '#999' }]}>
      <Text style={[styles.roleText, { color: ROLE_COLOR[role] || '#333' }]}>{role}</Text>
    </View>
  );
}

function MemberCard({ member, onEdit, onToggleStatus, onResetPassword }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardLeft}>
        <View style={[styles.avatar, { backgroundColor: member.isActive ? HEADER_BG : '#CCC' }]}>
          <Text style={styles.avatarText}>{member.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.memberName}>{member.name}</Text>
          <Text style={styles.memberEmail}>{member.email}</Text>
          <View style={styles.cardMeta}>
            <RoleBadge role={member.role} />
            <View style={[styles.statusBadge, { backgroundColor: member.isActive ? '#E8F5E9' : '#FFEBEE' }]}>
              <Text style={[styles.statusText, { color: member.isActive ? '#2E7D32' : '#C62828' }]}>
                {member.isActive ? 'Active' : 'Disabled'}
              </Text>
            </View>
          </View>
        </View>
      </View>
      <View style={styles.cardActions}>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onEdit(member)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="pencil" size={18} color={HEADER_BG} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onToggleStatus(member)} activeOpacity={0.7}>
          <MaterialCommunityIcons name={member.isActive ? 'account-off' : 'account-check'} size={18} color={member.isActive ? '#C62828' : '#2E7D32'} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.actionBtn} onPress={() => onResetPassword(member)} activeOpacity={0.7}>
          <MaterialCommunityIcons name="lock-reset" size={18} color="#7B5800" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function AddMemberScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  // Create / Edit modal
  const [formModal, setFormModal] = useState({ visible: false, mode: 'create', member: null });
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState('Staff');
  const [formLoading, setFormLoading] = useState(false);
  const formSubmitRef = React.useRef(false); // synchronous guard against double-submit

  // Reset password modal
  const [resetModal, setResetModal] = useState({ visible: false, member: null });
  const [resetPassword, setResetPassword] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const resetSubmitRef = React.useRef(false);

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await userAPI.list();
      if (res.data.success) setMembers(res.data.data);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to load members');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      fetchMembers();
    }, [fetchMembers])
  );

  const openCreate = () => {
    setFormName('');
    setFormEmail('');
    setFormPassword('');
    setFormRole('Staff');
    setFormModal({ visible: true, mode: 'create', member: null });
  };

  const openEdit = (member) => {
    setFormName(member.name);
    setFormEmail(member.email);
    setFormPassword('');
    setFormRole(member.role);
    setFormModal({ visible: true, mode: 'edit', member });
  };

  const handleFormSave = async () => {
    if (formSubmitRef.current) return; // synchronous guard — blocks before state re-render
    if (!formName.trim()) return Alert.alert('Error', 'Name is required');
    if (formModal.mode === 'create') {
      if (!formEmail.trim() || !/\S+@\S+\.\S+/.test(formEmail)) return Alert.alert('Error', 'Enter a valid email');
      if (!formPassword || formPassword.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    }

    formSubmitRef.current = true;
    setFormLoading(true);
    try {
      if (formModal.mode === 'create') {
        await userAPI.create({ name: formName.trim(), email: formEmail.trim().toLowerCase(), password: formPassword, role: formRole });
        setFormModal({ visible: false, mode: 'create', member: null });
        fetchMembers();
        Alert.alert('Success', 'Member created successfully');
      } else {
        await userAPI.update(formModal.member._id, { name: formName.trim(), role: formRole });
        setFormModal({ visible: false, mode: 'create', member: null });
        fetchMembers();
        Alert.alert('Success', 'Member updated successfully');
      }
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to save member';
      const isConflict = err?.response?.status === 409;
      if (isConflict) {
        // Email already in DB — close modal and refresh list so user can see the existing member
        setFormModal({ visible: false, mode: 'create', member: null });
        fetchMembers();
        Alert.alert('Already Registered', msg);
      } else {
        Alert.alert('Error', msg);
      }
    } finally {
      formSubmitRef.current = false;
      setFormLoading(false);
    }
  };

  const handleToggleStatus = (member) => {
    const action = member.isActive ? 'disable' : 'enable';
    Alert.alert(
      `${action.charAt(0).toUpperCase() + action.slice(1)} Member`,
      `Are you sure you want to ${action} ${member.name}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: action.charAt(0).toUpperCase() + action.slice(1),
          style: member.isActive ? 'destructive' : 'default',
          onPress: async () => {
            try {
              await userAPI.toggleStatus(member._id);
              fetchMembers();
            } catch (err) {
              Alert.alert('Error', err?.response?.data?.message || 'Failed to update status');
            }
          },
        },
      ]
    );
  };

  const openResetPassword = (member) => {
    setResetPassword('');
    setResetModal({ visible: true, member });
  };

  const handleResetPassword = async () => {
    if (resetSubmitRef.current) return;
    if (!resetPassword || resetPassword.length < 6) return Alert.alert('Error', 'Password must be at least 6 characters');
    resetSubmitRef.current = true;
    setResetLoading(true);
    try {
      await userAPI.resetPassword(resetModal.member._id, { newPassword: resetPassword });
      setResetModal({ visible: false, member: null });
      Alert.alert('Success', `Password reset for ${resetModal.member.name}`);
    } catch (err) {
      Alert.alert('Error', err?.response?.data?.message || 'Failed to reset password');
    } finally {
      resetSubmitRef.current = false;
      setResetLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || (Platform.OS === 'android' ? 24 : 44) }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Team Members</Text>
        <TouchableOpacity onPress={openCreate} style={styles.addBtn}>
          <MaterialCommunityIcons name="plus" size={22} color={GOLD} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={GOLD} />
        </View>
      ) : members.length === 0 ? (
        <View style={styles.centered}>
          <MaterialCommunityIcons name="account-group-outline" size={56} color="#CCC" />
          <Text style={styles.emptyText}>No members yet</Text>
          <TouchableOpacity style={styles.addFirstBtn} onPress={openCreate}>
            <Text style={styles.addFirstText}>Add First Member</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={members}
          keyExtractor={(item) => item._id}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          renderItem={({ item }) => (
            <MemberCard
              member={item}
              onEdit={openEdit}
              onToggleStatus={handleToggleStatus}
              onResetPassword={openResetPassword}
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}

      {/* Create / Edit Modal */}
      <Modal visible={formModal.visible} animationType="slide" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{formModal.mode === 'create' ? 'Add Member' : 'Edit Member'}</Text>
              <TouchableOpacity onPress={() => setFormModal({ ...formModal, visible: false })} disabled={formLoading}>
                <MaterialCommunityIcons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Name *</Text>
                <TextInput
                  style={styles.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="Full name"
                  autoCapitalize="words"
                />
              </View>

              {formModal.mode === 'create' && (
                <>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Email *</Text>
                    <TextInput
                      style={styles.input}
                      value={formEmail}
                      onChangeText={setFormEmail}
                      placeholder="email@example.com"
                      keyboardType="email-address"
                      autoCapitalize="none"
                    />
                  </View>
                  <View style={styles.field}>
                    <Text style={styles.fieldLabel}>Password *</Text>
                    <TextInput
                      style={styles.input}
                      value={formPassword}
                      onChangeText={setFormPassword}
                      placeholder="Min 6 characters"
                      secureTextEntry
                    />
                  </View>
                </>
              )}

              <View style={styles.field}>
                <Text style={styles.fieldLabel}>Role *</Text>
                <View style={styles.roleRow}>
                  {ROLES.map((r) => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.roleOption, formRole === r && styles.roleOptionSelected]}
                      onPress={() => setFormRole(r)}
                    >
                      <Text style={[styles.roleOptionText, formRole === r && styles.roleOptionTextSelected]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <TouchableOpacity style={[styles.saveBtn, formLoading && { opacity: 0.7 }]} onPress={handleFormSave} disabled={formLoading}>
                {formLoading ? (
                  <ActivityIndicator size="small" color={GOLD} />
                ) : (
                  <Text style={styles.saveBtnText}>{formModal.mode === 'create' ? 'Create Member' : 'Save Changes'}</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Reset Password Modal */}
      <Modal visible={resetModal.visible} animationType="fade" transparent>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={[styles.modalSheet, { maxHeight: 300 }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reset Password</Text>
              <TouchableOpacity onPress={() => setResetModal({ visible: false, member: null })} disabled={resetLoading}>
                <MaterialCommunityIcons name="close" size={22} color="#333" />
              </TouchableOpacity>
            </View>
            <Text style={styles.resetInfo}>Set a new password for {resetModal.member?.name}.</Text>
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>New Password *</Text>
              <TextInput
                style={styles.input}
                value={resetPassword}
                onChangeText={setResetPassword}
                placeholder="Min 6 characters"
                secureTextEntry
              />
            </View>
            <TouchableOpacity style={[styles.saveBtn, resetLoading && { opacity: 0.7 }]} onPress={handleResetPassword} disabled={resetLoading}>
              {resetLoading ? (
                <ActivityIndicator size="small" color={GOLD} />
              ) : (
                <Text style={styles.saveBtnText}>Reset Password</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  backBtn: { padding: 4, marginRight: 8 },
  addBtn: { padding: 4, marginLeft: 8 },
  headerTitle: { flex: 1, color: GOLD, fontSize: 18, fontWeight: '700', textAlign: 'center' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: TEXT_MUTED, fontSize: 16, marginTop: 12 },
  addFirstBtn: { marginTop: 16, backgroundColor: HEADER_BG, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 10 },
  addFirstText: { color: GOLD, fontWeight: '700', fontSize: 14 },
  card: {
    backgroundColor: WHITE,
    borderRadius: 14,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  cardLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: GOLD, fontSize: 18, fontWeight: '800' },
  cardInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: TEXT_DARK },
  memberEmail: { fontSize: 12, color: TEXT_MUTED, marginTop: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 6, gap: 6 },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  roleText: { fontSize: 10, fontWeight: '700' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 },
  statusText: { fontSize: 10, fontWeight: '700' },
  cardActions: { flexDirection: 'column', gap: 8 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F5EFE0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: WHITE,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: HEADER_BG },
  resetInfo: { fontSize: 13, color: TEXT_MUTED, marginBottom: 16 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: TEXT_DARK, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    color: TEXT_DARK,
    backgroundColor: '#F9F9F9',
  },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleOption: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#DDD',
    alignItems: 'center',
    backgroundColor: '#F9F9F9',
  },
  roleOptionSelected: { borderColor: HEADER_BG, backgroundColor: '#FFF0E0' },
  roleOptionText: { fontSize: 13, fontWeight: '600', color: TEXT_MUTED },
  roleOptionTextSelected: { color: HEADER_BG },
  saveBtn: {
    backgroundColor: HEADER_BG,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  saveBtnText: { color: GOLD, fontSize: 15, fontWeight: '800' },
});
