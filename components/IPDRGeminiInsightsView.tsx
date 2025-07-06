
import React, { useState, useCallback, useMemo } from 'react';
import { BrainCircuit, Zap, Info, Loader2, AlertTriangle, ChevronDown, ChevronUp, CheckCircle, XCircle, Activity } from 'lucide-react';
import { useIPDRContext } from '../contexts/IPDRContext';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { IPDRRecord } from '../types';
import { formatDate } from '../utils/cdrUtils'; // For formatting dates in sample records

// Interface for structured AI insights
interface StructuredGeminiInsight {
  title: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  entitiesInvolved: string[];
  supportingData?: Record<string, string | number>;
  suggestedAction: string;
}

const formatBytesForAI = (bytes?: number): string => {
  if (bytes === undefined || bytes === null || isNaN(bytes)) return 'N/A';
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

const getHostnameFromUrlForAI = (url?: string): string | null => {
    if (!url || typeof url !== 'string' || !url.trim()) return null;
    try {
        let fullUrl = url.trim();
        if (!fullUrl.match(/^([a-zA-Z]+:\/\/)/)) {
        if (fullUrl.includes('.') && !fullUrl.includes(' ') && !fullUrl.startsWith('/')) {
            fullUrl = 'http://' + fullUrl;
        } else { return url; }
        }
        const parsedUrl = new URL(fullUrl);
        let hostname = parsedUrl.hostname;
        if (hostname.startsWith('www.')) hostname = hostname.substring(4);
        return hostname;
    } catch (e) { return url; } // Return original on error for AI to see raw data
};


// Helper to create a concise summary of IPDR data for the AI prompt
const summarizeIPDRDataForAI = (records: IPDRRecord[], maxEntries = 50): string => {
    if (records.length === 0) return "No IPDR data available for analysis.";

    const summaryPoints: string[] = [];
    const totalVolume = records.reduce((sum, r) => sum + (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0), 0);
    summaryPoints.push(`- Total IPDR Records for Analysis: ${records.length}`);
    summaryPoints.push(`- Overall Total Data Volume: ${formatBytesForAI(totalVolume)}`);
    
    const publicIpCounts = new Map<string, { count: number, volume: number }>();
    records.forEach(r => {
        if (r.publicIP) {
            const entry = publicIpCounts.get(r.publicIP) || { count: 0, volume: 0 };
            entry.count++;
            entry.volume += (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);
            publicIpCounts.set(r.publicIP, entry);
        }
    });
    const topPublicIps = Array.from(publicIpCounts.entries()).sort((a,b) => b[1].volume - a[1].volume).slice(0,5);
    summaryPoints.push(`- Top Public IPs (by volume): ${topPublicIps.map(([ip, data]) => `${ip} (${data.count} sessions, ${formatBytesForAI(data.volume)})`).join(', ') || 'None'}`);

    const serverIpCounts = new Map<string, { count: number, volume: number }>();
    records.forEach(r => {
        if (r.serverIP) {
            const entry = serverIpCounts.get(r.serverIP) || { count: 0, volume: 0 };
            entry.count++;
            entry.volume += (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);
            serverIpCounts.set(r.serverIP, entry);
        }
    });
    const topServerIps = Array.from(serverIpCounts.entries()).sort((a,b) => b[1].volume - a[1].volume).slice(0,5);
    summaryPoints.push(`- Top Server IPs (by volume): ${topServerIps.map(([ip, data]) => `${ip} (${data.count} sessions, ${formatBytesForAI(data.volume)})`).join(', ') || 'None'}`);

    const msisdnDataVolume = new Map<string, number>();
    records.forEach(r => {
        if (r.msisdn) {
            const volume = (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);
            msisdnDataVolume.set(r.msisdn, (msisdnDataVolume.get(r.msisdn) || 0) + volume);
        }
    });
    const topMsisdnsByVolume = Array.from(msisdnDataVolume.entries()).sort((a,b) => b[1]-a[1]).slice(0,5);
    summaryPoints.push(`- Top MSISDNs (by data volume): ${topMsisdnsByVolume.map(([msisdn, vol]) => `${msisdn} (${formatBytesForAI(vol)})`).join(', ') || 'None'}`);
    
    const appDataVolume = new Map<string, number>();
    records.forEach(r => {
        if (r.applicationType) {
            const volume = (r.uplinkTrafficByte || 0) + (r.downlinkTrafficByte || 0);
            appDataVolume.set(r.applicationType, (appDataVolume.get(r.applicationType) || 0) + volume);
        }
    });
    const topAppsByVolume = Array.from(appDataVolume.entries()).sort((a,b) => b[1]-a[1]).slice(0,5);
    summaryPoints.push(`- Top Apps (by data volume): ${topAppsByVolume.map(([app, vol]) => `${app} (${formatBytesForAI(vol)})`).join(', ') || 'None'}`);

    const urlCounts = new Map<string, number>();
    records.forEach(r => {
        if (r.url) {
            const host = getHostnameFromUrlForAI(r.url) || r.url; // Use helper
            urlCounts.set(host, (urlCounts.get(host) || 0) + 1);
        }
    });
    const topUrls = Array.from(urlCounts.entries()).sort((a,b) => b[1]-a[1]).slice(0,10);
    summaryPoints.push(`- Top 10 Accessed Hostnames/URLs (by session count): ${topUrls.map(([url, count]) => `${url} (${count})`).join(', ') || 'None'}`);
    
    const distinctImeis = new Set(records.map(r => r.imeisv).filter(Boolean));
    summaryPoints.push(`- Distinct IMEIs observed: ${distinctImeis.size}`);

    // Add a small sample of raw records (e.g., first 5) for context
    const sampleRecords = records.slice(0, Math.min(maxEntries, 5)).map(r => {
        return `{msisdn: ${r.msisdn || 'N/A'}, imei: ${r.imeisv || 'N/A'}, publicIP: ${r.publicIP || 'N/A'}, serverIP: ${r.serverIP || 'N/A'}, app: ${r.applicationType || 'N/A'}, url: ${getHostnameFromUrlForAI(r.url) || r.url || 'N/A'}, dataUp: ${formatBytesForAI(r.uplinkTrafficByte)}, dataDown: ${formatBytesForAI(r.downlinkTrafficByte)}, time: ${r.startTime ? formatDate(r.startTime) : 'N/A'}}`;
    });
    summaryPoints.push(`\n- Sample Records (first few): \n  ${sampleRecords.join('\n  ')}`);


    return summaryPoints.join('\n');
};


const IPDRGeminiInsightsView: React.FC = () => {
  const { filteredIPDRRecords, isLoading: contextIsLoading, uploadedIPDRFiles } = useIPDRContext();
  const [isLoadingAI, setIsLoadingAI] = useState<boolean>(false);
  const [aiInsights, setAiInsights] = useState<StructuredGeminiInsight[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const handleGenerateInsights = useCallback(async () => {
    if (filteredIPDRRecords.length === 0) {
      setAiError("No IPDR data available to analyze. Please check your filters or upload files.");
      return;
    }
    setIsLoadingAI(true);
    setAiError(null);
    setAiInsights(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const dataSummary = summarizeIPDRDataForAI(filteredIPDRRecords);
      
      const prompt = `
        You are an expert telecom fraud and anomaly detection analyst. Analyze the following summarized IPDR (Internet Protocol Detail Record) data to identify suspicious patterns, potential hidden links between entities, or anomalous activities relevant to a digital investigation. Highlight any entities (MSISDN, IMSI, IMEI, Public IP, URL, Application Type) that stand out.

        Key areas to focus on:
        1.  Unusual Data Volumes: Extremely high up/down traffic for certain users, IPs, or applications.
        2.  Suspicious Timing: Significant activity during odd hours (e.g., 1 AM - 5 AM local time, assume data timestamps are local).
        3.  Anonymization Indicators: Access patterns or app types suggesting TOR/VPN use.
        4.  High IMEI-MSISDN Correlation: A single IMEI associated with an unusually high number of MSISDNs (or vice-versa).
        5.  Anomalous Application Usage: Use of rare, P2P, or heavily encrypted messaging apps in conjunction with other suspicious indicators.
        6.  Concentrated Server IP Access: Many users connecting to a small set of non-CDN server IPs, or a single user to many diverse IPs quickly.
        7.  Repetitive URL Access: High frequency of access to specific, non-mainstream URLs.
        8.  Data Exfiltration Patterns: Large, consistent uploads from a user/IP, especially to unusual destinations or at unusual times.
        9.  Service Abuse: Patterns indicating potential abuse of specific services (e.g., high volume of short sessions to specific ports/applications).

        Data Summary:
        ${dataSummary}

        Please return your findings as a JSON array of objects. Each object represents one anomaly or significant insight and should have the following fields:
        - "title": string (A concise title for the anomaly, e.g., "High Data User", "Suspicious Night Activity")
        - "description": string (Detailed explanation of the anomaly, 2-3 sentences)
        - "severity": "Low" | "Medium" | "High"
        - "entitiesInvolved": string[] (List of key entities involved, e.g., ["MSISDN: 8801...", "App: File Sharing", "IP: 1.2.3.4"])
        - "supportingData": Record<string, string | number> (Optional: A small JSON object with 2-3 key data points from the input that directly support your finding, e.g., {"dataVolume": "50GB", "period": "Last 24h"})
        - "suggestedAction": string (Potential investigative next steps if applicable)

        Example of a JSON object for one finding:
        {
          "title": "Potential High Data User",
          "description": "MSISDN 8801xxxxxxxxx shows unusually high data consumption (e.g., >50GB) concentrated on 'File Sharing' application type. This might indicate bulk data exfiltration or unauthorized distribution.",
          "severity": "Medium",
          "entitiesInvolved": ["MSISDN: 8801xxxxxxxxx", "App: File Sharing"],
          "supportingData": { "totalData": "52GB", "topAppPercentage": "85%" },
          "suggestedAction": "Investigate the specific server IPs and URLs accessed by this MSISDN during high volume periods. Cross-reference with IMEI activity."
        }

        If no significant anomalies are found, return an empty JSON array: [].
      `;

      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17", 
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      let jsonStr = response.text.trim();
      const fenceRegex = /^```(\w*)?\s*\n?(.*?)\n?\s*```$/s;
      const match = jsonStr.match(fenceRegex);
      if (match && match[2]) {
        jsonStr = match[2].trim();
      }
      
      const parsedResults = JSON.parse(jsonStr);
      if (Array.isArray(parsedResults)) {
        setAiInsights(parsedResults as StructuredGeminiInsight[]);
      } else {
        console.error("Gemini API returned non-array data:", parsedResults);
        setAiError("Received unexpected data format from AI. Expected an array of insights. Output: " + jsonStr.substring(0,100) + "...");
        setAiInsights([]);
      }

    } catch (e: any) {
      console.error("Error calling Gemini API for IPDR insights:", e);
      setAiError(`Failed to generate AI insights: ${e.message || 'Unknown error'}. Check API key and console.`);
    } finally {
      setIsLoadingAI(false);
    }
  }, [filteredIPDRRecords]);

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
      case 'Medium': return <Activity size={16} className="text-warning-dark" />; // Using Activity for Medium
      case 'Low': return <Info size={16} className="text-info-dark" />;
      default: return <Info size={16} className="text-neutral-dark" />;
    }
  };


  if (contextIsLoading && filteredIPDRRecords.length === 0) {
    return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading IPDR data for AI analysis...</p></div>;
  }
  if (uploadedIPDRFiles.length === 0 && !contextIsLoading) {
     return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload IPDR files to enable AI-powered insights.</p></div>;
  }


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
          <div>
            <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
              <BrainCircuit size={24} className="mr-2.5 text-primary" /> AI-Powered IPDR Insights
            </div>
            <p className="text-sm text-textSecondary">Leverage Gemini to uncover hidden patterns and anomalies in IPDR data.</p>
             <p className="text-xs text-textSecondary mt-1">Note: AI insights are based on a summary of the data and should be cross-verified.</p>
          </div>
          <button 
            onClick={handleGenerateInsights} 
            disabled={isLoadingAI || filteredIPDRRecords.length === 0}
            className="mt-3 sm:mt-0 px-5 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isLoadingAI ? (
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
            ) : (
                <Zap size={16} className="mr-2" />
            )}
            {isLoadingAI ? 'Analyzing Data...' : 'Generate Insights'}
          </button>
        </div>
      </div>

      {aiError && (
        <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-start">
          <AlertTriangle size={20} className="mr-2.5 mt-0.5 flex-shrink-0"/> 
          <div>
            <p className="font-semibold">Analysis Error</p>
            <p className="text-xs">{aiError}</p>
          </div>
        </div>
      )}

      {isLoadingAI && (
        <div className="flex flex-col items-center justify-center h-60 bg-surface rounded-xl border border-neutral-light shadow-md">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="mt-3 text-textSecondary">AI is processing IPDR data... This might take a moment.</p>
        </div>
      )}

      {!isLoadingAI && !aiError && !aiInsights && (
         <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <Info size={28} className="mb-2 text-neutral-DEFAULT" />
            <p className="font-medium">Click "Generate Insights" to get AI-powered analysis of the current IPDR data.</p>
            {filteredIPDRRecords.length === 0 && <p className="text-xs mt-1 text-warning-dark">(No IPDR records currently loaded or matching filters for analysis)</p>}
        </div>
      )}

      {aiInsights && aiInsights.length === 0 && !aiError && !isLoadingAI && (
        <div className="p-6 bg-success-lighter border border-success-light rounded-lg text-center text-success-darker flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <CheckCircle size={28} className="mb-2"/>
            <p className="font-medium">AI analysis complete. No specific anomalies or major insights were flagged in the current dataset.</p>
        </div>
      )}

      {aiInsights && aiInsights.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-textPrimary">AI Analysis Results ({aiInsights.length} insights found):</h3>
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

export default IPDRGeminiInsightsView;
