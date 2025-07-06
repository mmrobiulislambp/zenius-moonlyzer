
import React, { useState, useMemo } from 'react';
import { Link2, Users, FileText, ChevronDown, ChevronRight, Info, Globe, ListChecks, PhoneForwarded, PhoneIncoming, MapPin as LacIcon, ScanBarcode as ImeiIcon, Home as AddressIcon, TowerControl as CellIcon, Download, Search, XCircle, AlignLeft, Eye } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord, DetailedFileInteraction, LinkAnalysisResult } from '../types'; 
import { formatDate, formatDurationFromSeconds } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils'; 

const ROWS_PER_LINK_DETAILS = 5; 

const RecordDetailRow: React.FC<{ record: CDRRecord }> = ({ record }) => (
  <tr className="text-xs bg-neutral-lightest/30 hover:bg-neutral-lightest/70">
    <td className="px-2 py-1 border border-neutral-light">{formatDate(record.START_DTTIME)}</td>
    <td className="px-2 py-1 border border-neutral-light">{record.APARTY}</td>
    <td className="px-2 py-1 border border-neutral-light">{record.BPARTY}</td>
    <td className="px-2 py-1 border border-neutral-light text-center">{formatDurationFromSeconds(parseInt(record.CALL_DURATION,10) || 0)}</td>
    <td className="px-2 py-1 border border-neutral-light">{record.USAGE_TYPE}</td>
    <td className="px-2 py-1 border border-neutral-light">{record.NETWORK_TYPE || 'N/A'}</td>
    <td className="px-2 py-1 border border-neutral-light">{record.LACSTARTA}-{record.CISTARTA}</td>
    <td className="px-2 py-1 border border-neutral-light truncate max-w-[150px]" title={record.ADDRESS}>{record.ADDRESS || 'N/A'}</td>
  </tr>
);


const LinkAnalysisView: React.FC = () => {
  const { linkAnalysisResults, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();
  const [expandedLinks, setExpandedLinks] = useState<Record<string, boolean>>({});
  const [expandedFileRecords, setExpandedFileRecords] = useState<Record<string, boolean>>({});
  const [expandedCommonFileDetails, setExpandedCommonFileDetails] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');

  const toggleLinkExpansion = (number: string) => setExpandedLinks(prev => ({ ...prev, [number]: !prev[number] }));
  const toggleFileRecordsExpansion = (key: string) => setExpandedFileRecords(prev => ({ ...prev, [key]: !prev[key] }));
  const toggleCommonFileDetailExpansion = (key: string) => setExpandedCommonFileDetails(prev => ({ ...prev, [key]: !prev[key] }));

  const getExportFilenameBase = () => {
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        return activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        return (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return "all_selected_files";
  };

  const handleExportLinksSummary = () => {
    const headers = ["Linked Number", "Total Occurrences", "Present in Files Count", "Is Common in All Selected"];
    const data = filteredLinkResults.map(link => [ 
        link.number,
        String(link.totalOccurrences),
        String(link.isCommonAcrossAllSelectedFiles ? (link.commonNumberDetails?.length || 0) : link.files.length),
        link.isCommonAcrossAllSelectedFiles ? "Yes" : "No",
    ]);
    downloadCSV(`link_analysis_summary_${getExportFilenameBase()}_${searchTerm ? 'filtered_'+searchTerm : ''}.csv`, data, headers);
  };

  const handleExportLinkRecords = (number: string, fileIdOrCombinedKey: string, records: CDRRecord[], sourceName: string) => {
    if (!records || records.length === 0) {
      alert("No records to export for this selection.");
      return;
    }
    const headers = Object.keys(records[0] || {}); 
    const data = records.map(rec => headers.map(h => String(rec[h as keyof CDRRecord] ?? '')));
    downloadCSV(`link_records_${number}_${sourceName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_${getExportFilenameBase()}.csv`, data, headers);
  };

  const filteredLinkResults = useMemo(() => {
    if (!searchTerm) return linkAnalysisResults;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return linkAnalysisResults.filter(link => link.number.toLowerCase().includes(lowerSearchTerm));
  }, [linkAnalysisResults, searchTerm]);

  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Analyzing links...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  
  const filesSelectedForAnalysisCount = filesToAnalyze.length;
  if (filesSelectedForAnalysisCount === 0 && uploadedFiles.length > 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please select files from 'Filter by Files' to perform link analysis.</p></div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files to begin analysis.</p></div>;
  
  const commonAcrossAllLinks = filteredLinkResults.filter(link => link.isCommonAcrossAllSelectedFiles);
  const otherLinks = filteredLinkResults.filter(link => !link.isCommonAcrossAllSelectedFiles);

  if (linkAnalysisResults.length > 0 && filteredLinkResults.length === 0 && searchTerm) {
    return (
        <div className="space-y-6">
             <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                    <div>
                        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <Link2 size={24} className="mr-2.5 text-primary" /> Inter-CDR Link Analysis Results </div>
                        <p className="text-sm text-textSecondary"> Found {linkAnalysisResults.length} number(s) with notable links across the {filesSelectedForAnalysisCount} selected file(s). </p>
                    </div>
                </div>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-neutral-DEFAULT" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search linked numbers..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full sm:w-72 px-3 py-2 pl-10 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm placeholder-neutral-DEFAULT"
                    />
                    {searchTerm && (
                        <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear search">
                            <XCircle size={16} />
                        </button>
                    )}
                </div>
            </div>
            <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
                <Info size={28} className="mb-2 text-neutral-DEFAULT" />
                <p>No links found matching "{searchTerm}".</p>
            </div>
        </div>
    );
  }

  if (linkAnalysisResults.length === 0) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No significant links found for the currently selected files and filters.</p></div>;
  
  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <Link2 size={24} className="mr-2.5 text-primary" /> Inter-CDR Link Analysis Results </div>
                <p className="text-sm text-textSecondary"> Found {linkAnalysisResults.length} number(s) with notable links. {searchTerm && `(${filteredLinkResults.length} matching "${searchTerm}")`}</p>
            </div>
             {filteredLinkResults.length > 0 && (
                <button onClick={handleExportLinksSummary} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Links Summary </button>
            )}
        </div>
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-neutral-DEFAULT" />
            </div>
            <input 
                type="text" 
                placeholder="Search linked numbers..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full sm:w-72 px-3 py-2 pl-10 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm placeholder-neutral-DEFAULT"
            />
            {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-DEFAULT hover:text-danger" title="Clear search">
                    <XCircle size={16} />
                </button>
            )}
        </div>
      </div>

      {/* Common Across All Selected Files */}
      {commonAcrossAllLinks.length > 0 && (
        <div className="space-y-3">
          <div className="p-3 bg-primary-lighter/40 border-l-4 border-primary rounded-r-lg shadow-md">
            <h3 className="text-base sm:text-lg font-semibold text-primary-dark flex items-center">
              <Globe size={18} className="mr-2"/> Numbers Common Across All Selected Files ({commonAcrossAllLinks.length})
            </h3>
          </div>
          {commonAcrossAllLinks.map((link) => (
            <div key={`common-${link.number}`} className="bg-surface border border-neutral-light rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
              <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-lightest/60" onClick={() => toggleLinkExpansion(link.number)}>
                <div className="flex items-center">
                  {expandedLinks[link.number] ? <ChevronDown size={18} className="mr-2 text-neutral-DEFAULT" /> : <ChevronRight size={18} className="mr-2 text-neutral-DEFAULT" />}
                  <Users size={16} className="mr-2 text-primary" />
                  <span className="font-semibold text-primary-dark">{link.number}</span>
                  <span className="ml-2 text-xs text-textSecondary">({link.totalOccurrences} total occurrences across {link.commonNumberDetails?.length} selected files)</span>
                </div>
              </div>
              {expandedLinks[link.number] && link.commonNumberDetails && (
                <div className="px-3 pb-3 border-t border-neutral-light bg-neutral-lightest/50 space-y-2">
                  {link.commonNumberDetails.map((detail, detailIdx) => {
                    const fileRecordKey = `common-${link.number}-${detail.fileId}`;
                    const commonFileDisplayKey = `common-${link.number}-file-${detail.fileId}`;
                    const rawRecords = link.files.find(f => f.fileId === detail.fileId)?.records || [];
                    return (
                      <div key={fileRecordKey} className="p-2.5 border border-neutral-light rounded-lg bg-surface shadow-sm">
                        <div className="flex items-center justify-between cursor-pointer hover:bg-neutral-lightest/40 p-1 -m-1 rounded" onClick={() => toggleCommonFileDetailExpansion(commonFileDisplayKey)}>
                          <div className="flex items-center">
                            {expandedCommonFileDetails[commonFileDisplayKey] ? <ChevronDown size={16} className="mr-1.5 text-neutral-DEFAULT" /> : <ChevronRight size={16} className="mr-1.5 text-neutral-DEFAULT" />}
                            <FileText size={15} className="mr-1.5 text-secondary" />
                            <span className="text-xs font-medium text-textPrimary">{detail.fileName} ({detail.sourceName}) - {detail.recordCountInFile} records</span>
                          </div>
                        </div>
                        {expandedCommonFileDetails[commonFileDisplayKey] && (
                          <div className="mt-2 pl-5 text-xs space-y-1.5">
                            <p><PhoneForwarded size={12} className="inline mr-1 text-green-600"/><strong>Contacts made by {link.number}:</strong> {detail.contactedBParties.join(', ') || 'None'}</p>
                            <p><PhoneIncoming size={12} className="inline mr-1 text-blue-600"/><strong>Contacts made to {link.number}:</strong> {detail.callingAParties.join(', ') || 'None'}</p>
                            <p><LacIcon size={12} className="inline mr-1 text-teal-600"/><strong>LACs:</strong> {detail.associatedLACs.join(', ') || 'N/A'}</p>
                            <p><CellIcon size={12} className="inline mr-1 text-cyan-600"/><strong>Cell IDs:</strong> {detail.associatedCellIds.join(', ') || 'N/A'}</p>
                            <p><ImeiIcon size={12} className="inline mr-1 text-indigo-600"/><strong>IMEIs:</strong> {detail.associatedIMEIs.join(', ') || 'N/A'}</p>
                            <p><AddressIcon size={12} className="inline mr-1 text-purple-600"/><strong>Addresses:</strong> {detail.associatedAddresses.join(', ') || 'N/A'}</p>
                            {rawRecords.length > 0 && (
                                <div className="mt-2">
                                    <button onClick={() => toggleFileRecordsExpansion(fileRecordKey)} className="text-xs text-primary hover:underline flex items-center"><AlignLeft size={14} className="mr-1"/>{expandedFileRecords[fileRecordKey] ? 'Hide' : 'Show'} {rawRecords.length} Raw Records</button>
                                    {expandedFileRecords[fileRecordKey] && (
                                        <div className="mt-1.5 max-h-60 overflow-y-auto border border-neutral-DEFAULT/20 rounded p-1.5 scrollbar-thin">
                                        <table className="min-w-full text-[10px]"><thead><tr><th className="px-1 py-0.5 border-b">Time</th><th className="px-1 py-0.5 border-b">AParty</th><th className="px-1 py-0.5 border-b">BParty</th><th className="px-1 py-0.5 border-b">Dur.</th><th className="px-1 py-0.5 border-b">Type</th><th className="px-1 py-0.5 border-b">Network</th><th className="px-1 py-0.5 border-b">Cell</th><th className="px-1 py-0.5 border-b">Address</th></tr></thead><tbody>{rawRecords.map(r => <RecordDetailRow key={r.id} record={r} />)}</tbody></table>
                                        </div>
                                    )}
                                </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      
      {/* Other Notable Links */}
      {otherLinks.length > 0 && (
        <div className="space-y-3 mt-6">
           <div className="p-3 bg-accent-lighter/40 border-l-4 border-accent rounded-r-lg shadow-md">
            <h3 className="text-base sm:text-lg font-semibold text-accent-dark flex items-center">
                <ListChecks size={18} className="mr-2"/> Other Notable Links ({otherLinks.length})
            </h3>
          </div>
          {otherLinks.map((link) => (
             <div key={`other-${link.number}`} className="bg-surface border border-neutral-light rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow">
                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-neutral-lightest/60" onClick={() => toggleLinkExpansion(`other-${link.number}`)}>
                    <div className="flex items-center">
                        {expandedLinks[`other-${link.number}`] ? <ChevronDown size={18} className="mr-2 text-neutral-DEFAULT" /> : <ChevronRight size={18} className="mr-2 text-neutral-DEFAULT" />}
                        <Users size={16} className="mr-2 text-accent-dark" />
                        <span className="font-semibold text-accent-darker">{link.number}</span>
                        <span className="ml-2 text-xs text-textSecondary">({link.totalOccurrences} total occurrences in {link.files.length} file(s))</span>
                    </div>
                </div>
                {expandedLinks[`other-${link.number}`] && (
                    <div className="px-3 pb-3 border-t border-neutral-light bg-neutral-lightest/50 space-y-2">
                        {link.files.map(fileEntry => {
                            const fileRecordKey = `other-${link.number}-${fileEntry.fileId}`;
                            return (
                                <div key={fileRecordKey} className="p-2.5 border border-neutral-light rounded-lg bg-surface shadow-sm">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center">
                                            <FileText size={15} className="mr-1.5 text-sky-600" />
                                            <span className="text-xs font-medium text-textPrimary">{fileEntry.fileName} ({fileEntry.sourceName})</span>
                                        </div>
                                        <span className="text-xs text-textSecondary">A: {fileEntry.asAPartyCount}, B: {fileEntry.asBPartyCount}</span>
                                    </div>
                                    {fileEntry.records.length > 0 && (
                                         <div className="mt-2">
                                            <button onClick={() => toggleFileRecordsExpansion(fileRecordKey)} className="text-xs text-primary hover:underline flex items-center"><AlignLeft size={14} className="mr-1"/>{expandedFileRecords[fileRecordKey] ? 'Hide' : 'Show'} {fileEntry.records.length} Records</button>
                                            {expandedFileRecords[fileRecordKey] && (
                                                <div className="mt-1.5 max-h-60 overflow-y-auto border border-neutral-DEFAULT/20 rounded p-1.5 scrollbar-thin">
                                                <table className="min-w-full text-[10px]"><thead><tr><th className="px-1 py-0.5 border-b">Time</th><th className="px-1 py-0.5 border-b">AParty</th><th className="px-1 py-0.5 border-b">BParty</th><th className="px-1 py-0.5 border-b">Dur.</th><th className="px-1 py-0.5 border-b">Type</th><th className="px-1 py-0.5 border-b">Network</th><th className="px-1 py-0.5 border-b">Cell</th><th className="px-1 py-0.5 border-b">Address</th></tr></thead><tbody>{fileEntry.records.map(r => <RecordDetailRow key={r.id} record={r} />)}</tbody></table>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
export default LinkAnalysisView;
