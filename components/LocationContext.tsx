import React, { createContext, useContext, useState } from 'react';

export interface LocationInfo {
  city: string;
  latitude: number;
  longitude: number;
}

interface LocationContextProps {
  selectedLocation: LocationInfo | null;
  setSelectedLocation: (loc: LocationInfo | null) => void;
}

const LocationContext = createContext<LocationContextProps | undefined>(undefined);

export const LocationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [selectedLocation, setSelectedLocation] = useState<LocationInfo | null>(null);
  return (
    <LocationContext.Provider value={{ selectedLocation, setSelectedLocation }}>
      {children}
    </LocationContext.Provider>
  );
};

export const useLocation = () => {
  const context = useContext(LocationContext);
  if (!context) throw new Error('useLocation must be used within a LocationProvider');
  return context;
}; 