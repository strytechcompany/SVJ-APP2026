import React, { useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, Animated, Dimensions, Platform, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width, height } = Dimensions.get('window');
const GOLD = '#D4AF37';
const DARK_BROWN = '#3D2200';
const LIGHT_BROWN = '#5C3A00';
const BG = '#F8F4E8';

export default function Sidebar({ visible, onClose, navigation, onLogout }) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-width)).current;

  useEffect(() => {
    if (visible) {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -width,
        duration: 250,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  const menuItems = [
    { name: 'Dashboard', icon: 'view-dashboard', route: 'Home' },
    { name: 'Stock Management', icon: 'gold', route: 'Stocks' },
    { name: 'Customers', icon: 'account-group', route: 'Customers' },
    { name: 'Orders', icon: 'clipboard-list-outline', route: 'Orders' },
    { name: 'Transactions', icon: 'text-box-multiple-outline', route: 'TransactionManagement' },
    { name: 'Line Stocker', icon: 'briefcase-outline', route: 'LineStockDashboard' },
    { name: 'Settings', icon: 'cog-outline', route: 'Settings' },
  ];

  const handleNavigate = (route) => {
    onClose();
    setTimeout(() => {
      navigation.navigate(route);
    }, 200);
  };

  return (
    <Modal visible={visible} transparent={true} animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.overlayBg} activeOpacity={1} onPress={onClose} />
        
        <Animated.View style={[styles.sidebarContainer, { transform: [{ translateX: slideAnim }] }]}>
          <View style={[styles.header, { paddingTop: insets.top || (Platform.OS === 'android' ? StatusBar.currentHeight || 24 : 44) }]}>
            <View style={styles.profileCircle}>
              <Text style={styles.profileInitials}>SV</Text>
            </View>
            <Text style={styles.brandTitle}>Sri Vaishnavi</Text>
            <Text style={styles.brandSub}>Jewellers</Text>
          </View>

          <View style={styles.menuList}>
            {menuItems.map((item, index) => (
              <TouchableOpacity 
                key={index} 
                style={styles.menuItem} 
                onPress={() => handleNavigate(item.route)}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name={item.icon} size={24} color={LIGHT_BROWN} style={styles.menuIcon} />
                <Text style={styles.menuText}>{item.name}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#D8C8B0" />
              </TouchableOpacity>
            ))}
          </View>

          <View style={[styles.footer, { paddingBottom: insets.bottom || 20 }]}>
            <TouchableOpacity style={styles.logoutBtn} onPress={() => { onClose(); onLogout(); }}>
              <MaterialCommunityIcons name="logout" size={20} color={GOLD} />
              <Text style={styles.logoutText}>Logout</Text>
            </TouchableOpacity>
            <Text style={styles.version}>v1.0.0</Text>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row' },
  overlayBg: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)' },
  sidebarContainer: { width: width * 0.75, maxWidth: 320, backgroundColor: BG, height: height, elevation: 20, shadowColor: '#000', shadowOffset: { width: 4, height: 0 }, shadowOpacity: 0.3, shadowRadius: 10 },
  
  header: { backgroundColor: DARK_BROWN, paddingHorizontal: 24, paddingBottom: 24, alignItems: 'flex-start' },
  profileCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: GOLD, alignItems: 'center', justifyContent: 'center', marginBottom: 16, elevation: 4 },
  profileInitials: { fontSize: 24, fontWeight: '900', color: DARK_BROWN },
  brandTitle: { color: GOLD, fontSize: 20, fontWeight: '800' },
  brandSub: { color: '#E8D8B8', fontSize: 13, fontWeight: '600', letterSpacing: 1, marginTop: 2 },
  
  menuList: { flex: 1, paddingTop: 16 },
  menuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 24, borderBottomWidth: 1, borderBottomColor: '#EEDFCC' },
  menuIcon: { marginRight: 16 },
  menuText: { flex: 1, fontSize: 16, fontWeight: '600', color: LIGHT_BROWN },
  
  footer: { paddingHorizontal: 24, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#EEDFCC' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: DARK_BROWN, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center', marginBottom: 12 },
  logoutText: { color: GOLD, fontSize: 15, fontWeight: '700', marginLeft: 8 },
  version: { textAlign: 'center', color: '#999', fontSize: 12, fontWeight: '600' }
});
