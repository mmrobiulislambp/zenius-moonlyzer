
import React, { useState, useMemo, useContext } from 'react'; // Added useContext
import { ChevronDown, ChevronUp, Filter as FilterIcon, Download } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { WatchlistContext } from '../contexts/WatchlistContext'; // Added WatchlistContext
import { CDRRecord, SortConfig, UploadedFile, EXPECTED_HEADERS } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import FilterControls from './FilterControls'; 
import { downloadCSV } from '../utils/downloadUtils'; 
import { cn } from '../utils/cn'; // Added cn utility

const ROWS_PER_PAGE = 20; // Increased rows per page

const DataTable: React.FC = () => {
  const { 
    filteredRecords, 
    isLoading, 
    error, 
    uploadedFiles, 
    activeFileTabId, 
    filterState 
  } = useCDRContext();
  
  const watchlistContext = useContext(WatchlistContext); // Added WatchlistContext
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'START_DTTIME', direction: 'descending' });
  const [showFilters, setShowFilters] = useState(false);

  const uniqueFileHeaders = useMemo(() => {
    const headersSet = new Set<string>();
    
    const activeFile = activeFileTabId ? uploadedFiles.find(f => f.id === activeFileTabId) : undefined;

    if (activeFile) {
        activeFile.headers.forEach(h => headersSet.add(h));
    } else {
        let targetFilesForHeaders = uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id));
        if (targetFilesForHeaders.length === 0 && uploadedFiles.length > 0) {
            targetFilesForHeaders = uploadedFiles; // Default to all uploaded if no specific files selected by filter
        }
        targetFilesForHeaders.forEach(file => file.headers.forEach(h => headersSet.add(h)));
    }

    if (headersSet.size === 0 && uploadedFiles.length > 0) { // If still no headers but files exist, use expected
        EXPECTED_HEADERS.forEach(h => headersSet.add(h as string));
    } else if (uploadedFiles.length === 0) { // If no files, use expected as placeholder
        EXPECTED_HEADERS.forEach(h => headersSet.add(h as string));
    }
    
    const sortedHeaders = Array.from(headersSet).sort((a,b) => {
        const idxA = EXPECTED_HEADERS.indexOf(a as keyof Omit<CDRRecord, 'id' | 'sourceFileId' | 'fileName' | 'rowIndex'>);
        const idxB = EXPECTED_HEADERS.indexOf(b as keyof Omit<CDRRecord, 'id' | 'sourceFileId' | 'fileName' | 'rowIndex'>);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
    });
    return sortedHeaders;
  }, [uploadedFiles, activeFileTabId, filterState.selectedFileIds]);


  const sortedRecords = useMemo(() => {
    let sortableItems = [...filteredRecords]; 
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA = a[sortConfig.key!];
        let valB = b[sortConfig.key!];

        if (sortConfig.key === 'START_DTTIME') {
          valA = parseDateTime(a.START_DTTIME)?.getTime() ?? 0;
          valB = parseDateTime(b.START_DTTIME)?.getTime() ?? 0;
        } else if (sortConfig.key === 'CALL_DURATION') {
          valA = parseInt(a.CALL_DURATION, 10) || 0;
          valB = parseInt(b.CALL_DURATION, 10) || 0;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (valA > valB) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableItems;
  }, [filteredRecords, sortConfig]);

  const currentTableData = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedRecords.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedRecords]);

  const totalPages = Math.ceil(sortedRecords.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof CDRRecord) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof CDRRecord) => {
    if (sortConfig.key !== key) {
      return <ChevronDown className="h-4 w-4 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 transition-opacity" />;
    }
    return sortConfig.direction === 'ascending' ? (
      <ChevronUp className="h-4 w-4 text-primary-dark" />
    ) : (
      <ChevronDown className="h-4 w-4 text-primary-dark" />
    );
  };
  
  const handleExportData = () => {
    if (sortedRecords.length === 0) {
      alert("No data to export.");
      return;
    }
    const headersToExport = [...uniqueFileHeaders];
    if (!activeFileTabId && uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id)).length > 1 && uniqueFileHeaders.length > 0) {
        headersToExport.push("Source File"); // Add "Source File" only if multiple files are effectively being displayed
    }
    const dataToExport = sortedRecords.map(record => {
        const row = headersToExport.map(headerKey => {
            if (headerKey === "Source File") return record.fileName;
            return headerKey === 'START_DTTIME' ? formatDate(record[headerKey as keyof CDRRecord]) : record[headerKey as keyof CDRRecord] ?? 'N/A'
        });
        return row;
    });
    const activeFile = activeFileTabId ? uploadedFiles.find(f => f.id === activeFileTabId) : null;
    const baseFilename = activeFile ? activeFile.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() 
                        : (uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id)).length === 1 
                            ? uploadedFiles.find(f => filterState.selectedFileIds.includes(f.id))!.sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase() 
                            : "data_view_export");
    downloadCSV(`${baseFilename}.csv`, dataToExport, headersToExport);
  };


  if (isLoading && filteredRecords.length === 0 && uploadedFiles.length > 0) {
    return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Applying filters...</p></div>;
  }

  if (error) {
    return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  }
  
  const noFileSelectedForDisplay = uploadedFiles.length > 0 && !activeFileTabId && filterState.selectedFileIds.length === 0;

  if (filteredRecords.length === 0 && uploadedFiles.length > 0 && (activeFileTabId || filterState.selectedFileIds.length > 0) ) {
    return (
      <div>
        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-md"
          >
            <FilterIcon size={18} className="mr-2" />
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
        {showFilters && <FilterControls />}
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary mt-4 min-h-[100px] flex items-center justify-center">
            No records match the current filters for the selected file tab.
        </div>
      </div>
    );
  }
  
  if (noFileSelectedForDisplay) {
      return (
        <div>
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark transition-colors shadow-md"
              >
                <FilterIcon size={18} className="mr-2" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
              </button>
            </div>
            {showFilters && <FilterControls />}
            <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark mt-4 min-h-[100px] flex items-center justify-center">
                Please select a file tab or files in the 'Filter by Files' section to view data.
            </div>
        </div>
      )
  }


  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-4 mb-4">
        <h3 className="text-xl font-semibold text-textPrimary">
          Displaying {sortedRecords.length} Records {activeFileTabId ? `for ${uploadedFiles.find(f=>f.id === activeFileTabId)?.sourceName || ''}` : (filterState.selectedFileIds.length === 1 ? `for ${uploadedFiles.find(f=>filterState.selectedFileIds.includes(f.id))?.sourceName || ''}`: '(Across Selected Files)')}
        </h3>
        <div className="flex gap-2.5"> {/* Increased gap */}
            {sortedRecords.length > 0 && (
              <button
                onClick={handleExportData}
                className="flex items-center px-4 py-2 bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 transition-colors shadow-md text-sm"
                title="Export current table data to CSV"
              >
                <Download size={16} className="mr-1.5" />
                Export CSV
              </button>
            )}
            <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 transition-colors shadow-md text-sm"
              >
                <FilterIcon size={16} className="mr-1.5" />
                {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
        </div>
      </div>

      {showFilters && <FilterControls />}

      { (sortedRecords.length > 0 || (isLoading && sortedRecords.length > 0)) && (
        <>
          <div className="overflow-x-auto bg-surface shadow-xl rounded-xl border border-neutral-light">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0 z-10"> {/* Sticky header */}
                <tr>
                  {uniqueFileHeaders.map((key) => (
                    <th
                      key={key}
                      scope="col"
                      onClick={() => requestSort(key as keyof CDRRecord)}
                      className="group px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between">
                        {key.replace(/_/g, ' ')}
                        {renderSortIcon(key as keyof CDRRecord)}
                      </div>
                    </th>
                  ))}
                  {!activeFileTabId && uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id)).length > 1 && uniqueFileHeaders.length > 0 && (
                     <th scope="col" className="px-3.5 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider whitespace-nowrap">Source File</th>
                  )}
                </tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {currentTableData.map((record, index) => {
                  const isAPartyWatched = watchlistContext?.isWatched(record.APARTY);
                  const isBPartyWatched = record.BPARTY && watchlistContext?.isWatched(record.BPARTY);
                  const isImeiWatched = record.IMEI && watchlistContext?.isWatched(record.IMEI);
                  const isRowWatched = isAPartyWatched || isBPartyWatched || isImeiWatched;
                  const watchedSuspectName = isAPartyWatched?.name || isBPartyWatched?.name || isImeiWatched?.name;

                  return (
                    <tr 
                        key={record.id} 
                        className={cn(
                            `transition-colors hover:bg-primary-lighter/20`,
                            index % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/60',
                            isRowWatched && 'relative border-l-4 border-red-500 bg-red-50 hover:bg-red-100/70'
                        )}
                        title={isRowWatched ? `Watched Suspect: ${watchedSuspectName}` : undefined}
                    >
                      {uniqueFileHeaders.map(headerKey => (
                        <td key={`${record.id}-${headerKey}`} className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary"> {/* Adjusted padding */}
                          {headerKey === 'START_DTTIME' ? formatDate(record[headerKey as keyof CDRRecord]) : record[headerKey as keyof CDRRecord] ?? 'N/A'}
                        </td>
                      ))}
                      {!activeFileTabId && uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id)).length > 1 && uniqueFileHeaders.length > 0 && (
                          <td className="px-3.5 py-2.5 whitespace-nowrap text-xs text-textSecondary truncate max-w-[150px]" title={record.fileName}>{record.fileName}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1"> {/* Added slight horizontal padding */}
              <span className="text-sm text-textSecondary mb-2 sm:mb-0">
                Page {currentPage} of {totalPages} (Total: {sortedRecords.length} records)
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage((prev) => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-light"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((prev) => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary-light"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DataTable;