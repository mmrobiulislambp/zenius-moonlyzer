
import React, { createContext, useState, useEffect, useCallback, ReactNode, useMemo } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { SuspectEntry, WatchlistContextType } from '../types';

export const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const LOCAL_STORAGE_KEY = 'suspectWatchlist';

export const WatchlistProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [suspects, setSuspects] = useState<SuspectEntry[]>(() => {
    try {
      const storedSuspects = localStorage.getItem(LOCAL_STORAGE_KEY);
      return storedSuspects ? JSON.parse(storedSuspects) : [];
    } catch (error) {
      console.error("Error loading suspects from localStorage:", error);
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(suspects));
    } catch (error) {
      console.error("Error saving suspects to localStorage:", error);
    }
  }, [suspects]);

  // Memoize a map for fast lookups. O(N) creation, O(1) lookup.
  const watchedEntitiesMap = useMemo(() => {
    const map = new Map<string, SuspectEntry>();
    suspects.forEach(suspect => {
      suspect.msisdns.forEach(msisdn => {
        if (msisdn) map.set(msisdn.trim(), suspect);
      });
      suspect.imeis.forEach(imei => {
        if (imei) map.set(imei.trim(), suspect);
      });
    });
    return map;
  }, [suspects]);

  const addSuspect = useCallback((suspectData: Omit<SuspectEntry, 'id' | 'createdAt'>) => {
    const newSuspect: SuspectEntry = {
      ...suspectData,
      id: uuidv4(),
      createdAt: new Date().toISOString(),
    };
    setSuspects(prev => [...prev, newSuspect]);
  }, []);

  const updateSuspect = useCallback((id: string, updates: Partial<Omit<SuspectEntry, 'id' | 'createdAt'>>) => {
    setSuspects(prev => prev.map(s => (s.id === id ? { ...s, ...updates } : s)));
  }, []);

  const deleteSuspect = useCallback((id: string) => {
    setSuspects(prev => prev.filter(s => s.id !== id));
  }, []);

  const isWatched = useCallback((identifier: string): SuspectEntry | null => {
    if (!identifier || typeof identifier !== 'string') return null;
    return watchedEntitiesMap.get(identifier.trim()) || null;
  }, [watchedEntitiesMap]);

  return (
    <WatchlistContext.Provider value={{ suspects, addSuspect, updateSuspect, deleteSuspect, isWatched }}>
      {children}
    </WatchlistContext.Provider>
  );
};
