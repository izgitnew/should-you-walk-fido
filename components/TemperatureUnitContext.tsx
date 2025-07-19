import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TemperatureUnit = 'F' | 'C';

interface TemperatureUnitContextProps {
  unit: TemperatureUnit;
  setUnit: (unit: TemperatureUnit) => void;
}

const TemperatureUnitContext = createContext<TemperatureUnitContextProps | undefined>(undefined);

export const TemperatureUnitProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [unit, setUnitState] = useState<TemperatureUnit>('F');

  useEffect(() => {
    AsyncStorage.getItem('temperatureUnit').then((stored: string | null) => {
      if (stored === 'C' || stored === 'F') setUnitState(stored);
    });
  }, []);

  const setUnit = (newUnit: TemperatureUnit) => {
    setUnitState(newUnit);
    AsyncStorage.setItem('temperatureUnit', newUnit);
  };

  return (
    <TemperatureUnitContext.Provider value={{ unit, setUnit }}>
      {children}
    </TemperatureUnitContext.Provider>
  );
};

export const useTemperatureUnit = () => {
  const context = useContext(TemperatureUnitContext);
  if (!context) throw new Error('useTemperatureUnit must be used within a TemperatureUnitProvider');
  return context;
}; 