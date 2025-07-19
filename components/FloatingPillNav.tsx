import React from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const TABS: { key: string; icon: keyof typeof Feather.glyphMap; }[] = [
  { key: 'home', icon: 'home' },
  { key: 'pet', icon: 'activity' }, // 'activity' is a good paw/energy analog in Feather
  { key: 'forecast', icon: 'calendar' },
];

const ACCENT = '#19C37D';
const INACTIVE = '#B0B0B0';

export default function FloatingPillNav({ activeTab, onTabPress }: {
  activeTab: string;
  onTabPress: (tab: string) => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.container, { bottom: insets.bottom + 16 }]}> 
      <View style={styles.pill}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => onTabPress(tab.key)}
              style={styles.tabBtn}
              accessibilityLabel={tab.key}
              accessibilityRole="button"
            >
              <Feather
                name={tab.icon}
                size={28}
                color={isActive ? ACCENT : INACTIVE}
                style={isActive ? styles.activeIcon : undefined}
              />
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    pointerEvents: 'box-none',
  },
  pill: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 32,
    paddingHorizontal: 24,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    alignItems: 'center',
    minWidth: 180,
    ...Platform.select({
      android: {
        borderWidth: 0.5,
        borderColor: '#eee',
      },
    }),
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 12,
    padding: 4,
  },
  activeIcon: {
    transform: [{ scale: 1.15 }],
  },
}); 