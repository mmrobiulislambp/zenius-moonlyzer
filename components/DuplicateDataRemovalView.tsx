
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { Layers, Search, Trash2, Info, AlertTriangle, CheckCircle, ShieldCheck, FileText, Clock, Phone, User, Loader2 } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord } from '../types';
import { formatDate, parseDateTime } from '../utils/cdrUtils';

interface DuplicateGroup {
  key: string; // Concatenation of AParty, BParty, StartTime, Duration
  records: CDRRecord[];
  commonAParty: string;
  commonBParty: string;
  commonStartTime: string;
  commonDuration: string;
}

const DuplicateDataRemovalView: React.FC = () => {
  const { globallyFilteredRecords, removeRecordsByIds, isLoading: contextIsLoading } = useCDRContext();
  const [duplicateGroups, setDuplicateGroups] = useState<DuplicateGroup[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanComplete, setScanComplete] = useState(false);
  const [recordsToKeep, setRecordsToKeep] = useState<Record<string, string>>({}); // groupId -> recordIdToKeep
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);


  const handleScanForDuplicates = useCallback(() => {
    setIsScanning(true);
    setScanComplete(false);
    setDuplicateGroups([]);
    setRecordsToKeep({});
    setShowSuccessMessage(false); // Hide success message on new scan

    const groups: Record<string, CDRRecord[]> = {};

    globallyFilteredRecords.forEach(record => {
      // Normalize StartTime for consistent key generation if necessary
      const startTimeKey = parseDateTime(record.START_DTTIME)?.toISOString() || record.START_DTTIME;
      const key = `${record.APARTY}|${record.BPARTY}|${startTimeKey}|${record.CALL_DURATION}`;
      
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(record);
    });

    const foundDuplicates: DuplicateGroup[] = [];
    Object.entries(groups).forEach(([key, records]) => {
      if (records.length > 1) {
        // Sort records within a group by original file name then row index for consistent default selection
        const sortedRecords = [...records].sort((a,b) => {
            if (a.fileName.localeCompare(b.fileName) !== 0) {
                return a.fileName.localeCompare(b.fileName);
            }
            return a.rowIndex - b.rowIndex;
        });

        foundDuplicates.push({
          key,
          records: sortedRecords,
          commonAParty: records[0].APARTY,
          commonBParty: records[0].BPARTY,
          commonStartTime: records[0].START_DTTIME,
          commonDuration: records[0].CALL_DURATION,
        });
        // Default to keep the first record (after sorting) in each new group
        setRecordsToKeep(prev => ({ ...prev, [key]: sortedRecords[0].id }));
      }
    });

    setDuplicateGroups(foundDuplicates);
    setIsScanning(false);
    setScanComplete(true);
  }, [globallyFilteredRecords]);

  const handleSelectRecordToKeep = (groupKey: string, recordId: string) => {
    setRecordsToKeep(prev => ({ ...prev, [groupKey]: recordId }));
  };

  const handleDeleteDuplicates = () => {
    if (Object.keys(recordsToKeep).length === 0 && duplicateGroups.length > 0) {
      alert("No records selected to keep. Please select one record from each duplicate group.");
      return;
    }
     if (totalRecordsToDelete === 0 && duplicateGroups.length > 0) {
      alert("All duplicates are already set to be kept, or no selection changes made. Nothing to delete.");
      return;
    }
    setShowConfirmationModal(true);
  };

  const confirmDeletion = () => {
    const recordIdsToDelete: string[] = [];
    duplicateGroups.forEach(group => {
      const recordIdToKeep = recordsToKeep[group.key];
      group.records.forEach(record => {
        if (record.id !== recordIdToKeep) {
          recordIdsToDelete.push(record.id);
        }
      });
    });

    if (recordIdsToDelete.length > 0) {
      removeRecordsByIds(recordIdsToDelete);
      setShowSuccessMessage(true); // Show success message
    }
    setShowConfirmationModal(false);
    // Re-scan or clear, for now let's re-scan to show updated state
    handleScanForDuplicates(); 
  };
  
  useEffect(() => {
    if (showSuccessMessage) {
      const timer = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 4000); // Hide after 4 seconds
      return () => clearTimeout(timer);
    }
  }, [showSuccessMessage]);

  const totalRecordsToDelete = useMemo(() => {
    let count = 0;
    duplicateGroups.forEach(group => {
      const recordIdToKeep = recordsToKeep[group.key];
      group.records.forEach(record => {
          if (record.id !== recordIdToKeep) {
              count++;
          }
      });
    });
    return count;
  }, [duplicateGroups, recordsToKeep]);

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                <Layers size={24} className="mr-2.5 text-primary" /> Duplicate Data Removal
                </div>
                <p className="text-sm text-textSecondary">Identify and remove duplicate records based on AParty, BParty, Start Time, and Call Duration.</p>
            </div>
            <button
                onClick={handleScanForDuplicates}
                disabled={isScanning || contextIsLoading}
                className="mt-3 sm:mt-0 px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60"
            >
                {isScanning ? <Loader2 className="h-5 w-5 animate-spin mr-2" /> : <Search size={18} className="mr-2" />}
                {isScanning ? 'Scanning...' : 'Scan for Duplicates'}
            </button>
        </div>
      </div>

      {isScanning && (
          <div className="flex justify-center items-center h-40">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="ml-3 text-textSecondary">Scanning for duplicate records...</p>
          </div>
      )}
      
      {showSuccessMessage && (
        <div className="p-4 bg-success-lighter text-success-darker rounded-lg border border-success-light flex items-center shadow-md transition-opacity duration-300">
          <CheckCircle size={20} className="mr-2.5"/> Successfully deleted duplicate records. The view has been updated.
        </div>
      )}

      {scanComplete && !isScanning && (
        <div className="p-4 bg-neutral-lightest border border-neutral-light rounded-lg shadow-md">
          {duplicateGroups.length === 0 ? (
            <div className="text-center text-textSecondary py-8 flex flex-col items-center">
              <CheckCircle size={32} className="text-success mb-3" />
              <p className="font-semibold text-lg text-textPrimary">No Duplicates Found</p>
              <p>Based on the criteria (AParty, BParty, Start Time, Duration), no duplicate records were identified in the current dataset.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-center p-3 bg-info-lighter border border-info-light rounded-md">
                <p className="text-sm text-info-dark mb-2 sm:mb-0">
                  <Info size={16} className="inline mr-1.5 align-text-bottom" />
                  Found <span className="font-bold">{duplicateGroups.length}</span> set(s) of duplicates. 
                  A total of <span className="font-bold">{totalRecordsToDelete}</span> record(s) will be deleted if you proceed.
                </p>
                <button
                  onClick={handleDeleteDuplicates}
                  disabled={totalRecordsToDelete === 0}
                  className="px-4 py-2 bg-danger text-white rounded-lg hover:bg-danger-dark focus:outline-none focus:ring-2 focus:ring-danger-light focus:ring-offset-1 flex items-center shadow-md text-sm disabled:opacity-60"
                >
                  <Trash2 size={16} className="mr-2" /> Delete Duplicates (Keep Selected)
                </button>
              </div>

              {duplicateGroups.map((group) => (
                <div key={group.key} className="p-4 border border-neutral-DEFAULT/30 rounded-lg shadow-md bg-surface">
                  <h4 className="text-sm font-semibold text-textPrimary mb-2 pb-2 border-b border-neutral-light">
                    Duplicate Set for: <span className="text-primary-dark">{group.commonAParty}</span> &harr; <span className="text-primary-dark">{group.commonBParty}</span>
                    <br/>Time: <span className="text-primary-dark">{formatDate(group.commonStartTime)}</span>, Duration: <span className="text-primary-dark">{group.commonDuration}s</span>
                  </h4>
                  <p className="text-xs text-textSecondary mb-2">Select one record from this group to keep. Others will be deleted.</p>
                  <ul className="space-y-2">
                    {group.records.map((record) => (
                      <li key={record.id} className={`p-3 border rounded-md text-xs transition-colors flex items-start gap-3 ${recordsToKeep[group.key] === record.id ? 'bg-green-100 border-green-400 ring-2 ring-green-300' : 'bg-neutral-lightest border-neutral-light hover:border-primary-light'}`}>
                        <input
                          type="radio"
                          name={`keep-${group.key}`}
                          id={`keep-${record.id}`}
                          checked={recordsToKeep[group.key] === record.id}
                          onChange={() => handleSelectRecordToKeep(group.key, record.id)}
                          className="mt-1 form-radio h-4 w-4 text-primary-dark border-neutral-dark focus:ring-primary-dark accent-primary-dark"
                        />
                        <label htmlFor={`keep-${record.id}`} className="flex-grow cursor-pointer">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
                            <div title={record.APARTY}><User size={12} className="inline mr-1 opacity-70"/>A: <span className="font-medium text-textPrimary">{record.APARTY}</span></div>
                            <div title={record.BPARTY}><User size={12} className="inline mr-1 opacity-70"/>B: <span className="font-medium text-textPrimary">{record.BPARTY}</span></div>
                            <div title={record.START_DTTIME}><Clock size={12} className="inline mr-1 opacity-70"/>Time: <span className="font-medium text-textPrimary">{formatDate(record.START_DTTIME)}</span></div>
                            <div title={record.CALL_DURATION}><Phone size={12} className="inline mr-1 opacity-70"/>Dur: <span className="font-medium text-textPrimary">{record.CALL_DURATION}s</span></div>
                            <div title={record.fileName} className="truncate"><FileText size={12} className="inline mr-1 opacity-70"/>File: <span className="font-medium text-textPrimary">{record.fileName}</span></div>
                            <div title={`Row: ${record.rowIndex}`}><ShieldCheck size={12} className="inline mr-1 opacity-70"/>Row: <span className="font-medium text-textPrimary">{record.rowIndex}</span></div>
                          </div>
                           <p className="text-[10px] text-neutral-DEFAULT mt-1">Source: {record.sourceName || 'N/A'}</p>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* Confirmation Modal */}
      {showConfirmationModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowConfirmationModal(false)}>
          <div className="bg-surface p-6 rounded-lg shadow-xl max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center mb-4">
              <AlertTriangle size={24} className="text-danger mr-3" />
              <h3 className="text-lg font-semibold text-textPrimary">Confirm Deletion</h3>
            </div>
            <p className="text-sm text-textSecondary mb-6">
              Are you sure you want to delete <span className="font-bold text-danger-dark">{totalRecordsToDelete}</span> duplicate record(s)? 
              This action cannot be undone.
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowConfirmationModal(false)}
                className="px-4 py-2 text-sm bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded-md shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeletion}
                className="px-4 py-2 text-sm bg-danger hover:bg-danger-dark text-white rounded-md shadow-sm"
              >
                Yes, Delete Duplicates
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default DuplicateDataRemovalView;
