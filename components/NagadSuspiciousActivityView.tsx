
import React, { useState, useCallback, useMemo } from 'react';
import { ShieldAlert, Zap, Info, Loader2, AlertTriangle, CheckCircle, Activity } from 'lucide-react';
import { useNagadContext } from '../contexts/NagadContext';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { NagadRecord } from '../types';
import { formatDate } from '../utils/cdrUtils';

interface NagadAISuspicionReport {
  title: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  entitiesInvolved: string[];
  supportingData?: Record<string, string | number>;
  suggestedAction?: string;
}

const formatCurrencyForAI = (amount?: number): string => {
  if (amount === undefined || amount === null || isNaN(amount)) return 'N/A';
  return `BDT ${amount.toFixed(2)}`;
};

// Helper to create a concise summary of Nagad data for the AI prompt
const summarizeNagadDataForAI = (records: NagadRecord[], maxEntries = 50): string => {
    if (records.length === 0) return "No Nagad transaction data available for analysis.";

    const summaryPoints: string[] = [];
    summaryPoints.push(`- Total Nagad Transactions for Analysis: ${records.length}`);

    const totalCredit = records.filter(r => r.TXN_TYPE_DR_CR === 'CREDIT').reduce((sum, r) => sum + r.TXN_AMT, 0);
    const totalDebit = records.filter(r => r.TXN_TYPE_DR_CR === 'DEBIT').reduce((sum, r) => sum + r.TXN_AMT, 0);
    summaryPoints.push(`- Overall Total Amount Credited to Statement Account: ${formatCurrencyForAI(totalCredit)}`);
    summaryPoints.push(`- Overall Total Amount Debited from Statement Account: ${formatCurrencyForAI(totalDebit)}`);

    const txnTypeCounts = new Map<string, number>();
    records.forEach(r => txnTypeCounts.set(r.TXN_TYPE, (txnTypeCounts.get(r.TXN_TYPE) || 0) + 1));
    const topTrxTypes = Array.from(txnTypeCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,5);
    summaryPoints.push(`- Top Transaction Types: ${topTrxTypes.map(([type, count]) => `${type} (${count})`).join(', ') || 'None'}`);
    
    const partnerAccountStats = new Map<string, { sentToStatement: number, receivedFromStatement: number, count: number }>();
    records.forEach(r => {
        if (r.TXN_WITH_ACC && r.TXN_WITH_ACC.trim() !== '' && r.TXN_WITH_ACC.toUpperCase() !== 'SYSTEM') {
            const partner = r.TXN_WITH_ACC;
            const entry = partnerAccountStats.get(partner) || { sentToStatement: 0, receivedFromStatement: 0, count: 0 };
            entry.count++;
            if (r.TXN_TYPE_DR_CR === 'CREDIT') entry.sentToStatement += r.TXN_AMT;
            else if (r.TXN_TYPE_DR_CR === 'DEBIT') entry.receivedFromStatement += r.TXN_AMT;
            partnerAccountStats.set(partner, entry);
        }
    });
    const topPartnersByVolume = Array.from(partnerAccountStats.entries())
        .map(([acc, data]) => ({ account: acc, totalVolume: data.sentToStatement + data.receivedFromStatement, count: data.count }))
        .sort((a,b) => b.totalVolume - a.totalVolume)
        .slice(0,5);
    summaryPoints.push(`- Top Interacting Accounts (by volume): ${topPartnersByVolume.map(p => `${p.account} (${p.count} txns, ${formatCurrencyForAI(p.totalVolume)})`).join('; ') || 'None identified in sample'}`);

    const channelCounts = new Map<string, number>();
    records.forEach(r => channelCounts.set(r.CHANNEL, (channelCounts.get(r.CHANNEL) || 0) + 1));
    const topChannels = Array.from(channelCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,3);
    summaryPoints.push(`- Top Channels Used: ${topChannels.map(([ch, count]) => `${ch} (${count})`).join(', ') || 'None'}`);
    
    const sampleRecords = records.slice(0, Math.min(records.length, Math.min(maxEntries, 5))).map(r => {
        return `{txnId: ${r.TXN_ID || 'N/A'}, type: ${r.TXN_TYPE}, statementAcc: ${r.STATEMENT_FOR_ACC}, partnerAcc: ${r.TXN_WITH_ACC || 'N/A'}, direction: ${r.TXN_TYPE_DR_CR}, amount: ${formatCurrencyForAI(r.TXN_AMT)}, time: ${r.TXN_DATE_TIME ? formatDate(r.TXN_DATE_TIME) : 'N/A'}}`;
    });
    summaryPoints.push(`\n- Sample Records (first few): \n  ${sampleRecords.join('\n  ')}`);

    return summaryPoints.join('\n');
};


const NagadSuspiciousActivityView: React.FC = () => {
  const { globallyFilteredNagadRecords, isLoading: contextIsLoading, uploadedNagadFiles } = useNagadContext();
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<NagadAISuspicionReport[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAnalyzeSuspiciousActivity = useCallback(async () => {
    if (globallyFilteredNagadRecords.length === 0) {
      setAiError("No Nagad transaction data available to analyze. Please check your filters or upload files.");
      return;
    }
    setIsLoadingAI(true);
    setAiError(null);
    setAiInsights(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const dataSummary = summarizeNagadDataForAI(globallyFilteredNagadRecords);
      
      const prompt = `
        You are an expert financial fraud analyst specializing in Mobile Financial Services (MFS) like Nagad. Analyze the following summarized Nagad transaction data to identify suspicious patterns or anomalies.

        Key areas to focus on:
        1.  Rapid Transactions: Many transactions (especially small amounts) to/from the same account or a small set of accounts in a short period.
        2.  Large Volume Movements: Unusually large single transactions or a series of transactions summing to a large amount.
        3.  Unusual Timing: Significant activity during typically off-peak hours (e.g., 1 AM - 5 AM).
        4.  Layering/Structuring Patterns: Multiple transactions slightly below common reporting or scrutiny thresholds.
        5.  High Velocity: An account involved in an unusually high number of transactions (either sending or receiving) over a period.
        6.  Pass-Through Activity: Funds quickly moving in and out of an account with minimal balance retention.
        7.  Anomalous Transaction Types or Channels: Unusual frequency or volume for specific transaction types or channels given the typical account profile (if inferable).

        Data Summary:
        ${dataSummary}

        Please return your findings as a JSON array of objects. Each object represents one suspicious activity or significant insight and should have the following fields:
        - "title": string (A concise title for the anomaly, e.g., "Rapid Small Value Transfers", "Large Cash Out Anomaly")
        - "description": string (Detailed explanation of the anomaly, 2-3 sentences, referencing specific data points or patterns from the summary)
        - "severity": "Low" | "Medium" | "High"
        - "entitiesInvolved": string[] (List of key entities involved, e.g., ["Statement Acc: 018...", "Partner Acc: 019...", "TxnType: Send Money"])
        - "supportingData": Record<string, string | number> (Optional: A small JSON object with 2-3 key data points from the input summary that directly support your finding, e.g., {"transactionCount": 30, "timeWindowHours": 1, "totalAmount": "BDT 150000"})
        - "suggestedAction": string (Potential investigative next steps if applicable, e.g., "Review detailed transaction logs for involved accounts. Check if partner accounts are also suspicious.")

        Example of a JSON object for one finding:
        {
          "title": "High Frequency Small Debits",
          "description": "Statement Account 018XXXXXXXX has made 25 'Send Money' transactions, each BDT 500, to various accounts within 30 minutes. This might indicate automated activity or micro-laundering attempts.",
          "severity": "High",
          "entitiesInvolved": ["Statement Acc: 018XXXXXXXX", "TxnType: Send Money"],
          "supportingData": { "transactionCount": 25, "timeWindowMinutes": 30, "averageAmount": "BDT 500.00" },
          "suggestedAction": "Investigate the recipient accounts for common links or further suspicious activity. Check the source of funds for the statement account."
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
        setAiInsights(validResults as NagadAISuspicionReport[]);
        if(validResults.length !== parsedResults.length) {
            console.warn("Some AI results for Nagad had unexpected structure and were filtered out.");
        }
      } else {
        console.error("Gemini API returned non-array data for Nagad analysis:", parsedResults);
        setAiError("Received unexpected data format from AI. Expected an array of insights. Output: " + jsonStr.substring(0,200) + "...");
        setAiInsights([]);
      }

    } catch (e: any) {
      console.error("Error calling Gemini API for Nagad suspicious activity:", e);
      setAiError(`Failed to analyze for suspicious activity: ${e.message || 'Unknown error'}. Check API key and console.`);
    } finally {
      setIsLoadingAI(false);
    }
  }, [globallyFilteredNagadRecords]);

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

  if (contextIsLoading && globallyFilteredNagadRecords.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-emerald-500" /><p className="ml-3 text-textSecondary">Loading Nagad data...</p></div>;
  }
  if (uploadedNagadFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload Nagad statement files to enable AI-powered suspicious activity detection.</p></div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
              <ShieldAlert size={24} className="mr-2.5 text-emerald-500" /> Nagad Suspicious Activity Detection (AI)
            </div>
            <p className="text-sm text-textSecondary">Utilize AI to identify potentially suspicious transaction patterns in Nagad data.</p>
            <p className="text-xs text-textSecondary mt-1">Note: AI insights are based on a summary of the currently filtered data and should be cross-verified.</p>
          </div>
          <button 
            onClick={handleAnalyzeSuspiciousActivity} 
            disabled={isLoadingAI || globallyFilteredNagadRecords.length === 0}
            className="mt-3 sm:mt-0 px-5 py-2.5 text-sm bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingAI ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
            ) : (
                <Zap size={16} className="mr-2" />
            )}
            {isLoadingAI ? 'AI Analyzing...' : `Analyze ${globallyFilteredNagadRecords.length} Transactions`}
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
            <Loader2 className="h-10 w-10 animate-spin text-emerald-500" />
            <p className="mt-3 text-textSecondary">AI is processing Nagad transactions... This may take a few moments.</p>
        </div>
      )}

      {!isLoadingAI && !aiError && !aiInsights && globallyFilteredNagadRecords.length > 0 && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2 text-neutral-DEFAULT" />
            <p className="font-medium">Click "Analyze Transactions" to initiate AI-powered suspicious activity detection.</p>
        </div>
      )}
      {!isLoadingAI && !aiError && !aiInsights && globallyFilteredNagadRecords.length === 0 && uploadedNagadFiles.length > 0 && (
         <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <AlertTriangle size={28} className="mb-2" />
            <p className="font-medium">No Nagad records currently available for analysis. Check global filters or select files.</p>
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

export default NagadSuspiciousActivityView;