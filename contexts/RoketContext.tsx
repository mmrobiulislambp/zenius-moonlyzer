
import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo } from 'react';
import { UploadedRoketFile, RoketRecord, RoketFilterState, RoketContextType } from '../types';
import { parseDateTime } from '../utils/cdrUtils'; // Assuming Roket might also use similar date parsing

const RoketContext = createContext<RoketContextType | undefined>(undefined);

export const RoketProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedRoketFiles, setUploadedRoketFiles] = useState<UploadedRoketFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [roketFilterState, setRoketFilterState] = useState<RoketFilterState>({
    searchTerm: '',
    selectedFileIds: [],
  });
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);


  const addRoketFile = useCallback((file: UploadedRoketFile) => {
    setUploadedRoketFiles((currentUploadedFiles) => {
      const isFirstFileOverall = currentUploadedFiles.length === 0;
      const newUploadedFiles = [...currentUploadedFiles, file];
      
      setRoketFilterState(prevFilterState => ({
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

  const removeRoketFile = useCallback((fileId: string) => {
    setUploadedRoketFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setRoketFilterState(currentFilterState => {
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

  const removeAllRoketFiles = useCallback(() => {
    setUploadedRoketFiles([]);
    setRoketFilterState({
        searchTerm: '',
        selectedFileIds: [],
    });
    setActiveFileTabId(null);
    setError(null);
  }, [setActiveFileTabId]); // Added setActiveFileTabId to dependencies

  const updateRoketFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedRoketFiles(prevFiles => 
      prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f)
    );
  }, []);

  const allRoketRecords = useMemo(() => {
    return uploadedRoketFiles.flatMap((file) => file.records);
  }, [uploadedRoketFiles]);

  const filteredRoketRecords = useMemo(() => {
    let baseRecords: RoketRecord[] = [];

    if (activeFileTabId) {
        const activeFile = uploadedRoketFiles.find(f => f.id === activeFileTabId);
        if (activeFile) {
            baseRecords = activeFile.records;
        } else {
             baseRecords = roketFilterState.selectedFileIds.length > 0
            ? uploadedRoketFiles.filter(f => roketFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records)
            : allRoketRecords;
        }
    } else if (roketFilterState.selectedFileIds.length > 0) {
        baseRecords = uploadedRoketFiles.filter(f => roketFilterState.selectedFileIds.includes(f.id)).flatMap(f => f.records);
    } else {
        baseRecords = allRoketRecords;
    }
    
    let recordsToReturn = baseRecords;
    if (roketFilterState.searchTerm) {
      const searchTermLower = roketFilterState.searchTerm.toLowerCase();
      recordsToReturn = recordsToReturn.filter(record =>
        Object.values(record).some(value =>
          String(value).toLowerCase().includes(searchTermLower)
        )
      );
    }
    return recordsToReturn;
  }, [allRoketRecords, uploadedRoketFiles, roketFilterState, activeFileTabId]);
  
  const getUniqueRoketValues = useCallback((key: keyof RoketRecord): string[] => {
    const values = new Set<string>();
    allRoketRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) {
        values.add(String(val));
      }
    });
    return Array.from(values).sort();
  }, [allRoketRecords]);


  const contextValue: RoketContextType = {
    uploadedRoketFiles,
    addRoketFile,
    removeRoketFile,
    removeAllRoketFiles,
    updateRoketFileSourceName,
    allRoketRecords,
    filteredRoketRecords,
    roketFilterState,
    setRoketFilterState,
    isLoading,
    setIsLoading,
    error,
    setError,
    getUniqueRoketValues,
    activeFileTabId, setActiveFileTabId
  };

  return (
    <RoketContext.Provider value={contextValue}>
      {children}
    </RoketContext.Provider>
  );
};

export const useRoketContext = (): RoketContextType => {
  const context = useContext(RoketContext);
  if (!context) {
    throw new Error('useRoketContext must be used within a RoketProvider');
  }
  return context;
};
