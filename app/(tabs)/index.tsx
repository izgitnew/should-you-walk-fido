import { useLocation } from '@/components/LocationContext';
import { PetInfo, usePet } from '@/components/PetContext';
import { useTemperatureUnit } from '@/components/TemperatureUnitContext';
import CustomToggle from '@/components/ui/CustomToggle';
import WebCardContainer from '@/components/WebCardContainer';
import { Colors } from '@/constants/Colors';
import { useColorScheme } from '@/hooks/useColorScheme';
import { FontAwesome5, Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { SafeAreaView as SafeAreaViewRN, useSafeAreaInsets } from 'react-native-safe-area-context';



const WEATHER_API_KEY = '1223a1d1bdae45fdbc5202048251306';

function toCelsius(f: number) { return ((f - 32) * 5) / 9; }

const STATUS = {
  safe: {
    color: '#19C37D',
    icon: 'happy-outline',
    title: 'Safe for your dog!',
    message: 'Enjoy your walk, but always monitor your dog for signs of overheating.'
  },
  caution: {
    color: '#FF9900',
    icon: 'alert-circle-outline',
    title: 'Caution',
    message: 'Limit activity, provide water and shade.'
  },
  danger: {
    color: '#FF3B30',
    icon: 'home-outline',
    title: 'Dangerous for your dog!',
    message: 'Avoid walks. Keep your dog indoors with access to water and shade.'
  }
};

function getStatus(tempF: number) {
  if (tempF < 80) return STATUS.safe;
  if (tempF < 90) return STATUS.caution;
  return STATUS.danger;
}

// Risk matrix from chart
const RISK_MATRIX = {
  Small:   [5,5,5,5,4,3,3,2,1,1,1,2,3,3,3,4,4,5,5,5,5], // 95F to 0F
  Medium:  [5,5,5,4,3,3,2,1,1,1,2,2,2,3,3,4,4,5,5,5,5],
  Large:   [5,5,5,4,4,3,3,2,1,1,1,1,1,2,3,4,4,5,5,5,5],
};
const TEMP_STEPS_F = [95,90,85,80,75,70,65,60,55,50,45,40,35,30,25,20,15,10,5,0];

// Function to get temperature-based card color
function getTemperatureColor(tempF: number | null | undefined) {
  if (tempF == null || isNaN(tempF)) {
    return '#19C37D'; // Use your app's safe/neutral color during loading
  }
  if (tempF < 0) {
    return '#311b92'; // Dark purple for below 0
  } else if (tempF <= 14) {
    return '#4A148C'; // Dark purple for 0-14
  } else if (tempF <= 24) {
    return '#1565C0'; // Dark blue for 15-24
  } else if (tempF < 35) {
    return '#186F98'; // Bluish for 25-34
  } else if (tempF < 50) {
    return '#1B7A75'; // Greenish for 35-49
  } else if (tempF < 65) {
    return '#0c880b'; // Green for 50-64
  } else if (tempF < 75) {
    return '#F4B400'; // Orange for 65-74
  } else if (tempF < 85) {
    return '#e86c00'; // Dark orange for 75-84
  } else {
    return '#88211b'; // Red for 85+
  }
}

const RISK_LEVELS = [
  { level: 1, color: '#0c880b', icon: 'happy-outline', title: 'No evidence of risk', message: 'Wag and walk!' },
  { level: 2, color: '#A1CEDC', icon: 'happy-outline', title: 'Risk is unlikely', message: 'Sniff around, stay sharp' },
  { level: 3, color: '#ffb300', icon: 'alert-circle-outline', title: 'Unsafe potential', message: 'Maybe paws off for some' },
  { level: 4, color: '#ff7d00', icon: 'alert-circle-outline', title: 'Dangerous weather', message: 'Watch your paws out there' },
  { level: 5, color: '#88211b', icon: 'home-outline', title: 'Life-Threatening', message: 'Skip the stroll, stay in!' },
];

function getRiskLevel(tempF: number, pet: PetInfo, shade: boolean, wetWeather: boolean) {
  let idx = TEMP_STEPS_F.findIndex((t) => tempF >= t);
  if (idx === -1) idx = TEMP_STEPS_F.length - 1;
  let base = RISK_MATRIX[pet.size][idx];
  let mod = 0;
  if (pet.obese) mod += 1;
  if (pet.brachy) mod += 1;
  if (pet.senior) mod += 1;
  if (shade) mod -= 1;
  // Conditional modifiers
  if (tempF < 35) {
    if (wetWeather) mod += 2;
    if (pet.northern) mod -= 1;
    if (pet.acclimated) mod -= 1;
  } else if (tempF > 70) {
    if (wetWeather) mod -= 2;
    if (pet.northern) mod += 1;
    if (pet.acclimated) mod += 1;
  }
  // Clamp between 1 and 5
  let risk = Math.max(1, Math.min(5, base + mod));
  return RISK_LEVELS[risk-1];
}

// Add mapping function for pavement temp, message, and risk
function getPavementAndMessage(tempF: number) {
  if (tempF < 20) {
    return {
      pavement: 'Under 60°F',
      message: 'No. Quick potty breaks only.',
      risk: 'High for all dogs.',
      color: '#db342b',
    };
  } else if (tempF < 32) {
    return {
      pavement: 'Under 75°F',
      message: 'Maybe. Limit walks to 15 minutes.',
      risk: 'High for puppies, small breeds, and seniors. Moderate for large and thick–coated breeds.',
      color: '#db342b',
    };
  } else if (tempF < 45) {
    return {
      pavement: 'Under 105°F',
      message: 'Yes. Consider limiting walks to 30 minutes.',
      risk: 'Moderate for small dogs and short–haired breeds.',
      color: '#ffb300',
    };
  } else if (tempF < 60) {
    return {
      pavement: '85 – 125°F',
      message: 'Yes. Monitor for signs of discomfort.',
      risk: 'Low for most dogs.',
      color: '#19C37D',
    };
  } else if (tempF < 75) {
    return {
      pavement: '105 – 135°F',
      message: 'Yes. Monitor for signs of discomfort.',
      risk: 'Low for small and medium breeds. Moderate risk for large and at–risk dogs.',
      color: '#19C37D',
    };
  } else if (tempF < 85) {
    return {
      pavement: '115 – 145°F',
      message: 'Maybe. Consider limiting walks to 30 minutes.',
      risk: 'Moderate for small and medium breeds. High for large and at–risk breeds.',
      color: '#ffb300',
    };
  } else if (tempF < 100) {
    return {
      pavement: 'Over 145°F',
      message: 'Maybe. Limit walks to 15 minutes. Potty breaks only for at–risk dogs.',
      risk: 'High for most dogs.',
      color: '#ff5e47', // light red
    };
  } else {
    return {
      pavement: 'Over 145°F',
      message: 'Walking is not advised. Potty breaks only.',
      risk: 'High for most dogs.',
      color: '#db342b',
    };
  }
}

function pavementTempToCelsius(pavementStr: string) {
  function toCelsius(f: number) { return Math.round((f - 32) * 5 / 9); }
  let match;
  if (pavementStr.startsWith('Under ')) {
    match = pavementStr.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      return `Under ${toCelsius(num)}°C`;
    }
    return pavementStr;
  }
  if (pavementStr.startsWith('Usually under ')) {
    match = pavementStr.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      return `Usually under ${toCelsius(num)}°C`;
    }
    return pavementStr;
  }
  if (pavementStr.includes('–')) {
    match = pavementStr.match(/\d+/g);
    if (match && match.length === 2) {
      const [low, high] = match.map(Number);
      return `${toCelsius(low)}–${toCelsius(high)}°C`;
    }
    return pavementStr;
  }
  if (pavementStr.startsWith('Potentially over ')) {
    match = pavementStr.match(/\d+/);
    if (match) {
      const num = parseInt(match[0], 10);
      return `Potentially over ${toCelsius(num)}°C`;
    }
    return pavementStr;
  }
  return pavementStr; // fallback
}

const WEATHER_ICONS: Record<string, string> = {
  clear: 'sunny-outline',
  sunny: 'sunny-outline',
  cloud: 'cloud-outline',
  overcast: 'cloudy-outline',
  rain: 'rainy-outline',
  drizzle: 'rainy-outline',
  shower: 'rainy-outline',
  storm: 'thunderstorm-outline',
  snow: 'snow-outline',
  fog: 'cloudy-outline',
  mist: 'cloudy-outline',
  haze: 'cloudy-outline',
};
const PET_AVATARS = [
  { key: 'dog1', icon: 'paw-outline' },
  { key: 'dog2', icon: 'paw' },
  { key: 'dog3', icon: 'happy-outline' },
];

// Custom risk icons mapping
const RISK_ICONS = {
  safe: 'checkmark-circle-outline',
  monitor: 'alert-circle-outline',
  danger: 'close-circle-outline',
};

// Helper for date formatting
function formatDay(dateStr: string) {
  // Parse as UTC and always render as UTC
  const date = new Date(dateStr + 'T00:00:00Z');
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC' // <-- force UTC rendering
  });
}

// Helper for best walk time (suggests 6-11am if hot, 12-3pm if cold, else coolest 2-hour window)
function getBestWalkTime(hours: any[], high: number, unit: string) {
  if (!Array.isArray(hours) || hours.length === 0) {
    console.log('No hourly data available for this day.');
    return null;
  }
  // Ensure each hour has an 'hour' property
  hours = hours.map(h => ({
    ...h,
    hour: typeof h.hour === 'number' ? h.hour : new Date(h.time).getHours()
  }));
  // Hot: suggest earliest 2-hour window between 6am-11am
  if ((unit === 'C' && high >= 29) || (unit === 'F' && high >= 85)) {
    const morning = hours.filter(h => h.hour >= 6 && h.hour <= 11);
    if (morning.length < 2) {
      console.log('No suitable hot walk window: not enough morning hours (6am-11am).', morning.map(h => h.hour));
    }
    for (let i = 0; i < morning.length - 1; i++) {
      return { window: [morning[i], morning[i+1]], reason: 'It will be hot today. Walk early!' };
    }
  }
  // Cold: suggest earliest 2-hour window between 12pm-3pm
  if ((unit === 'C' && high <= 10) || (unit === 'F' && high <= 50)) {
    const midday = hours.filter(h => h.hour >= 12 && h.hour <= 15);
    if (midday.length < 2) {
      console.log('No suitable cold walk window: not enough midday hours (12pm-3pm).', midday.map(h => h.hour));
    }
    for (let i = 0; i < midday.length - 1; i++) {
      return { window: [midday[i], midday[i+1]], reason: 'It will be cold today. Walk in the warmest part of the day.' };
    }
  }
  // Otherwise, coolest 2-hour window between 6am-8pm
  let bestIdx = -1;
  let bestAvg = Infinity;
  let found = false;
  for (let i = 0; i < hours.length - 1; i++) {
    if (hours[i].hour >= 6 && hours[i+1].hour <= 20) {
      const avg = (hours[i].temp_c + hours[i+1].temp_c) / 2;
      if (avg < bestAvg) {
        bestAvg = avg;
        bestIdx = i;
        found = true;
      }
    }
  }
  if (found && bestIdx !== -1) {
    return { window: [hours[bestIdx], hours[bestIdx+1]], reason: 'Coolest part of the day' };
  }
  // If no valid window found, log why
  console.log('No suitable fallback walk window: available hours:', hours.map(h => h.hour));
  return null;
}

// Helper to check if a reason is for hot or cold
function isHotOrColdReason(reason: string) {
  return reason === 'It will be hot today. Walk early!' || reason === 'It will be cold today. Walk in the warmest part of the day.';
}

// Helper to check scenario and return color, icon, and message
function getWalkScenario(reason: string) {
  if (reason === 'It will be hot today. Walk early!') {
    return {
      bg: '#FFF9E6',
      accent: '#FF9900',
      icon: { name: 'sunny-outline', color: '#FF9900' },
      message: 'Walk early – pavement may be very hot!'
    };
  }
  if (reason === 'It will be cold today. Walk in the warmest part of the day.') {
    return {
      bg: '#E6F0FF',
      accent: '#2196f3',
      icon: { name: 'snow-outline', color: '#2196f3' },
      message: 'Walk midday for warmth.'
    };
  }
  if (reason === 'Coolest part of the day') {
    return {
      bg: '#E6FFEF',
      accent: '#19C37D',
      icon: { name: 'sunny-outline', color: '#19C37D' }, // green sun
      message: 'Great day for a walk!'
    };
  }
  // fallback
  return {
    bg: '#FFF',
    accent: '#222',
    icon: null,
    message: ''
  };
}

// Utility to determine if a color is dark
function isColorDark(hex: string) {
  // Remove # if present
  hex = hex.replace('#', '');
  // Convert 3-digit to 6-digit
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  const r = parseInt(hex.substring(0,2), 16);
  const g = parseInt(hex.substring(2,4), 16);
  const b = parseInt(hex.substring(4,6), 16);
  // Perceived brightness
  return (r * 0.299 + g * 0.587 + b * 0.114) < 186;
}

// Utility to lighten a hex color
function lightenColor(hex: string, percent: number) {
  hex = hex.replace('#', '');
  if (hex.length === 3) hex = hex.split('').map(x => x + x).join('');
  let r = parseInt(hex.substring(0,2), 16);
  let g = parseInt(hex.substring(2,4), 16);
  let b = parseInt(hex.substring(4,6), 16);
  r = Math.min(255, Math.floor(r + (255 - r) * percent));
  g = Math.min(255, Math.floor(g + (255 - g) * percent));
  b = Math.min(255, Math.floor(b + (255 - b) * percent));
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`;
}
// Utility to get a pastel/muted accent from cardColor
function pastelizeColor(hex: string) {
  return lightenColor(hex, 0.5);
}

export default function DogWalkSafetyScreen() {
  const colorScheme = useColorScheme();
  const theme = Colors[colorScheme ?? 'light'];
  const { unit, setUnit } = useTemperatureUnit();
  const { pet, setPet } = usePet();
  console.log('Home pet:', pet);
  const { selectedLocation, setSelectedLocation } = useLocation();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [city, setCity] = useState<string | null>(null);
  const [tempF, setTempF] = useState<number | null>(null);
  const [feelsLikeF, setFeelsLikeF] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [isDay, setIsDay] = useState(true);
  const [shade, setShade] = useState(true); // default true, will update after weather fetch
  const [userHasToggledShade, setUserHasToggledShade] = useState(false);
  const [wetWeather, setWetWeather] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const [petAvatar, setPetAvatar] = useState('dog1');
  const [helpVisible, setHelpVisible] = useState(false);
  const [condition, setCondition] = useState<string>('');
  const [showSizePicker, setShowSizePicker] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [locationModalVisible, setLocationModalVisible] = useState(false);
  const [postalInput, setPostalInput] = useState('');
  const [postalError, setPostalError] = useState('');

  // Pet Detail Card Flip State and Animation
  const [isEditingPet, setIsEditingPet] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const [flipDeg, setFlipDeg] = useState(0);

  useEffect(() => {
    Animated.timing(flipAnim, {
      toValue: isEditingPet ? 1 : 0,
      duration: 400,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [isEditingPet]);

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });

  const fetchWeather = async () => {
    setLoading(true);
    setError(null);
    try {
      let latitude: number, longitude: number, cityName: string | null = null;
      if (selectedLocation) {
        latitude = selectedLocation.latitude;
        longitude = selectedLocation.longitude;
        cityName = selectedLocation.city;
      } else {
        let { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') {
          setError('Location permission denied.');
          setLoading(false);
          return;
        }
        let location = await Location.getCurrentPositionAsync({});
        latitude = location.coords.latitude;
        longitude = location.coords.longitude;
      }
      // Reverse geocode to get city if not provided
      if (cityName) {
        setCity(cityName);
      } else {
        try {
          const OPENCAGE_API_KEY = '30ac786f7de74572ae57c37f48ec58f1';
          const ocUrl = `https://api.opencagedata.com/geocode/v1/json?q=${latitude}+${longitude}&key=${OPENCAGE_API_KEY}`;
          const ocResp = await axios.get(ocUrl);
          const results = ocResp.data.results;
          if (results && results.length > 0) {
            const components = results[0].components;
            const cityPart = components.city || components.town || components.village || components.state || '';
            const countryCode = components.country_code ? components.country_code.toUpperCase() : '';
            setCity(cityPart && countryCode ? `${cityPart}, ${countryCode}` : cityPart || countryCode || 'Location unavailable');
          } else {
            setCity('Location unavailable');
          }
        } catch {
          setCity('Location unavailable');
        }
      }
      const url = `https://api.weatherapi.com/v1/current.json?key=${WEATHER_API_KEY}&q=${latitude},${longitude}`;
      const response = await axios.get(url);
      setTempF(response.data.current.temp_f);
      setFeelsLikeF(response.data.current.feelslike_f);
      setIsDay(response.data.current.is_day === 1);
      setLastUpdated(new Date());
      if (!userHasToggledShade) {
        setShade(response.data.current.is_day !== 1 ? true : false);
      }
      const cond = response.data.current.condition.text.toLowerCase();
      setCondition(cond);
      setWetWeather(cond.includes('rain') || cond.includes('shower') || cond.includes('drizzle') || cond.includes('storm'));
    } catch (e: any) {
      setError('Failed to fetch weather data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
      Animated.timing(fadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }
  };

  useEffect(() => {
    fetchWeather();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocation]);

  useEffect(() => {
    AsyncStorage.getItem('petAvatar').then((a) => { if (a) setPetAvatar(a); });
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    setTempF(null);
    setFeelsLikeF(null);
    setLastUpdated(null);
    fadeAnim.setValue(0);
    fetchWeather();
  };

  const handleSetPetAvatar = (avatar: string) => {
    setPetAvatar(avatar);
    AsyncStorage.setItem('petAvatar', avatar);
  };

  const [showDebug, setShowDebug] = useState(false);
  const [headlineClicks, setHeadlineClicks] = useState(0);
  const headlineClickTimeout = useRef<any>(null);

  // Debug: custom temperature override
  const [customTemp, setCustomTemp] = useState<string>('');
  const [useCustomTemp, setUseCustomTemp] = useState(false);

  // Debug: custom time of day override
  const [useCustomTimeOfDay, setUseCustomTimeOfDay] = useState(false);
  const [customIsDay, setCustomIsDay] = useState(true);

  // Auto-enable shade at night and make it non-editable
  useEffect(() => {
    // Use override if enabled
    const effectiveIsDay = useCustomTimeOfDay ? customIsDay : isDay;
    if (!effectiveIsDay) {
      setShade(true);
      setUserHasToggledShade(false); // Reset so it can be auto-managed
    }
  }, [isDay, useCustomTimeOfDay, customIsDay]);

  // Determine if shade toggle should be disabled (at night)
  const effectiveIsDay = useCustomTimeOfDay ? customIsDay : isDay;
  const isShadeDisabled = !effectiveIsDay;

  let displayTemp: number | null = tempF;
  let displayFeels: number | null = feelsLikeF;
  let tempUnit = '°F';
  // Use custom temp if enabled in debug mode
  const tempForLogic = useCustomTemp && customTemp !== '' && !isNaN(Number(customTemp))
    ? Number(customTemp)
    : (feelsLikeF ?? tempF ?? null);

  if (unit === 'C' && tempF !== null && feelsLikeF !== null) {
    displayTemp = Math.round(toCelsius(tempF));
    displayFeels = Math.round(toCelsius(feelsLikeF));
    tempUnit = '°C';
  } else if (tempF !== null && feelsLikeF !== null) {
    displayTemp = Math.round(tempF);
    displayFeels = Math.round(feelsLikeF);
  } else {
    displayTemp = null;
    displayFeels = null;
  }

  // If using custom temp, override display values
  if (useCustomTemp && customTemp !== '' && !isNaN(Number(customTemp))) {
    displayTemp = Math.round(Number(customTemp));
    displayFeels = Math.round(Number(customTemp));
    tempUnit = '°F';
  }

  // Custom pavement info for night
  const nightPavementInfo = {
    pavement: 'Cooling Down',
    message: 'No sun, no sizzle! Pavement is safer at night.',
    risk: 'Low for all dogs.',
    color: '#19C37D',
  };

  const pavementInfo = !effectiveIsDay
    ? nightPavementInfo
    : getPavementAndMessage(tempForLogic ?? 0);
  const risk = (tempForLogic !== null && tempForLogic !== undefined && pet) ? getRiskLevel(tempForLogic, pet, shade, wetWeather) : RISK_LEVELS[0];
  // Use temperature for card color, risk for icon and message
  const cardColor = getTemperatureColor(tempForLogic == null ? 0 : tempForLogic);
  const cardIcon = risk.icon;
  const cardTitle = risk.title;
  const cardMessage = risk.message;

  const riskIcon =
    pavementInfo.color === '#19C37D' ? RISK_ICONS.safe :
    pavementInfo.color === '#ffb300' ? RISK_ICONS.monitor :
    RISK_ICONS.danger;

  // Loading skeleton
  const Skeleton = () => (
    <View style={styles.skeletonWrap}>
      <View style={[styles.skelCity, { backgroundColor: theme.card }]} />
      <View style={[styles.skelIcon, { backgroundColor: theme.card }]} />
      <View style={[styles.skelTemp, { backgroundColor: theme.card }]} />
      <View style={[styles.skelFeels, { backgroundColor: theme.card }]} />
      <View style={[styles.skelStatus, { backgroundColor: theme.card }]} />
    </View>
  );

  async function handlePostalSubmit() {
    setPostalError('');
    if (!postalInput.trim()) {
      setPostalError('Please enter a postal code.');
      return;
    }
    try {
      const OPENCAGE_API_KEY = '30ac786f7de74572ae57c37f48ec58f1';
      const url = `https://api.opencagedata.com/geocode/v1/json?q=${encodeURIComponent(postalInput.trim())}&key=${OPENCAGE_API_KEY}`;
      const resp = await fetch(url);
      const data = await resp.json();
      if (data.results && data.results.length > 0) {
        const loc = data.results[0];
        setSelectedLocation({
          latitude: loc.geometry.lat,
          longitude: loc.geometry.lng,
          city: (() => {
            const comp = loc.components || {};
            const cityPart = comp.city || comp.town || comp.village || comp.state || '';
            const countryCode = comp.country_code ? comp.country_code.toUpperCase() : '';
            return cityPart && countryCode ? `${cityPart}, ${countryCode}` : cityPart || countryCode || 'Location unavailable';
          })(),
        });
        setLocationModalVisible(false);
        setPostalInput('');
      } else {
        setPostalError('Location not found for that postal code.');
      }
    } catch (e) {
      setPostalError('Error looking up postal code.');
    }
  }

  // Error boundary and accessibility
  // Add a state to track the status card height
  const [statusCardHeight, setStatusCardHeight] = useState(400);

  const shakeAnim = useRef(new Animated.Value(0)).current;

  // Paw shake: only shake twice per hour (every 30 minutes)
  useEffect(() => {
    let shakeTimeout: any = null;
    let shakeInterval: any = null;
    let isUnmounted = false;

    const triggerShake = () => {
      Animated.sequence([
        Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: -1, duration: 80, useNativeDriver: true }),
        Animated.timing(shakeAnim, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]).start();
    };

    if (!isEditingPet) {
      // Shake immediately on mount, then every 30 minutes
      triggerShake();
      shakeInterval = setInterval(() => {
        if (!isUnmounted) triggerShake();
      }, 30 * 60 * 1000); // 30 minutes
    }

    return () => {
      isUnmounted = true;
      if (shakeTimeout) clearTimeout(shakeTimeout);
      if (shakeInterval) clearInterval(shakeInterval);
      shakeAnim.stopAnimation();
      shakeAnim.setValue(0);
    };
  }, [isEditingPet]);

  // Debug menu show/hide state and click counter for headline
  const handleHeadlineClick = () => {
    console.log('Headline tapped!');
    if (headlineClickTimeout.current) clearTimeout(headlineClickTimeout.current);
    setHeadlineClicks((prev) => {
      const next = prev + 1;
      if (next >= 7) {
        setShowDebug((v) => !v);
        return 0;
      }
      // Reset if no 7 clicks within 2 seconds
      headlineClickTimeout.current = setTimeout(() => setHeadlineClicks(0), 2000);
      return next;
    });
  };

  const { width, height } = useWindowDimensions();
  const isMobile = Platform.OS !== 'web' && width < 600;
  const insets = useSafeAreaInsets();

  // Remove swipe navigation logic and PanResponder
  // Add nav bar page state
  const [page, setPage] = useState(0); // 0: Home, 1: Pet, 2: Forecast

  // Nav bar icon data
  const navIcons = [
    { key: 'home', icon: <FontAwesome5 name="dog" size={28} />, label: 'Home' },
    { key: 'pet', icon: <Ionicons name="paw" size={28} />, label: 'Pet' },
    { key: 'forecast', icon: <Ionicons name="calendar-outline" size={28} />, label: 'Forecast' },
  ];

  // Walk Forecast state
  const [forecast, setForecast] = useState<any>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState('');
  const [forecastFadeAnim] = useState(new Animated.Value(0));

  // 1. Add a refreshForecast state at the top of DogWalkSafetyScreen:
  const [refreshForecast, setRefreshForecast] = useState(0);

  // At the top of DogWalkSafetyScreen (with other useRef/useState):
  const forecastLoadingTimeout = useRef<any>(null);
  const forecastLoadingStart = useRef<number>(0);

  // Fetch and cache forecast
  useEffect(() => {
    if (page !== 2) return;
    let isMounted = true;
    async function fetchForecast() {
      // Only show loading overlay if no forecast data is available (not just switching tabs)
      const shouldShowLoading = !forecast;
      if (shouldShowLoading) {
        forecastLoadingStart.current = Date.now();
        if (forecastLoadingTimeout.current) clearTimeout(forecastLoadingTimeout.current);
        setForecastLoading(true);
      }
      setForecastError('');
      try {
        // Use city or fallback to a default
        const loc = city || 'New York';
        const cacheKey = `forecast_${loc}`;
        // const cached = await AsyncStorage.getItem(cacheKey);
        // if (cached) {
        //   const parsed = JSON.parse(cached);
        //   if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
        //     setForecast(parsed.data);
        //     setForecastLoading(false);
        //     Animated.timing(forecastFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        //     return;
        //   }
        // }
        // Always fetch from API for debugging
        const url = `https://api.weatherapi.com/v1/forecast.json?key=${WEATHER_API_KEY}&q=${encodeURIComponent(loc)}&days=7&aqi=no&alerts=no`;
        console.log('Forecast API URL:', url);
        const resp = await fetch(url);
        if (!resp.ok) throw new Error('API error');
        const data = await resp.json();
        console.log('Forecast API response:', data);
        if (isMounted) {
          setForecast(data);
          await AsyncStorage.setItem(cacheKey, JSON.stringify({ data, timestamp: Date.now() }));
          const MIN_FORECAST_LOADING = 150; // ms
          const elapsed = Date.now() - forecastLoadingStart.current;
          if (shouldShowLoading) {
            if (elapsed < MIN_FORECAST_LOADING) {
              forecastLoadingTimeout.current = setTimeout(() => {
                setForecastLoading(false);
              }, MIN_FORECAST_LOADING - elapsed);
            } else {
              setForecastLoading(false);
            }
          }
          Animated.timing(forecastFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }).start();
        }
      } catch (e) {
        setForecastError('Forecast unavailable. Please check your connection.');
        setForecastLoading(false);
      }
    }
    fetchForecast();
    return () => { isMounted = false; };
  }, [page, city, refreshForecast, forecast]);

  const [activeTab, setActiveTab] = useState<'home' | 'pet' | 'forecast'>('home');

  const isDarkBg = isColorDark(cardColor);
  const petTextColor = isDarkBg ? '#fff' : '#222';
  const petAccentColor = isDarkBg ? '#fff' : '#222';
  const pillBgColor = isDarkBg ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.10)';

  const cardBgColor = lightenColor(cardColor, 0.25); // 25% lighter for card backgrounds
  const accentPastel = pastelizeColor(cardColor);

  // 1. Add state and Animated.Value for location pill press effect, near other useState/useRef hooks:
  const [locationPillPressed, setLocationPillPressed] = useState(false);
  const locationPillScale = useRef(new Animated.Value(1)).current;

  // 2. Add effect for press in/out animation:
  useEffect(() => {
    Animated.spring(locationPillScale, {
      toValue: locationPillPressed ? 0.96 : 1,
      useNativeDriver: true,
      speed: 30,
      bounciness: 8,
    }).start();
  }, [locationPillPressed]);

  // 1. Add state and Animated.Value arrays for nav icon press effects, near other useState/useRef hooks:
  const [navPressed, setNavPressed] = useState([false, false, false]);
  const navScales = [useRef(new Animated.Value(1)).current, useRef(new Animated.Value(1)).current, useRef(new Animated.Value(1)).current];

  // 2. Add effect for press in/out animation:
  useEffect(() => {
    navPressed.forEach((pressed, idx) => {
      Animated.spring(navScales[idx], {
        toValue: pressed ? 0.92 : 1,
        useNativeDriver: true,
        speed: 30,
        bounciness: 8,
      }).start();
    });
  }, [navPressed]);

  // Before the pavement temp row (mobile):
  const showIceCream = !effectiveIsDay || tempForLogic < 55;

  // 1. Add at the top of DogWalkSafetyScreen (with other useRef/useState):
  const statusWiggle = useRef(new Animated.Value(0)).current;

  // 2. Add useEffect to trigger wiggle when 'risk' changes:
  useEffect(() => {
    statusWiggle.setValue(0);
    Animated.sequence([
      Animated.timing(statusWiggle, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(statusWiggle, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(statusWiggle, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(statusWiggle, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  }, [risk]);

  // 3. Create an interpolation for rotation:
  const statusWiggleRotate = statusWiggle.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-15deg', '15deg'],
  });

  // 4. Wrap the status icon in Animated.View and apply the rotation:
  // Replace:
  // <Ionicons name={cardIcon as any} size={34} color={accentPastel} ... />
  // With:
  <Animated.View style={{ transform: [{ rotate: statusWiggleRotate }], marginRight: 10 }}>
    <Ionicons name={cardIcon as any} size={34} color={accentPastel} accessibilityLabel={cardMessage} />
  </Animated.View>

  // 1. Add at the top of DogWalkSafetyScreen (with other useRef/useState):
  const dogBounce = useRef(new Animated.Value(0)).current;
  const dogWiggle = useRef(new Animated.Value(0)).current;

  // 2. useEffect for bounce on mount:
  useEffect(() => {
    dogBounce.setValue(0);
    Animated.spring(dogBounce, {
      toValue: 1,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }, []);

  // 3. Interpolations:
  const dogScale = dogBounce.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });
  const dogWiggleRotate = dogWiggle.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] });

  // 4. Update the dog icon TouchableOpacity onPress handler:
  const handleDogIconPress = () => {
    Animated.sequence([
      Animated.timing(dogWiggle, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(dogWiggle, { toValue: -1, duration: 60, useNativeDriver: true }),
      Animated.timing(dogWiggle, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.timing(dogWiggle, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
    if (typeof handleHeadlineClick === 'function') handleHeadlineClick();
  };

  // 1. Add at the top of DogWalkSafetyScreen (with other useRef/useState):
  const statusPulse = useRef(new Animated.Value(0)).current;

  // 2. useEffect to trigger pulse when risk changes to 'Safe' or 'Danger':
  useEffect(() => {
    if (risk.level === 1 || risk.level === 5) {
      statusPulse.setValue(0);
      Animated.sequence([
        Animated.timing(statusPulse, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(statusPulse, { toValue: 0, duration: 320, useNativeDriver: true }),
      ]).start();
    }
  }, [risk]);

  // 3. Interpolate for scale and shadow/glow:
  const statusPulseScale = statusPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] });
  const statusPulseShadow = statusPulse.interpolate({ inputRange: [0, 1], outputRange: [0, 0.45] });

  // 4. Wrap the status row in Animated.View and apply the animation:
  // Replace:
  // <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'center', justifyContent: 'center', marginTop: 18, marginBottom: 18 }}>
  //   ...
  // </View>
  // With:
  <Animated.View style={{
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    justifyContent: 'center',
    marginTop: 18,
    marginBottom: 18,
    transform: [{ scale: statusPulseScale }],
    shadowColor: risk.level === 1 ? '#19C37D' : risk.level === 5 ? '#FF3B30' : 'transparent',
    shadowOpacity: statusPulseShadow,
    shadowRadius: 18,
    elevation: statusPulseShadow,
  }}>
    <Animated.View style={{ transform: [{ rotate: statusWiggleRotate }], marginRight: 10 }}>
      <Ionicons name={cardIcon as any} size={34} color={accentPastel} accessibilityLabel={cardMessage} />
    </Animated.View>
    <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>
      {risk.message}
    </Text>
  </Animated.View>

  // Main weather icon color logic for hero icon
  let mainIconName = 'sunny-outline';
  let mainIconColor = '#FFD600'; // default sun yellow
  const today = forecast?.forecast?.forecastday?.[0];
  if (today) {
    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
    const best = getBestWalkTime(today.hour, high, unit);
    if (best) {
      const scenario = getWalkScenario(best.reason);
      mainIconName = (scenario.icon?.name || 'sunny-outline');
      if (mainIconName === 'rainy-outline') mainIconColor = '#64b5f6';
      else if (mainIconName === 'cloud-outline' || mainIconName === 'cloudy-outline') mainIconColor = '#B0BEC5';
      else if (mainIconName === 'thunderstorm-outline') mainIconColor = '#FF9800';
      else if (mainIconName === 'snow-outline') mainIconColor = '#90caf9';
    }
  }

  // Add at the top of DogWalkSafetyScreen (with other useState):
  const [lastForecastDate, setLastForecastDate] = useState<string | null>(null);

  // ... existing code ...
  // After the useEffect that fetches the forecast, add:
  useEffect(() => {
    if (!forecast) return;
    const currentDate = new Date().toISOString().split('T')[0];
    if (!lastForecastDate) setLastForecastDate(currentDate);
    const interval = setInterval(() => {
      const nowDate = new Date().toISOString().split('T')[0];
      if (lastForecastDate && nowDate !== lastForecastDate) {
        // Clear forecast cache and refetch
        const loc = city || 'New York';
        const cacheKey = `forecast_${loc}`;
        AsyncStorage.removeItem(cacheKey).then(() => {
          setLastForecastDate(nowDate);
          setForecast(null); // This will trigger the forecast fetch useEffect
        });
      }
    }, 10 * 60 * 1000); // every 10 minutes
    return () => clearInterval(interval);
  }, [forecast, lastForecastDate, city]);
  // ... existing code ...

  // 1. Add a handler for forecast refresh at the top-level of DogWalkSafetyScreen:
  const handleForecastRefresh = async () => {
    if (!city && !forecast) return;
    setForecastLoading(true);
    setForecastError('');
    const loc = city || 'New York';
    const cacheKey = `forecast_${loc}`;
    await AsyncStorage.removeItem(cacheKey);
    setForecast(null); // This will trigger the forecast fetch useEffect
    setRefreshForecast((c) => c + 1); // force effect to re-run
  };

  // 1. Add lastCardColor state at the top of DogWalkSafetyScreen:
  const [lastCardColor, setLastCardColor] = useState('#19C37D');

  // 2. After cardColor is computed, update lastCardColor when not loading and tempForLogic is valid:
  useEffect(() => {
    if (!loading && tempForLogic !== null && tempForLogic !== undefined) {
      setLastCardColor(getTemperatureColor(tempForLogic));
    }
  }, [loading, tempForLogic]);

  // Only show the full-screen loading overlay on the temp detail (home) page
  if (loading && page === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: '#2D2D2D', alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size={64} color="#fff" />
      </View>
    );
  }

  return (
    <>
      <View style={{ flex: 1, backgroundColor: '#fff' }}>
        <>
          {/* Refresh button for temp detail (home) page (mobile & web) */}
          {page === 0 && Platform.OS !== 'web' && (
            <View style={{ position: 'absolute', top: insets.top + 12, right: 60, zIndex: 2001, flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={onRefresh}
                accessibilityLabel="Refresh current weather"
                accessibilityRole="button"
                style={{ marginRight: 8 }}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator size={28} color={petAccentColor} />
                ) : (
                  <Ionicons name="refresh" size={32} color={petAccentColor} />
                )}
              </TouchableOpacity>
            </View>
          )}
          {/* Refresh button for forecast page (mobile & web) */}
          {page === 2 && Platform.OS !== 'web' && (
            <View style={{ position: 'absolute', top: insets.top + 12, right: 60, zIndex: 2001, flexDirection: 'row' }}>
              <TouchableOpacity
                onPress={handleForecastRefresh}
                accessibilityLabel="Refresh forecast"
                accessibilityRole="button"
                style={{ marginRight: 8 }}
                disabled={forecastLoading}
              >
                {forecastLoading ? (
                  <ActivityIndicator size={28} color={petAccentColor} />
                ) : (
                  <Ionicons name="refresh" size={32} color={petAccentColor} />
                )}
              </TouchableOpacity>
            </View>
          )}
          {activeTab === 'home' && (
            <ScrollView
              style={{ flex: 1, backgroundColor: theme.background }}
              contentContainerStyle={{ flexGrow: 1 }}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} accessibilityLabel="Pull to refresh" />}
              accessible accessibilityLabel="Home screen"
            >
              {isMobile ? (
                <SafeAreaViewRN style={{ flex: 1, backgroundColor: cardColor }} edges={['top','bottom']}>
                  {/* Info button absolutely positioned below the notch, using safe area inset */}
                  <View style={{ position: 'absolute', top: insets.top + 12, right: 20, zIndex: 10 }}>
                    <TouchableOpacity onPress={() => setHelpVisible(true)} accessibilityLabel="About Us" accessibilityRole="button">
                      <Ionicons name="information-circle-outline" size={32} color={petAccentColor} />
                    </TouchableOpacity>
                  </View>
                  {/* Main content area */}
                  <View style={{ flex: 1, justifyContent: 'flex-start', paddingTop: 0 }}>
                    {page === 0 ? (
                      // Temp detail page
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, width: '100%' }}>
                        <WebCardContainer style={{ backgroundColor: cardColor }}>
                          {/* Absolutely positioned button row for web */}
                          {Platform.OS === 'web' && (
                            <View style={{ position: 'absolute', top: 18, right: 18, zIndex: 10, flexDirection: 'row' }}>
                              <TouchableOpacity
                                onPress={onRefresh}
                                accessibilityLabel="Refresh current weather"
                                accessibilityRole="button"
                                style={{ marginRight: 8 }}
                                disabled={loading}
                              >
                                {loading ? (
                                  <ActivityIndicator size={28} color={petAccentColor} />
                                ) : (
                                  <Ionicons name="refresh" size={32} color={petAccentColor} />
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setHelpVisible(true)} accessibilityLabel="About Us" accessibilityRole="button">
                                <Ionicons name="information-circle-outline" size={32} color={petAccentColor} />
                              </TouchableOpacity>
                            </View>
                          )}
                          {/* --- main card content starts here --- */}
                          <Animated.View style={{ transform: [{ scale: dogScale }, { rotate: dogWiggleRotate }] }}>
                            <TouchableOpacity onPress={handleDogIconPress} accessibilityLabel="Dog icon. Tap 7 times to show debug menu." style={{ alignSelf: 'center', marginTop: 40, marginBottom: 8 }}>
                              <FontAwesome5 name="dog" size={110} color={petAccentColor} />
                            </TouchableOpacity>
                          </Animated.View>
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 46, textAlign: 'center', marginBottom: 10, marginTop: 0 }}>Should You Walk Fido?</Text>
                          <Animated.View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'center',
                            justifyContent: 'center',
                            marginTop: 18,
                            marginBottom: 18,
                            transform: [{ scale: statusPulseScale }],
                            shadowColor: risk.level === 1 ? '#19C37D' : risk.level === 5 ? '#FF3B30' : 'transparent',
                            shadowOpacity: statusPulseShadow,
                            shadowRadius: 18,
                            elevation: statusPulseShadow,
                          }}>
                            <Animated.View style={{ transform: [{ rotate: statusWiggleRotate }], marginRight: 10 }}>
                              <Ionicons name={cardIcon as any} size={34} color={accentPastel} accessibilityLabel={cardMessage} />
                            </Animated.View>
                            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>
                              {risk.message}
                            </Text>
                          </Animated.View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                            <Ionicons name="thermometer-outline" size={34} color={accentPastel} style={{ marginRight: 10 }} />
                            <Text style={{ color: '#fff', fontSize: 150, fontWeight: 'bold', textAlign: 'center' }}>{displayTemp !== null ? displayTemp : '--'}</Text>
                            <TouchableOpacity
                              onPress={() => setUnit(unit === 'F' ? 'C' : 'F')}
                              accessibilityLabel={`Switch to ${unit === 'F' ? 'Celsius' : 'Fahrenheit'}`}
                              accessibilityRole="button"
                              style={{ marginLeft: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'center', justifyContent: 'center' }}
                            >
                              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', textAlignVertical: 'center' }}>{tempUnit}</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={{ color: '#fff', fontSize: 20, opacity: 0.9, marginTop: 0, marginBottom: 8, textAlign: 'center' }}>
                            Feels like {displayFeels !== null ? displayFeels : '--'}{tempUnit}
                          </Text>
                          {city && (
                            <Animated.View style={{
                              transform: [{ scale: locationPillScale }],
                              alignSelf: 'center',
                            }}>
                              <TouchableOpacity
                                onPress={() => setLocationModalVisible(true)}
                                accessibilityLabel="Change location"
                                accessibilityRole="button"
                                activeOpacity={1}
                                onPressIn={() => setLocationPillPressed(true)}
                                onPressOut={() => setLocationPillPressed(false)}
                                style={{ marginTop: 0, marginBottom: 14 }}
                              >
                                <View style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: locationPillPressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
                                  borderRadius: 16,
                                  paddingHorizontal: 14,
                                  paddingVertical: 6,
                                  shadowColor: '#000',
                                  shadowOpacity: locationPillPressed ? 0.18 : 0.10,
                                  shadowRadius: locationPillPressed ? 8 : 6,
                                  elevation: locationPillPressed ? 6 : 4,
                                }}>
                                  <Ionicons name="location-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{city}</Text>
                                </View>
                              </TouchableOpacity>
                            </Animated.View>
                          )}
                          
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'center',
                            maxWidth: '90%',
                            backgroundColor: 'rgba(0,0,0,0.13)',
                            borderRadius: 16,
                            paddingVertical: 6,
                            paddingLeft: 20,
                            paddingRight: 20,
                            marginTop: 32,
                            marginBottom: 12,
                            shadowColor: '#000',
                            shadowOpacity: 0.10,
                            shadowRadius: 6,
                            elevation: 4,
                          }}>
                            {showIceCream ? (
                              <Ionicons name="ice-cream-outline" size={34} color="#64b5f6" style={{ marginRight: 6 }} />
                            ) : (
                              <Ionicons name="flame-outline" size={34} color="#ff9800" style={{ marginRight: 6 }} />
                            )}
                            <Text
                              style={{
                                color: '#fff',
                                fontWeight: '600',
                                fontSize: 16,
                              }}
                            >
                              Pavement Temp: {unit === 'C' ? pavementTempToCelsius(pavementInfo.pavement) : pavementInfo.pavement}
                            </Text>
                          </View>
                          <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
                            {lastUpdated && (
                              <Text style={{ color: '#fff', fontSize: 14, opacity: 0.7, textAlign: 'center', marginTop: 8, marginBottom: 36 }}>Last updated: {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                            )}
                          </View>
                        </WebCardContainer>
                      </View>
                    ) : page === 1 ? (
                      // Pet detail page
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, width: '100%' }}>
                        <WebCardContainer style={{ backgroundColor: cardColor }}>
                          <TouchableOpacity
                            onPress={() => setIsEditingPet(!isEditingPet)}
                            accessibilityLabel={isEditingPet ? 'Close pet edit' : 'Edit pet details'}
                            accessibilityRole="button"
                            style={{ alignItems: 'center', marginBottom: 18, marginTop: 8 }}
                          >
                            <Animated.View style={{
                              transform: [{ rotate: shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] }) }],
                            }}>
                              <Ionicons name="paw" size={100} color={petAccentColor} style={isEditingPet ? { transform: [{ scaleX: -1 }] } : {}} />
                            </Animated.View>
                          </TouchableOpacity>
                          {!isEditingPet ? (
                            // Summary view
                            <>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pillBgColor, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 22, marginBottom: 28, opacity: isShadeDisabled ? 0.5 : 1 }}>
                                <Ionicons name="partly-sunny-outline" size={28} color={petAccentColor} style={{ marginRight: 10 }} />
                                <Text style={{ color: petAccentColor, fontSize: 20, marginRight: 10 }}>Shade available</Text>
                                <CustomToggle
                                  value={shade}
                                  onValueChange={(val) => {
                                    if (!isShadeDisabled) {
                                      setShade(val);
                                      setUserHasToggledShade(true);
                                    }
                                  }}
                                  disabled={isShadeDisabled}
                                  accessibilityLabel="Toggle shade availability"
                                  isDarkBg={isDarkBg}
                                />
                              </View>
                              <Text style={{ color: petTextColor, fontWeight: 'bold', fontSize: 28, marginBottom: 12 }}>Pet Details</Text>
                              <Text style={{ color: petTextColor, fontSize: 22, marginBottom: 8 }}>Size: {pet.size}</Text>
                              <Text style={{ color: petTextColor, fontSize: 18, opacity: 0.8, textAlign: 'center', marginBottom: 18 }}>
                                Traits: {[
                                  pet.obese ? 'Obese' : null,
                                  pet.brachy ? 'Brachycephalic' : null,
                                  pet.senior ? 'Senior' : null,
                                  pet.northern ? 'Northern Breed' : null,
                                  pet.acclimated ? 'Cold Acclimated' : null,
                                ].filter(Boolean).join(', ') || 'None'}
                              </Text>
                              <Text style={{ color: petTextColor, fontSize: 16, opacity: 0.6, marginTop: 18 }}>
                                Tap the paw to edit
                              </Text>
                            </>
                          ) : (
                            // Editing view
                            <>
                              <Text style={{ color: petTextColor, fontWeight: 'bold', fontSize: 28, marginBottom: 24 }}>Edit Pet Details</Text>
                              <View style={{ marginBottom: 20 }}>
                                <Text style={{ color: petTextColor, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>Size:</Text>
                                <TouchableOpacity
                                  onPress={() => setShowDropdown(true)}
                                  style={{
                                    backgroundColor: pillBgColor,
                                    borderRadius: 12,
                                    paddingHorizontal: 20,
                                    paddingVertical: 10,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 120,
                                  }}
                                >
                                  <Text style={{ color: petAccentColor, fontSize: 18, fontWeight: 'bold', marginRight: 8 }}>{pet.size}</Text>
                                  <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={petAccentColor} />
                                </TouchableOpacity>
                              </View>
                              <View style={{ width: '100%', maxWidth: 300 }}>
                                {[
                                  { key: 'obese', label: 'Obese', icon: 'barbell-outline' },
                                  { key: 'brachy', label: 'Brachycephalic', icon: 'ellipse-outline' },
                                  { key: 'senior', label: 'Senior', icon: 'hourglass-outline' },
                                  { key: 'northern', label: 'Northern Breed', icon: 'snow-outline' },
                                  { key: 'acclimated', label: 'Cold Acclimated', icon: 'sunny-outline' }
                                ].map(({ key, label, icon }) => (
                                  <View key={key} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    borderBottomWidth: 0.5,
                                    borderColor: '#ccc',
                                  }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                      <Ionicons name={icon as any} size={20} color={petAccentColor} style={{ marginRight: 10 }} />
                                      <Text style={{ color: petAccentColor, fontSize: 16 }}>{label}</Text>
                                    </View>
                                    <CustomToggle
                                      value={(() => {
                                        if (key === 'obese') return pet.obese;
                                        if (key === 'brachy') return pet.brachy;
                                        if (key === 'senior') return pet.senior;
                                        if (key === 'northern') return pet.northern;
                                        if (key === 'acclimated') return pet.acclimated;
                                        return false;
                                      })()}
                                      onValueChange={(val) => {
                                        if (key === 'obese') setPet({ ...pet, obese: val });
                                        if (key === 'brachy') setPet({ ...pet, brachy: val });
                                        if (key === 'senior') setPet({ ...pet, senior: val });
                                        if (key === 'northern') setPet({ ...pet, northern: val });
                                        if (key === 'acclimated') setPet({ ...pet, acclimated: val });
                                      }}
                                      accessibilityLabel={`Toggle ${label}`}
                                      isDarkBg={isDarkBg}
                                    />
                                  </View>
                                ))}
                              </View>
                              <Text style={{ color: petTextColor, fontSize: 16, opacity: 0.6, marginTop: 20, textAlign: 'center' }}>
                                Tap the paw to save
                              </Text>
                            </>
                          )}
                          <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
                            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowDropdown(false)}>
                              <View style={{ backgroundColor: lightenColor(cardColor, 0.18), borderRadius: 14, paddingVertical: 6, minWidth: 120, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)' }}>
                                {['Small', 'Medium', 'Large'].map((size) => (
                                  <TouchableOpacity
                                    key={size}
                                    onPress={() => {
                                      setPet({ ...pet, size: size as PetInfo['size'] });
                                      setShowDropdown(false);
                                    }}
                                    style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: pet.size === size ? lightenColor(cardColor, 0.28) : 'transparent', borderRadius: 10, width: 120, alignItems: 'center', marginBottom: 2 }}
                                  >
                                    <Text style={{ color: petTextColor, fontWeight: pet.size === size ? 'bold' : 'normal', fontSize: 16 }}>{size}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </Pressable>
                          </Modal>
                        </WebCardContainer>
                      </View>
                    ) : (
                      // Walk Forecast page
                      Platform.OS === 'web' ? (
                        <View style={{ flex: 1, backgroundColor: cardColor, paddingHorizontal: 16, opacity: forecastFadeAnim, paddingTop: (insets?.top ?? 0) + 40, paddingBottom: 0, margin: 0 }}>
                          <Text style={{ fontSize: 30, fontWeight: 'bold', color: petTextColor, textAlign: 'center', marginTop: 0, marginBottom: 8, letterSpacing: 0.2 }}>Best Time To Walk Today</Text>
                          {forecastLoading ? (
                            <ActivityIndicator size="large" color="#19C37D" style={{ marginTop: 40 }} />
                          ) : forecastError ? (
                            <Text style={{ color: '#b60424', fontSize: 18, textAlign: 'center', marginTop: 40 }}>{forecastError}</Text>
                          ) : forecast ? (
                            <>
                              <View style={{ width: '100%', alignItems: 'center', paddingTop: 36, paddingBottom: 32 }}>
                                <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                                  <Ionicons
                                    name={mainIconName as any}
                                    size={115}
                                    color={mainIconColor}
                                    style={{ marginBottom: 0 }}
                                  />
                                </View>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 38, textAlign: 'center', marginBottom: 8 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '--';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '--';
                                    if (!best || !best.window || !Array.isArray(best.window) || best.window.length < 2 || !best.window[0]?.time || !best.window[1]?.time) return '--';
                                    const start = new Date(best.window[0].time);
                                    const end = new Date(best.window[1].time);
                                    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 4, fontWeight: '600' }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const scenario = getWalkScenario(best.reason);
                                    return scenario.message;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.85 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const temp = unit === 'C' ? Math.round(best.window[0].temp_c) : Math.round(best.window[0].temp_f);
                                    return `Expected: ${temp}°${unit}`;
                                  })()}
                                </Text>
                              </View>
                              <View style={{ marginTop: 36, paddingHorizontal: 0, width: '100%' }}>
                                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 18, letterSpacing: 0.2 }}>3-Day Forecast</Text>
                                {(() => {
                                  const localDate = forecast?.location?.localtime?.split(' ')[0];
                                  const allForecastDays = forecast?.forecast?.forecastday || [];
                                  console.log('Forecast days:', allForecastDays.map((d: any) => d.date));
                                  return allForecastDays.map((day: any, idx: number) => {
                                    const hours = Array.isArray(day.hour) ? day.hour : [];
                                    const high = unit === 'C' ? Math.round(day.day.maxtemp_c) : Math.round(day.day.maxtemp_f);
                                    const low = unit === 'C' ? Math.round(day.day.mintemp_c) : Math.round(day.day.mintemp_f);
                                    let iconName: any = 'sunny-outline';
                                    let iconColor = '#FFD600'; // default sun yellow
                                    if (day.day.condition.text.toLowerCase().includes('rain')) { iconName = 'rainy-outline'; iconColor = '#64b5f6'; }
                                    else if (day.day.condition.text.toLowerCase().includes('cloud')) { iconName = 'cloud-outline'; iconColor = '#B0BEC5'; }
                                    else if (day.day.condition.text.toLowerCase().includes('storm')) { iconName = 'thunderstorm-outline'; iconColor = '#FF9800'; }
                                    else if (day.day.condition.text.toLowerCase().includes('snow')) { iconName = 'snow-outline'; iconColor = '#90caf9'; }
                                    const best = getBestWalkTime(hours, high, unit);
                                    let walkTime = 'No suitable walk time';
                                    if (best && best.window && best.window[0]) {
                                      const start = new Date(best.window[0].time);
                                      walkTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                    }
                                    return (
                                      <View
                                        key={day.date || idx}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          paddingVertical: 14,
                                          borderBottomWidth: idx < allForecastDays.length - 1 ? 1 : 0,
                                          borderColor: 'rgba(255,255,255,0.18)',
                                        }}
                                      >
                                        {/* Date */}
                                        <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center' }}>
                                          <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'left' }} numberOfLines={1} ellipsizeMode="tail">{formatDay(day.date)}</Text>
                                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name={iconName as any} size={24} color={iconColor} />
                                          </View>
                                        </View>
                                        {/* Time */}
                                        <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' }} numberOfLines={1} ellipsizeMode="tail">{walkTime}</Text>
                                        {/* Temps */}
                                        <Text style={{ flex: 1.5, color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">{high}°{unit} / {low}°{unit}</Text>
                                      </View>
                                    );
                                  });
                                })()}
                              </View>
                            </>
                          ) : null}
                        </View>
                      ) : (
                        <Animated.View style={{ flex: 1, backgroundColor: cardColor, paddingHorizontal: 16, opacity: forecastFadeAnim, paddingTop: insets.top + 40 }}>
                          <Text style={{ fontSize: 30, fontWeight: 'bold', color: petTextColor, textAlign: 'center', marginTop: 0, marginBottom: 8, letterSpacing: 0.2 }}>Best Time To Walk Today</Text>
                          {forecastLoading ? (
                            <ActivityIndicator size="large" color="#19C37D" style={{ marginTop: 40 }} />
                          ) : forecastError ? (
                            <Text style={{ color: '#b60424', fontSize: 18, textAlign: 'center', marginTop: 40 }}>{forecastError}</Text>
                          ) : forecast ? (
                            <>
                              <View style={{ width: '100%', alignItems: 'center', paddingTop: 36, paddingBottom: 32 }}>
                                <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                                  <Ionicons
                                    name={mainIconName as any}
                                    size={115}
                                    color={mainIconColor}
                                    style={{ marginBottom: 0 }}
                                  />
                                </View>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 38, textAlign: 'center', marginBottom: 8 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '--';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '--';
                                    if (!best || !best.window || !Array.isArray(best.window) || best.window.length < 2 || !best.window[0]?.time || !best.window[1]?.time) return '--';
                                    const start = new Date(best.window[0].time);
                                    const end = new Date(best.window[1].time);
                                    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 4, fontWeight: '600' }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const scenario = getWalkScenario(best.reason);
                                    return scenario.message;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.85 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const temp = unit === 'C' ? Math.round(best.window[0].temp_c) : Math.round(best.window[0].temp_f);
                                    return `Expected: ${temp}°${unit}`;
                                  })()}
                                </Text>
                              </View>
                              <View style={{ marginTop: 36, paddingHorizontal: 16 }}>
                                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 18, letterSpacing: 0.2 }}>3-Day Forecast</Text>
                                {(() => {
                                  const localDate = forecast?.location?.localtime?.split(' ')[0];
                                  const allForecastDays = forecast?.forecast?.forecastday || [];
                                  console.log('Forecast days:', allForecastDays.map((d: any) => d.date));
                                  return allForecastDays.map((day: any, idx: number) => {
                                    const hours = Array.isArray(day.hour) ? day.hour : [];
                                    const high = unit === 'C' ? Math.round(day.day.maxtemp_c) : Math.round(day.day.maxtemp_f);
                                    const low = unit === 'C' ? Math.round(day.day.mintemp_c) : Math.round(day.day.mintemp_f);
                                    let iconName: any = 'sunny-outline';
                                    let iconColor = '#FFD600'; // default sun yellow
                                    if (day.day.condition.text.toLowerCase().includes('rain')) { iconName = 'rainy-outline'; iconColor = '#64b5f6'; }
                                    else if (day.day.condition.text.toLowerCase().includes('cloud')) { iconName = 'cloud-outline'; iconColor = '#B0BEC5'; }
                                    else if (day.day.condition.text.toLowerCase().includes('storm')) { iconName = 'thunderstorm-outline'; iconColor = '#FF9800'; }
                                    else if (day.day.condition.text.toLowerCase().includes('snow')) { iconName = 'snow-outline'; iconColor = '#90caf9'; }
                                    const best = getBestWalkTime(hours, high, unit);
                                    let walkTime = 'No suitable walk time';
                                    if (best && best.window && best.window[0]) {
                                      const start = new Date(best.window[0].time);
                                      walkTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                    }
                                    return (
                                      <View
                                        key={day.date || idx}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          paddingVertical: 14,
                                          borderBottomWidth: idx < allForecastDays.length - 1 ? 1 : 0,
                                          borderColor: 'rgba(255,255,255,0.18)',
                                        }}
                                      >
                                        {/* Date */}
                                        <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center' }}>
                                          <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'left' }} numberOfLines={1} ellipsizeMode="tail">{formatDay(day.date)}</Text>
                                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name={iconName as any} size={24} color={iconColor} />
                                          </View>
                                        </View>
                                        {/* Time */}
                                        <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' }} numberOfLines={1} ellipsizeMode="tail">{walkTime}</Text>
                                        {/* Temps */}
                                        <Text style={{ flex: 1.5, color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">{high}°{unit} / {low}°{unit}</Text>
                                      </View>
                                    );
                                  });
                                })()}
                              </View>
                            </>
                          ) : null}
                        </Animated.View>
                      )
                    )}
                  </View>
                  {/* Global bottom nav bar */}
                  {/* ... removed nav bar for mobile ... */}
                </SafeAreaViewRN>
              ) : (
                // Web layout
                
                  <View style={{ flex: 1, width: '100%', justifyContent: 'center', alignItems: 'center' }}>
                    {page === 0 ? (
                      // Temp detail page
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, width: '100%' }}>
                        <WebCardContainer style={{ backgroundColor: cardColor }}>
                          {/* Absolutely positioned button row for web */}
                          {Platform.OS === 'web' && (
                            <View style={{ position: 'absolute', top: 18, right: 18, zIndex: 10, flexDirection: 'row' }}>
                              <TouchableOpacity
                                onPress={onRefresh}
                                accessibilityLabel="Refresh current weather"
                                accessibilityRole="button"
                                style={{ marginRight: 8 }}
                                disabled={loading}
                              >
                                {loading ? (
                                  <ActivityIndicator size={28} color={petAccentColor} />
                                ) : (
                                  <Ionicons name="refresh" size={32} color={petAccentColor} />
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setHelpVisible(true)} accessibilityLabel="About Us" accessibilityRole="button">
                                <Ionicons name="information-circle-outline" size={32} color={petAccentColor} />
                              </TouchableOpacity>
                            </View>
                          )}
                          {/* --- main card content starts here --- */}
                          <Animated.View style={{ transform: [{ scale: dogScale }, { rotate: dogWiggleRotate }] }}>
                            <TouchableOpacity onPress={handleDogIconPress} accessibilityLabel="Dog icon. Tap 7 times to show debug menu." style={{ alignSelf: 'center', marginTop: 40, marginBottom: 8 }}>
                              <FontAwesome5 name="dog" size={110} color={petAccentColor} />
                            </TouchableOpacity>
                          </Animated.View>
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 46, textAlign: 'center', marginBottom: 10, marginTop: 0 }}>Should You Walk Fido?</Text>
                          <Animated.View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'center',
                            justifyContent: 'center',
                            marginTop: 18,
                            marginBottom: 18,
                            transform: [{ scale: statusPulseScale }],
                            shadowColor: risk.level === 1 ? '#19C37D' : risk.level === 5 ? '#FF3B30' : 'transparent',
                            shadowOpacity: statusPulseShadow,
                            shadowRadius: 18,
                            elevation: statusPulseShadow,
                          }}>
                            <Animated.View style={{ transform: [{ rotate: statusWiggleRotate }], marginRight: 10 }}>
                              <Ionicons name={cardIcon as any} size={34} color={accentPastel} accessibilityLabel={cardMessage} />
                            </Animated.View>
                            <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600', textAlign: 'center', flexShrink: 1 }}>
                              {risk.message}
                            </Text>
                          </Animated.View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                            <Ionicons name="thermometer-outline" size={34} color={accentPastel} style={{ marginRight: 10 }} />
                            <Text style={{ color: '#fff', fontSize: 150, fontWeight: 'bold', textAlign: 'center' }}>{displayTemp !== null ? displayTemp : '--'}</Text>
                            <TouchableOpacity
                              onPress={() => setUnit(unit === 'F' ? 'C' : 'F')}
                              accessibilityLabel={`Switch to ${unit === 'F' ? 'Celsius' : 'Fahrenheit'}`}
                              accessibilityRole="button"
                              style={{ marginLeft: 10, backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, alignSelf: 'center', justifyContent: 'center' }}
                            >
                              <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', textAlignVertical: 'center' }}>{tempUnit}</Text>
                            </TouchableOpacity>
                          </View>
                          <Text style={{ color: '#fff', fontSize: 20, opacity: 0.9, marginTop: 0, marginBottom: 8, textAlign: 'center' }}>
                            Feels like {displayFeels !== null ? displayFeels : '--'}{tempUnit}
                          </Text>
                          {city && (
                            <Animated.View style={{
                              transform: [{ scale: locationPillScale }],
                              alignSelf: 'center',
                            }}>
                              <TouchableOpacity
                                onPress={() => setLocationModalVisible(true)}
                                accessibilityLabel="Change location"
                                accessibilityRole="button"
                                activeOpacity={1}
                                onPressIn={() => setLocationPillPressed(true)}
                                onPressOut={() => setLocationPillPressed(false)}
                                style={{ marginTop: 0, marginBottom: 14 }}
                              >
                                <View style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  backgroundColor: locationPillPressed ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
                                  borderRadius: 16,
                                  paddingHorizontal: 14,
                                  paddingVertical: 6,
                                  shadowColor: '#000',
                                  shadowOpacity: locationPillPressed ? 0.18 : 0.10,
                                  shadowRadius: locationPillPressed ? 8 : 6,
                                  elevation: locationPillPressed ? 6 : 4,
                                }}>
                                  <Ionicons name="location-outline" size={18} color="#fff" style={{ marginRight: 6 }} />
                                  <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }}>{city}</Text>
                                </View>
                              </TouchableOpacity>
                            </Animated.View>
                          )}
                          
                          <View style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            alignSelf: 'center',
                            maxWidth: '90%',
                            backgroundColor: 'rgba(0,0,0,0.13)',
                            borderRadius: 16,
                            paddingVertical: 6,
                            paddingLeft: 20,
                            paddingRight: 20,
                            marginTop: 32,
                            marginBottom: 12,
                            shadowColor: '#000',
                            shadowOpacity: 0.10,
                            shadowRadius: 6,
                            elevation: 4,
                          }}>
                            {showIceCream ? (
                              <Ionicons name="ice-cream-outline" size={34} color="#64b5f6" style={{ marginRight: 6 }} />
                            ) : (
                              <Ionicons name="flame-outline" size={34} color="#ff9800" style={{ marginRight: 6 }} />
                            )}
                            <Text
                              style={{
                                color: '#fff',
                                fontWeight: '600',
                                fontSize: 16,
                              }}
                            >
                              Pavement Temp: {unit === 'C' ? pavementTempToCelsius(pavementInfo.pavement) : pavementInfo.pavement}
                            </Text>
                          </View>
                          <View style={{ flex: 1, width: '100%', justifyContent: 'flex-end' }}>
                            {lastUpdated && (
                              <Text style={{ color: '#fff', fontSize: 14, opacity: 0.7, textAlign: 'center', marginTop: 8, marginBottom: 36 }}>Last updated: {lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                            )}
                          </View>
                          {/* --- main card content ends here --- */}
                          {Platform.OS === 'web' && (
                            <View style={{ position: 'absolute', top: 18, right: 18, zIndex: 10 }}>
                              <TouchableOpacity onPress={() => setHelpVisible(true)} accessibilityLabel="About Us" accessibilityRole="button">
                                <Ionicons name="information-circle-outline" size={32} color={petAccentColor} />
                              </TouchableOpacity>
                            </View>
                          )}
                        </WebCardContainer>
                      </View>
                    ) : page === 1 ? (
                      // Pet detail page
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, width: '100%' }}>
                        <WebCardContainer style={{ backgroundColor: cardColor }}>
                          <TouchableOpacity
                            onPress={() => setIsEditingPet(!isEditingPet)}
                            accessibilityLabel={isEditingPet ? 'Close pet edit' : 'Edit pet details'}
                            accessibilityRole="button"
                            style={{ alignItems: 'center', marginBottom: 18, marginTop: 8 }}
                          >
                            <Animated.View style={{
                              transform: [{ rotate: shakeAnim.interpolate({ inputRange: [-1, 1], outputRange: ['-15deg', '15deg'] }) }],
                            }}>
                              <Ionicons name="paw" size={100} color={petAccentColor} style={isEditingPet ? { transform: [{ scaleX: -1 }] } : {}} />
                            </Animated.View>
                          </TouchableOpacity>
                          {!isEditingPet ? (
                            // Summary view
                            <>
                              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: pillBgColor, borderRadius: 22, paddingVertical: 10, paddingHorizontal: 22, marginBottom: 28, opacity: isShadeDisabled ? 0.5 : 1 }}>
                                <Ionicons name="partly-sunny-outline" size={28} color={petAccentColor} style={{ marginRight: 10 }} />
                                <Text style={{ color: petAccentColor, fontSize: 20, marginRight: 10 }}>Shade available</Text>
                                <CustomToggle
                                  value={shade}
                                  onValueChange={(val) => {
                                    if (!isShadeDisabled) {
                                      setShade(val);
                                      setUserHasToggledShade(true);
                                    }
                                  }}
                                  disabled={isShadeDisabled}
                                  accessibilityLabel="Toggle shade availability"
                                  isDarkBg={isDarkBg}
                                />
                              </View>
                              <Text style={{ color: petTextColor, fontWeight: 'bold', fontSize: 28, marginBottom: 12 }}>Pet Details</Text>
                              <Text style={{ color: petTextColor, fontSize: 22, marginBottom: 8 }}>Size: {pet.size}</Text>
                              <Text style={{ color: petTextColor, fontSize: 18, opacity: 0.8, textAlign: 'center', marginBottom: 18 }}>
                                Traits: {[
                                  pet.obese ? 'Obese' : null,
                                  pet.brachy ? 'Brachycephalic' : null,
                                  pet.senior ? 'Senior' : null,
                                  pet.northern ? 'Northern Breed' : null,
                                  pet.acclimated ? 'Cold Acclimated' : null,
                                ].filter(Boolean).join(', ') || 'None'}
                              </Text>
                              <Text style={{ color: petTextColor, fontSize: 16, opacity: 0.6, marginTop: 18 }}>
                                Tap the paw to edit
                              </Text>
                            </>
                          ) : (
                            // Editing view
                            <>
                              <Text style={{ color: petTextColor, fontWeight: 'bold', fontSize: 28, marginBottom: 24 }}>Edit Pet Details</Text>
                              <View style={{ marginBottom: 20 }}>
                                <Text style={{ color: petTextColor, fontSize: 18, marginBottom: 8, textAlign: 'center' }}>Size:</Text>
                                <TouchableOpacity
                                  onPress={() => setShowDropdown(true)}
                                  style={{
                                    backgroundColor: pillBgColor,
                                    borderRadius: 12,
                                    paddingHorizontal: 20,
                                    paddingVertical: 10,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    minWidth: 120,
                                  }}
                                >
                                  <Text style={{ color: petAccentColor, fontSize: 18, fontWeight: 'bold', marginRight: 8 }}>{pet.size}</Text>
                                  <Ionicons name={showDropdown ? 'chevron-up' : 'chevron-down'} size={20} color={petAccentColor} />
                                </TouchableOpacity>
                              </View>
                              <View style={{ width: '100%', maxWidth: 300 }}>
                                {[
                                  { key: 'obese', label: 'Obese', icon: 'barbell-outline' },
                                  { key: 'brachy', label: 'Brachycephalic', icon: 'ellipse-outline' },
                                  { key: 'senior', label: 'Senior', icon: 'hourglass-outline' },
                                  { key: 'northern', label: 'Northern Breed', icon: 'snow-outline' },
                                  { key: 'acclimated', label: 'Cold Acclimated', icon: 'sunny-outline' }
                                ].map(({ key, label, icon }) => (
                                  <View key={key} style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    borderBottomWidth: 0.5,
                                    borderColor: '#ccc',
                                  }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                      <Ionicons name={icon as any} size={20} color={petAccentColor} style={{ marginRight: 10 }} />
                                      <Text style={{ color: petAccentColor, fontSize: 16 }}>{label}</Text>
                                    </View>
                                    <CustomToggle
                                      value={(() => {
                                        if (key === 'obese') return pet.obese;
                                        if (key === 'brachy') return pet.brachy;
                                        if (key === 'senior') return pet.senior;
                                        if (key === 'northern') return pet.northern;
                                        if (key === 'acclimated') return pet.acclimated;
                                        return false;
                                      })()}
                                      onValueChange={(val) => {
                                        if (key === 'obese') setPet({ ...pet, obese: val });
                                        if (key === 'brachy') setPet({ ...pet, brachy: val });
                                        if (key === 'senior') setPet({ ...pet, senior: val });
                                        if (key === 'northern') setPet({ ...pet, northern: val });
                                        if (key === 'acclimated') setPet({ ...pet, acclimated: val });
                                      }}
                                      accessibilityLabel={`Toggle ${label}`}
                                      isDarkBg={isDarkBg}
                                    />
                                  </View>
                                ))}
                              </View>
                              <Text style={{ color: petTextColor, fontSize: 16, opacity: 0.6, marginTop: 20, textAlign: 'center' }}>
                                Tap the paw to save
                              </Text>
                            </>
                          )}
                          <Modal visible={showDropdown} transparent animationType="fade" onRequestClose={() => setShowDropdown(false)}>
                            <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }} onPress={() => setShowDropdown(false)}>
                              <View style={{ backgroundColor: lightenColor(cardColor, 0.18), borderRadius: 14, paddingVertical: 6, minWidth: 120, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4, borderWidth: 1, borderColor: 'rgba(0,0,0,0.10)' }}>
                                {['Small', 'Medium', 'Large'].map((size) => (
                                  <TouchableOpacity
                                    key={size}
                                    onPress={() => {
                                      setPet({ ...pet, size: size as PetInfo['size'] });
                                      setShowDropdown(false);
                                    }}
                                    style={{ paddingVertical: 12, paddingHorizontal: 20, backgroundColor: pet.size === size ? lightenColor(cardColor, 0.28) : 'transparent', borderRadius: 10, width: 120, alignItems: 'center', marginBottom: 2 }}
                                  >
                                    <Text style={{ color: petTextColor, fontWeight: pet.size === size ? 'bold' : 'normal', fontSize: 16 }}>{size}</Text>
                                  </TouchableOpacity>
                                ))}
                              </View>
                            </Pressable>
                          </Modal>
                        </WebCardContainer>
                      </View>
                    ) : (
                      // Walk Forecast page
                      Platform.OS === 'web' ? (
                        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40, width: '100%' }}>
                          <WebCardContainer style={{ backgroundColor: cardColor }}>
                            {/* Absolutely positioned button row for web (forecast page) */}
                            <View style={{ position: 'absolute', top: 18, right: 18, zIndex: 10, flexDirection: 'row' }}>
                              <TouchableOpacity
                                onPress={handleForecastRefresh}
                                accessibilityLabel="Refresh forecast"
                                accessibilityRole="button"
                                style={{ marginRight: 8 }}
                                disabled={forecastLoading}
                              >
                                {forecastLoading ? (
                                  <ActivityIndicator size={28} color={petAccentColor} />
                                ) : (
                                  <Ionicons name="refresh" size={32} color={petAccentColor} />
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setHelpVisible(true)} accessibilityLabel="About Us" accessibilityRole="button">
                                <Ionicons name="information-circle-outline" size={32} color={petAccentColor} />
                              </TouchableOpacity>
                            </View>
                            {/* --- main card content starts here --- */}
                            <Text style={{ fontSize: 24, fontWeight: 'bold', color: petTextColor, textAlign: 'center', marginTop: 24, marginBottom: 18 }}>Best Time To Walk Today</Text>
                            {forecastLoading ? (
                              <ActivityIndicator size="large" color="#19C37D" style={{ marginTop: 40 }} />
                            ) : forecastError ? (
                              <Text style={{ color: '#b60424', fontSize: 18, textAlign: 'center', marginTop: 40 }}>{forecastError}</Text>
                            ) : forecast ? (
                              <>
                                <View style={{ width: '100%', alignItems: 'center', paddingTop: 36, paddingBottom: 32 }}>
                                  <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                                    <Ionicons
                                      name={mainIconName as any}
                                      size={115}
                                      color={mainIconColor}
                                      style={{ marginBottom: 0 }}
                                    />
                                  </View>
                                  <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 38, textAlign: 'center', marginBottom: 8 }}>
                                    {(() => {
                                      const today = forecast?.forecast?.forecastday?.[0];
                                      if (!today) return '--';
                                      const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                      const best = getBestWalkTime(today.hour, high, unit);
                                      if (!best) return '--';
                                      if (!best || !best.window || !Array.isArray(best.window) || best.window.length < 2 || !best.window[0]?.time || !best.window[1]?.time) return '--';
                                      const start = new Date(best.window[0].time);
                                      const end = new Date(best.window[1].time);
                                      return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                    })()}
                                  </Text>
                                  <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 4, fontWeight: '600' }}>
                                    {(() => {
                                      const today = forecast?.forecast?.forecastday?.[0];
                                      if (!today) return '';
                                      const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                      const best = getBestWalkTime(today.hour, high, unit);
                                      if (!best) return '';
                                      const scenario = getWalkScenario(best.reason);
                                      return scenario.message;
                                    })()}
                                  </Text>
                                  <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.85 }}>
                                    {(() => {
                                      const today = forecast?.forecast?.forecastday?.[0];
                                      if (!today) return '';
                                      const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                      const best = getBestWalkTime(today.hour, high, unit);
                                      if (!best) return '';
                                      const temp = unit === 'C' ? Math.round(best.window[0].temp_c) : Math.round(best.window[0].temp_f);
                                      return `Expected: ${temp}°${unit}`;
                                    })()}
                                  </Text>
                                </View>
                                <View style={{ marginTop: 36, paddingHorizontal: 0, width: '100%' }}>
                                  <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 18, letterSpacing: 0.2 }}>3-Day Forecast</Text>
                                  {(() => {
                                    const localDate = forecast?.location?.localtime?.split(' ')[0];
                                    const allForecastDays = forecast?.forecast?.forecastday || [];
                                    console.log('Forecast days:', allForecastDays.map((d: any) => d.date));
                                    return allForecastDays.map((day: any, idx: number) => {
                                      const hours = Array.isArray(day.hour) ? day.hour : [];
                                      const high = unit === 'C' ? Math.round(day.day.maxtemp_c) : Math.round(day.day.maxtemp_f);
                                      const low = unit === 'C' ? Math.round(day.day.mintemp_c) : Math.round(day.day.mintemp_f);
                                      let iconName: any = 'sunny-outline';
                                      let iconColor = '#FFD600'; // default sun yellow
                                      if (day.day.condition.text.toLowerCase().includes('rain')) { iconName = 'rainy-outline'; iconColor = '#64b5f6'; }
                                      else if (day.day.condition.text.toLowerCase().includes('cloud')) { iconName = 'cloud-outline'; iconColor = '#B0BEC5'; }
                                      else if (day.day.condition.text.toLowerCase().includes('storm')) { iconName = 'thunderstorm-outline'; iconColor = '#FF9800'; }
                                      else if (day.day.condition.text.toLowerCase().includes('snow')) { iconName = 'snow-outline'; iconColor = '#90caf9'; }
                                      const best = getBestWalkTime(hours, high, unit);
                                      let walkTime = 'No suitable walk time';
                                      if (best && best.window && best.window[0]) {
                                        const start = new Date(best.window[0].time);
                                        walkTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                      }
                                      return (
                                        <View
                                          key={day.date || idx}
                                          style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            paddingVertical: 14,
                                            borderBottomWidth: idx < allForecastDays.length - 1 ? 1 : 0,
                                            borderColor: 'rgba(255,255,255,0.18)',
                                          }}
                                        >
                                          {/* Date */}
                                          <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center' }}>
                                            <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'left' }} numberOfLines={1} ellipsizeMode="tail">{formatDay(day.date)}</Text>
                                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                              <Ionicons name={iconName as any} size={24} color={iconColor} />
                                            </View>
                                          </View>
                                          {/* Time */}
                                          <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' }} numberOfLines={1} ellipsizeMode="tail">{walkTime}</Text>
                                          {/* Temps */}
                                          <Text style={{ flex: 1.5, color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">{high}°{unit} / {low}°{unit}</Text>
                                        </View>
                                      );
                                    });
                                  })()}
                                </View>
                              </>
                            ) : null}
                          </WebCardContainer>
                        </View>
                      ) : (
                        <Animated.View style={{ flex: 1, backgroundColor: cardColor, paddingHorizontal: 16, opacity: forecastFadeAnim, paddingTop: insets.top + 40 }}>
                          <Text style={{ fontSize: 30, fontWeight: 'bold', color: petTextColor, textAlign: 'center', marginTop: 0, marginBottom: 8, letterSpacing: 0.2 }}>Best Time To Walk Today</Text>
                          {forecastLoading ? (
                            <ActivityIndicator size="large" color="#19C37D" style={{ marginTop: 40 }} />
                          ) : forecastError ? (
                            <Text style={{ color: '#b60424', fontSize: 18, textAlign: 'center', marginTop: 40 }}>{forecastError}</Text>
                          ) : forecast ? (
                            <>
                              <View style={{ width: '100%', alignItems: 'center', paddingTop: 36, paddingBottom: 32 }}>
                                <View style={{ alignItems: 'center', justifyContent: 'center', marginBottom: 28 }}>
                                  <Ionicons
                                    name={mainIconName as any}
                                    size={115}
                                    color={mainIconColor}
                                    style={{ marginBottom: 0 }}
                                  />
                                </View>
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 38, textAlign: 'center', marginBottom: 8 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '--';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '--';
                                    if (!best || !best.window || !Array.isArray(best.window) || best.window.length < 2 || !best.window[0]?.time || !best.window[1]?.time) return '--';
                                    const start = new Date(best.window[0].time);
                                    const end = new Date(best.window[1].time);
                                    return `${start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} – ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 18, textAlign: 'center', marginBottom: 4, fontWeight: '600' }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const scenario = getWalkScenario(best.reason);
                                    return scenario.message;
                                  })()}
                                </Text>
                                <Text style={{ color: '#fff', fontSize: 16, textAlign: 'center', opacity: 0.85 }}>
                                  {(() => {
                                    const today = forecast?.forecast?.forecastday?.[0];
                                    if (!today) return '';
                                    const high = unit === 'C' ? Math.round(today.day.maxtemp_c) : Math.round(today.day.maxtemp_f);
                                    const best = getBestWalkTime(today.hour, high, unit);
                                    if (!best) return '';
                                    const temp = unit === 'C' ? Math.round(best.window[0].temp_c) : Math.round(best.window[0].temp_f);
                                    return `Expected: ${temp}°${unit}`;
                                  })()}
                                </Text>
                              </View>
                              <View style={{ marginTop: 36, paddingHorizontal: 16 }}>
                                <Text style={{ fontSize: 22, fontWeight: '900', color: '#fff', marginBottom: 18, letterSpacing: 0.2 }}>3-Day Forecast</Text>
                                {(() => {
                                  const localDate = forecast?.location?.localtime?.split(' ')[0];
                                  const allForecastDays = forecast?.forecast?.forecastday || [];
                                  console.log('Forecast days:', allForecastDays.map((d: any) => d.date));
                                  return allForecastDays.map((day: any, idx: number) => {
                                    const hours = Array.isArray(day.hour) ? day.hour : [];
                                    const high = unit === 'C' ? Math.round(day.day.maxtemp_c) : Math.round(day.day.maxtemp_f);
                                    const low = unit === 'C' ? Math.round(day.day.mintemp_c) : Math.round(day.day.mintemp_f);
                                    let iconName: any = 'sunny-outline';
                                    let iconColor = '#FFD600'; // default sun yellow
                                    if (day.day.condition.text.toLowerCase().includes('rain')) { iconName = 'rainy-outline'; iconColor = '#64b5f6'; }
                                    else if (day.day.condition.text.toLowerCase().includes('cloud')) { iconName = 'cloud-outline'; iconColor = '#B0BEC5'; }
                                    else if (day.day.condition.text.toLowerCase().includes('storm')) { iconName = 'thunderstorm-outline'; iconColor = '#FF9800'; }
                                    else if (day.day.condition.text.toLowerCase().includes('snow')) { iconName = 'snow-outline'; iconColor = '#90caf9'; }
                                    const best = getBestWalkTime(hours, high, unit);
                                    let walkTime = 'No suitable walk time';
                                    if (best && best.window && best.window[0]) {
                                      const start = new Date(best.window[0].time);
                                      walkTime = start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
                                    }
                                    return (
                                      <View
                                        key={day.date || idx}
                                        style={{
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          paddingVertical: 14,
                                          borderBottomWidth: idx < allForecastDays.length - 1 ? 1 : 0,
                                          borderColor: 'rgba(255,255,255,0.18)',
                                        }}
                                      >
                                        {/* Date */}
                                        <View style={{ flex: 2.2, flexDirection: 'row', alignItems: 'center' }}>
                                          <Text style={{ flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 15, textAlign: 'left' }} numberOfLines={1} ellipsizeMode="tail">{formatDay(day.date)}</Text>
                                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                                            <Ionicons name={iconName as any} size={24} color={iconColor} />
                                          </View>
                                        </View>
                                        {/* Time */}
                                        <Text style={{ flex: 1, color: '#fff', fontSize: 15, fontWeight: '600', textAlign: 'center' }} numberOfLines={1} ellipsizeMode="tail">{walkTime}</Text>
                                        {/* Temps */}
                                        <Text style={{ flex: 1.5, color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'right' }} numberOfLines={1} ellipsizeMode="tail">{high}°{unit} / {low}°{unit}</Text>
                                      </View>
                                    );
                                  });
                                })()}
                              </View>
                            </>
                          ) : null}
                        </Animated.View>
                      )
                    )}
                  </View>
              )}
              {/* After the status card, before the debug section, add the shade toggle */}
              {/* This block is now redundant as the toggle is moved to the pet detail card */}
              {/* <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16, marginBottom: 4 }}>
                <Text style={{ color: theme.text, fontSize: 16, marginRight: 8 }}>Shade available</Text>
                <Switch
                  value={shade}
                  onValueChange={(val) => { setShade(val); setUserHasToggledShade(true); }}
                  accessibilityLabel="Toggle shade availability"
                  accessibilityRole="switch"
                />
              </View> */}
              {/* After the status card, add a debug/admin section */}
              {showDebug && (
                Platform.OS !== 'web' ? (
                  // Floating overlay for mobile
                  <View style={{
                    position: 'absolute',
                    top: 80,
                    left: 0,
                    right: 0,
                    zIndex: 100,
                    backgroundColor: theme.card,
                    borderRadius: 8,
                    padding: 12,
                    margin: 16,
                    alignSelf: 'center',
                    maxWidth: 400,
                    width: '90%',
                    elevation: 8,
                    shadowColor: '#000',
                    shadowOpacity: 0.2,
                    shadowRadius: 8,
                  }}>
                    <TouchableOpacity
                      onPress={() => setShowDebug(false)}
                      style={{ position: 'absolute', top: 8, right: 8, zIndex: 101, padding: 8 }}
                      accessibilityLabel="Close debug panel"
                      accessibilityRole="button"
                    >
                      <Ionicons name="close" size={24} color={theme.text} />
                    </TouchableOpacity>
                    <Text style={{ color: theme.text, fontWeight: 'bold', marginBottom: 4, marginTop: 8 }}>Risk Calculation Debug</Text>
                    {/* Custom temp override controls */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Switch
                        value={useCustomTemp}
                        onValueChange={setUseCustomTemp}
                        accessibilityLabel="Enable custom temperature override"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: theme.text, fontSize: 15, marginRight: 8 }}>Custom Temp (°F):</Text>
                      <TextInput
                        value={customTemp}
                        onChangeText={setCustomTemp}
                        placeholder="e.g. 42"
                        keyboardType="numeric"
                        style={{ backgroundColor: '#fff', color: '#222', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 60, fontSize: 15, borderWidth: 1, borderColor: '#ccc' }}
                        editable={useCustomTemp}
                      />
                    </View>
                    {/* Custom time of day override controls */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Switch
                        value={useCustomTimeOfDay}
                        onValueChange={setUseCustomTimeOfDay}
                        accessibilityLabel="Enable custom time of day override"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: theme.text, fontSize: 15, marginRight: 8 }}>Custom Time of Day:</Text>
                      <TouchableOpacity
                        onPress={() => setCustomIsDay(true)}
                        disabled={!useCustomTimeOfDay}
                        style={{
                          backgroundColor: useCustomTimeOfDay && customIsDay ? '#19C37D' : '#eee',
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ color: useCustomTimeOfDay && customIsDay ? '#fff' : '#333', fontWeight: 'bold' }}>Day</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setCustomIsDay(false)}
                        disabled={!useCustomTimeOfDay}
                        style={{
                          backgroundColor: useCustomTimeOfDay && !customIsDay ? '#1565C0' : '#eee',
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: useCustomTimeOfDay && !customIsDay ? '#fff' : '#333', fontWeight: 'bold' }}>Night</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: theme.text }}>Feels like: {feelsLikeF}°F</Text>
                    <Text style={{ color: theme.text }}>Pet size: {pet.size}</Text>
                    <Text style={{ color: theme.text }}>Obese: {pet.obese ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Brachycephalic: {pet.brachy ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Senior: {pet.senior ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Northern breed: {pet.northern ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Acclimated: {pet.acclimated ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Shade: {shade ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Wet weather: {wetWeather ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Base risk (matrix): {(() => {
                      let idx = TEMP_STEPS_F.findIndex((t) => (tempForLogic) >= t);
                      if (idx === -1) idx = TEMP_STEPS_F.length - 1;
                      return RISK_MATRIX[pet.size][idx];
                    })()}</Text>
                    <Text style={{ color: theme.text }}>Final risk (after modifiers): {(() => {
                      let idx = TEMP_STEPS_F.findIndex((t) => (tempForLogic) >= t);
                      if (idx === -1) idx = TEMP_STEPS_F.length - 1;
                      let base = RISK_MATRIX[pet.size][idx];
                      let mod = 0;
                      if (pet.obese) mod += 1;
                      if (pet.brachy) mod += 1;
                      if (pet.senior) mod += 1;
                      if (shade) mod -= 1;
                      if (tempForLogic !== null && tempForLogic < 35) {
                        if (wetWeather) mod += 2;
                        if (pet.northern) mod -= 1;
                        if (pet.acclimated) mod -= 1;
                      } else if (tempForLogic !== null && tempForLogic > 70) {
                        if (wetWeather) mod -= 2;
                        if (pet.northern) mod += 1;
                        if (pet.acclimated) mod += 1;
                      }
                      let risk = Math.max(1, Math.min(5, base + mod));
                      return `${risk} (${RISK_LEVELS[risk-1].title})`;
                    })()}</Text>
                    {/* At the bottom of the debug section, add a quick reference legend */}
                    <Text style={{ color: theme.text, marginTop: 8, fontSize: 13, fontWeight: 'bold' }}>Risk Matrix Key:</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>1 = No evidence of risk</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>2 = Risk is unlikely</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>3 = Unsafe potential</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>4 = Dangerous weather</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>5 = Life-Threatening</Text>
                  </View>
                ) : (
                  // Web: keep in scrollview
                  <View style={{ marginTop: 16, alignSelf: 'center', backgroundColor: theme.card, borderRadius: 8, padding: 12, maxWidth: 400, width: '90%' }}>
                    <Text style={{ color: theme.text, fontWeight: 'bold', marginBottom: 4 }}>Risk Calculation Debug</Text>
                    {/* Custom temp override controls */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Switch
                        value={useCustomTemp}
                        onValueChange={setUseCustomTemp}
                        accessibilityLabel="Enable custom temperature override"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: theme.text, fontSize: 15, marginRight: 8 }}>Custom Temp (°F):</Text>
                      <TextInput
                        value={customTemp}
                        onChangeText={setCustomTemp}
                        placeholder="e.g. 42"
                        keyboardType="numeric"
                        style={{ backgroundColor: '#fff', color: '#222', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, width: 60, fontSize: 15, borderWidth: 1, borderColor: '#ccc' }}
                        editable={useCustomTemp}
                      />
                    </View>
                    {/* Custom time of day override controls */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Switch
                        value={useCustomTimeOfDay}
                        onValueChange={setUseCustomTimeOfDay}
                        accessibilityLabel="Enable custom time of day override"
                        style={{ marginRight: 8 }}
                      />
                      <Text style={{ color: theme.text, fontSize: 15, marginRight: 8 }}>Custom Time of Day:</Text>
                      <TouchableOpacity
                        onPress={() => setCustomIsDay(true)}
                        disabled={!useCustomTimeOfDay}
                        style={{
                          backgroundColor: useCustomTimeOfDay && customIsDay ? '#19C37D' : '#eee',
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                          marginRight: 6,
                        }}
                      >
                        <Text style={{ color: useCustomTimeOfDay && customIsDay ? '#fff' : '#333', fontWeight: 'bold' }}>Day</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setCustomIsDay(false)}
                        disabled={!useCustomTimeOfDay}
                        style={{
                          backgroundColor: useCustomTimeOfDay && !customIsDay ? '#1565C0' : '#eee',
                          borderRadius: 6,
                          paddingHorizontal: 10,
                          paddingVertical: 4,
                        }}
                      >
                        <Text style={{ color: useCustomTimeOfDay && !customIsDay ? '#fff' : '#333', fontWeight: 'bold' }}>Night</Text>
                      </TouchableOpacity>
                    </View>
                    <Text style={{ color: theme.text }}>Feels like: {feelsLikeF}°F</Text>
                    <Text style={{ color: theme.text }}>Pet size: {pet.size}</Text>
                    <Text style={{ color: theme.text }}>Obese: {pet.obese ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Brachycephalic: {pet.brachy ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Senior: {pet.senior ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Northern breed: {pet.northern ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Acclimated: {pet.acclimated ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Shade: {shade ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Wet weather: {wetWeather ? 'Yes' : 'No'}</Text>
                    <Text style={{ color: theme.text }}>Base risk (matrix): {(() => {
                      let idx = TEMP_STEPS_F.findIndex((t) => (tempForLogic) >= t);
                      if (idx === -1) idx = TEMP_STEPS_F.length - 1;
                      return RISK_MATRIX[pet.size][idx];
                    })()}</Text>
                    <Text style={{ color: theme.text }}>Final risk (after modifiers): {(() => {
                      let idx = TEMP_STEPS_F.findIndex((t) => (tempForLogic) >= t);
                      if (idx === -1) idx = TEMP_STEPS_F.length - 1;
                      let base = RISK_MATRIX[pet.size][idx];
                      let mod = 0;
                      if (pet.obese) mod += 1;
                      if (pet.brachy) mod += 1;
                      if (pet.senior) mod += 1;
                      if (shade) mod -= 1;
                      if (tempForLogic !== null && tempForLogic < 35) {
                        if (wetWeather) mod += 2;
                        if (pet.northern) mod -= 1;
                        if (pet.acclimated) mod -= 1;
                      } else if (tempForLogic !== null && tempForLogic > 70) {
                        if (wetWeather) mod -= 2;
                        if (pet.northern) mod += 1;
                        if (pet.acclimated) mod += 1;
                      }
                      let risk = Math.max(1, Math.min(5, base + mod));
                      return `${risk} (${RISK_LEVELS[risk-1].title})`;
                    })()}</Text>
                    {/* At the bottom of the debug section, add a quick reference legend */}
                    <Text style={{ color: theme.text, marginTop: 8, fontSize: 13, fontWeight: 'bold' }}>Risk Matrix Key:</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>1 = No evidence of risk</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>2 = Risk is unlikely</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>3 = Unsafe potential</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>4 = Dangerous weather</Text>
                    <Text style={{ color: theme.text, fontSize: 13 }}>5 = Life-Threatening</Text>
                  </View>
                )
              )}
              {/* Help/Info Modal */}
              <Modal visible={helpVisible} transparent animationType="fade" onRequestClose={() => setHelpVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setHelpVisible(false)}>
                  <View style={[styles.modalContent, { backgroundColor: theme.card }]}> 
                    <Text style={[styles.modalTitle, { color: theme.text }]}>About Us</Text>
                    <Text style={[styles.modalBody, { color: theme.text }]}>We help you decide when it's safe to walk your dog by checking the real-time weather where you are and factoring in how it actually feels outside. You tell us a bit about your pup, like their size, age, and sensitivity, and we use vet-backed guidance to personalize a simple recommendation just for them. Whether it's a green light to go or a heads-up to be cautious, we make it easy to know what's best so every walk can be a safe one.</Text>
                    <TouchableOpacity style={[styles.closeBtn, { backgroundColor: theme.safe }]} onPress={() => setHelpVisible(false)} accessibilityLabel="Close help" accessibilityRole="button">
                      <Text style={styles.closeText}>Close</Text>
                    </TouchableOpacity>
                  </View>
                </Pressable>
              </Modal>
              {/* Location Picker Modal */}
              <Modal visible={locationModalVisible} transparent animationType="fade" onRequestClose={() => setLocationModalVisible(false)}>
                <Pressable style={styles.modalOverlay} onPress={() => setLocationModalVisible(false)}>
                  <View style={{ flex: 1 }} />
                </Pressable>
                <View style={[styles.modalContent, { backgroundColor: theme.card, position: 'absolute', alignSelf: 'center', top: '30%', maxWidth: 400, width: '90%' }]}> 
                  <TouchableOpacity
                    onPress={() => setLocationModalVisible(false)}
                    accessibilityLabel="Close location picker"
                    accessibilityRole="button"
                    style={{ position: 'absolute', top: 12, right: 12, zIndex: 10 }}
                  >
                    <Ionicons name="close" size={28} color={theme.text} />
                  </TouchableOpacity>
                  <Text style={[styles.modalTitle, { color: theme.text, paddingRight: 32 }]}>Choose Location</Text>
                  <TextInput
                    value={postalInput}
                    onChangeText={setPostalInput}
                    placeholder="Enter postal code"
                    style={{
                      backgroundColor: theme.background,
                      color: theme.text,
                      borderRadius: 8,
                      padding: 12,
                      marginBottom: 12,
                      fontSize: 18,
                      width: 200,
                      textAlign: 'center',
                    }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                  />
                  {postalError ? <Text style={{ color: theme.alert, marginBottom: 8 }}>{postalError}</Text> : null}
                  <TouchableOpacity
                    style={[
                      styles.closeBtn,
                      {
                        backgroundColor: theme.safe,
  marginBottom: 8,
                        alignSelf: 'center',
                        width: 220,
                        borderRadius: 12,
                        paddingVertical: 12,
                      }
                    ]}
                    onPress={handlePostalSubmit}
                    accessibilityLabel="Submit postal code"
                    accessibilityRole="button"
                  >
                    <Text style={styles.closeText}>Set Location</Text>
                  </TouchableOpacity>
                </View>
              </Modal>
              {error && (
                <Text style={[styles.errorText, { color: theme.alert }]} accessibilityLiveRegion="polite">{error}</Text>
              )}
            </ScrollView>
          )}
          {activeTab === 'pet' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24, color: '#333' }}>Pet Details (placeholder)</Text>
            </View>
          )}
          {activeTab === 'forecast' && (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 24, color: '#333' }}>Walk Forecast (placeholder)</Text>
            </View>
          )}
          {/* Floating pill navigation bar (bottom center) */}
          <View
            pointerEvents="box-none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: Platform.OS === 'web' ? 32 : 24,
              alignItems: 'center',
              zIndex: 100,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#fff',
                borderRadius: 32,
                paddingHorizontal: 10,
                paddingVertical: 4,
                shadowColor: '#000',
                shadowOpacity: 0.12,
                shadowRadius: 8,
                elevation: 8,
                alignItems: 'center',
                minWidth: 120,
                justifyContent: 'center',
              }}
            >
              {navIcons.map((item, idx) => (
                <Animated.View key={item.key} style={{ transform: [{ scale: navScales[idx] }], borderRadius: 20 }}>
                  <TouchableOpacity
                    key={item.key}
                    onPress={() => setPage(idx)}
                    accessibilityLabel={item.label}
                    accessibilityRole="button"
                    onPressIn={() => setNavPressed(p => p.map((v, i) => i === idx ? true : v))}
                    onPressOut={() => setNavPressed(p => p.map((v, i) => i === idx ? false : v))}
                    style={{
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginHorizontal: 6,
                      backgroundColor: page === idx ? '#f0f0f0' : navPressed[idx] ? 'rgba(0,0,0,0.07)' : 'transparent',
                      borderRadius: 20,
                      padding: 6,
                      minWidth: 32,
                      borderWidth: page === idx ? 1 : 0,
                      borderColor: page === idx ? 'rgba(0,0,0,0.08)' : 'transparent',
                      shadowColor: page === idx ? '#000' : 'transparent',
                      shadowOpacity: page === idx ? 0.10 : 0,
                      shadowRadius: page === idx ? 6 : 0,
                      elevation: page === idx ? 4 : 0,
                    }}
                  >
                    {React.cloneElement(item.icon, { color: page === idx ? '#222' : '#333', size: 22 })}
                  </TouchableOpacity>
                </Animated.View>
              ))}
            </View>
          </View>
        </>
      </View>
      {/* Overlay spinner for forecast page loading */}
      {page === 2 && forecastLoading && (
        <View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: '#2D2D2D',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <ActivityIndicator size={64} color="#fff" />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  scrollContainer: { flexGrow: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  city: { fontSize: 20, fontWeight: '600', color: '#222', marginBottom: 16, marginTop: 24 },
  iconWrap: { marginBottom: 12 },
  temp: { fontSize: 64, fontWeight: 'bold', color: '#222', marginBottom: 4 },
  feelsLike: { fontSize: 18, color: '#444', marginBottom: 8 },
  updated: { fontSize: 14, color: '#888', marginBottom: 16 },
  statusCard: { borderRadius: 16, padding: 20, width: '100%', alignItems: 'center', marginTop: 8 },
  statusTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff', marginBottom: 6 },
  statusMsg: { fontSize: 16, color: '#fff', textAlign: 'center' },
  error: { color: '#FF3B30', fontSize: 18, marginTop: 16, textAlign: 'center' },
  centered: { alignItems: 'center', justifyContent: 'center', flex: 1, width: '100%' },
  retryBtn: { marginTop: 16, backgroundColor: '#19C37D', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 24 },
  retryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  // Skeleton styles
  skeletonWrap: { alignItems: 'center', width: '100%', marginTop: 40 },
  skelCity: { width: 120, height: 22, backgroundColor: '#eee', borderRadius: 8, marginBottom: 20 },
  skelIcon: { width: 56, height: 56, backgroundColor: '#eee', borderRadius: 28, marginBottom: 16 },
  skelTemp: { width: 100, height: 48, backgroundColor: '#eee', borderRadius: 12, marginBottom: 8 },
  skelFeels: { width: 120, height: 20, backgroundColor: '#eee', borderRadius: 8, marginBottom: 16 },
  skelStatus: { width: '100%', height: 80, backgroundColor: '#eee', borderRadius: 16, marginTop: 8 },
  // New styles for help modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '80%',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  modalBody: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  closeBtn: {
    width: '100%',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  closeText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#FF3B30',
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
  },
});