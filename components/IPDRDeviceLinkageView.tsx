
import React, { useState, useMemo } from 'react';
import { Smartphone, Info, UserSearch, ListFilter, Download, BarChart2, Clock, Server as ServerIcon, FileText, ChevronUp, ChevronDown, AlertTriangle, Loader2, Globe as GlobeIcon, Users, Search } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { IPDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;

const formatBytes = (bytes?: number, decimals = 2): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

interface AssociatedEntity {
    id: string;
    type: 'msisdn' | 'imsi' | 'publicIP' | 'serverIP';
    firstSeenWithImei?: Date;
    lastSeenWithImei?: Date;
    recordCountWithImei: number;
    dataVolumeWithImei: number;
}

interface ImeiProfile {
    imei: string;
    totalRecords: number;
    firstSeen?: Date;
    lastSeen?: Date;
    associatedUsers: AssociatedEntity[];
    associatedIPs: AssociatedEntity[];
}

const IPDRDeviceLinkageView: React.FC = () => {
  const { filteredIPDRRecords, isLoading: contextIsLoading, error: contextError, uploadedIPDRFiles, getUniqueIPDRValues } = useIPDRContext();
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [profileData, setProfileData] = useState<ImeiProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [usersPage, setUsersPage] = useState(1);
  const [ipsPage, setIpsPage] = useState(1);
  const [usersSort, setUsersSort] = useState<{ key: keyof AssociatedEntity; direction: 'asc' | 'desc' }>({ key: 'recordCountWithImei', direction: 'desc' });
  const [ipsSort, setIpsSort] = useState<{ key: keyof AssociatedEntity; direction: 'asc' | 'desc' }>({ key: 'recordCountWithImei', direction: 'desc' });

  const uniqueImeisForDropdown = useMemo(() => {
    return getUniqueIPDRValues('imeisv').filter(id => id && id.trim() !== '');
  }, [getUniqueIPDRValues]);


  const handleSearch = (imeiToSearchOverride?: string) => {
    const imeiToProcess = imeiToSearchOverride || searchTerm.trim();
    if (!imeiToProcess) {
      setSearchError("Please enter or select an IMEI to search.");
      setProfileData(null);
      return;
    }
    setIsLoading(true);
    setSearchError(null);
    setProfileData(null);
    setUsersPage(1);
    setIpsPage(1);

    const relatedRecords = filteredIPDRRecords.filter(r => r.imeisv === imeiToProcess);

    if (relatedRecords.length === 0) {
      setSearchError(`No records found for IMEI: ${imeiToProcess}`);
      setIsLoading(false);
      return;
    }

    let imeiFirstSeen: Date | undefined = undefined;
    let imeiLastSeen: Date | undefined = undefined;
    
    const usersMap = new Map<string, AssociatedEntity>();
    const ipsMap = new Map<string, AssociatedEntity>();

    relatedRecords.forEach(r => {
      const recordTime = r.startTime ? parseDateTime(r.startTime) : (r.natBeginTime ? parseDateTime(r.natBeginTime) : undefined);
      if (recordTime) {
        if (!imeiFirstSeen || recordTime < imeiFirstSeen) imeiFirstSeen = recordTime;
        if (!imeiLastSeen || recordTime > imeiLastSeen) imeiLastSeen = recordTime;
      }
      
      const recordVolume = (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);

      const processEntity = (map: Map<string, AssociatedEntity>, id: string, type: AssociatedEntity['type']) => {
        if (!id || id.trim() === "") return; // Ensure ID is valid before processing
        let entity = map.get(id);
        if (!entity) {
          entity = { id, type, recordCountWithImei: 0, dataVolumeWithImei: 0 };
        }
        entity.recordCountWithImei += 1;
        entity.dataVolumeWithImei += recordVolume;
        if (recordTime) {
          if (!entity.firstSeenWithImei || recordTime < entity.firstSeenWithImei) entity.firstSeenWithImei = recordTime;
          if (!entity.lastSeenWithImei || recordTime > entity.lastSeenWithImei) entity.lastSeenWithImei = recordTime;
        }
        map.set(id, entity);
      };

      if (r.msisdn) processEntity(usersMap, r.msisdn, 'msisdn');
      if (r.imsi) processEntity(usersMap, r.imsi, 'imsi');
      if (r.publicIP) processEntity(ipsMap, r.publicIP, 'publicIP');
      if (r.serverIP) processEntity(ipsMap, r.serverIP, 'serverIP');
    });
    
    setProfileData({
      imei: imeiToProcess,
      totalRecords: relatedRecords.length,
      firstSeen: imeiFirstSeen,
      lastSeen: imeiLastSeen,
      associatedUsers: Array.from(usersMap.values()),
      associatedIPs: Array.from(ipsMap.values()),
    });
    setIsLoading(false);
  };
  
  const handleDropdownChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedValue = e.target.value;
    setSearchTerm(selectedValue); // Update text input as well
    if (selectedValue) {
      handleSearch(selectedValue); // Trigger search immediately
    } else {
      setProfileData(null); // Clear profile if "-- Select IMEI --" is chosen
      setSearchError(null);
    }
  };


  const sortAndPaginateEntities = (
    entities: AssociatedEntity[],
    sortConfig: { key: keyof AssociatedEntity; direction: 'asc' | 'desc' },
    currentPage: number
  ) => {
    const sorted = [...entities].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];
      let comparison = 0;
      if (valA instanceof Date && valB instanceof Date) {
        comparison = valA.getTime() - valB.getTime();
      } else if (typeof valA === 'number' && typeof valB === 'number') {
        comparison = valA - valB;
      } else if (typeof valA === 'string' && typeof valB === 'string') {
        comparison = valA.localeCompare(valB);
      }
      return sortConfig.direction === 'asc' ? comparison : -comparison;
    });
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return {
      paginatedData: sorted.slice(startIndex, startIndex + ROWS_PER_PAGE),
      totalPages: Math.ceil(sorted.length / ROWS_PER_PAGE),
      fullSortedData: sorted,
    };
  };

  const { paginatedData: paginatedUsers, totalPages: totalUsersPages, fullSortedData: fullSortedUsers } = sortAndPaginateEntities(profileData?.associatedUsers || [], usersSort, usersPage);
  const { paginatedData: paginatedIPs, totalPages: totalIPsPages, fullSortedData: fullSortedIPs } = sortAndPaginateEntities(profileData?.associatedIPs || [], ipsSort, ipsPage);

  const requestSortForTable = (
    tableType: 'users' | 'ips', 
    key: keyof AssociatedEntity
  ) => {
    const currentSort = tableType === 'users' ? usersSort : ipsSort;
    const setSort = tableType === 'users' ? setUsersSort : setIpsSort;
    const setPage = tableType === 'users' ? setUsersPage : setIpsPage;

    let direction: 'asc' | 'desc' = 'desc';
    if (currentSort.key === key && currentSort.direction === 'desc') {
      direction = 'asc';
    }
    setSort({ key, direction });
    setPage(1);
  };

  const renderSortIcon = (key: keyof AssociatedEntity, currentSort: { key: keyof AssociatedEntity; direction: 'asc' | 'desc' }) => {
    if (currentSort.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return currentSort.direction === 'asc' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExport = (type: 'users' | 'ips') => {
    if (!profileData) return;
    const dataToExport = type === 'users' ? fullSortedUsers : fullSortedIPs;
    const filename = `imei_linkage_${profileData.imei}_${type}.csv`;
    
    const headers = ["Identifier", "Type", "Record Count with IMEI", "Data Volume with IMEI", "First Seen with IMEI", "Last Seen with IMEI"];
    const csvData = dataToExport.map(d => [
        d.id,
        d.type,
        d.recordCountWithImei.toString(),
        formatBytes(d.dataVolumeWithImei),
        d.firstSeenWithImei ? formatDate(d.firstSeenWithImei.toISOString()) : 'N/A',
        d.lastSeenWithImei ? formatDate(d.lastSeenWithImei.toISOString()) : 'N/A',
    ]);
    downloadCSV(filename, csvData, headers);
  };
  
  const associatedUsersTableHeaders: { key: keyof AssociatedEntity; label: string; icon?: React.ReactNode }[] = [
    { key: 'id', label: 'Identifier', icon: <UserSearch size={14}/> },
    { key: 'type', label: 'Type', icon: <Info size={14}/> },
    { key: 'recordCountWithImei', label: 'Records w/ IMEI', icon: <ListFilter size={14}/> },
    { key: 'dataVolumeWithImei', label: 'Data Volume w/ IMEI', icon: <BarChart2 size={14}/> },
    { key: 'firstSeenWithImei', label: 'First Seen w/ IMEI', icon: <Clock size={14}/> },
    { key: 'lastSeenWithImei', label: 'Last Seen w/ IMEI', icon: <Clock size={14}/> },
  ];
  const associatedIPsTableHeaders: { key: keyof AssociatedEntity; label: string; icon?: React.ReactNode }[] = [
    { key: 'id', label: 'IP Address', icon: <GlobeIcon size={14}/> },
    { key: 'type', label: 'Type (IP)', icon: <Info size={14}/> },
    { key: 'recordCountWithImei', label: 'Records w/ IMEI', icon: <ListFilter size={14}/> },
    { key: 'dataVolumeWithImei', label: 'Data Volume w/ IMEI', icon: <BarChart2 size={14}/> },
    { key: 'firstSeenWithImei', label: 'First Seen w/ IMEI', icon: <Clock size={14}/> },
    { key: 'lastSeenWithImei', label: 'Last Seen w/ IMEI', icon: <Clock size={14}/> },
  ];

  const renderEntityTable = (
    title: string,
    entities: AssociatedEntity[],
    paginatedData: AssociatedEntity[],
    totalPages: number,
    currentPage: number,
    setCurrentPage: (page: number) => void,
    sortConfig: { key: keyof AssociatedEntity; direction: 'asc' | 'desc' },
    requestSortFn: (key: keyof AssociatedEntity) => void,
    exportType: 'users' | 'ips',
    headers: { key: keyof AssociatedEntity; label: string; icon?: React.ReactNode }[]
  ) => (
    <div className="bg-surface p-4 sm:p-5 rounded-xl shadow-lg border border-neutral-light">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
        <h4 className="text-base font-semibold text-textPrimary mb-2 sm:mb-0 flex items-center">
            {exportType === 'users' ? <Users size={18} className="mr-2 text-primary"/> : <ServerIcon size={18} className="mr-2 text-primary"/>}
            {title} ({entities.length})
        </h4>
        {entities.length > 0 && <button onClick={() => handleExport(exportType)} className="px-3 py-1.5 text-xs bg-info-lighter text-info-dark rounded-lg hover:bg-info-light/50 flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export Table</button>}
      </div>
      {entities.length === 0 ? (
        <p className="text-sm text-textSecondary text-center py-4">No {exportType === 'users' ? 'users' : 'IPs'} found associated with this IMEI.</p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light text-xs">
              <thead className="bg-neutral-lightest">
                <tr>{headers.map(h => <th key={h.key} onClick={() => requestSortFn(h.key)} className="px-3 py-2.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light group"><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label} {renderSortIcon(h.key, sortConfig)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedData.map(item => (
                  <tr key={item.id + item.type} className="hover:bg-neutral-lightest/50">
                    <td className="px-3 py-2 whitespace-nowrap text-textPrimary font-medium">{item.id}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-textSecondary">{item.type}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-textSecondary">{item.recordCountWithImei}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-textSecondary">{formatBytes(item.dataVolumeWithImei)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-textSecondary">{item.firstSeenWithImei ? formatDate(item.firstSeenWithImei.toISOString()) : 'N/A'}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-textSecondary">{item.lastSeenWithImei ? formatDate(item.lastSeenWithImei.toISOString()) : 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages}</span>
                <div className="flex gap-1.5">
                    <button onClick={() => setCurrentPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                    <button onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
            </div>
          )}
        </>
      )}
    </div>
  );

  if (contextIsLoading && !profileData) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading IPDR data...</p></div>;
  }
   if (uploadedIPDRFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload IPDR files to analyze device linkage.</p></div>;
  

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <Smartphone size={24} className="mr-2.5 text-primary" /> IPDR Device Linkage (IMEI)
        </div>
        <p className="text-sm text-textSecondary">Search by IMEI (imeisv field) to find linked users (MSISDN/IMSI) and IPs from IPDR data.</p>
        
        <div className="mt-4 space-y-3">
            <div>
                <label htmlFor="imeiDropdown" className="block text-xs font-medium text-textSecondary mb-1">Select IMEI from Data:</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Smartphone size={16} className="text-neutral-DEFAULT" />
                    </div>
                    <select
                        id="imeiDropdown"
                        value={searchTerm}
                        onChange={handleDropdownChange}
                        disabled={uniqueImeisForDropdown.length === 0 || isLoading}
                        className="w-full p-2.5 pl-10 pr-8 border border-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface shadow-sm appearance-none"
                    >
                        <option value="">-- Select IMEI --</option>
                        {uniqueImeisForDropdown.map(imei => (
                            <option key={imei} value={imei}>{imei}</option>
                        ))}
                    </select>
                     <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <ChevronDown className="h-4 w-4 text-neutral-DEFAULT" />
                    </div>
                </div>
                 {uniqueImeisForDropdown.length === 0 && !contextIsLoading && <p className="text-xs text-warning-dark mt-1">No IMEIs found in the loaded data for selection.</p>}
            </div>
            
            <div>
                <label htmlFor="imeiTextInput" className="block text-xs font-medium text-textSecondary mb-1">Or Enter IMEI (imeisv):</label>
                <div className="flex gap-2 items-center">
                    <input 
                        id="imeiTextInput"
                        type="text" 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Enter IMEI (e.g., 35xxxxxxxxxxxxx)"
                        className="flex-grow p-2.5 border border-neutral-light rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface shadow-sm"
                    />
                    <button 
                        onClick={() => handleSearch()} 
                        disabled={isLoading || !searchTerm.trim()}
                        className="px-5 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-60"
                    >
                        {isLoading ? <Loader2 className="h-5 w-5 animate-spin"/> : <Search size={18}/>}
                    </button>
                </div>
            </div>
        </div>
        {searchError && <p className="text-xs text-danger-dark mt-2">{searchError}</p>}
      </div>

      {isLoading && !profileData && (
          <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Searching for IMEI...</p></div>
      )}
      
      {!profileData && !isLoading && !searchError && uploadedIPDRFiles.length > 0 && (
        <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2" />
            <p>Please enter or select an IMEI above and click "Search IMEI" to view its linked entities.</p>
        </div>
      )}

      {profileData && (
        <>
          <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-lg">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary mb-3">Summary for IMEI: <span className="text-primary-dark">{profileData.imei}</span></h3>
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Total Records:</strong> {profileData.totalRecords.toLocaleString()}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Associated Users:</strong> {profileData.associatedUsers.length}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Associated IPs:</strong> {profileData.associatedIPs.length}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">First Seen:</strong> {profileData.firstSeen ? formatDate(profileData.firstSeen.toISOString()) : 'N/A'}</div>
                <div className="p-2 bg-neutral-lightest rounded border border-neutral-light shadow-sm"><strong className="block text-neutral-dark">Last Seen:</strong> {profileData.lastSeen ? formatDate(profileData.lastSeen.toISOString()) : 'N/A'}</div>
            </div>
          </div>

          {renderEntityTable("Associated Users (MSISDN/IMSI)", profileData.associatedUsers, paginatedUsers, totalUsersPages, usersPage, setUsersPage, usersSort, (key) => requestSortForTable('users', key), 'users', associatedUsersTableHeaders)}
          {renderEntityTable("Associated IPs (Public/Server)", profileData.associatedIPs, paginatedIPs, totalIPsPages, ipsPage, setIpsPage, ipsSort, (key) => requestSortForTable('ips', key), 'ips', associatedIPsTableHeaders)}
        </>
      )}
    </div>
  );
};

export default IPDRDeviceLinkageView;
