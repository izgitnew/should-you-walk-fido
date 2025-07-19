import React, { createContext, useContext, useState } from 'react';

export type PetSize = 'Small' | 'Medium' | 'Large';

export interface PetInfo {
  name: string;
  size: PetSize;
  obese: boolean;
  brachy: boolean;
  senior: boolean;
  northern: boolean;
  acclimated: boolean;
}

interface PetContextProps {
  pet: PetInfo;
  setPet: (pet: PetInfo) => void;
}

const defaultPet: PetInfo = {
  name: '',
  size: 'Medium',
  obese: false,
  brachy: false,
  senior: false,
  northern: false,
  acclimated: false,
};

const PetContext = createContext<PetContextProps | undefined>(undefined);

export const PetProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [pet, setPet] = useState<PetInfo>(defaultPet);
  return (
    <PetContext.Provider value={{ pet, setPet }}>
      {children}
    </PetContext.Provider>
  );
};

export const usePet = () => {
  const context = useContext(PetContext);
  if (!context) throw new Error('usePet must be used within a PetProvider');
  return context;
}; 