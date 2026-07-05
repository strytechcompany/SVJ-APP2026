import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Platform,
  ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { useSettings } from '../../context/SettingsContext';
import SettingsEditModal from '../../components/settings/SettingsEditModal';
import ChangePasswordModal from '../../components/settings/ChangePasswordModal';

const HEADER_BG = '#3D2200';
const GOLD = '#D4AF37';
const BG = '#F8F4E8';
const WHITE = '#FFFFFF';
const TEXT_DARK = '#1A1A1A';
const TEXT_MUTED = '#888';

const APP_VERSION = '1.0.0';

function SettingsRow({ icon, label, value, onPress, danger }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.7}>
      <View style={[styles.rowIcon, danger && { backgroundColor: '#FFE5E5' }]}>
        <MaterialCommunityIcons name={icon} size={20} color={danger ? '#C0392B' : HEADER_BG} />
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowLabel, danger && { color: '#C0392B' }]}>{label}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      <MaterialCommunityIcons name="chevron-right" size={20} color={danger ? '#C0392B' : '#CCC'} />
    </TouchableOpacity>
  );
}

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

export default function SettingsScreen({ navigation }) {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const { settings, loading } = useSettings();
  
  const [modalConfig, setModalConfig] = useState({ visible: false, title: '', settingKey: '', fields: [] });
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);

  const openModal = (title, settingKey, fields) => {
    setModalConfig({ visible: true, title, settingKey, fields });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => { await logout(); } }
    ]);
  };

  const handleDataAction = async (actionName) => {
    Alert.alert(actionName, `${actionName} has been queued successfully.`);
  };

  if (loading || !settings) return <View style={styles.container}><ActivityIndicator style={{marginTop: 100}} size="large" color={GOLD}/></View>;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || (Platform.OS === 'android' ? 24 : 44) }]}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Profile Section */}
        <SectionHeader title="Profile" />
        <View style={styles.section}>
          <View style={styles.profileCard}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{user?.name ? user.name.charAt(0).toUpperCase() : 'U'}</Text></View>
            <View>
              <Text style={styles.profileName}>{user?.name || '—'}</Text>
              <Text style={styles.profileEmail}>{user?.email || '—'}</Text>
              <View style={styles.roleBadge}><Text style={styles.roleText}>{user?.role || '—'}</Text></View>
            </View>
          </View>
        </View>

        <SectionHeader title="1. Shop Profile" />
        <View style={styles.section}>
          <SettingsRow icon="store" label="Shop Details" value={settings.shopProfile.shopName} onPress={() => openModal('Shop Profile', 'shopProfile', [
            { key: 'shopName', label: 'Shop Name', type: 'text' },
            { key: 'ownerName', label: 'Owner Name', type: 'text' },
            { key: 'address', label: 'Shop Address', type: 'text', multiline: true },
            { key: 'phone1', label: 'Phone Number 1', type: 'text' },
            { key: 'phone2', label: 'Phone Number 2', type: 'text' },
            { key: 'gstNo', label: 'GST Number', type: 'text' },
            { key: 'email', label: 'Email', type: 'text' }
          ])} />
        </View>

        <SectionHeader title="3. Bill Settings" />
        <View style={styles.section}>
          <SettingsRow icon="receipt" label="Print Formatting" onPress={() => openModal('Bill Settings', 'billSettings', [
            { key: 'hsnCode', label: 'HSN Code (Jewellery)', type: 'text' },
            { key: 'tamilMessage', label: 'Default Tamil Message', type: 'text', multiline: true },
            { key: 'footerMessage', label: 'Default Footer Message', type: 'text', multiline: true },
            { key: 'printCopies', label: 'Default Print Copies', type: 'number' }
          ])} />
        </View>

        <SectionHeader title="4. Printer Settings" />
        <View style={styles.section}>
          <SettingsRow icon="printer" label="Device Routing" onPress={() => openModal('Printer Settings', 'printerSettings', [
            { key: 'barcodePrinter', label: 'Barcode Printer IP/Name', type: 'text' },
            { key: 'thermalPrinter', label: 'Thermal Printer IP/Name', type: 'text' },
            { key: 'a4Printer', label: 'A4 Printer IP/Name', type: 'text' }
          ])} />
        </View>

        <SectionHeader title="5. Barcode Settings" />
        <View style={styles.section}>
          <SettingsRow icon="barcode" label="Generation Rules" value={`Prefix: ${settings.barcodeSettings.prefix}`} onPress={() => openModal('Barcode Settings', 'barcodeSettings', [
            { key: 'prefix', label: 'Barcode Prefix', type: 'text' },
            { key: 'startingSequence', label: 'Starting Sequence', type: 'number' },
            { key: 'autoGenerate', label: 'Auto Generate Number', type: 'boolean' }
          ])} />
        </View>

        <SectionHeader title="6. Backup & Restore" />
        <View style={styles.section}>
          <SettingsRow icon="database-export" label="Backup Database" onPress={() => handleDataAction('Backup')} />
          <SettingsRow icon="database-import" label="Restore Database" onPress={() => handleDataAction('Restore')} />
        </View>

        {user?.role === 'SuperAdmin' && (
          <>
            <SectionHeader title="2. User Management" />
            <View style={styles.section}>
              <SettingsRow icon="account-group" label="Add / Manage Members" value="Admins, Managers, Staff" onPress={() => navigation.navigate('AddMember')} />
            </View>
          </>
        )}

        <SectionHeader title="7. Security Settings" />
        <View style={styles.section}>
          <SettingsRow icon="shield-lock" label="Change Password" onPress={() => setPasswordModalVisible(true)} />
          <SettingsRow icon="logout" label="Logout All Devices" onPress={() => handleDataAction('Logout All Devices')} danger />
        </View>

        <SectionHeader title="8. Notification Settings" />
        <View style={styles.section}>
          <SettingsRow icon="bell-ring" label="Alert Preferences" onPress={() => openModal('Notification Settings', 'notificationSettings', [
            { key: 'overdueLineStock', label: 'Overdue Line Stock Alerts', type: 'boolean' },
            { key: 'chitDue', label: 'Chit Due Alerts', type: 'boolean' },
            { key: 'lowStock', label: 'Low Stock Alerts', type: 'boolean' },
            { key: 'dailyReport', label: 'Daily Report Alerts', type: 'boolean' },
            { key: 'monthlyReport', label: 'Monthly Report Alerts', type: 'boolean' }
          ])} />
        </View>

        <SectionHeader title="9. Report Settings" />
        <View style={styles.section}>
          <SettingsRow icon="chart-bar" label="Report Formatting" onPress={() => openModal('Report Settings', 'reportSettings', [
            { key: 'defaultProfitGoldRate', label: 'Default Gold Rate For Profit', type: 'number' },
            { key: 'watermark', label: 'Report Watermark', type: 'text' },
            { key: 'enablePdfFooter', label: 'Enable PDF Footer', type: 'boolean' },
            { key: 'enableCompanyLogo', label: 'Enable Company Logo', type: 'boolean' }
          ])} />
        </View>

        <SectionHeader title="10. Data Management" />
        <View style={styles.section}>
          <SettingsRow icon="calculator" label="Recalculate Reports" onPress={() => handleDataAction('Recalculate Reports')} />
          <SettingsRow icon="sync" label="Sync Transactions" onPress={() => handleDataAction('Sync Transactions')} />
          <SettingsRow icon="check-all" label="Validate Stock" onPress={() => handleDataAction('Validate Stock')} />
        </View>

        <SectionHeader title="11. About Section" />
        <View style={styles.section}>
          <SettingsRow icon="information" label="ERP Version" value={`v${APP_VERSION}`} onPress={() => {}} />
          <SettingsRow icon="server-network" label="Server Status" value="Online" onPress={() => {}} />
        </View>

        {/* Logout */}
        <View style={[styles.section, { marginBottom: 32, marginTop: 20 }]}>
          <SettingsRow icon="logout" label="Sign Out" onPress={handleLogout} danger />
        </View>
      </ScrollView>
      
      <SettingsEditModal 
        visible={modalConfig.visible}
        onClose={() => setModalConfig({ ...modalConfig, visible: false })}
        title={modalConfig.title}
        settingKey={modalConfig.settingKey}
        fields={modalConfig.fields}
      />

      <ChangePasswordModal 
        visible={passwordModalVisible} 
        onClose={() => setPasswordModalVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  header: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 8,
  },
  headerTitle: {
    color: GOLD,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
  },
  scroll: { flex: 1 },
  sectionHeader: {
    fontSize: 12,
    fontWeight: '700',
    color: TEXT_MUTED,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginTop: 20,
    marginBottom: 6,
    marginHorizontal: 16,
  },
  section: {
    backgroundColor: WHITE,
    borderRadius: 16,
    marginHorizontal: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 3,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    gap: 16,
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: HEADER_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: GOLD,
    fontSize: 22,
    fontWeight: '800',
  },
  profileName: {
    fontSize: 16,
    fontWeight: '700',
    color: TEXT_DARK,
  },
  profileEmail: {
    fontSize: 13,
    color: TEXT_MUTED,
    marginTop: 2,
  },
  roleBadge: {
    marginTop: 6,
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: GOLD,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#7B5800',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F2F2F2',
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F5EFE0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  rowContent: { flex: 1 },
  rowLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: TEXT_DARK,
  },
  rowValue: {
    fontSize: 12,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});
