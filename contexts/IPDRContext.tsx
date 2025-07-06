import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { IPDRRecord, UploadedIPDRFile, IPDRFilterState, IPDRContextType } from '../types';
import { parseDateTime } from '../utils/cdrUtils'; 

const IPDRContext = createContext<IPDRContextType | undefined>(undefined);

export const IPDRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedIPDRFiles, setUploadedIPDRFiles] = useState<UploadedIPDRFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [ipdrFilterState, setIPDRFilterState] = useState<IPDRFilterState>({
    searchTerm: '',
    selectedFileIds: [],
  });
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

  const addIPDRFile = useCallback((file: UploadedIPDRFile) => {
    setUploadedIPDRFiles((currentUploadedFiles) => {
      const isFirstFileOverall = currentUploadedFiles.length === 0;
      const newUploadedFiles = [...currentUploadedFiles, file];
      
      setIPDRFilterState(prevFilterState => ({
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


  const removeIPDRFile = useCallback((fileId: string) => {
    setUploadedIPDRFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setIPDRFilterState(currentFilterState => {
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

  const removeAllIPDRFiles = useCallback(() => {
    setUploadedIPDRFiles([]);
    setIPDRFilterState({
        searchTerm: '',
        selectedFileIds: [],
        dateFrom: undefined,
        dateTo: undefined,
        serverIPs: undefined,
        applicationTypes: undefined,
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]);

  const updateIPDRFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedIPDRFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allIPDRRecords = useMemo(() => {
    return uploadedIPDRFiles.flatMap((file) => file.records);
  }, [uploadedIPDRFiles]);

  const globallyFilteredIPDRRecords = useMemo(() => {
    let recordsToProcess = ipdrFilterState.selectedFileIds.length > 0
      ? uploadedIPDRFiles.filter(f => ipdrFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
      : allIPDRRecords;

    return recordsToProcess.filter((record) => {
      const searchTermLower = ipdrFilterState.searchTerm.toLowerCase();
      if (ipdrFilterState.searchTerm) {
        let match = false;
        for (const key in record) {
          if (String(record[key]).toLowerCase().includes(searchTermLower)) {
            match = true;
            break;
          }
        }
        if (!match) return false;
      }

      if (ipdrFilterState.dateFrom && record.startTime) {
        const recordDate = parseDateTime(record.startTime);
        const fromDate = new Date(ipdrFilterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (ipdrFilterState.dateTo && record.startTime) {
        const recordDate = parseDateTime(record.startTime);
        const toDate = new Date(ipdrFilterState.dateTo);
        toDate.setHours(23, 59, 59, 999);
        if (recordDate && recordDate > toDate) return false;
      }
      
      if (ipdrFilterState.serverIPs && ipdrFilterState.serverIPs.length > 0 && record.serverIP && !ipdrFilterState.serverIPs.includes(record.serverIP)) return false;
      if (ipdrFilterState.applicationTypes && ipdrFilterState.applicationTypes.length > 0 && record.applicationType && !ipdrFilterState.applicationTypes.includes(record.applicationType)) return false;

      return true;
    });
  }, [allIPDRRecords, uploadedIPDRFiles, ipdrFilterState]);

  const filteredIPDRRecords = useMemo(() => {
    if (activeFileTabId) {
        const activeFile = uploadedIPDRFiles.find(f => f.id === activeFileTabId);
        if(activeFile) {
            // Apply global filters to the records of the active file
            return activeFile.records.filter((record) => {
                 const searchTermLower = ipdrFilterState.searchTerm.toLowerCase();
                if (ipdrFilterState.searchTerm) {
                    let match = false;
                    for (const key in record) {
                        if (String(record[key]).toLowerCase().includes(searchTermLower)) {
                            match = true;
                            break;
                        }
                    }
                    if (!match) return false;
                }
                // ... re-apply other filters ...
                return true;
            });
        }
    }
    return globallyFilteredIPDRRecords;
  }, [globallyFilteredIPDRRecords, activeFileTabId, uploadedIPDRFiles, ipdrFilterState]);


  const getUniqueIPDRValues = useCallback((key: keyof IPDRRecord): string[] => {
    const values = new Set<string>();
    allIPDRRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allIPDRRecords]);

  return (
    <IPDRContext.Provider value={{ 
      uploadedIPDRFiles, addIPDRFile, removeIPDRFile, removeAllIPDRFiles, updateIPDRFileSourceName,
      allIPDRRecords, filteredIPDRRecords, globallyFilteredIPDRRecords,
      ipdrFilterState, setIPDRFilterState,
      isLoading, setIsLoading, error, setError,
      getUniqueIPDRValues,
      activeFileTabId, setActiveFileTabId
    }}>
      {children}
    </IPDRContext.Provider>
  );
};

export const useIPDRContext = (): IPDRContextType => {
  const context = useContext(IPDRContext);
  if (!context) {
    throw new Error('useIPDRContext must be used within an IPDRProvider');
  }
  return context;
};
