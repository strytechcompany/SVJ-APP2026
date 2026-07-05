import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Animated,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

const GOLD = '#D4AF37';
const DARK_BROWN = '#4B2E05';
const HEADER_BG = '#3D2200';

const toNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const parseNumericValue = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value).replace(/,/g, '').trim();
  const match = normalized.match(/-?\d*\.?\d+/);
  if (!match) return 0;

  const num = Number(match[0]);
  return Number.isFinite(num) ? num : 0;
};

const getQuantity = (item) => toNumber(
  parseNumericValue(
    item && typeof item === 'object'
      ? (item.quantity ?? item.qty ?? item.pcs ?? item.totalQty)
      : item
  )
);

const getWeight = (item) => toNumber(
  parseNumericValue(
    item && typeof item === 'object'
      ? (item.grossWeight ?? item.netWeight ?? item.totalWeight ?? item.weight ?? 0)
      : item
  )
);

function ItemRow({ item, onEdit, onDelete, onPress }) {
  return (
    <TouchableOpacity
      style={styles.itemRow}
      onPress={() => onPress(item)}
      activeOpacity={0.8}
    >
      {/* Item Number Badge & Item Name */}
      <View style={styles.itemBadgeContainer}>
        <View style={styles.itemBadge}>
          <Text style={styles.itemBadgeText}>{item.itemNumber}</Text>
        </View>
        {item.itemName ? (
          <Text style={styles.itemNameText} numberOfLines={2}>
            {item.itemName}
          </Text>
        ) : null}
      </View>

      <View style={styles.itemDetails}>
        <View style={styles.itemDetailRow}>
          <View style={styles.detailChip}>
            <MaterialCommunityIcons name="tag" size={11} color={GOLD} />
            <Text style={styles.detailChipText}>{item.category}</Text>
          </View>
          <View style={styles.detailChip}>
            <MaterialCommunityIcons name="gold" size={11} color={GOLD} />
            <Text style={styles.detailChipText}>{item.purity}</Text>
          </View>
        </View>

        <View style={styles.itemMetaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Qty</Text>
            <Text style={styles.metaValue}>{getQuantity(item)}</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Net Wt</Text>
            <Text style={styles.metaValue}>{getWeight(item.netWeight).toFixed(3)} g</Text>
          </View>
          <View style={styles.metaDivider} />
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>Gross Wt</Text>
            <Text style={styles.metaValue}>{getWeight(item.grossWeight).toFixed(3)} g</Text>
          </View>
        </View>
      </View>

      <View style={styles.itemActions}>
        <TouchableOpacity
          style={[styles.actionBtn, styles.editBtn]}
          onPress={(e) => { e.stopPropagation?.(); onEdit(item); }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="pencil-outline" size={14} color={HEADER_BG} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.deleteBtn]}
          onPress={(e) => {
            e.stopPropagation?.();
            Alert.alert(
              'Delete Item',
              `Delete ${item.itemNumber}?`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () => onDelete(item._id),
                },
              ]
            );
          }}
          activeOpacity={0.7}
        >
          <MaterialCommunityIcons name="trash-can-outline" size={14} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );
}

export default function DesignCard({ group, onDelete, onEdit, onItemPress }) {
  const [expanded, setExpanded] = useState(true);

  const recordsTotalQty = group.records.reduce((sum, r) => {
    const qty = getQuantity(r);
    if (!Number.isFinite(parseNumericValue(r.quantity ?? r.qty ?? r.pcs ?? r.totalQty))) {
      console.warn('[DesignCard] Invalid quantity detected:', {
        designName: group.designName,
        itemId: r._id,
        quantity: r.quantity ?? r.qty ?? r.pcs ?? r.totalQty,
      });
    }
    return sum + qty;
  }, 0);
  const totalQty = recordsTotalQty || getQuantity(group.totalQty);
  const recordsTotalWeight = group.records
    .reduce((sum, r) => {
      return sum + getWeight(r);
    }, 0)
    .toFixed(3);
  const totalWeight = recordsTotalWeight !== '0.000'
    ? recordsTotalWeight
    : getWeight({
      grossWeight: group.totalWeight ?? group.totalNetWeight ?? group.totalStockWeight,
      netWeight: group.totalWeight ?? group.totalNetWeight ?? group.totalStockWeight,
      totalWeight: group.totalWeight ?? group.totalNetWeight ?? group.totalStockWeight,
      weight: group.totalWeight ?? group.totalNetWeight ?? group.totalStockWeight,
    }).toFixed(3);

  return (
    <View style={styles.card}>
      {/* Header — tap to expand/collapse */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((e) => !e)}
        activeOpacity={0.8}
      >
        <View style={styles.headerLeft}>
          <View style={styles.designIconCircle}>
            <MaterialCommunityIcons name="diamond" size={16} color={HEADER_BG} />
          </View>
          <View style={styles.headerTextBlock}>
            <Text style={styles.designName}>{group.designName.toUpperCase()}</Text>
            <Text style={styles.headerMeta}>
              {group.records.length} {group.records.length === 1 ? 'Record' : 'Records'}
            </Text>
          </View>
        </View>
        <MaterialCommunityIcons
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={22}
          color={GOLD}
        />
      </TouchableOpacity>

      {/* Items */}
      {expanded && (
        <View style={styles.itemsBlock}>
          {group.records.map((item, idx) => (
            <View key={item._id}>
              {idx > 0 && <View style={styles.separator} />}
              <ItemRow
                item={item}
                onEdit={onEdit}
                onDelete={onDelete}
                onPress={onItemPress}
              />
            </View>
          ))}

          {/* Bottom summary */}
          <View style={styles.footer}>
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Records</Text>
              <Text style={styles.footerValue}>{group.records.length}</Text>
            </View>
            <View style={styles.footerDivider} />
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Total Qty</Text>
              <Text style={styles.footerValue}>{totalQty}</Text>
            </View>
            <View style={styles.footerDivider} />
            <View style={styles.footerItem}>
              <Text style={styles.footerLabel}>Total Weight</Text>
              <Text style={styles.footerValue}>{totalWeight} g</Text>
            </View>
          </View>
        </View>
      )}

      {/* Collapsed summary pill */}
      {!expanded && (
        <View style={styles.collapsedPill}>
          <Text style={styles.collapsedText}>
            {group.records.length} items · Qty {totalQty} · {totalWeight} g
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginBottom: 14,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    borderWidth: 1,
    borderColor: '#F0E6D0',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: HEADER_BG,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  designIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  headerTextBlock: {
    flex: 1,
  },
  designName: {
    fontSize: 14,
    fontWeight: '800',
    color: GOLD,
    letterSpacing: 0.8,
  },
  headerMeta: {
    fontSize: 11,
    color: '#A08850',
    marginTop: 2,
    fontWeight: '500',
  },
  itemsBlock: {},
  separator: {
    height: 1,
    backgroundColor: '#F5EDD8',
    marginHorizontal: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  itemBadgeContainer: {
    marginRight: 12,
    minWidth: 75,
    maxWidth: 90,
  },
  itemBadge: {
    backgroundColor: '#F8F4E8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E5D8C0',
    alignItems: 'center',
  },
  itemBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: DARK_BROWN,
    letterSpacing: 0.5,
  },
  itemNameText: {
    marginTop: 6,
    fontSize: 11,
    fontWeight: '800',
    color: '#8A6822',
    textAlign: 'center',
    lineHeight: 14,
  },
  itemDetails: {
    flex: 1,
  },
  itemDetailRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 8,
  },
  detailChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E8',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 3,
    gap: 3,
    borderWidth: 1,
    borderColor: '#F0E0A0',
  },
  detailChipText: {
    fontSize: 10,
    color: DARK_BROWN,
    fontWeight: '600',
  },
  itemMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    alignItems: 'center',
  },
  metaLabel: {
    fontSize: 9,
    color: '#B09878',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  metaValue: {
    fontSize: 13,
    color: DARK_BROWN,
    fontWeight: '700',
    marginTop: 1,
  },
  metaDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#E5D8C0',
    marginHorizontal: 12,
  },
  itemActions: {
    flexDirection: 'column',
    gap: 6,
    marginLeft: 10,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  editBtn: {
    backgroundColor: GOLD,
  },
  deleteBtn: {
    backgroundColor: '#C0392B',
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: '#FDFAF3',
    borderTopWidth: 1,
    borderTopColor: '#F0E6D0',
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  footerItem: {
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 10,
    color: '#B09878',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerValue: {
    fontSize: 14,
    color: DARK_BROWN,
    fontWeight: '800',
    marginTop: 2,
  },
  footerDivider: {
    width: 1,
    height: 32,
    backgroundColor: '#E5D8C0',
  },
  collapsedPill: {
    backgroundColor: '#FDFAF3',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0E6D0',
  },
  collapsedText: {
    fontSize: 12,
    color: '#A08850',
    fontWeight: '600',
    textAlign: 'center',
  },
});
