import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, StatusBar } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useTransaction } from '../../context/TransactionContext';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

export default function CalculationPlaceholderScreen({ navigation, route }) {
  const { currentTransaction, clearTransaction } = useTransaction();
  const { type } = route.params || {};

  const handleBack = () => {
    clearTransaction();
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={BG} />
      
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={handleBack}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={DARK_BROWN} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{type} Calculation</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <MaterialCommunityIcons name="calculator-variant" size={80} color={GOLD} />
        <Text style={styles.title}>Calculation Page</Text>
        <Text style={styles.subtitle}>
          This is a placeholder for the {type} Calculation page.
        </Text>
        {currentTransaction?.customer && (
          <View style={styles.customerCard}>
            <Text style={styles.customerTitle}>Selected Customer:</Text>
            <Text style={styles.customerName}>{currentTransaction.customer.customerName}</Text>
            <Text style={styles.customerPhone}>+91 {currentTransaction.customer.phoneNumber}</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: '800',
    color: DARK_BROWN,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: DARK_BROWN,
    marginTop: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#8A6822',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  customerCard: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    borderRadius: 16,
    marginTop: 40,
    alignItems: 'center',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#F5EFE6',
  },
  customerTitle: {
    fontSize: 12,
    color: '#A08850',
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  customerName: {
    fontSize: 20,
    fontWeight: '800',
    color: DARK_BROWN,
    marginTop: 4,
  },
  customerPhone: {
    fontSize: 14,
    color: '#8A6822',
    fontWeight: '600',
    marginTop: 2,
  },
});
