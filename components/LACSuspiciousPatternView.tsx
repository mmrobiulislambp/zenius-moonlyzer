
import React, { useState, useCallback } from 'react';
import { BrainCircuit, Zap, Loader2, AlertTriangle, Info, List, MessageSquare, RepeatIcon, PhoneCallIcon } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext';
import { LACRecord, LACAnomalyReport } from '../types';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

const LACSuspiciousPatternView: React.FC = () => {
  const { filteredLACRecords, isLoading: contextIsLoading } = useLACContext();
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<LACAnomalyReport[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleAnalyzePatterns = useCallback(async () => {
    if (filteredLACRecords.length === 0) {
      setAiError("No LAC data currently filtered for analysis. Please check your filters or upload data.");
      setAiInsights(null);
      return;
    }
    setIsLoadingAI(true);
    setAiError(null);
    setAiInsights(null);

    try {
      // @ts-ignore
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      // Prepare a sample of data for the AI, focusing on relevant fields
      const sampleSize = Math.min(filteredLACRecords.length, 50); // Limit sample size
      const dataSampleForAI = filteredLACRecords.slice(0, sampleSize).map(r => ({
        DATE_TIME: r.DATE_TIME,
        MSISDN: r.MSISDN,
        OTHER_PARTY_NUMBER: r.OTHER_PARTY_NUMBER,
        USAGE_TYPE: r.USAGE_TYPE,
        CALL_DURATION: r.CALL_DURATION,
        LAC: r.LAC,
        CELL_ID: r.CELL_ID,
        IMEI: r.IMEI,
      }));

      const prompt = `
        You are an expert telecom fraud and anomaly detection analyst for Location Area Code (LAC) and Cell ID based data.
        Analyze the following sample of LAC/Cell records to identify potential suspicious patterns.
        Focus on these patterns based on the provided LAC data:
        1.  High SMS Volume: A large number of SMS messages (look for USAGE_TYPE like "SMSMO", "SMSMT", etc.) for a single MSISDN or IMEI in a short period or concentrated within a specific LAC-CELL_ID.
        2.  Rapid SIM/IMEI Change (if IMEI data is present in sample): An IMEI associated with multiple MSISDNs, or an MSISDN associated with multiple IMEIs in a short timeframe within this data sample and specific LAC-CELL_ID.
        3.  Frequent Short Calls from Same Cell ID: Multiple short duration calls (e.g., CALL_DURATION < 30 seconds) originating from or terminating at the same LAC-CELL_ID for a specific MSISDN or IMEI.

        For each detected anomaly, provide the following information in a JSON object:
        - "entityId": string (The primary MSISDN or IMEI involved in the pattern. If multiple, pick the most relevant or list them if appropriate within supporting data.)
        - "patternType": string (One of: "High SMS Volume", "Rapid SIM/IMEI Change", "Frequent Short Calls from Same Cell ID", or a more specific description if these don't fit well but is derived from the three categories)
        - "description": string (A concise explanation of why this pattern is suspicious based *only* on the provided data sample, highlighting key data points like counts, timeframes, specific LAC/Cell IDs if relevant to the pattern. Be specific about what in the data led to this conclusion.)
        - "severity": "Low" | "Medium" | "High" (Your assessment of the pattern's severity based *only* on the provided data sample.)
        - "supportingData": Record<string, any> (A small JSON object with 2-4 key data points from the input that directly support your finding. Example keys: "smsCount", "timeWindowMinutes", "lacCellId", "imeiCount", "msisdnCount", "shortCallCount", "callDurationSecondsAvg", "distinctOtherParties". Values should be derived from the sample data.)
        - "lacCellId": string (Optional: The "LAC-CELLID" where the pattern was most prominent, if applicable to the pattern itself.)
        
        Return your findings as a JSON array of these objects. If no significant anomalies are found from the categories above, return an empty JSON array: [].
        Do not invent data or patterns not present in the sample. Base all findings strictly on the provided data.

        Data Sample:
        ${JSON.stringify(dataSampleForAI, null, 2)}
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
        // Validate structure of each item roughly, more robust validation can be added
        const validResults = parsedResults.filter(item => 
            typeof item.entityId === 'string' &&
            typeof item.patternType === 'string' &&
            typeof item.description === 'string' &&
            ['Low', 'Medium', 'High'].includes(item.severity)
        );
        setAiInsights(validResults as LACAnomalyReport[]);
         if(validResults.length !== parsedResults.length) {
            console.warn("Some AI results had unexpected structure and were filtered out.");
        }
      } else {
        console.error("Gemini API returned non-array data:", parsedResults);
        setAiError("Received unexpected data format from AI. Expected an array of anomalies. Output: " + jsonStr.substring(0,200) + "...");
        setAiInsights([]);
      }

    } catch (e: any) {
      console.error("Error calling Gemini API for LAC pattern detection:", e);
      setAiError(`Failed to analyze patterns: ${e.message || 'Unknown error'}. Check API key and console.`);
    } finally {
      setIsLoadingAI(false);
    }
  }, [filteredLACRecords]);

  const getSeverityPillClass = (severity?: 'Low' | 'Medium' | 'High') => {
    switch (severity) {
      case 'High': return 'bg-danger text-white';
      case 'Medium': return 'bg-warning text-warning-darker';
      case 'Low': return 'bg-info text-white';
      default: return 'bg-neutral-light text-neutral-darker';
    }
  };
  
  const getPatternIcon = (patternType: string) => {
    const lowerPatternType = patternType.toLowerCase();
    if (lowerPatternType.includes("sms")) return <MessageSquare size={20} className="mr-2 text-primary"/>;
    if (lowerPatternType.includes("sim") || lowerPatternType.includes("imei")) return <RepeatIcon size={20} className="mr-2 text-primary"/>;
    if (lowerPatternType.includes("call")) return <PhoneCallIcon size={20} className="mr-2 text-primary"/>;
    return <Zap size={20} className="mr-2 text-primary"/>;
  };


  return (
    <div className="space-y-6">
      <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center shadow-md">
        <BrainCircuit size={28} className="mb-3 text-primary" />
        <h2 className="text-lg font-semibold text-textPrimary mb-2 flex items-center">
          Suspicious Pattern Detection (AI Analysis)
        </h2>
        <p className="text-sm mb-4 max-w-2xl">
          This tool leverages AI to analyze a sample of the currently filtered LAC/Cell data, highlighting suspicious patterns such as high SMS volume, rapid SIM/IMEI changes, or frequent short calls within the same Cell ID.
        </p>
        <button
          onClick={handleAnalyzePatterns}
          disabled={isLoadingAI || contextIsLoading || filteredLACRecords.length === 0}
          className="px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isLoadingAI ? (
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
          ) : (
            <Zap size={16} className="mr-2" />
          )}
          {isLoadingAI ? 'AI Analyzing...' : 'Analyze Patterns with AI'}
        </button>
         {filteredLACRecords.length === 0 && !contextIsLoading && (
            <p className="text-xs text-warning-dark mt-2">No LAC/Cell data currently available for analysis. Please select files or adjust global filters.</p>
        )}
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
        <div className="flex flex-col items-center justify-center h-40 bg-surface rounded-xl border border-neutral-light shadow-md">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-3 text-textSecondary">AI is processing LAC/Cell data... This might take a moment.</p>
        </div>
      )}
      
      {!isLoadingAI && !aiError && aiInsights === null && filteredLACRecords.length > 0 && (
         <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={24} className="mb-2" />
            <p>Click "Analyze Patterns with AI" to begin the analysis based on the current data sample.</p>
        </div>
      )}
      
      {aiInsights && aiInsights.length === 0 && !aiError && !isLoadingAI && (
        <div className="p-6 bg-success-lighter border border-success-light rounded-lg text-center text-success-darker flex flex-col items-center justify-center min-h-[100px] shadow-md">
            <Info size={28} className="mb-2"/>
            <p className="font-medium">AI analysis complete. No specific suspicious patterns were flagged in the data sample.</p>
        </div>
      )}

      {aiInsights && aiInsights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-textPrimary">AI Analysis Insights ({aiInsights.length}):</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {aiInsights.map((insight, index) => (
              <div 
                key={index} 
                className="bg-surface p-4 rounded-xl shadow-lg border border-neutral-light hover:shadow-xl transition-shadow duration-150 flex flex-col"
              >
                <div className="flex justify-between items-start mb-2">
                  <h4 className="text-md font-semibold text-textPrimary flex items-center flex-grow mr-2 break-words">
                    {getPatternIcon(insight.patternType)}
                    {insight.patternType}
                  </h4>
                  <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${getSeverityPillClass(insight.severity)}`}>
                    {insight.severity}
                  </span>
                </div>
                <p className="text-xs text-textSecondary mb-1">
                  <span className="font-medium text-neutral-darker">Entity:</span> {insight.entityId}
                </p>
                {insight.lacCellId && (
                  <p className="text-xs text-textSecondary mb-2">
                    <span className="font-medium text-neutral-darker">LAC-Cell ID:</span> {insight.lacCellId}
                  </p>
                )}
                <p className="text-xs text-textSecondary mb-3 flex-grow">{insight.description}</p>
                
                {insight.supportingData && Object.keys(insight.supportingData).length > 0 && (
                  <div className="mt-auto pt-2 border-t border-neutral-light text-xs">
                    <p className="font-medium text-textSecondary mb-1">Supporting Data:</p>
                    <ul className="list-disc list-inside pl-3 space-y-0.5 text-neutral-darker">
                      {Object.entries(insight.supportingData).map(([key, value]) => (
                        <li key={key} className="truncate" title={`${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${Array.isArray(value) ? value.join(', ') : String(value)}`}>
                          <span className="font-semibold">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span> {Array.isArray(value) ? value.join(', ') : String(value)}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LACSuspiciousPatternView;

        