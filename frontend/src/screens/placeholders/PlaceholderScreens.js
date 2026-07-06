import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const HEADER_BG = '#3D2200';
const GOLD = '#D4AF37';
const BG = '#F8F4E8';

function PlaceholderScreen({ title, icon, navigation }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top || (Platform.OS === 'android' ? 24 : 44) }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={GOLD} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 40 }} />
      </View>
      <View style={styles.body}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name={icon} size={48} color={GOLD} />
        </View>
        <Text style={styles.comingSoon}>Coming Soon</Text>
        <Text style={styles.subText}>{title} module is under development.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
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
    elevation: 8,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 20 },
  headerTitle: { flex: 1, color: GOLD, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  body: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconCircle: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(212,175,55,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  comingSoon: { fontSize: 24, fontWeight: '800', color: HEADER_BG, marginBottom: 8 },
  subText: { fontSize: 16, color: '#666', textAlign: 'center', lineHeight: 24 },
  
  menuContainer: { padding: 16 },
  menuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', padding: 16, borderRadius: 12, elevation: 2, marginBottom: 12 },
  menuIconBox: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(212,175,55,0.1)', alignItems: 'center', justifyContent: 'center', marginRight: 16 },
  menuTitle: { fontSize: 16, fontWeight: '700', color: HEADER_BG, marginBottom: 4 },
  menuSub: { fontSize: 13, color: '#666' },
});

export function B2CScreen({ navigation }) {
  return <PlaceholderScreen title="B2C" icon="account-circle" navigation={navigation} />;
}
export function B2DScreen({ navigation }) {
  return <PlaceholderScreen title="B2D" icon="account-multiple" navigation={navigation} />;
}
export function ChitFundScreen({ navigation }) {
  return <PlaceholderScreen title="Chit Fund" icon="piggy-bank" navigation={navigation} />;
}
export function CustomersScreen({ navigation }) {
  return <PlaceholderScreen title="Customers" icon="account-group" navigation={navigation} />;
}
export function ExpensesScreen({ navigation }) {
  return <PlaceholderScreen title="Expenses" icon="cash-minus" navigation={navigation} />;
}

export function AddScreen({ navigation }) {
  return <PlaceholderScreen title="Add" icon="plus-circle" navigation={navigation} />;
}
export function OrdersScreen({ navigation }) {
  return <PlaceholderScreen title="Orders" icon="clipboard-list" navigation={navigation} />;
}
export function SuspenseScreen({ navigation }) {
  return <PlaceholderScreen title="Suspense Transactions" icon="help-circle-outline" navigation={navigation} />;
}
