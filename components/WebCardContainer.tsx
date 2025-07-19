import React, { ReactNode } from 'react';
import { View, Platform, StyleSheet, ViewStyle } from 'react-native';

interface WebCardContainerProps {
  children: ReactNode;
  style?: ViewStyle | ViewStyle[];
}

export default function WebCardContainer({ children, style }: WebCardContainerProps) {
  if (Platform.OS !== 'web') return <>{children}</>;
  return (
    <View style={[styles.card, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    // backgroundColor intentionally removed for dynamic backgrounds
    borderRadius: 32,
    boxShadow: '0 6px 32px rgba(0,0,0,0.10)', // for web
    shadowColor: '#000', // for native
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 8,
    padding: 48,
    maxWidth: 480,
    width: '100%',
    alignItems: 'center',
  },
}); 