import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { SMSRecord, UploadedSMSFile, SMSFilterState, SMSContextType } from '../types';
import { parseDateTime } from '../utils/cdrUtils';

const SMSContext = createContext<SMSContextType | undefined>(undefined);

export const SMSProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedSMSFiles, setUploadedSMSFiles] = useState<UploadedSMSFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [smsFilterState, setSMSFilterState] = useState<SMSFilterState>({
    searchTerm: '',
    filterByNumber: '',
    contentKeyword: '',
    selectedFileIds: [],
    dateFrom: undefined,
    dateTo: undefined,
    direction: '',
  });
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

  const addSMSFile = useCallback((file: UploadedSMSFile) => {
    setUploadedSMSFiles((currentUploadedFiles) => {
        const isFirstFileOverall = currentUploadedFiles.length === 0;
        const newUploadedFiles = [...currentUploadedFiles, file];
        
        setSMSFilterState(prevFilterState => ({
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


  const removeSMSFile = useCallback((fileId: string) => {
    setUploadedSMSFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setSMSFilterState(currentFilterState => {
        const newSelectedFileIds = currentFilterState.selectedFileIds.filter(id => id !== fileId);
        if (activeFileTabId === fileId) {
             if (newSelectedFileIds.length > 0) {
                const stillSelectedAndRemaining = newUploadedFiles.filter(f => newSelectedFileIds.includes(f.id));
                setActiveFileTabId(stillSelectedAndRemaining.length > 0 ? stillSelectedAndRemaining[0].id : newSelectedFileIds[0]);
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
  
  const removeAllSMSFiles = useCallback(() => {
    setUploadedSMSFiles([]);
    setSMSFilterState({
        searchTerm: '',
        filterByNumber: '',
        contentKeyword: '',
        selectedFileIds: [],
        dateFrom: undefined,
        dateTo: undefined,
        direction: '',
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]);

  const updateSMSFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedSMSFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allSMSRecords = useMemo(() => {
    return uploadedSMSFiles.flatMap((file) => file.records);
  }, [uploadedSMSFiles]);

  const globallyFilteredSMSRecords = useMemo(() => {
    let recordsToProcess = smsFilterState.selectedFileIds.length > 0
      ? uploadedSMSFiles.filter(f => smsFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
      : allSMSRecords;

    return recordsToProcess.filter((record) => {
      const searchTermLower = smsFilterState.searchTerm.toLowerCase();
      const filterByNumberLower = smsFilterState.filterByNumber.toLowerCase();
      const contentKeywordLower = smsFilterState.contentKeyword.toLowerCase();

      if (smsFilterState.searchTerm) {
        let generalMatch = false;
        if (record.Initiator && record.Initiator.toLowerCase().includes(searchTermLower)) generalMatch = true;
        if (!generalMatch && record.Recipient && record.Recipient.toLowerCase().includes(searchTermLower)) generalMatch = true;
        if (!generalMatch && record.Content && record.Content.toLowerCase().includes(searchTermLower)) generalMatch = true;
        if (!generalMatch) return false;
      }
      
      if (smsFilterState.filterByNumber) {
        let numberMatch = false;
        if (record.Initiator && record.Initiator.toLowerCase().includes(filterByNumberLower)) numberMatch = true;
        if (!numberMatch && record.Recipient && record.Recipient.toLowerCase().includes(filterByNumberLower)) numberMatch = true;
        if (!numberMatch) return false;
      }

      if (smsFilterState.contentKeyword) {
        if (!record.Content || !record.Content.toLowerCase().includes(contentKeywordLower)) return false;
      }
      
      if (smsFilterState.dateFrom && record.Timestamp) {
        const recordDate = parseDateTime(record.Timestamp); 
        const fromDate = new Date(smsFilterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (smsFilterState.dateTo && record.Timestamp) {
        const recordDate = parseDateTime(record.Timestamp);
        const toDate = new Date(smsFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (smsFilterState.direction && record.OriginalDirection !== smsFilterState.direction) return false;
      
      return true;
    });
  }, [allSMSRecords, uploadedSMSFiles, smsFilterState]);

  const filteredSMSRecords = useMemo(() => {
     // SMS views don't currently use file tabs, so this is an alias for global filtering.
    return globallyFilteredSMSRecords;
  }, [globallyFilteredSMSRecords]);


  const getUniqueSMSValues = useCallback((key: keyof SMSRecord): string[] => {
    const values = new Set<string>();
    allSMSRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allSMSRecords]);

  return (
    <SMSContext.Provider value={{ 
      uploadedSMSFiles, addSMSFile, removeSMSFile, removeAllSMSFiles, updateSMSFileSourceName,
      allSMSRecords, filteredSMSRecords, globallyFilteredSMSRecords,
      smsFilterState, setSMSFilterState,
      isLoading, setIsLoading, error, setError,
      getUniqueSMSValues,
      activeFileTabId, setActiveFileTabId
    }}>
      {children}
    </SMSContext.Provider>
  );
};

export const useSMSContext = (): SMSContextType => {
  const context = useContext(SMSContext);
  if (!context) {
    throw new Error('useSMSContext must be used within an SMSProvider');
  }
  return context;
};