import React, { createContext, useState, useContext, ReactNode, useCallback } from 'react';

export type LicenseLevel = 'TRIAL' | 'STANDARD' | 'PRO';

interface LicenseContextType {
  currentLicense: LicenseLevel;
  setLicense: (level: LicenseLevel) => void;
  activateLicense: (key: string) => { success: boolean; message: string; newLevel?: LicenseLevel };
  isFeatureAllowed: (requiredLevel?: LicenseLevel) => boolean;
}

const LicenseContext = createContext<LicenseContextType | undefined>(undefined);

const LICENSE_STORAGE_KEY = 'zeniusMoonlyzerProLicenseLevel';

const DEMO_LICENSE_KEYS: Record<string, LicenseLevel> = {
  "ZENMOON-TRIAL-DEMO": "TRIAL",
  "ZENMOON-STANDARD-DEMO": "STANDARD",
  "ZENMOON-PRO-DEMO": "PRO",
};

const DEFAULT_LICENSE_LEVEL: LicenseLevel = 'TRIAL'; 

export const LicenseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentLicense, setCurrentLicense] = useState<LicenseLevel>(() => {
    try {
      const storedLevel = localStorage.getItem(LICENSE_STORAGE_KEY);
      if (storedLevel && ['TRIAL', 'STANDARD', 'PRO'].includes(storedLevel)) {
        return storedLevel as LicenseLevel;
      }
    } catch (error) {
      console.error("Error reading license from localStorage:", error);
    }
    return DEFAULT_LICENSE_LEVEL;
  });

  const setLicense = useCallback((level: LicenseLevel) => {
    try {
      localStorage.setItem(LICENSE_STORAGE_KEY, level);
      setCurrentLicense(level);
    } catch (error) {
      console.error("Error saving license to localStorage:", error);
      // Still set in memory even if localStorage fails
      setCurrentLicense(level);
    }
  }, []);

  const activateLicense = useCallback((key: string): { success: boolean; message: string; newLevel?: LicenseLevel } => {
    const normalizedKey = key.trim().toUpperCase();
    if (DEMO_LICENSE_KEYS[normalizedKey]) {
      const newLevel = DEMO_LICENSE_KEYS[normalizedKey];
      setLicense(newLevel);
      return { success: true, message: `License successfully activated. Your new level is ${newLevel}.`, newLevel };
    }
    // Backward compatibility for old complex keys
    const oldKeys: Record<string, LicenseLevel> = {
      "ZENMOON-TRIAL-AB7C1-9X3YZ-PQR65-DEMO": "TRIAL",
      "ZENMOON-STANDARD-K2M4N-7B8VC-X9Y1Z-DEMO": "STANDARD",
      "ZENMOON-PRO-HS4J5-L0P2Q-R3S6T-DEMO7": "PRO",
    };
     if (oldKeys[normalizedKey]) {
      const newLevel = oldKeys[normalizedKey];
      setLicense(newLevel);
      return { success: true, message: `License successfully activated. Your new level is ${newLevel}.`, newLevel };
    }

    return { success: false, message: "Invalid license key." };
  }, [setLicense]);
  
  const isFeatureAllowed = useCallback((requiredLevel?: LicenseLevel): boolean => {
    if (!requiredLevel) return true; 

    const levelHierarchy: Record<LicenseLevel, number> = {
      'TRIAL': 1,
      'STANDARD': 2,
      'PRO': 3,
    };

    return levelHierarchy[currentLicense] >= levelHierarchy[requiredLevel];
  }, [currentLicense]);


  return (
    <LicenseContext.Provider value={{ currentLicense, setLicense, activateLicense, isFeatureAllowed }}>
      {children}
    </LicenseContext.Provider>
  );
};

export const useLicenseContext = (): LicenseContextType => {
  const context = useContext(LicenseContext);
  if (!context) {
    throw new Error('useLicenseContext must be used within a LicenseProvider');
  }
  return context;
};