
import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { NagadRecord, UploadedNagadFile, NagadFilterState, NagadContextType } from '../types';
import { parseDateTime } from '../utils/cdrUtils'; // Using existing robust date parser

const NagadContext = createContext<NagadContextType | undefined>(undefined);

export const NagadProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedNagadFiles, setUploadedNagadFiles] = useState<UploadedNagadFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [nagadFilterState, setNagadFilterState] = useState<NagadFilterState>({
    searchTerm: '',
    selectedFileIds: [],
    dateFrom: undefined,
    dateTo: undefined,
    txnTypes: [],
    channels: [],
    drCrTypes: [],
    minTxnAmount: null,
    maxTxnAmount: null,
  });
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);


  const addNagadFile = useCallback((file: UploadedNagadFile) => {
    setUploadedNagadFiles((currentUploadedFiles) => {
      const isFirstFileOverall = currentUploadedFiles.length === 0;
      const newUploadedFiles = [...currentUploadedFiles, file];
      
      setNagadFilterState(prevFilterState => ({
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

  const removeNagadFile = useCallback((fileId: string) => {
    setUploadedNagadFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setNagadFilterState(currentFilterState => {
        const newSelectedFileIds = currentFilterState.selectedFileIds.filter(id => id !== fileId);
        
        if (activeFileTabId === fileId) {
          if (newSelectedFileIds.length > 0) {
            const stillSelectedAndRemaining = newUploadedFiles.filter(f => newSelectedFileIds.includes(f.id));
            if (stillSelectedAndRemaining.length > 0) {
              setActiveFileTabId(stillSelectedAndRemaining[0].id);
            } else { // Should not happen if newSelectedFileIds is derived from newUploadedFiles
              setActiveFileTabId(newSelectedFileIds[0]);
            }
          } else if (newUploadedFiles.length > 0) {
            setActiveFileTabId(newUploadedFiles[0].id);
          } else {
            setActiveFileTabId(null);
          }
        }
        return { ...currentFilterState, selectedFileIds: newSelectedFileIds };
      });
      return newUploadedFiles;
    });
  }, [activeFileTabId, setActiveFileTabId]);
  
  const removeAllNagadFiles = useCallback(() => {
    setUploadedNagadFiles([]);
    setNagadFilterState({
        searchTerm: '',
        selectedFileIds: [],
        dateFrom: undefined,
        dateTo: undefined,
        txnTypes: [],
        channels: [],
        drCrTypes: [],
        minTxnAmount: null,
        maxTxnAmount: null,
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]); // Added setActiveFileTabId to dependencies

  const updateNagadFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedNagadFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allNagadRecords = useMemo(() => {
    return uploadedNagadFiles.flatMap((file) => file.records);
  }, [uploadedNagadFiles]);

  const globallyFilteredNagadRecords = useMemo(() => {
    let baseRecords = nagadFilterState.selectedFileIds.length > 0
      ? uploadedNagadFiles.filter(f => nagadFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
      : allNagadRecords;

    return baseRecords.filter((record) => {
      const searchTermLower = nagadFilterState.searchTerm.toLowerCase();
      if (nagadFilterState.searchTerm) {
        const match = Object.values(record).some(value => 
          String(value).toLowerCase().includes(searchTermLower)
        );
        if (!match) return false;
      }

      if (nagadFilterState.dateFrom && record.TXN_DATE_TIME) {
        const recordDate = parseDateTime(record.TXN_DATE_TIME);
        const fromDate = new Date(nagadFilterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (nagadFilterState.dateTo && record.TXN_DATE_TIME) {
        const recordDate = parseDateTime(record.TXN_DATE_TIME);
        const toDate = new Date(nagadFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (nagadFilterState.txnTypes && nagadFilterState.txnTypes.length > 0 && !nagadFilterState.txnTypes.includes(record.TXN_TYPE)) return false;
      if (nagadFilterState.channels && nagadFilterState.channels.length > 0 && !nagadFilterState.channels.includes(record.CHANNEL)) return false;
      if (nagadFilterState.drCrTypes && nagadFilterState.drCrTypes.length > 0 && !nagadFilterState.drCrTypes.includes(record.TXN_TYPE_DR_CR as ('' | 'CREDIT' | 'DEBIT'))) return false;
      
      if (nagadFilterState.minTxnAmount !== null && nagadFilterState.minTxnAmount !== undefined && record.TXN_AMT < nagadFilterState.minTxnAmount) return false;
      if (nagadFilterState.maxTxnAmount !== null && nagadFilterState.maxTxnAmount !== undefined && record.TXN_AMT > nagadFilterState.maxTxnAmount) return false;
      
      return true;
    });
  }, [allNagadRecords, uploadedNagadFiles, nagadFilterState]);


  const filteredNagadRecords = useMemo(() => {
    let baseRecords: NagadRecord[] = [];

    if (activeFileTabId) {
        const activeFile = uploadedNagadFiles.find(f => f.id === activeFileTabId);
        if (activeFile) {
            baseRecords = activeFile.records;
        } else {
             // Fallback to global if activeFileTabId is invalid but present
             return globallyFilteredNagadRecords;
        }
    } else {
        // If no specific tab is active, use the globally filtered records
        return globallyFilteredNagadRecords;
    }


    return baseRecords.filter((record) => {
      const searchTermLower = nagadFilterState.searchTerm.toLowerCase();
      if (nagadFilterState.searchTerm) {
        const match = Object.values(record).some(value => 
          String(value).toLowerCase().includes(searchTermLower)
        );
        if (!match) return false;
      }

      if (nagadFilterState.dateFrom && record.TXN_DATE_TIME) {
        const recordDate = parseDateTime(record.TXN_DATE_TIME);
        const fromDate = new Date(nagadFilterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (nagadFilterState.dateTo && record.TXN_DATE_TIME) {
        const recordDate = parseDateTime(record.TXN_DATE_TIME);
        const toDate = new Date(nagadFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (nagadFilterState.txnTypes && nagadFilterState.txnTypes.length > 0 && !nagadFilterState.txnTypes.includes(record.TXN_TYPE)) return false;
      if (nagadFilterState.channels && nagadFilterState.channels.length > 0 && !nagadFilterState.channels.includes(record.CHANNEL)) return false;
      if (nagadFilterState.drCrTypes && nagadFilterState.drCrTypes.length > 0 && !nagadFilterState.drCrTypes.includes(record.TXN_TYPE_DR_CR as ('' | 'CREDIT' | 'DEBIT'))) return false;
      
      if (nagadFilterState.minTxnAmount !== null && nagadFilterState.minTxnAmount !== undefined && record.TXN_AMT < nagadFilterState.minTxnAmount) return false;
      if (nagadFilterState.maxTxnAmount !== null && nagadFilterState.maxTxnAmount !== undefined && record.TXN_AMT > nagadFilterState.maxTxnAmount) return false;
      
      return true;
    });
  }, [uploadedNagadFiles, nagadFilterState, activeFileTabId, globallyFilteredNagadRecords]);

  const getUniqueNagadValues = useCallback((key: keyof NagadRecord): string[] => {
    const values = new Set<string>();
    allNagadRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allNagadRecords]);

  return (
    <NagadContext.Provider value={{ 
      uploadedNagadFiles, addNagadFile, removeNagadFile, removeAllNagadFiles, updateNagadFileSourceName,
      allNagadRecords, filteredNagadRecords, globallyFilteredNagadRecords,
      nagadFilterState, setNagadFilterState,
      isLoading, setIsLoading, error, setError,
      getUniqueNagadValues,
      activeFileTabId, setActiveFileTabId
    }}>
      {children}
    </NagadContext.Provider>
  );
};

export const useNagadContext = (): NagadContextType => {
  const context = useContext(NagadContext);
  if (!context) {
    throw new Error('useNagadContext must be used within a NagadProvider');
  }
  return context;
};