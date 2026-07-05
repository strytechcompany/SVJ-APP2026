import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useDashboard } from '../context/DashboardContext';

const GOLD = '#D4AF37';
const HEADER_BG = '#3D2200';

const TYPE_COLORS = {
  B2B: '#FFF8E1',
  B2C: '#FFF3E0',
  B2D: '#EEEEEE',
};

const TYPE_TEXT_COLORS = {
  B2B: '#5C3A00',
  B2C: '#7B3F00',
  B2D: '#333',
};

export default function RecentIssuedList() {
  const { recentIssued, loading } = useDashboard();

  return (
    <View style={styles.wrapper}>
      <Text style={styles.sectionTitle}>Recent Issued Details</Text>

      {loading ? (
        <ActivityIndicator color={GOLD} style={{ marginTop: 20 }} />
      ) : recentIssued.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>No issued records found.</Text>
        </View>
      ) : (
        recentIssued.map((item, index) => (
          <View key={item._id || index} style={styles.card}>
            <View style={styles.leftBorder} />
            <View style={styles.cardBody}>
              <View style={styles.topRow}>
                <View style={styles.info}>
                  <Text style={styles.customerName}>{item.customerName}</Text>
                  <Text style={styles.issueDate}>{item.issueDate}</Text>
                </View>
                <View style={[styles.typeBadge, { backgroundColor: TYPE_COLORS[item.issueType] || '#F0F0F0' }]}>
                  <Text style={[styles.typeText, { color: TYPE_TEXT_COLORS[item.issueType] || '#333' }]}>
                    {item.issueType}
                  </Text>
                </View>
              </View>
              <Text style={styles.weightText}>
                OB: {Number(item.goldWeight).toFixed(3)} g
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 22,
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 14,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    overflow: 'hidden',
  },
  leftBorder: {
    width: 4,
    backgroundColor: GOLD,
  },
  cardBody: {
    flex: 1,
    padding: 14,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  info: {
    flex: 1,
    marginRight: 10,
  },
  customerName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  issueDate: {
    fontSize: 12,
    color: '#888',
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  weightText: {
    fontSize: 13,
    fontWeight: '600',
    color: HEADER_BG,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: '#999',
    fontSize: 14,
  },
});
