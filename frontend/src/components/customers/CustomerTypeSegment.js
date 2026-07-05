import React, { useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

const GOLD = '#D4AF37';
const DARK_BROWN = '#5C3A00';
const BG = '#F8F4E8';

const TYPES = ['B2B', 'B2C', 'B2D', 'LINE STOCKER'];

export default function CustomerTypeSegment({ selected, onSelect }) {
  const segmentWidth = (Dimensions.get('window').width - 64) / 4;
  const animX = useRef(new Animated.Value(TYPES.indexOf(selected) * segmentWidth)).current;

  useEffect(() => {
    const idx = TYPES.indexOf(selected);
    Animated.spring(animX, {
      toValue: idx * segmentWidth,
      useNativeDriver: true,
      tension: 60,
      friction: 10,
    }).start();
  }, [selected, segmentWidth]);

  return (
    <View style={styles.container}>
      {/* Sliding gold indicator */}
      <Animated.View
        style={[
          styles.slider,
          { width: segmentWidth, transform: [{ translateX: animX }] },
        ]}
      />
      {TYPES.map((type) => {
        const isActive = selected === type;
        return (
          <TouchableOpacity
            key={type}
            style={[styles.tab, { width: segmentWidth }]}
            onPress={() => onSelect(type)}
            activeOpacity={0.8}
          >
            <Text style={[styles.tabText, isActive && styles.tabTextActive]}>
              {type}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 4,
    marginHorizontal: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
    position: 'relative',
    overflow: 'hidden',
  },
  slider: {
    position: 'absolute',
    top: 4,
    left: 4,
    bottom: 4,
    borderRadius: 10,
    backgroundColor: GOLD,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
    elevation: 4,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    zIndex: 1,
  },
  tabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#A08850',
    letterSpacing: 0.5,
  },
  tabTextActive: {
    color: DARK_BROWN,
  },
});
