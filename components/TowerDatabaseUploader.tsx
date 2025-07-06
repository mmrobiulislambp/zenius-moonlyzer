
import React, { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud, DatabaseZap, Trash2, Info, AlertTriangle, ChevronDown, ChevronUp, ListFilter, MapPin, SmartphoneNfc, Globe } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { TowerInfo } from '../types';
import { parseExcelFile } from '../utils/excelParser'; // Assuming parseExcelFile can handle CSV as well, or adapt for CSV

const ROWS_PER_PAGE = 10;

// Expected headers for tower database file (case-insensitive matching for some common variations)
const TOWER_DB_EXPECTED_HEADERS_MAP: Record<string, keyof Omit<TowerInfo, 'id'>> = {
  'lac': 'lac', 'locationareacode': 'lac',
  'ci': 'ci', 'cellid': 'ci', 'cell_id': 'ci', 'celltowerid': 'ci',
  'latitude': 'latitude', 'lat': 'latitude',
  'longitude': 'longitude', 'lon': 'longitude', 'lng': 'longitude',
  'address': 'address', 'siteaddress': 'address',
  'operator': 'operator',
  'technology': 'technology', 'tech': 'technology', 'radio': 'technology',
};

interface TowerDBSortConfig {
  key: keyof TowerInfo | null;
  direction: 'ascending' | 'descending';
}

const TowerDatabaseUploader: React.FC = () => {
  const { towerDatabase, loadTowerDatabase, clearTowerDatabase, isLoading: contextIsLoading, setError: contextSetError, error: contextError } = useLACContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<TowerDBSortConfig>({ key: 'lac', direction: 'ascending' });
  const [searchTerm, setSearchTerm] = useState('');


  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    setIsLoading(true);
    setError(null);
    contextSetError(null); // Clear context error too

    if (acceptedFiles.length === 0) {
        setIsLoading(false);
        return;
    }
    const file = acceptedFiles[0]; // Process one file at a time for tower DB

    try {
      const { records: rawDataArray, headers: rawHeadersFromFile } = await parseExcelFile(file);
      
      if (rawDataArray.length === 0 || rawHeadersFromFile.length === 0) {
        throw new Error("File is empty or has no headers.");
      }

      // Map raw headers to TowerInfo keys
      const headerMapping: { [rawHeader: string]: keyof Omit<TowerInfo, 'id'> } = {};
      rawHeadersFromFile.forEach(rawHeader => {
        const normalizedHeader = rawHeader.toLowerCase().replace(/\s+/g, '');
        for (const [expectedKey, towerInfoKey] of Object.entries(TOWER_DB_EXPECTED_HEADERS_MAP)) {
          if (normalizedHeader.includes(expectedKey)) {
            headerMapping[rawHeader] = towerInfoKey;
            break;
          }
        }
      });
      
      // Check for essential headers (LAC, CI, Latitude, Longitude)
      const mappedKeys = Object.values(headerMapping);
      if (!mappedKeys.includes('lac') || !mappedKeys.includes('ci') || !mappedKeys.includes('latitude') || !mappedKeys.includes('longitude')) {
          throw new Error("Missing essential headers: LAC, CI, Latitude, and Longitude must be present and identifiable.");
      }


      const newTowerData: TowerInfo[] = rawDataArray.map((row, index) => {
        const towerEntry: Partial<TowerInfo> = { id: uuidv4() };
        rawHeadersFromFile.forEach((rawHeader, colIndex) => {
          const towerInfoKey = headerMapping[rawHeader];
          if (towerInfoKey) {
            const value = row[colIndex];
            if (towerInfoKey === 'latitude' || towerInfoKey === 'longitude') {
              (towerEntry as any)[towerInfoKey] = parseFloat(String(value));
            } else {
              (towerEntry as any)[towerInfoKey] = String(value).trim();
            }
          }
        });
        // Ensure essential fields are numbers and valid
        if (isNaN(towerEntry.latitude!) || isNaN(towerEntry.longitude!)) {
            console.warn(`Skipping tower record at row ${index + 1} due to invalid latitude/longitude.`);
            return null;
        }
        if (!towerEntry.lac || !towerEntry.ci) {
            console.warn(`Skipping tower record at row ${index + 1} due to missing LAC/CI.`);
            return null;
        }
        return towerEntry as TowerInfo;
      }).filter(t => t !== null) as TowerInfo[];

      if (newTowerData.length === 0) {
          throw new Error("No valid tower data could be extracted. Check file format, headers, and data types (especially Lat/Lon).");
      }

      loadTowerDatabase(newTowerData);
      setError(`Successfully loaded ${newTowerData.length} tower entries. This will be used to enrich CDR/LAC location data.`);

    } catch (err) {
      console.error('Error processing tower database file:', err);
      const friendlyMessage = err instanceof Error ? err.message : 'Unknown error during file processing.';
      setError(`Error: ${friendlyMessage}`);
    } finally {
      setIsLoading(false);
    }
  }, [loadTowerDatabase, contextSetError]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: false,
  });
  
  const filteredTowerData = useMemo(() => {
    if (!searchTerm) return towerDatabase;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return towerDatabase.filter(tower => 
        tower.lac.toLowerCase().includes(lowerSearchTerm) ||
        tower.ci.toLowerCase().includes(lowerSearchTerm) ||
        (tower.address && tower.address.toLowerCase().includes(lowerSearchTerm)) ||
        (tower.operator && tower.operator.toLowerCase().includes(lowerSearchTerm)) ||
        (tower.technology && tower.technology.toLowerCase().includes(lowerSearchTerm))
    );
  }, [towerDatabase, searchTerm]);

  const sortedTowerData = useMemo(() => {
    return [...filteredTowerData].sort((a, b) => {
        if (!sortConfig.key) return 0;
        const valA = a[sortConfig.key];
        const valB = b[sortConfig.key];
        let comparison = 0;
        if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
  }, [filteredTowerData, sortConfig]);

  const paginatedData = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedTowerData.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedTowerData, currentPage]);
  const totalPages = Math.ceil(sortedTowerData.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof TowerInfo) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') direction = 'descending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof TowerInfo) => {
    if (sortConfig.key !== key) return <ChevronDown size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const tableHeaders: { key: keyof TowerInfo; label: string; icon?: React.ReactNode }[] = [
    { key: 'lac', label: 'LAC', icon: <Globe size={14}/> },
    { key: 'ci', label: 'Cell ID', icon: <SmartphoneNfc size={14}/> },
    { key: 'latitude', label: 'Latitude', icon: <MapPin size={14}/> },
    { key: 'longitude', label: 'Longitude', icon: <MapPin size={14}/> },
    { key: 'address', label: 'Address', icon: <MapPin size={14}/> },
    { key: 'operator', label: 'Operator', icon: <ListFilter size={14}/> },
    { key: 'technology', label: 'Technology', icon: <ListFilter size={14}/> },
  ];


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <DatabaseZap size={24} className="mr-2.5 text-primary" /> Cell Tower Database Management
        </div>
        <p className="text-sm text-textSecondary">Upload and manage your cell tower location database (CSV/Excel). This data will be used to enrich CDR and LAC records with geographic information.</p>
        <p className="text-xs text-amber-600 mt-1"><Info size={12} className="inline mr-1"/>Expected headers: LAC, CI (or CellID), Latitude, Longitude. Optional: Address, Operator, Technology.</p>
      </div>

      <div className="bg-surface shadow-lg rounded-xl p-4 sm:p-6 border border-neutral-light">
        <h3 className="text-lg font-semibold text-textPrimary mb-3">Upload Tower Database File</h3>
        {error && <div className={`mb-4 p-3 rounded-md border ${error.startsWith("Successfully") ? 'bg-success-lighter text-success-darker border-success-light' : 'bg-danger-lighter text-danger-darker border-danger-light'}`}>{error}</div>}
        
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-all ease-in-out
                      ${isDragActive ? 'border-primary-dark bg-primary-lighter/60 scale-105' : 'border-neutral-light hover:border-primary'}`}
        >
          <input {...getInputProps()} />
          <UploadCloud className={`mx-auto h-10 w-10 mb-2 ${isDragActive ? 'text-primary-dark' : 'text-primary/90'}`} />
          {isDragActive ? (
            <p className="text-primary-dark font-semibold">Drop the file here ...</p>
          ) : (
            <p className="text-textSecondary text-sm">Drag 'n' drop tower database file here, or click to select (.xlsx, .xls, .csv)</p>
          )}
        </div>
        {isLoading && <p className="text-sm text-textSecondary mt-2 text-center">Processing file...</p>}
      </div>

      {towerDatabase.length > 0 && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-textPrimary">Loaded Tower Data ({towerDatabase.length} entries)</h3>
            <button
              onClick={() => { if(window.confirm("Are you sure you want to clear the tower database?")) clearTowerDatabase(); }}
              className="px-4 py-2 text-xs bg-danger text-white rounded-lg hover:bg-danger-dark flex items-center shadow-sm"
            >
              <Trash2 size={14} className="mr-1.5"/> Clear Database
            </button>
          </div>
          <div className="mb-3">
            <input 
                type="text" 
                placeholder="Search loaded towers (LAC, CI, Address...)" 
                value={searchTerm} 
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full p-2 border border-neutral-light rounded-md text-sm shadow-sm"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0">
                <tr>{tableHeaders.map(h => <th key={h.key as string} onClick={() => requestSort(h.key!)} className="group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key!)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedData.map((tower) => (
                  <tr key={tower.id} className="hover:bg-neutral-lightest/50">
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{tower.lac}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{tower.ci}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{tower.latitude.toFixed(6)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{tower.longitude.toFixed(6)}</td>
                    <td className="px-3 py-2 text-xs text-textSecondary truncate max-w-xs" title={tower.address}>{tower.address || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{tower.operator || 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{tower.technology || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-3 border-t border-neutral-light text-xs">
              <span className="text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedTowerData.length} towers)</span>
              <div className="flex gap-2">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
       {towerDatabase.length === 0 && !isLoading && !error && (
        <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2" />
            <p>No tower database loaded. Upload a file to enable location enrichment for CDR/LAC records.</p>
        </div>
      )}

    </div>
  );
};

export default TowerDatabaseUploader;
