import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ProfileModal from './ProfileModal';

const HEADER_BG = '#3D2200';
const GOLD = '#D4AF37';
const WHITE = '#FFFFFF';
const INACTIVE = '#8A7560';

const TABS = [
  { key: 'Home',    label: 'Home',    icon: 'home' },
  { key: 'Reports', label: 'Reports', icon: 'file-chart' },
  { key: 'Orders',  label: 'Orders',  icon: 'clipboard-list' },
  { key: 'Profile', label: '',        icon: 'account', isCenter: true },
  { key: 'Stocks',  label: 'Stocks',  icon: 'warehouse' },
  { key: 'Settings',label: 'Settings',icon: 'cog' },
];

export default function BottomTabBar({ state, descriptors, navigation }) {
  const [isKeyboardVisible, setKeyboardVisible] = React.useState(false);
  const [profileModalVisible, setProfileModalVisible] = React.useState(false);

  React.useEffect(() => {
    const showSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setKeyboardVisible(true)
    );
    const hideSubscription = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setKeyboardVisible(false)
    );
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  if (isKeyboardVisible) return null;

  return (
    <View style={styles.container}>
      {TABS.map((tab, index) => {
        const isFocused = state.index === index;

        const onPress = () => {
          if (tab.key === 'Profile') {
            setProfileModalVisible(true);
            return;
          }

          const event = navigation.emit({
            type: 'tabPress',
            target: state.routes[index]?.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(state.routes[index]?.name || tab.key);
          }
        };

        if (tab.isCenter) {
          return (
            <TouchableOpacity
              key={tab.key}
              style={styles.centerWrapper}
              onPress={onPress}
              activeOpacity={0.85}
            >
              <View style={styles.centerBtn}>
                <MaterialCommunityIcons name="account" size={32} color={HEADER_BG} />
              </View>
            </TouchableOpacity>
          );
        }

        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={onPress}
            activeOpacity={0.7}
          >
            <MaterialCommunityIcons
              name={tab.icon}
              size={24}
              color={isFocused ? GOLD : INACTIVE}
            />
            <Text style={[styles.label, isFocused && styles.labelActive]}>
              {tab.label}
            </Text>
          </TouchableOpacity>
        );
      })}

      <ProfileModal 
        visible={profileModalVisible} 
        onClose={() => setProfileModalVisible(false)} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: HEADER_BG,
    height: 64 + (Platform.OS === 'ios' ? 20 : 0),
    paddingBottom: Platform.OS === 'ios' ? 20 : 0,
    alignItems: 'center',
    paddingHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
  },
  label: {
    fontSize: 10,
    color: INACTIVE,
    marginTop: 3,
    fontWeight: '500',
  },
  labelActive: {
    color: GOLD,
    fontWeight: '700',
  },
  centerWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -24,
  },
  centerBtn: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: GOLD,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
});
