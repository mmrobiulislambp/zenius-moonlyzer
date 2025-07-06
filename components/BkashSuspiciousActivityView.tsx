
import React, { useState, useCallback, useMemo } from 'react';
import { ShieldAlert, Zap, Info, Loader2, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { BkashRecord } from '../types';
import { formatDate } from '../utils/cdrUtils';

interface BkashAISuspicionReport {
  title: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  entitiesInvolved: string[]; // e.g., Account numbers, Trx IDs
  supportingData?: Record<string, string | number>; // e.g., transaction count, total amount, time window
  suggestedAction?: string;
}

const formatCurrencyForAI = (amount?: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  return `BDT ${amount.toFixed(2)}`;
};

// Helper to create a concise summary of bKash data for the AI prompt
const summarizeBkashDataForAI = (records: BkashRecord[], maxEntries = 50): string => {
    if (records.length === 0) return "No bKash transaction data available for analysis.";

    const summaryPoints: string[] = [];
    summaryPoints.push(`- Total bKash Transactions for Analysis: ${records.length}`);

    const totalSent = records.filter(r => r.transactionDirection === 'DEBIT').reduce((sum, r) => sum + r.transactedAmount, 0);
    const totalReceived = records.filter(r => r.transactionDirection === 'CREDIT').reduce((sum, r) => sum + r.transactedAmount, 0);
    summaryPoints.push(`- Overall Total Amount Sent: ${formatCurrencyForAI(totalSent)}`);
    summaryPoints.push(`- Overall Total Amount Received: ${formatCurrencyForAI(totalReceived)}`);

    const trxTypeCounts = new Map<string, number>();
    records.forEach(r => trxTypeCounts.set(r.trxType, (trxTypeCounts.get(r.trxType) || 0) + 1));
    const topTrxTypes = Array.from(trxTypeCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,5);
    summaryPoints.push(`- Top Transaction Types: ${topTrxTypes.map(([type, count]) => `${type} (${count})`).join(', ') || 'None'}`);
    
    const senderCounts = new Map<string, {count: number, volume: number}>();
    records.filter(r => r.sender && r.transactionDirection === 'DEBIT').forEach(r => {
        const entry = senderCounts.get(r.sender) || {count:0, volume:0};
        entry.count++;
        entry.volume += r.transactedAmount;
        senderCounts.set(r.sender, entry);
    });
    const topSenders = Array.from(senderCounts.entries()).sort((a,b) => b[1].volume - a[1].volume).slice(0,3);
    summaryPoints.push(`- Top Senders (by volume): ${topSenders.map(([acc, data]) => `${acc} (${data.count} txns, ${formatCurrencyForAI(data.volume)})`).join('; ') || 'None identified in sample'}`);

    const receiverCounts = new Map<string, {count: number, volume: number}>();
    records.filter(r => r.receiver && r.transactionDirection === 'CREDIT').forEach(r => {
        const entry = receiverCounts.get(r.receiver) || {count:0, volume:0};
        entry.count++;
        entry.volume += r.transactedAmount;
        receiverCounts.set(r.receiver, entry);
    });
    const topReceivers = Array.from(receiverCounts.entries()).sort((a,b) => b[1].volume - a[1].volume).slice(0,3);
    summaryPoints.push(`- Top Receivers (by volume): ${topReceivers.map(([acc, data]) => `${acc} (${data.count} txns, ${formatCurrencyForAI(data.volume)})`).join('; ') || 'None identified in sample'}`);
    
    const sampleRecords = records.slice(0, Math.min(records.length, Math.min(maxEntries, 5))).map(r => {
        return `{trxId: ${r.trxId || 'N/A'}, type: ${r.trxType}, sender: ${r.sender || 'N/A'}, receiver: ${r.receiver || 'N/A'}, amount: ${formatCurrencyForAI(r.transactedAmount)}, time: ${r.transactionDate ? formatDate(r.transactionDate) : 'N/A'}}`;
    });
    summaryPoints.push(`\n- Sample Records (first few): \n  ${sampleRecords.join('\n  ')}`);

    return summaryPoints.join('\n');
};


const BkashSuspiciousActivityView: React.FC = () => {
  const { globallyFilteredBkashRecords, isLoading: contextIsLoading, uploadedBkashFiles } = useBkashContext();
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<BkashAISuspicionReport[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAnalyzeSuspiciousActivity = useCallback(async () => {
    if (globallyFilteredBkashRecords.length === 0) {
      setAiError("No bKash transaction data available to analyze. Please check your filters or upload files.");
      return;
    }
    setIsLoadingAI(true);
    setAiError(null);
    setAiInsights(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const dataSummary = summarizeBkashDataForAI(globallyFilteredBkashRecords);
      
      const prompt = `
        You are an expert financial fraud analyst specializing in Mobile Financial Services (MFS) like bKash. Analyze the following summarized bKash transaction data to identify suspicious patterns or anomalies.

        Key areas to focus on:
        1.  Rapid Transactions: Many transactions (especially small amounts) to/from the same account or a small set of accounts in a short period.
        2.  Large Volume Movements: Unusually large single transactions or a series of transactions summing to a large amount.
        3.  Unusual Timing: Significant activity during typically off-peak hours (e.g., 1 AM - 5 AM).
        4.  Layering/Structuring Patterns: Multiple transactions slightly below common reporting or scrutiny thresholds.
        5.  High Velocity: An account involved in an unusually high number of transactions (either sending or receiving) over a period.
        6.  Pass-Through Activity: Funds quickly moving in and out of an account with minimal balance retention.
        7.  Anomalous Transaction Types: Unusual frequency or volume for specific transaction types given the typical account profile (if inferable).

        Data Summary:
        ${dataSummary}

        Please return your findings as a JSON array of objects. Each object represents one suspicious activity or significant insight and should have the following fields:
        - "title": string (A concise title for the anomaly, e.g., "Rapid Small Transactions", "Large Outflow Anomaly")
        - "description": string (Detailed explanation of the anomaly, 2-3 sentences, referencing specific data points or patterns from the summary)
        - "severity": "Low" | "Medium" | "High"
        - "entitiesInvolved": string[] (List of key entities involved, e.g., ["Account: 017...", "TrxType: Send Money"])
        - "supportingData": Record<string, string | number> (Optional: A small JSON object with 2-3 key data points from the input summary that directly support your finding, e.g., {"transactionCount": 25, "timeWindowMinutes": 10, "averageAmount": "BDT 50.00"})
        - "suggestedAction": string (Potential investigative next steps if applicable, e.g., "Review detailed transaction logs for involved accounts.")

        Example of a JSON object for one finding:
        {
          "title": "Potential Structuring Activity",
          "description": "Account 017XXXXXXXX has multiple outgoing 'Send Money' transactions of BDT 4,900 - 4,990 each, totaling BDT 49,500 within a 2-hour window. This pattern might indicate an attempt to stay below a BDT 5,000 threshold.",
          "severity": "Medium",
          "entitiesInvolved": ["Account: 017XXXXXXXX", "TrxType: Send Money"],
          "supportingData": { "transactionCount": 10, "timeWindowHours": 2, "commonAmountRange": "BDT 4900-4990" },
          "suggestedAction": "Examine receiver accounts and subsequent fund movements. Check if this account exhibits similar patterns historically."
        }

        If no significant suspicious activities are found, return an empty JSON array: [].
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
      
      const parsedResults = JSON.parse(jsonStr);
      if (Array.isArray(parsedResults)) {
        const validResults = parsedResults.filter(item => 
            typeof item.title === 'string' &&
            typeof item.description === 'string' &&
            ['Low', 'Medium', 'High'].includes(item.severity) &&
            Array.isArray(item.entitiesInvolved)
        );
        setAiInsights(validResults as BkashAISuspicionReport[]);
        if(validResults.length !== parsedResults.length) {
            console.warn("Some AI results for bKash had unexpected structure and were filtered out.");
        }
      } else {
        console.error("Gemini API returned non-array data for bKash analysis:", parsedResults);
        setAiError("Received unexpected data format from AI. Expected an array of insights. Output: " + jsonStr.substring(0,200) + "...");
        setAiInsights([]);
      }

    } catch (e: any) {
      console.error("Error calling Gemini API for bKash suspicious activity:", e);
      setAiError(`Failed to analyze for suspicious activity: ${e.message || 'Unknown error'}. Check API key and console.`);
    } finally {
      setIsLoadingAI(false);
    }
  }, [globallyFilteredBkashRecords]);

  const getSeverityClass = (severity: 'Low' | 'Medium' | 'High') => {
    switch (severity) {
      case 'High': return 'border-danger-dark bg-danger-lighter text-danger-darker';
      case 'Medium': return 'border-warning-dark bg-warning-lighter text-warning-darker';
      case 'Low': return 'border-info-dark bg-info-lighter text-info-darker';
      default: return 'border-neutral-dark bg-neutral-lighter text-neutral-darker';
    }
  };
  
  const getSeverityIcon = (severity: 'Low' | 'Medium' | 'High') => {
    switch (severity) {
      case 'High': return <AlertTriangle size={16} className="text-danger-dark" />;
      case 'Medium': return <Activity size={16} className="text-warning-dark" />;
      case 'Low': return <Info size={16} className="text-info-dark" />;
      default: return <Info size={16} className="text-neutral-dark" />;
    }
  };

  if (contextIsLoading && globallyFilteredBkashRecords.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-pink-500" /><p className="ml-3 text-textSecondary">Loading bKash data...</p></div>;
  }
  if (uploadedBkashFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload bKash statement files to enable AI-powered suspicious activity detection.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
              <ShieldAlert size={24} className="mr-2.5 text-pink-500" /> bKash Suspicious Activity Detection (AI)
            </div>
            <p className="text-sm text-textSecondary">Utilize AI to identify potentially suspicious transaction patterns in bKash data.</p>
            <p className="text-xs text-textSecondary mt-1">Note: AI insights are based on a summary of the currently filtered data and should be cross-verified.</p>
          </div>
          <button 
            onClick={handleAnalyzeSuspiciousActivity} 
            disabled={isLoadingAI || globallyFilteredBkashRecords.length === 0}
            className="mt-3 sm:mt-0 px-5 py-2.5 text-sm bg-pink-500 text-white rounded-lg hover:bg-pink-600 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingAI ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
            ) : (
                <Zap size={16} className="mr-2" />
            )}
            {isLoadingAI ? 'AI Analyzing...' : `Analyze ${globallyFilteredBkashRecords.length} Transactions`}
          </button>
        </div>
      </div>

      {aiError && (
        <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-start shadow">
          <AlertTriangle size={20} className="mr-2.5 mt-0.5 flex-shrink-0"/> 
          <div>
            <p className="font-semibold">AI Analysis Error</p>
            <p className="text-xs">{aiError}</p>
          </div>
        </div>
      )}

      {isLoadingAI && (
        <div className="flex flex-col items-center justify-center h-60 bg-surface rounded-xl border border-neutral-light shadow-md">
            <Loader2 className="h-10 w-10 animate-spin text-pink-500" />
            <p className="mt-3 text-textSecondary">AI is processing bKash transactions... This may take a few moments.</p>
        </div>
      )}

      {!isLoadingAI && !aiError && !aiInsights && globallyFilteredBkashRecords.length > 0 && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2 text-neutral-DEFAULT" />
            <p className="font-medium">Click "Analyze Transactions" to initiate AI-powered suspicious activity detection.</p>
        </div>
      )}
      {!isLoadingAI && !aiError && !aiInsights && globallyFilteredBkashRecords.length === 0 && uploadedBkashFiles.length > 0 && (
         <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <AlertTriangle size={28} className="mb-2" />
            <p className="font-medium">No bKash records currently available for analysis. Check global filters or select files.</p>
        </div>
      )}


      {aiInsights && aiInsights.length === 0 && !aiError && !isLoadingAI && (
        <div className="p-6 bg-success-lighter border border-success-light rounded-lg text-center text-success-darker flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <CheckCircle size={28} className="mb-2"/>
            <p className="font-medium">AI analysis complete. No specific suspicious activities were flagged by the AI in this dataset.</p>
        </div>
      )}

      {aiInsights && aiInsights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-textPrimary">AI-Detected Suspicious Activities ({aiInsights.length}):</h3>
          {aiInsights.map((insight, index) => (
            <div key={index} className={`p-4 border-l-4 rounded-r-lg shadow-md hover:shadow-lg transition-shadow ${getSeverityClass(insight.severity)}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start">
                <div className="flex-grow">
                    <p className="text-sm font-semibold flex items-center">
                        {getSeverityIcon(insight.severity)}
                        <span className="ml-2">{insight.title}</span>
                    </p>
                    <p className="text-xs mt-1.5">{insight.description}</p>
                </div>
                <span className={`mt-2 sm:mt-0 ml-0 sm:ml-3 px-2 py-0.5 text-[10px] font-medium rounded-full ${getSeverityClass(insight.severity)} border border-current/50`}>
                    Severity: {insight.severity}
                </span>
              </div>
              
              {insight.entitiesInvolved && insight.entitiesInvolved.length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-current/20 text-xs">
                  <p className="font-medium mb-0.5">Entities Involved:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {insight.entitiesInvolved.map((entity, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-current/10 text-current rounded-full text-[10px] border border-current/30">{entity}</span>
                    ))}
                  </div>
                </div>
              )}

              {insight.supportingData && Object.keys(insight.supportingData).length > 0 && (
                <div className="mt-2 pt-1.5 border-t border-current/20 text-xs">
                  <p className="font-medium mb-0.5">Supporting Data:</p>
                  <ul className="list-disc list-inside pl-3 space-y-0.5">
                    {Object.entries(insight.supportingData).map(([key, value]) => (
                      <li key={key} className="truncate" title={`${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${String(value)}`}>
                        <span className="font-semibold">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span> {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

               {insight.suggestedAction && (
                <div className="mt-2 pt-1.5 border-t border-current/20 text-xs">
                  <p className="font-medium mb-0.5">Suggested Action:</p>
                  <p>{insight.suggestedAction}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default BkashSuspiciousActivityView;