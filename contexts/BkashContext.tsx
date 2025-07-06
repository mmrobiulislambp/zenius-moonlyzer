
import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { UploadedBkashFile, BkashRecord, BkashFilterState, BkashContextType } from '../types';
import { parseDateTime } from '../utils/cdrUtils';

const BkashContext = createContext<BkashContextType | undefined>(undefined);

export const BkashProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedBkashFiles, setUploadedBkashFiles] = useState<UploadedBkashFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [bkashFilterState, setBkashFilterState] = useState<BkashFilterState>({
    searchTerm: '',
    selectedFileIds: [],
    dateFrom: undefined,
    dateTo: undefined,
    txnTypes: [],
    drCrTypes: [],
    minTxnAmount: null,
    maxTxnAmount: null,
  });
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);


  const addBkashFile = useCallback((file: UploadedBkashFile) => {
    setUploadedBkashFiles((currentUploadedFiles) => {
      const isFirstFileOverall = currentUploadedFiles.length === 0;
      const newUploadedFiles = [...currentUploadedFiles, file];
      
      setBkashFilterState(prevFilterState => ({
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

  const removeBkashFile = useCallback((fileId: string) => {
    setUploadedBkashFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setBkashFilterState(currentFilterState => {
        const newSelectedFileIds = currentFilterState.selectedFileIds.filter(id => id !== fileId);
        
        if (activeFileTabId === fileId) {
          if (newSelectedFileIds.length > 0) {
            const stillSelectedAndRemaining = newUploadedFiles.filter(f => newSelectedFileIds.includes(f.id));
            if (stillSelectedAndRemaining.length > 0) {
              setActiveFileTabId(stillSelectedAndRemaining[0].id);
            } else {
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
  
  const removeAllBkashFiles = useCallback(() => {
    setUploadedBkashFiles([]);
    setBkashFilterState({
        searchTerm: '',
        selectedFileIds: [],
        dateFrom: undefined,
        dateTo: undefined,
        txnTypes: [],
        drCrTypes: [],
        minTxnAmount: null,
        maxTxnAmount: null,
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]); // Added setActiveFileTabId to dependencies

  const updateBkashFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedBkashFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allBkashRecords = useMemo(() => {
    return uploadedBkashFiles.flatMap((file) => file.records);
  }, [uploadedBkashFiles]);

  const globallyFilteredBkashRecords = useMemo(() => {
    let baseRecords = bkashFilterState.selectedFileIds.length > 0
      ? uploadedBkashFiles.filter(f => bkashFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
      : allBkashRecords;

    return baseRecords.filter((record) => {
      const searchTermLower = bkashFilterState.searchTerm.toLowerCase();
      if (bkashFilterState.searchTerm) {
        const match = 
            (record.trxId && String(record.trxId).toLowerCase().includes(searchTermLower)) ||
            (record.trxType && String(record.trxType).toLowerCase().includes(searchTermLower)) ||
            (record.sender && String(record.sender).toLowerCase().includes(searchTermLower)) ||
            (record.receiver && String(record.receiver).toLowerCase().includes(searchTermLower)) ||
            (record.receiverName && String(record.receiverName).toLowerCase().includes(searchTermLower)) ||
            (record.reference && String(record.reference).toLowerCase().includes(searchTermLower)) ||
            (record.fileName && String(record.fileName).toLowerCase().includes(searchTermLower));
        if (!match) return false;
      }

      if (bkashFilterState.dateFrom && record.transactionDate) {
        const recordDate = parseDateTime(record.transactionDate);
        const fromDate = new Date(bkashFilterState.dateFrom);
        fromDate.setHours(0,0,0,0);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (bkashFilterState.dateTo && record.transactionDate) {
        const recordDate = parseDateTime(record.transactionDate);
        const toDate = new Date(bkashFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (bkashFilterState.txnTypes && bkashFilterState.txnTypes.length > 0 && !bkashFilterState.txnTypes.includes(record.trxType)) return false;
      
      if (bkashFilterState.drCrTypes && bkashFilterState.drCrTypes.length > 0) {
        const direction = record.transactionDirection || ''; 
        if (!bkashFilterState.drCrTypes.includes(direction)) return false;
      }
      
      const amount = record.transactedAmount;
      if (bkashFilterState.minTxnAmount !== null && bkashFilterState.minTxnAmount !== undefined && amount < bkashFilterState.minTxnAmount) return false;
      if (bkashFilterState.maxTxnAmount !== null && bkashFilterState.maxTxnAmount !== undefined && amount > bkashFilterState.maxTxnAmount) return false;
      
      return true;
    });
  }, [allBkashRecords, uploadedBkashFiles, bkashFilterState]);

  const filteredBkashRecords = useMemo(() => {
    let baseRecords: BkashRecord[] = [];

    if (activeFileTabId) {
        const activeFile = uploadedBkashFiles.find(f => f.id === activeFileTabId);
        if (activeFile) {
            baseRecords = activeFile.records;
        } else {
             return globallyFilteredBkashRecords;
        }
    } else {
        return globallyFilteredBkashRecords;
    }

    return baseRecords.filter((record) => {
      const searchTermLower = bkashFilterState.searchTerm.toLowerCase();
      if (bkashFilterState.searchTerm) {
        const match = 
            (record.trxId && String(record.trxId).toLowerCase().includes(searchTermLower)) ||
            (record.trxType && String(record.trxType).toLowerCase().includes(searchTermLower)) ||
            (record.sender && String(record.sender).toLowerCase().includes(searchTermLower)) ||
            (record.receiver && String(record.receiver).toLowerCase().includes(searchTermLower)) ||
            (record.receiverName && String(record.receiverName).toLowerCase().includes(searchTermLower)) ||
            (record.reference && String(record.reference).toLowerCase().includes(searchTermLower)) ||
            (record.fileName && String(record.fileName).toLowerCase().includes(searchTermLower));
        if (!match) return false;
      }

      if (bkashFilterState.dateFrom && record.transactionDate) {
        const recordDate = parseDateTime(record.transactionDate);
        const fromDate = new Date(bkashFilterState.dateFrom);
        fromDate.setHours(0,0,0,0);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (bkashFilterState.dateTo && record.transactionDate) {
        const recordDate = parseDateTime(record.transactionDate);
        const toDate = new Date(bkashFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (bkashFilterState.txnTypes && bkashFilterState.txnTypes.length > 0 && !bkashFilterState.txnTypes.includes(record.trxType)) return false;
      
      if (bkashFilterState.drCrTypes && bkashFilterState.drCrTypes.length > 0) {
        const direction = record.transactionDirection || ''; 
        if (!bkashFilterState.drCrTypes.includes(direction)) return false;
      }
      
      const amount = record.transactedAmount;
      if (bkashFilterState.minTxnAmount !== null && bkashFilterState.minTxnAmount !== undefined && amount < bkashFilterState.minTxnAmount) return false;
      if (bkashFilterState.maxTxnAmount !== null && bkashFilterState.maxTxnAmount !== undefined && amount > bkashFilterState.maxTxnAmount) return false;
      
      return true;
    });
  }, [uploadedBkashFiles, bkashFilterState, activeFileTabId, globallyFilteredBkashRecords]);

  const getUniqueBkashValues = useCallback((key: keyof BkashRecord): string[] => {
    const values = new Set<string>();
    allBkashRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allBkashRecords]);

  const contextValue: BkashContextType = {
    uploadedBkashFiles,
    addBkashFile,
    removeBkashFile,
    removeAllBkashFiles,
    updateBkashFileSourceName,
    allBkashRecords,
    filteredBkashRecords,
    globallyFilteredBkashRecords,
    bkashFilterState,
    setBkashFilterState,
    isLoading,
    setIsLoading,
    error,
    setError,
    getUniqueBkashValues,
    activeFileTabId, setActiveFileTabId
  };

  return (
    <BkashContext.Provider value={contextValue}>
      {children}
    </BkashContext.Provider>
  );
};

export const useBkashContext = (): BkashContextType => {
  const context = useContext(BkashContext);
  if (!context) {
    throw new Error('useBkashContext must be used within a BkashProvider');
  }
  return context;
};