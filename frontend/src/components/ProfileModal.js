import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TouchableWithoutFeedback } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';

const HEADER_BG = '#3D2200';
const GOLD = '#D4AF37';

const NAV_ITEMS = [
  { icon: 'clipboard-list',    label: 'Orders',      route: 'Orders' },
  { icon: 'account-group',     label: 'Customers',   route: 'Customers' },
  { icon: 'cash-register',     label: 'Transactions',route: 'TransactionManagement' },
  { icon: 'warehouse',         label: 'Line Stock',  route: 'LineStockDashboard' },
  { icon: 'piggy-bank-outline',label: 'Chit Fund',   route: 'ChitFund' },
  { icon: 'receipt',           label: 'Expenses',    route: 'Expenses' },
];

export default function ProfileModal({ visible, onClose }) {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigation = useNavigation();

  const goTo = (route) => {
    onClose();
    navigation.navigate(route);
  };

  if (!user || !settings) return null;

  const { shopProfile } = settings;

  return (
    <Modal visible={visible} animationType="fade" transparent={true}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.overlay}>
          <TouchableWithoutFeedback>
            <View style={styles.modalContainer}>
              <View style={styles.header}>
                <Text style={styles.headerTitle}>My Profile</Text>
                <TouchableOpacity onPress={onClose} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}}>
                  <MaterialCommunityIcons name="close" size={24} color="#333" />
                </TouchableOpacity>
              </View>

              <View style={styles.profileSection}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{user.name ? user.name.charAt(0).toUpperCase() : 'U'}</Text>
                </View>
                <Text style={styles.userName}>{user.name}</Text>
                <Text style={styles.userEmail}>{user.email}</Text>
                <View style={styles.roleBadge}>
                  <Text style={styles.roleText}>{user.role}</Text>
                </View>
              </View>

              <View style={styles.divider} />

              {/* Quick Navigation */}
              <View style={styles.navSection}>
                <Text style={styles.sectionTitle}>Quick Access</Text>
                <View style={styles.navGrid}>
                  {NAV_ITEMS.map((item) => (
                    <TouchableOpacity
                      key={item.route}
                      style={styles.navItem}
                      onPress={() => goTo(item.route)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.navIconBox}>
                        <MaterialCommunityIcons name={item.icon} size={22} color={GOLD} />
                      </View>
                      <Text style={styles.navLabel}>{item.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.shopSection}>
                <Text style={styles.sectionTitle}>Shop Contact Info</Text>

                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="store" size={20} color={GOLD} style={styles.icon} />
                  <Text style={styles.infoText}>{shopProfile.shopName}</Text>
                </View>

                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="map-marker" size={20} color={GOLD} style={styles.icon} />
                  <Text style={styles.infoText}>{shopProfile.address}</Text>
                </View>

                <View style={styles.infoRow}>
                  <MaterialCommunityIcons name="phone" size={20} color={GOLD} style={styles.icon} />
                  <Text style={styles.infoText}>{shopProfile.phone1}{shopProfile.phone2 ? `, ${shopProfile.phone2}` : ''}</Text>
                </View>

              </View>

            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: '85%',
    backgroundColor: '#FFF',
    borderRadius: 24,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: HEADER_BG,
  },
  profileSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(212,175,55,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: '700',
    color: GOLD,
  },
  userName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#333',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  roleBadge: {
    backgroundColor: HEADER_BG,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  roleText: {
    color: GOLD,
    fontSize: 12,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: '#EEE',
    marginVertical: 10,
  },
  shopSection: {
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#888',
    marginBottom: 16,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  icon: {
    marginRight: 12,
    marginTop: 2,
  },
  infoText: {
    flex: 1,
    fontSize: 15,
    color: '#444',
    lineHeight: 22,
  },
});
