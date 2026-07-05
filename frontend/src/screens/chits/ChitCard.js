import React, { useState, useRef } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { printChitStatement, shareChitStatement } from '../../services/ChitPrintService';
import { useNavigation } from '@react-navigation/native';

export default function ChitCard({ customer, onPayPress, isCompleted }) {
  const navigation  = useNavigation();
  const [expanded,     setExpanded]     = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const actionLockRef = useRef(false);

  // Guard: if customer data isn't ready yet, render nothing
  if (!customer) return null;

  const {
    chitId,
    customerName,
    phoneNumber,
    monthlyAmount,
    durationMonths,
    completedMonths,
    totalWeightAccumulated,
    address,
  } = customer;

  const withActionLock = async (fn) => {
    if (actionLockRef.current) return;
    actionLockRef.current = true;
    setActionLoading(true);
    const timeout = setTimeout(() => {
      actionLockRef.current = false;
      setActionLoading(false);
    }, 60000);
    try {
      await fn();
    } catch (error) {
      if (!error?.message?.toLowerCase().includes('cancel')) {
        Alert.alert('Error', 'Could not complete the action. Please try again.');
      }
    } finally {
      clearTimeout(timeout);
      actionLockRef.current = false;
      setActionLoading(false);
    }
  };

  const handlePrintStatement = () => withActionLock(() => printChitStatement(customer));
  const handleShareStatement = () => withActionLock(() => shareChitStatement(customer));

  const renderMonthCircles = () => {
    const circles = [];
    for (let i = 1; i <= durationMonths; i++) {
      let bgColor   = '#E0E0E0';
      let textColor = '#8A8A8A';

      if (i <= completedMonths) {
        bgColor   = '#BFA85D';
        textColor = '#FFF';
      } else if (i === completedMonths + 1 && !isCompleted) {
        bgColor   = '#FF8C00';
        textColor = '#FFF';
      }

      circles.push(
        <TouchableOpacity
          key={i}
          disabled={i !== completedMonths + 1 || isCompleted}
          onPress={onPayPress}
          style={[styles.circle, { backgroundColor: bgColor }]}
        >
          {i === completedMonths + 1 && !isCompleted ? (
            <Text style={[styles.circleText, { color: textColor }]}>+{i}</Text>
          ) : (
            <Text style={[styles.circleText, { color: textColor }]}>{i}</Text>
          )}
        </TouchableOpacity>
      );
    }
    return circles;
  };

  return (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <View style={[styles.header, !expanded && { marginBottom: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.chitId}>{chitId}</Text>
          <Text style={styles.customerName}>{customerName}</Text>
          <Text style={styles.subtext}>{phoneNumber} • {address}</Text>
        </View>

        <View style={styles.actions}>
          {expanded && (
            <>
              {/* WhatsApp share */}
              <TouchableOpacity
                onPress={handleShareStatement}
                disabled={actionLoading}
                style={[styles.iconBtn, { backgroundColor: '#E8F5E9' }, actionLoading && { opacity: 0.5 }]}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#2E7D32" />
                  : <Ionicons name="logo-whatsapp" size={20} color="#2E7D32" />}
              </TouchableOpacity>

              {/* Print statement */}
              <TouchableOpacity
                onPress={handlePrintStatement}
                disabled={actionLoading}
                style={[styles.iconBtn, { backgroundColor: '#E3F2FD' }, actionLoading && { opacity: 0.5 }]}
              >
                {actionLoading
                  ? <ActivityIndicator size="small" color="#1565C0" />
                  : <Ionicons name="print" size={20} color="#1565C0" />}
              </TouchableOpacity>
            </>
          )}
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={24}
            color="#8A8A8A"
            style={{ marginLeft: 8, marginTop: 4 }}
          />
        </View>
      </View>

      {expanded && (
        <>
          {/* Stats Grid */}
          <View style={styles.statsGrid}>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Monthly Amt</Text>
              <Text style={styles.statValue}>₹{monthlyAmount}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Amt Paid</Text>
              <Text style={styles.statValue}>₹{(monthlyAmount * completedMonths).toLocaleString()}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Total Wt Paid</Text>
              <Text style={[styles.statValue, { color: '#BFA85D' }]}>
                {totalWeightAccumulated.toFixed(4)} g
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Paid / Total</Text>
              <Text style={[styles.statValue, { color: '#0052CC' }]}>
                {completedMonths}/{durationMonths}
              </Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>Status</Text>
              <Text style={[styles.statValue, { color: isCompleted ? '#28A745' : '#DC3545' }]}>
                {isCompleted ? 'Completed' : `${durationMonths - completedMonths} left`}
              </Text>
            </View>
          </View>

          {/* Monthly Payment Circles */}
          <View style={styles.paymentsSection}>
            <Text style={styles.paymentsTitle}>MONTHLY PAYMENTS</Text>
            <View style={styles.circlesContainer}>
              {renderMonthCircles()}
            </View>
          </View>

          <TouchableOpacity
            style={styles.profileBtn}
            onPress={() => navigation.navigate('ChitCustomerDetail', { customer })}
          >
            <Text style={styles.profileBtnText}>View Full Profile & History</Text>
          </TouchableOpacity>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  chitId: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0052CC',
    backgroundColor: '#E6F0FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  customerName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  subtext: {
    fontSize: 12,
    color: '#8A8A8A',
    marginTop: 2,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBtn: {
    padding: 8,
    backgroundColor: '#F9F5EC',
    borderRadius: 8,
    marginLeft: 8,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  statBox: {
    width: '31%',
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 10,
    color: '#8A8A8A',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  statValue: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  paymentsSection: {
    marginTop: 8,
  },
  paymentsTitle: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#8A8A8A',
    marginBottom: 8,
  },
  circlesContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginBottom: 8,
  },
  circleText: {
    fontSize: 12,
    fontWeight: 'bold',
  },
  profileBtn: {
    marginTop: 12,
    backgroundColor: '#F8F4E8',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#EAE1C8',
  },
  profileBtnText: {
    color: '#5C3A00',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
