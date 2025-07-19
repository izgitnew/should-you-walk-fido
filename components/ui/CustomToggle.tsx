import React, { useRef } from 'react';
import { View, TouchableOpacity, Animated, StyleSheet, Platform, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface CustomToggleProps {
  value: boolean;
  onValueChange: (val: boolean) => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
  isDarkBg?: boolean; // pass true for dark backgrounds, false for light
}

const THUMB_SIZE = 28;
const TRACK_WIDTH = 52;
const TRACK_HEIGHT = 32;

const CustomToggle: React.FC<CustomToggleProps> = ({
  value,
  onValueChange,
  disabled,
  accessibilityLabel,
  style,
  isDarkBg,
}) => {
  const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(anim, {
      toValue: value ? 1 : 0,
      duration: 180,
      useNativeDriver: false,
    }).start();
  }, [value]);

  const thumbColor = isDarkBg ? '#fff' : '#222';
  const checkColor = isDarkBg ? '#222' : '#fff';
  const trackOn = isDarkBg ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.10)';
  const trackOff = '#ccc';
  const borderColor = value ? (isDarkBg ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.12)') : 'rgba(0,0,0,0.08)';

  const thumbTranslate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [2, TRACK_WIDTH - THUMB_SIZE - 2],
  });

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => !disabled && onValueChange(!value)}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      style={[
        {
          width: TRACK_WIDTH,
          height: TRACK_HEIGHT,
          borderRadius: TRACK_HEIGHT / 2,
          backgroundColor: value ? trackOn : trackOff,
          borderWidth: 2,
          borderColor,
          justifyContent: 'center',
          padding: 0,
        },
        style,
      ]}
      disabled={disabled}
    >
      <Animated.View
        style={[
          {
            width: THUMB_SIZE,
            height: THUMB_SIZE,
            borderRadius: THUMB_SIZE / 2,
            backgroundColor: thumbColor,
            position: 'absolute',
            left: 0,
            top: (TRACK_HEIGHT - THUMB_SIZE) / 2,
            transform: [{ translateX: thumbTranslate }],
            shadowColor: '#000',
            shadowOpacity: value ? 0.18 : 0.08,
            shadowRadius: value ? 8 : 2,
            shadowOffset: { width: 0, height: 2 },
            elevation: value ? 4 : 1,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        {value && (
          <Ionicons name="checkmark" size={18} color={checkColor} />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

export default CustomToggle; 