import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { LACRecord, UploadedLACFile, LACFilterState, LACContextType, TowerInfo } from '../types';
import { parseDateTime } from '../utils/cdrUtils';

const LACContext = createContext<LACContextType | undefined>(undefined);

export const LACProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedLACFiles, setUploadedLACFiles] = useState<UploadedLACFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [lacFilterState, setLACFilterState] = useState<LACFilterState>({
    searchTerm: '',
    selectedFileIds: [],
  });
  const [towerDatabase, setTowerDatabase] = useState<TowerInfo[]>([]);
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

  const towerDBMap = useMemo(() => {
    const map = new Map<string, TowerInfo>();
    towerDatabase.forEach(tower => {
      const key = `${tower.lac}-${tower.ci}`;
      map.set(key, tower);
    });
    return map;
  }, [towerDatabase]);


  const addLACFile = useCallback((file: UploadedLACFile) => {
    setUploadedLACFiles((currentUploadedFiles) => {
      const isFirstFileOverall = currentUploadedFiles.length === 0;
      const newUploadedFiles = [...currentUploadedFiles, file];
      
      setLACFilterState(prevFilterState => ({
        ...prevFilterState,
        selectedFileIds: isFirstFileOverall 
                         ? [file.id] 
                         : [...new Set([...prevFilterState.selectedFileIds, file.id])]
      }));
      
      if (isFirstFileOverall) {
        setActiveFileTabId(file.id);
      }
      return newUploadedFiles;
    });
  }, [setActiveFileTabId]);


  const removeLACFile = useCallback((fileId: string) => {
    setUploadedLACFiles((prevFiles) => {
      const newFiles = prevFiles.filter((f) => f.id !== fileId);
      setLACFilterState(prev => {
        const newSelectedFileIds = prev.selectedFileIds.filter(id => id !== fileId);
        if (activeFileTabId === fileId) {
            const stillSelectedAndRemaining = newFiles.filter(f => newSelectedFileIds.includes(f.id));
            if (stillSelectedAndRemaining.length > 0) {
                setActiveFileTabId(stillSelectedAndRemaining[0].id);
            } else if (newFiles.length > 0) {
                setActiveFileTabId(newFiles[0].id);
            } else {
                setActiveFileTabId(null);
            }
        }
        return { ...prev, selectedFileIds: newSelectedFileIds };
      });
      return newFiles;
    });
  }, [activeFileTabId, setActiveFileTabId]);
  
  const removeAllLACFiles = useCallback(() => {
    setUploadedLACFiles([]);
    setLACFilterState({
        searchTerm: '',
        selectedFileIds: [],
        dateFrom: undefined,
        dateTo: undefined,
        usageTypes: undefined,
        lac: undefined,
        cellId: undefined,
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]);

  const updateLACFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedLACFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allLACRecords = useMemo(() => {
    return uploadedLACFiles.flatMap((file) => file.records);
  }, [uploadedLACFiles]);

  const globallyFilteredLACRecords = useMemo(() => {
    let recordsToProcess = lacFilterState.selectedFileIds.length > 0
      ? uploadedLACFiles.filter(f => lacFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
      : allLACRecords;

    // Apply tower database enrichment to LAC records
    const enrichedRecords = recordsToProcess.map(record => {
      if (towerDatabase.length > 0 && record.LAC && record.CELL_ID) {
        const key = `${record.LAC}-${record.CELL_ID}`;
        const towerInfo = towerDBMap.get(key);
        if (towerInfo) {
          const newRecord = { ...record };
          let changed = false;
          if (!newRecord.ADDRESS || newRecord.ADDRESS.toLowerCase() === 'n/a') {
            newRecord.ADDRESS = towerInfo.address || 'N/A (from Tower DB)';
            changed = true;
          }
          if (towerInfo.latitude && (newRecord.latitude === undefined || isNaN(newRecord.latitude))) {
            newRecord.latitude = towerInfo.latitude;
            changed = true;
          }
          if (towerInfo.longitude && (newRecord.longitude === undefined || isNaN(newRecord.longitude))) {
            newRecord.longitude = towerInfo.longitude;
            changed = true;
          }
          if (changed) {
            newRecord.derivedLocationSource = 'towerDB';
          }
          return newRecord;
        }
      }
      return record;
    });


    return enrichedRecords.filter((record) => {
      const searchTermLower = lacFilterState.searchTerm.toLowerCase();
      if (lacFilterState.searchTerm) {
        let match = false;
        const fieldsToSearch: (keyof LACRecord)[] = ['MSISDN', 'OTHER_PARTY_NUMBER', 'USAGE_TYPE', 'LAC', 'CELL_ID', 'IMEI', 'ADDRESS'];
        for (const key of fieldsToSearch) {
          if (record[key] && String(record[key]).toLowerCase().includes(searchTermLower)) {
            match = true;
            break;
          }
        }
        if (!match) return false;
      }

      if (lacFilterState.dateFrom && record.DATE_TIME) {
        const recordDate = parseDateTime(record.DATE_TIME);
        const fromDate = new Date(lacFilterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (lacFilterState.dateTo && record.DATE_TIME) {
        const recordDate = parseDateTime(record.DATE_TIME);
        const toDate = new Date(lacFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (lacFilterState.usageTypes && lacFilterState.usageTypes.length > 0 && record.USAGE_TYPE && !lacFilterState.usageTypes.includes(record.USAGE_TYPE)) return false;
      if (lacFilterState.lac && record.LAC !== lacFilterState.lac) return false;
      if (lacFilterState.cellId && record.CELL_ID !== lacFilterState.cellId) return false;
      
      return true;
    });
  }, [allLACRecords, uploadedLACFiles, lacFilterState, towerDatabase, towerDBMap]);

  const filteredLACRecords = useMemo(() => {
    // Note: LAC views generally don't use file tabs. So this is an alias for global filtering.
    // If a tabbed view is added for LAC, this logic will need to filter `globallyFilteredLACRecords` by `activeFileTabId`.
    return globallyFilteredLACRecords;
  }, [globallyFilteredLACRecords]);


  const getUniqueLACValues = useCallback((key: keyof LACRecord): string[] => {
    const values = new Set<string>();
    allLACRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allLACRecords]);

  const loadTowerDatabase = useCallback((towers: TowerInfo[]) => {
    setTowerDatabase(towers);
  }, []);

  const clearTowerDatabase = useCallback(() => {
    setTowerDatabase([]);
  }, []);
  
  const getTowerInfo = useCallback((lac: string, ci: string): TowerInfo | undefined => {
    if (!lac || !ci) return undefined;
    const key = `${lac}-${ci}`;
    return towerDBMap.get(key);
  }, [towerDBMap]);


  return (
    <LACContext.Provider value={{ 
      uploadedLACFiles, addLACFile, removeLACFile, removeAllLACFiles, updateLACFileSourceName,
      allLACRecords, filteredLACRecords, globallyFilteredLACRecords,
      lacFilterState, setLACFilterState,
      isLoading, setIsLoading, error, setError,
      getUniqueLACValues,
      towerDatabase, loadTowerDatabase, clearTowerDatabase, getTowerInfo,
      activeFileTabId, setActiveFileTabId,
    }}>
      {children}
    </LACContext.Provider>
  );
};

export const useLACContext = (): LACContextType => {
  const context = useContext(LACContext);
  if (!context) {
    throw new Error('useLACContext must be used within a LACProvider');
  }
  return context;
};