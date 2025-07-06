
import React, { useMemo, useEffect, useContext } from 'react'; // Added useContext
import { FileText, AlertTriangle, Info } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { WatchlistContext } from '../contexts/WatchlistContext'; // Added WatchlistContext
import DataTable from './DataTable';
// FilterControls import removed as it's now part of DataTable
import { Tab as FileTab, Tabs as FileTabs } from './Tabs'; 
import { cn } from '../utils/cn'; // Added cn utility

const DataView: React.FC = () => {
  const { 
    uploadedFiles, 
    filterState, 
    activeFileTabId, 
    setActiveFileTabId,
    isLoading, 
    error 
  } = useCDRContext();
  
  const watchlistContext = useContext(WatchlistContext); // Added WatchlistContext

  const filesForTabs = useMemo(() => {
    return uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id));
  }, [uploadedFiles, filterState.selectedFileIds]);

  useEffect(() => {
    if (filesForTabs.length > 0) {
      const currentActiveFileIsValid = filesForTabs.some(f => f.id === activeFileTabId);
      if (!activeFileTabId || !currentActiveFileIsValid) {
        setActiveFileTabId(filesForTabs[0].id);
      }
    } else {
      if (activeFileTabId !== null) {
         setActiveFileTabId(null); 
      }
    }
  }, [filesForTabs, activeFileTabId, setActiveFileTabId]);
  
  if (isLoading && uploadedFiles.length === 0) { 
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading data...</p></div>;
  }

  if (error) {
    return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  }
  
  if (uploadedFiles.length === 0) {
    return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files to view data.</p></div>;
  }


  return (
    <div className="space-y-5"> {/* Increased spacing */}
      {filesForTabs.length > 0 && (
        <div className="bg-surface p-3 sm:p-3.5 rounded-xl border border-neutral-light shadow-lg"> {/* Enhanced tab container */}
          <h3 className="text-xs sm:text-sm font-medium text-textSecondary mb-2 sm:mb-2.5 ml-1">Select File to View:</h3>
          <FileTabs>
            {filesForTabs.map(file => {
              // Check if any record in this file is watched
              let isFileWatched = false;
              if (watchlistContext && file.records) {
                isFileWatched = file.records.some(record => 
                  watchlistContext.isWatched(record.APARTY) || 
                  (record.BPARTY && watchlistContext.isWatched(record.BPARTY)) ||
                  (record.IMEI && watchlistContext.isWatched(record.IMEI))
                );
              }
              return (
                <FileTab
                  key={file.id}
                  title={file.sourceName || file.name}
                  icon={<FileText size={15} className={cn(isFileWatched && "text-red-500")} />}
                  isActive={activeFileTabId === file.id}
                  onClick={() => setActiveFileTabId(file.id)}
                />
              );
            })}
          </FileTabs>
        </div>
      )}
      
      {filterState.selectedFileIds.length === 0 && uploadedFiles.length > 0 && (
         <div className="p-4 bg-warning-lighter border border-warning-light rounded-lg text-warning-darker flex items-center shadow-md"> {/* Adjusted warning color */}
            <AlertTriangle size={20} className="mr-2.5"/>
            No files selected in filters. Please select files in 'Show Filters' &gt; 'Filter by Files' to view their data.
        </div>
      )}

      {(activeFileTabId === null && filesForTabs.length > 0) && (
         <div className="p-4 bg-info-lighter border border-info-light rounded-lg text-info-dark flex items-center shadow-md"> {/* Adjusted info color */}
            <Info size={20} className="mr-2.5"/>
            Select a file tab above to view its records.
        </div>
      )}
      
      <DataTable />
    </div>
  );
};

export default DataView;