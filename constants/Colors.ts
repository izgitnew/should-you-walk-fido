/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

const primaryGreen = '#6BCB77';
const accentBrown = '#A47149';
const surfaceBg = '#F9F6F2';
const cardWhite = '#FFFFFF';
const textDark = '#2D2D2D';
const textLight = '#FFFFFF';
const safeGreen = '#6BCB77';
const alertOrange = '#FFB347';

export const Colors = {
  light: {
    text: textDark,
    background: surfaceBg,
    tint: primaryGreen,
    icon: accentBrown,
    tabIconDefault: accentBrown,
    tabIconSelected: primaryGreen,
    card: cardWhite,
    safe: safeGreen,
    alert: alertOrange,
  },
  dark: {
    text: textLight,
    background: textDark,
    tint: primaryGreen,
    icon: accentBrown,
    tabIconDefault: accentBrown,
    tabIconSelected: primaryGreen,
    card: '#232323',
    safe: safeGreen,
    alert: alertOrange,
  },
};
