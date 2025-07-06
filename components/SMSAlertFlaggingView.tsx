
import React, { useState, useCallback, useMemo } from 'react';
import { ShieldAlert, ShieldCheck, Flag, Search, Download, ListFilter, ChevronDown, ChevronUp, Info, AlertTriangle, MessageSquare, Send, Inbox, Clock, FileText as FileTextIcon, Zap, Loader2, Eye, Ban, Smile, Skull, Flame, Edit, CheckCircle } from 'lucide-react'; // Added CheckCircle
import { useSMSContext } from '../contexts/SMSContext';
import { SMSRecord, SMSAnalysisResult } from '../types'; 
import { formatDate, parseDateTime } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const ROWS_PER_PAGE = 15;

interface ExtendedSMSRecord extends SMSRecord {
  aiAnalysis?: SMSAnalysisResult;
}

interface SortConfig {
  key: keyof ExtendedSMSRecord | 'aiFlagged' | 'aiCategory' | null;
  direction: 'ascending' | 'descending';
}

const SMSAlertFlaggingView: React.FC = () => {
  const { filteredSMSRecords, isLoading: contextIsLoading, uploadedSMSFiles } = useSMSContext();
  
  const [analysisResults, setAnalysisResults] = useState<ExtendedSMSRecord[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false); // Renamed from isLoadingAI to avoid conflict if other AI views are merged/used
  const [aiError, setAiError] = useState<string | null>(null);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'Timestamp', direction: 'descending' });
  const [filters, setFilters] = useState({ flagType: '', category: '' });

  const handleAnalyzeSMS = useCallback(async () => {
    if (filteredSMSRecords.length === 0) {
      setAiError("No SMS records available to analyze. Please check global filters or upload data.");
      return;
    }
    setIsAnalyzing(true);
    setAiError(null);
    setAnalysisResults([]);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const tempResults: ExtendedSMSRecord[] = [];

      for (const sms of filteredSMSRecords) {
        try {
          const prompt = `
            Analyze the following SMS message content.
            1. Determine if it contains pornographic/obscene language or violent language. If so, specify the type ("obscene" or "violent").
            2. Categorize the message into one of the following: "Normal", "Sensitive" (e.g., personal info, financial details), "Adult" (e.g., pornographic, obscene), or "Criminal" (e.g., scams, threats, illegal activities, violence).
            3. Provide a brief reason for your flagging and categorization if it's not "Normal".

            Return your analysis as a JSON object with the following structure:
            {
              "isFlagged": boolean,
              "flagType": "obscene" | "violent" | null,
              "category": "Normal" | "Sensitive" | "Adult" | "Criminal",
              "reason": string | null
            }

            SMS Content:
            "${sms.Content}"
          `;

          const response: GenerateContentResponse = await ai.models.generateContent({
            model: "gemini-2.5-flash-preview-04-17",
            contents: prompt,
            config: { responseMimeType: "application/json" }
          });
          
          let jsonStr = response.text.trim();
          const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
          const match = jsonStr.match(fenceRegex);
          if (match && match[2]) {
            jsonStr = match[2].trim();
          }
          
          const parsedAIResult = JSON.parse(jsonStr) as Omit<SMSAnalysisResult, 'smsId'>;
          tempResults.push({ ...sms, aiAnalysis: { ...parsedAIResult, smsId: sms.id } });
          setAnalysisResults([...tempResults]); // Update UI progressively

        } catch (e: any) {
          console.error(`Error analyzing SMS ID ${sms.id}:`, e);
          tempResults.push({ ...sms, aiAnalysis: { smsId: sms.id, isFlagged: false, flagType: null, category: "Normal", reason: "AI analysis failed" } });
          setAnalysisResults([...tempResults]);
          // Optionally set a general error message or handle per-SMS errors differently
          setAiError(prev => prev ? `${prev}; Error on SMS ID ${sms.id}` : `Error analyzing SMS ID ${sms.id}. Some results may be incomplete.`);
        }
      }
    } catch (e: any) {
      console.error(`Error calling Gemini API for SMS analysis:`, e);
      setAiError(`Failed to start analysis: ${e.message || 'Unknown error'}. Check API key and console.`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [filteredSMSRecords]);


  const filteredDisplayResults = useMemo(() => {
    return analysisResults.filter(item => {
      if (filters.flagType && item.aiAnalysis?.flagType !== filters.flagType) return false;
      if (filters.category && item.aiAnalysis?.category !== filters.category) return false;
      return true;
    });
  }, [analysisResults, filters]);

  const sortedDisplayResults = useMemo(() => {
    let sortableItems = [...filteredDisplayResults];
    if (sortConfig.key !== null) {
      sortableItems.sort((a, b) => {
        let valA, valB;
        if (sortConfig.key === 'aiFlagged') {
          valA = a.aiAnalysis?.isFlagged ?? false;
          valB = b.aiAnalysis?.isFlagged ?? false;
        } else if (sortConfig.key === 'aiCategory') {
          valA = a.aiAnalysis?.category ?? '';
          valB = b.aiAnalysis?.category ?? '';
        } else {
          valA = a[sortConfig.key as keyof SMSRecord];
          valB = b[sortConfig.key as keyof SMSRecord];
        }
        
        if (sortConfig.key === 'Timestamp') {
          valA = parseDateTime(String(a.Timestamp))?.getTime() ?? 0;
          valB = parseDateTime(String(b.Timestamp))?.getTime() ?? 0;
        } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
          return (valA === valB) ? 0 : valA ? (sortConfig.direction === 'ascending' ? -1 : 1) : (sortConfig.direction === 'ascending' ? 1 : -1);
        } else if (typeof valA === 'string' && typeof valB === 'string') {
          valA = valA.toLowerCase();
          valB = valB.toLowerCase();
        }

        if (valA < valB) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sortableItems;
  }, [filteredDisplayResults, sortConfig]);

  const paginatedResults = useMemo(() => {
    const firstPageIndex = (currentPage - 1) * ROWS_PER_PAGE;
    const lastPageIndex = firstPageIndex + ROWS_PER_PAGE;
    return sortedDisplayResults.slice(firstPageIndex, lastPageIndex);
  }, [currentPage, sortedDisplayResults]);

  const totalPages = Math.ceil(sortedDisplayResults.length / ROWS_PER_PAGE);

  const requestSort = (key: keyof ExtendedSMSRecord | 'aiFlagged' | 'aiCategory') => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
    setCurrentPage(1);
  };

  const renderSortIcon = (key: keyof ExtendedSMSRecord | 'aiFlagged' | 'aiCategory') => {
    if (sortConfig.key !== key) return <ChevronDown size={14} className="ml-1 text-neutral-DEFAULT opacity-30 group-hover:opacity-100 inline" />;
    return sortConfig.direction === 'ascending' ? <ChevronUp size={14} className="ml-1 text-primary inline" /> : <ChevronDown size={14} className="ml-1 text-primary inline" />;
  };

  const handleExportData = () => {
    if (sortedDisplayResults.length === 0) { alert("No data to export."); return; }
    const headers = ["Timestamp", "Sender", "Recipient", "Content Snippet", "Flagged", "Flag Type", "Category", "AI Reason", "Source File"];
    const data = sortedDisplayResults.map(sms => [
      formatDate(sms.Timestamp),
      sms.Initiator,
      sms.Recipient,
      sms.Content.substring(0, 50) + (sms.Content.length > 50 ? '...' : ''),
      sms.aiAnalysis?.isFlagged ? 'Yes' : 'No',
      sms.aiAnalysis?.flagType || 'N/A',
      sms.aiAnalysis?.category || 'N/A',
      sms.aiAnalysis?.reason || 'N/A',
      sms.fileName
    ]);
    downloadCSV(`sms_alert_flagging_report_${new Date().toISOString().split('T')[0]}.csv`, data, headers);
  };

  const getFlagIcon = (flagged?: boolean, flagType?: SMSAnalysisResult['flagType']) => {
    if (!flagged) return <ShieldCheck size={16} className="text-success" aria-label="Not Flagged"/>;
    if (flagType === 'obscene') return <Flame size={16} className="text-orange-500" aria-label="Obscene Content"/>;
    if (flagType === 'violent') return <Skull size={16} className="text-red-600" aria-label="Violent Content"/>;
    return <ShieldAlert size={16} className="text-danger" aria-label="Flagged (General)"/>;
  };

  const getCategoryIcon = (category?: SMSAnalysisResult['category']) => {
    switch(category) {
      case 'Normal': return <Smile size={16} className="text-green-600" aria-label="Normal"/>;
      case 'Sensitive': return <Eye size={16} className="text-blue-500" aria-label="Sensitive"/>;
      case 'Adult': return <Ban size={16} className="text-orange-600" aria-label="Adult"/>;
      case 'Criminal': return <AlertTriangle size={16} className="text-red-700" aria-label="Criminal"/>;
      default: return <Info size={16} className="text-neutral-500" aria-label="Unknown Category"/>;
    }
  };
  
  const tableHeaders: { key: keyof ExtendedSMSRecord | 'aiFlagged' | 'aiCategory'; label: string; icon?: React.ReactNode, className?: string }[] = [
    { key: 'Timestamp', label: 'Timestamp', icon: <Clock size={14}/> },
    { key: 'Initiator', label: 'Sender', icon: <Send size={14}/> },
    { key: 'Recipient', label: 'Recipient', icon: <Inbox size={14}/> },
    { key: 'Content', label: 'Content Snippet', icon: <MessageSquare size={14}/>, className: "min-w-[200px] max-w-xs"},
    { key: 'aiFlagged', label: 'Flagged', icon: <Flag size={14}/>, className: "text-center" },
    { key: 'aiCategory', label: 'Category', icon: <ListFilter size={14}/> },
    { key: 'aiAnalysis', label: 'AI Reason', icon: <Edit size={14}/>, className: "min-w-[200px] max-w-md"},
    { key: 'fileName', label: 'Source File', icon: <FileTextIcon size={14}/> },
  ];


  if (contextIsLoading && filteredSMSRecords.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading SMS data...</p></div>;
  }
  if (uploadedSMSFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload SMS data files to use the Alert & Flagging module.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                  <ShieldAlert size={24} className="mr-2.5 text-primary" /> SMS Alert & Flagging Module
                </div>
                <p className="text-sm text-textSecondary">Analyze SMS content for problematic language using AI.</p>
                 <p className="text-xs text-textSecondary mt-1">Note: AI insights are based on a sample of currently filtered SMS records. Results may vary.</p>
            </div>
            <button 
                onClick={handleAnalyzeSMS} 
                disabled={isAnalyzing || filteredSMSRecords.length === 0}
                className="mt-3 sm:mt-0 px-5 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
                {isAnalyzing ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
                ) : (
                    <Zap size={16} className="mr-2" />
                )}
                {isAnalyzing ? 'Analyzing SMS...' : `Analyze ${filteredSMSRecords.length} SMS`}
            </button>
        </div>
      </div>

      {aiError && <div className="p-3 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-start shadow"><AlertTriangle size={18} className="mr-2 mt-0.5 flex-shrink-0"/><div><p className="font-semibold">Analysis Error</p><p className="text-xs">{aiError}</p></div></div>}
      
      {isAnalyzing && analysisResults.length === 0 && <div className="flex justify-center items-center h-40"><Loader2 className="h-10 w-10 animate-spin text-primary" /><p className="ml-3 text-textSecondary">AI analysis in progress...</p></div>}
      
      {!isAnalyzing && !aiError && analysisResults.length === 0 && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={28} className="mb-2 text-neutral-DEFAULT" />
            <p className="font-medium">Click "Analyze SMS" to begin AI content analysis of the current SMS data.</p> 
            {filteredSMSRecords.length === 0 && <p className="text-xs mt-1 text-warning-dark">(No SMS records currently loaded or matching filters for analysis)</p>}
        </div>
      )}

      {analysisResults.length > 0 && !isAnalyzing && filteredDisplayResults.length === 0 && (
        <div className="p-4 bg-info-lighter border border-info-light rounded-lg text-info-dark flex items-center shadow-md">
          <Info size={18} className="mr-2"/> No flagged messages match the current category/type filters.
        </div>
      )}
      
      {sortedDisplayResults.length > 0 && (
        <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
          <div className="flex flex-col sm:flex-row justify-between items-center mb-3">
            <h3 className="text-base sm:text-lg font-semibold text-textPrimary">Analysis Results ({sortedDisplayResults.length} items)</h3>
            <div className="flex gap-2 items-center mt-2 sm:mt-0 text-xs">
                <select name="flagType" value={filters.flagType} onChange={(e) => setFilters(f => ({...f, flagType: e.target.value}))} className="p-1.5 border border-neutral-light rounded-md shadow-sm bg-surface">
                    <option value="">All Flag Types</option>
                    <option value="obscene">Obscene</option>
                    <option value="violent">Violent</option>
                </select>
                 <select name="category" value={filters.category} onChange={(e) => setFilters(f => ({...f, category: e.target.value}))} className="p-1.5 border border-neutral-light rounded-md shadow-sm bg-surface">
                    <option value="">All Categories</option>
                    <option value="Normal">Normal</option>
                    <option value="Sensitive">Sensitive</option>
                    <option value="Adult">Adult</option>
                    <option value="Criminal">Criminal</option>
                </select>
                <button onClick={handleExportData} className="px-3 py-1.5 bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-sm"><Download size={14} className="mr-1.5"/>Export</button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-neutral-light">
              <thead className="bg-neutral-lightest sticky top-0">
                <tr>{tableHeaders.map(h => <th key={String(h.key)} onClick={() => requestSort(h.key!)} className={`group px-3 py-2.5 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider cursor-pointer hover:bg-neutral-lighter ${h.className || ''}`}><div className="flex items-center">{h.icon && <span className="mr-1.5 text-neutral-DEFAULT group-hover:text-primary">{h.icon}</span>}{h.label}{renderSortIcon(h.key!)}</div></th>)}</tr>
              </thead>
              <tbody className="bg-surface divide-y divide-neutral-light">
                {paginatedResults.map((sms) => (
                  <tr key={sms.id} className={`hover:bg-neutral-lightest/50 ${sms.aiAnalysis?.isFlagged ? 'bg-danger-lighter/30' : (sms.aiAnalysis?.category !== 'Normal' && sms.aiAnalysis?.category !== undefined ? 'bg-warning-lighter/30' : '')}`}>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{formatDate(sms.Timestamp)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textPrimary font-medium">{sms.Initiator}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{sms.Recipient}</td>
                    <td className="px-3 py-2 text-xs text-textSecondary max-w-xs truncate" title={sms.Content}>{sms.Content.substring(0,50)}{sms.Content.length > 50 ? '...' : ''}</td>
                    <td className="px-3 py-2 text-xs text-textSecondary text-center">{getFlagIcon(sms.aiAnalysis?.isFlagged, sms.aiAnalysis?.flagType)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary">{getCategoryIcon(sms.aiAnalysis?.category)} {sms.aiAnalysis?.category || 'N/A'}</td>
                    <td className="px-3 py-2 text-xs text-textSecondary max-w-md truncate" title={sms.aiAnalysis?.reason || ''}>{sms.aiAnalysis?.reason || (sms.aiAnalysis ? '' : 'Not Analyzed')}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-textSecondary max-w-[100px] truncate" title={sms.fileName}>{sms.fileName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row justify-between items-center mt-3 pt-2 border-t border-neutral-light text-xs">
              <span className="text-textSecondary mb-1 sm:mb-0">Page {currentPage} of {totalPages} ({sortedDisplayResults.length} results)</span>
              <div className="flex gap-1.5">
                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Prev</button>
                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2.5 py-1 font-medium bg-surface border rounded-md shadow-sm hover:bg-neutral-lighter disabled:opacity-50">Next</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SMSAlertFlaggingView;
