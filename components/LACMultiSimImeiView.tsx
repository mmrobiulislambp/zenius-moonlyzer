import React, { useState, useMemo, useCallback } from 'react';
import { Smartphone, Users2, ListFilter, Download, Clock, FileText, Search, ChevronUp, ChevronDown, AlertTriangle, Info, Loader2, X, Eye } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';

const ROWS_PER_PAGE = 10;
const MODAL_ROWS_PER_PAGE = 5;

interface AssociatedMSISDN {
    msisdn: string;
    recordCountWithImei: number;
    firstSeenWithImei?: Date;
    lastSeenWithImei?: Date;
}

interface MultiSimImeiProfile {
    imei: string;
    uniqueMsisdnCount: number;
    totalRecordsForImei: number;
    firstSeen?: Date;
    lastSeen?: Date;
    associatedMsisdns: AssociatedMSISDN[];
}

const LACMultiSimImeiView: React.FC = () => {
  const { allLACRecords, isLoading: contextIsLoading, error: contextError, uploadedLACFiles } = useLACContext();
  
  const [imeiProfiles, setImeiProfiles] = useState<MultiSimImeiProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [selectedImeiForModal, setSelectedImeiForModal] = useState<MultiSimImeiProfile | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<{ key: keyof MultiSimImeiProfile | string; direction: 'ascending' | 'descending' }>({ key: 'uniqueMsisdnCount', direction: 'descending' });
  
  const [modalCurrentPage, setModalCurrentPage] = useState(1);
  const [modalSortConfig, setModalSortConfig] = useState<{ key: keyof AssociatedMSISDN; direction: 'ascending' | 'descending' }>({ key: 'recordCountWithImei', direction: 'descending' });


  useMemo(() => {
    if (allLACRecords.length === 0 && !contextIsLoading) {
      setImeiProfiles([]);
      return;
    }
    setIsLoading(true);
    const imeiMap = new Map<string, { 
        msisdns: Set<string>, 
        records: LACRecord[],
        firstSeen?: Date,
        lastSeen?: Date 
    }>();

    allLACRecords.forEach(record => {
      if (record.IMEI && record.IMEI.trim() !== '' && record.MSISDN && record.MSISDN.trim() !== '') {
        const imei = record.IMEI.trim();
        const msisdn = record.MSISDN.trim();
        
        let entry = imeiMap.get(imei);
        if (!entry) {
          entry = { msisdns: new Set(), records: [] };
        }
        entry.msisdns.add(msisdn);
        entry.records.push(record);

        const recordDate = parseDateTime(record.DATE_TIME);
        if (recordDate) {
            if (!entry.firstSeen || recordDate < entry.firstSeen) entry.firstSeen = recordDate;
            if (!entry.lastSeen || recordDate > entry.lastSeen) entry.lastSeen = recordDate;
        }
        imeiMap.set(imei, entry);
      }
    });

    const profiles: MultiSimImeiProfile[] = [];
    imeiMap.forEach((data, imei) => {
      if (data.msisdns.size > 1) { // Only include IMEIs with more than one MSISDN
        const associatedMsisdns: AssociatedMSISDN[] = [];
        data.msisdns.forEach(msisdn => {
            const recordsWithThisMsisdnForImei = data.records.filter(r => r.MSISDN === msisdn);
            let firstSeenMsisdn: Date | undefined = undefined;
            let lastSeenMsisdn: Date | undefined = undefined;
            recordsWithThisMsisdnForImei.forEach(r => {
                const msisdnRecordDate = parseDateTime(r.DATE_TIME);
                if(msisdnRecordDate) {
                    if(!firstSeenMsisdn || msisdnRecordDate < firstSeenMsisdn) firstSeenMsisdn = msisdnRecordDate;
                    if(!lastSeenMsisdn || msisdnRecordDate > lastSeenMsisdn) lastSeenMsisdn = msisdnRecordDate;
                }
            });
            associatedMsisdns.push({
                msisdn: msisdn,
                recordCountWithImei: recordsWithThisMsisdnForImei.length,
                firstSeenWithImei: firstSeenMsisdn,
                lastSeenWithImei: lastSeenMsisdn,
            });
        });

        profiles.push({
          imei,
          uniqueMsisdnCount: data.msisdns.size,
          totalRecordsForImei: data.records.length,
          firstSeen: data.firstSeen,
          lastSeen: data.lastSeen,
          associatedMsisdns: associatedMsisdns.sort((a,b) => b.recordCountWithImei - a.recordCountWithImei),
        });
      }
    });
    setImeiProfiles(profiles);
    setIsLoading(false);
  }, [allLACRecords, contextIsLoading]);

  const sortedProfiles = useMemo(() => {
    let sortableItems = [...imeiProfiles];
    if (sortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[sortConfig.key as keyof MultiSimImeiProfile];
        const valB = b[sortConfig.key as keyof MultiSimImeiProfile];
        let comparison = 0;
        if (valA instanceof Date && valB instanceof Date) {
          comparison = valA.getTime() - valB.getTime();
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return sortableItems;
  }, [imeiProfiles, sortConfig]);

  const paginatedProfiles = useMemo(() => {
    const startIndex = (currentPage - 1) * ROWS_PER_PAGE;
    return sortedProfiles.slice(startIndex, startIndex + ROWS_PER_PAGE);
  }, [sortedProfiles, currentPage]);
  const totalPages = Math.ceil(sortedProfiles.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof MultiSimImeiProfile | string) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (sortConfig.key === key && sortConfig.direction === 'descending') direction = 'ascending';
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };
  
  const renderSortIcon = (key: keyof MultiSimImeiProfile | string) => {
    if (sortConfig.key !== key) return <ListFilter size={14} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };
  
  const sortedModalMsisdns = useMemo(() => {
    if (!selectedImeiForModal) return [];
    let sortableItems = [...selectedImeiForModal.associatedMsisdns];
    if (modalSortConfig.key) {
      sortableItems.sort((a, b) => {
        const valA = a[modalSortConfig.key];
        const valB = b[modalSortConfig.key];
        let comparison = 0;
        if (valA instanceof Date && valB instanceof Date) {
          comparison = valA.getTime() - valB.getTime();
        } else if (typeof valA === 'number' && typeof valB === 'number') {
          comparison = valA - valB;
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          comparison = valA.localeCompare(valB);
        }
        return modalSortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return sortableItems;
  }, [selectedImeiForModal, modalSortConfig]);

  const paginatedModalMsisdns = useMemo(() => {
    const startIndex = (modalCurrentPage - 1) * MODAL_ROWS_PER_PAGE;
    return sortedModalMsisdns.slice(startIndex, startIndex + MODAL_ROWS_PER_PAGE);
  }, [sortedModalMsisdns, modalCurrentPage]);
  const totalModalPages = selectedImeiForModal ? Math.ceil(selectedImeiForModal.associatedMsisdns.length / MODAL_ROWS_PER_PAGE) : 0;

  const requestModalSort = (key: keyof AssociatedMSISDN) => {
    let direction: 'ascending' | 'descending' = 'descending';
    if (modalSortConfig.key === key && modalSortConfig.direction === 'descending') direction = 'ascending';
    setModalSortConfig({ key, direction });
    setModalCurrentPage(1);
  };

  const renderModalSortIcon = (key: keyof AssociatedMSISDN) => {
    if (modalSortConfig.key !== key) return <ListFilter size={12} className="ml-1 opacity-30 group-hover:opacity-100 inline" />;
    return modalSortConfig.direction === 'ascending' ? <ChevronUp size={12} className="ml-1 text-primary inline" /> : <ChevronDown size={12} className="ml-1 text-primary inline" />;
  };


  const handleViewDetails = (imeiProfile: MultiSimImeiProfile) => {
    setSelectedImeiForModal(imeiProfile);
    setIsModalOpen(true);
    setModalCurrentPage(1); // Reset modal pagination
  };

  const handleExportMainTable = () => {
    if (sortedProfiles.length === 0) return;
    const headers = ["IMEI", "Unique MSISDNs", "Total Records", "First Seen", "Last Seen"];
    const data = sortedProfiles.map(p => [
      p.imei,
      String(p.uniqueMsisdnCount),
      String(p.totalRecordsForImei),
      p.firstSeen ? formatDate(p.firstSeen.toISOString()) : 'N/A',
      p.lastSeen ? formatDate(p.lastSeen.toISOString()) : 'N/A',
    ]);
    downloadCSV(`multi_sim_imeis_summary_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const handleExportModalTable = () => {
    if (!selectedImeiForModal) return;
    const headers = ["MSISDN", "Record Count w/ IMEI", "First Seen w/ IMEI", "Last Seen w/ IMEI"];
    const data = selectedImeiForModal.associatedMsisdns.map(msisdn => [
        msisdn.msisdn,
        String(msisdn.recordCountWithImei),
        msisdn.firstSeenWithImei ? formatDate(msisdn.firstSeenWithImei.toISOString()) : 'N/A',
        msisdn.lastSeenWithImei ? formatDate(msisdn.lastSeenWithImei.toISOString()) : 'N/A',
    ]);
    downloadCSV(`imei_${selectedImeiForModal.imei}_associated_msisdns_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const tableHeaders: { key: keyof MultiSimImeiProfile | string; label: string; icon?: React.ReactNode }[] = [
    { key: 'imei', label: 'IMEI', icon: <Smartphone size={14}/> },
    { key: 'uniqueMsisdnCount', label: '# Unique MSISDNs', icon: <Users2 size={14}/> },
    { key: 'totalRecordsForImei', label: '# Total Records', icon: <ListFilter size={14}/> },
    { key: 'firstSeen', label: 'First Seen', icon: <Clock size={14}/> },
    { key: 'lastSeen', label: 'Last Seen', icon: <Clock size={14}/> },
  ];
  const modalTableHeaders: { key: keyof AssociatedMSISDN; label: string; icon?: React.ReactNode }[] = [
    { key: 'msisdn', label: 'MSISDN', icon: <Smartphone size={12}/> },
    { key: 'recordCountWithImei', label: '# Records', icon: <ListFilter size={12}/> },
    { key: 'firstSeenWithImei', label: 'First Seen', icon: <Clock size={12}/> },
    { key: 'lastSeenWithImei', label: 'Last Seen', icon: <Clock size={12}/> },
  ];

  if (contextIsLoading && allLACRecords.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading LAC data...</p></div>;
  if (uploadedLACFiles.length === 0 && !contextIsLoading) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload LAC/Cell data files.</p></div>;
  
  if (isLoading) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Analyzing IMEI-MSISDN links...</p></div>;
  if (contextError) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{contextError}</div>;

  if (imeiProfiles.length === 0 && !isLoading) return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
      <Smartphone size={28} className="mb-2 text-neutral-DEFAULT" />
      <p>No IMEIs found associated with multiple MSISDNs in the current dataset.</p>
      <p className="text-xs mt-1">Ensure your data contains IMEI and MSISDN/IMSI fields.</p>
    </div>
  );
  
  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                    <Smartphone size={20} className="mr-1.5 text-primary" />
                    <Users2 size={20} className="mr-2.5 text-primary" />
                     Multi-MSISDN IMEI Linkage
                </div>
                <p className="text-sm text-textSecondary">IMEIs found used with more than one MSISDN.</p>
            </div>
            {sortedProfiles.length > 0 && (
                <button onClick={handleExportMainTable} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export IMEI List </button>
            )}
        </div>
      </div>

      <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
        <table className="min-w-full divide-y divide-neutral-light">
          <thead className="bg-neutral-lightest sticky top-0 z-10">
            <tr>
              {tableHeaders.map(h => (
                <th key={h.key as string} onClick={() => requestSort(h.key)} className="group px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter transition-colors whitespace-nowrap">
                  <div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key)}</div>
                </th>
              ))}
              <th className="px-3 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-surface divide-y divide-neutral-light">
            {paginatedProfiles.map((profile, idx) => (
              <tr key={profile.imei} className={`transition-colors ${idx % 2 === 0 ? 'bg-surface' : 'bg-neutral-lightest/70'} hover:bg-primary-lighter/30`}>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textPrimary font-medium">{profile.imei}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{profile.uniqueMsisdnCount}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary text-center">{profile.totalRecordsForImei}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{profile.firstSeen ? formatDate(profile.firstSeen.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs text-textSecondary">{profile.lastSeen ? formatDate(profile.lastSeen.toISOString()) : 'N/A'}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                  <button onClick={() => handleViewDetails(profile)} className="text-primary-dark hover:text-primary-darker font-medium hover:underline flex items-center text-xs">
                    <Eye size={14} className="mr-1"/>View MSISDNs
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && ( <div className="flex flex-col sm:flex-row justify-between items-center mt-4 py-3 px-1"> <span className="text-sm text-textSecondary mb-2 sm:mb-0">Page {currentPage} of {totalPages} (Total: {sortedProfiles.length} IMEIs)</span> <div className="flex gap-2"> <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Previous</button> <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-3 py-1.5 text-xs font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button> </div> </div> )}
    
      {isModalOpen && selectedImeiForModal && (
        <div className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setIsModalOpen(false)}>
          <div className="bg-surface rounded-xl shadow-2xl w-full max-w-xl max-h-[80vh] p-5 sm:p-6 border border-neutral-light flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3 pb-2 border-b border-neutral-light">
              <h3 className="text-md font-semibold text-textPrimary">MSISDNs for IMEI: <span className="text-primary-dark">{selectedImeiForModal.imei}</span></h3>
              <button onClick={() => setIsModalOpen(false)} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50"><X size={20}/></button>
            </div>
            <div className="flex-grow overflow-y-auto scrollbar-thin pr-1">
                <div className="flex justify-end mb-2">
                     <button onClick={handleExportModalTable} className="px-2.5 py-1 text-[10px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={12} className="mr-1"/>Export MSISDNs</button>
                </div>
              <table className="min-w-full divide-y divide-neutral-light text-[11px]">
                <thead className="bg-neutral-lightest sticky top-0">
                    <tr>{modalTableHeaders.map(h => <th key={h.key} onClick={() => requestModalSort(h.key)} className="group px-2 py-1.5 text-left font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-light"><div className="flex items-center">{h.icon && <span className="mr-1 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderModalSortIcon(h.key)}</div></th>)}</tr>
                </thead>
                <tbody className="bg-surface divide-y divide-neutral-light">
                  {paginatedModalMsisdns.map(msisdn => (
                    <tr key={msisdn.msisdn} className="hover:bg-neutral-lightest/50">
                      <td className="px-2 py-1 whitespace-nowrap text-textPrimary font-medium">{msisdn.msisdn}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-textSecondary text-center">{msisdn.recordCountWithImei}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-textSecondary">{msisdn.firstSeenWithImei ? formatDate(msisdn.firstSeenWithImei.toISOString()) : 'N/A'}</td>
                      <td className="px-2 py-1 whitespace-nowrap text-textSecondary">{msisdn.lastSeenWithImei ? formatDate(msisdn.lastSeenWithImei.toISOString()) : 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalModalPages > 1 && (
              <div className="flex flex-col sm:flex-row justify-between items-center mt-2 pt-2 border-t border-neutral-light text-[10px]">
                <span className="text-textSecondary mb-1 sm:mb-0">Page {modalCurrentPage} of {totalModalPages}</span>
                <div className="flex gap-1">
                  <button onClick={() => setModalCurrentPage(p => Math.max(1, p - 1))} disabled={modalCurrentPage === 1} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                  <button onClick={() => setModalCurrentPage(p => Math.min(totalModalPages, p + 1))} disabled={modalCurrentPage === totalModalPages} className="px-2 py-0.5 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
                </div>
              </div>
            )}
            <button onClick={() => setIsModalOpen(false)} className="mt-4 px-4 py-2 bg-primary text-white text-sm rounded-lg hover:bg-primary-dark self-end shadow-md">Close</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default LACMultiSimImeiView;
