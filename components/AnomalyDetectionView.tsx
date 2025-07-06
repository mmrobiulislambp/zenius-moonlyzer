
import React, { useState, useCallback } from 'react';
import { ShieldAlert, AlertTriangle, Zap, Info, Loader2, SearchCheck } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { AnomalyReport, BehavioralFingerprint, DeviceAnalyticsData, SimCardAnalyticsData, EntitySummaryForAnomalyDetection, ActivityPattern } from '../types';
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";

// Helper to format supporting data object into a readable string list
const formatSupportingData = (data?: Record<string, any>): string => {
  if (!data || Object.keys(data).length === 0) return "No specific supporting data provided.";
  return Object.entries(data)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${String(value)}`)
    .join('; ');
};


const AnomalyDetectionView: React.FC = () => {
  const { 
    behavioralFingerprints, 
    deviceAnalyticsData, 
    simCardAnalytics, 
    isLoading: contextIsLoading, 
    error: contextError, 
    uploadedFiles, 
    filesToAnalyze 
  } = useCDRContext();

  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState<boolean>(false);
  const [anomalyResults, setAnomalyResults] = useState<AnomalyReport[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  
  const ai = new GoogleGenAI({ apiKey: "AIzaSyCP5M3WUcXIAVwRZ_CpweBT2yuKwxBVRVA" });

  const prepareDataForAnalysis = useCallback((): EntitySummaryForAnomalyDetection[] => {
    const summaries: EntitySummaryForAnomalyDetection[] = [];

    behavioralFingerprints.forEach(fp => {
      summaries.push({
        entityId: fp.number,
        entityType: 'Number',
        totalInteractions: fp.totalInteractions,
        avgCallDurationSeconds: fp.avgCallDurationSeconds,
        callDirectionality: fp.callDirectionality,
        smsDirectionality: fp.smsDirectionality,
        primaryActivityFocus: fp.primaryActivityFocus,
        dominantTimeSlot: fp.dominantTimeSlot,
        hourlyActivity: fp.hourlyActivity,
        dailyActivity: fp.dailyActivity,
        topTowers: fp.topTowers.slice(0,5), // Limit top towers
        // firstSeen, lastSeen can be derived from raw records if needed, or added to BehavioralFingerprint
      });
    });

    deviceAnalyticsData.forEach(dev => {
      summaries.push({
        entityId: dev.imei,
        entityType: 'IMEI',
        totalInteractions: dev.recordCount,
        firstSeen: dev.firstSeen?.toISOString(),
        lastSeen: dev.lastSeen?.toISOString(),
        associatedSimsCount: dev.associatedSims.length,
        simChangeCount: dev.simChangeHistory.length,
        simChangeTimestamps: dev.simChangeHistory.slice(0,10).map(ch => ch.timestamp.toISOString()), // Last 10 changes
        hourlyActivity: dev.hourlyBreakdown.map(h => ({ name: h.name, count: h.callCount })) as ActivityPattern[],
      });
    });

    simCardAnalytics.forEach(sim => {
      summaries.push({
        entityId: sim.simIdentifier,
        entityType: 'SIM',
        totalInteractions: sim.recordCount,
        firstSeen: sim.firstSeenOverall?.toISOString(),
        lastSeen: sim.lastSeenOverall?.toISOString(),
        associatedImeisCount: sim.associatedImeis.length,
        imeiChangeCount: sim.imeiChangeHistory.length,
        imeiChangeTimestamps: sim.imeiChangeHistory.slice(0,10).map(ch => ch.timestamp.toISOString()), // Last 10 changes
      });
    });
    
    // Limit the number of entities sent to the API to avoid overly large prompts
    return summaries.slice(0, 100); // Example limit, adjust as needed
  }, [behavioralFingerprints, deviceAnalyticsData, simCardAnalytics]);


  const handleAnalyzeAnomalies = async () => {
    setIsLoadingAnomalies(true);
    setAnalysisError(null);
    setAnomalyResults([]);

    const summarizedData = prepareDataForAnalysis();

    if (summarizedData.length === 0) {
      setAnalysisError("No data available to analyze. Please ensure data is loaded and processed in other views.");
      setIsLoadingAnomalies(false);
      return;
    }

    const prompt = `
      You are an expert telecom fraud and anomaly detection analyst. I will provide you with summarized Call Detail Record (CDR) data for several entities (phone numbers, IMEIs, or SIMs). Your task is to identify any suspicious or anomalous patterns in this data.

      For each entity, I will provide characteristics like total interactions, activity patterns (hourly/daily), call/SMS directionality, dominant time slots, associated devices/SIMs, and change histories.

      Based on this information, please identify and report any anomalies. For each anomaly found, provide:
      1.  The 'id' (original entity ID) and 'type' ('Number', 'IMEI', 'SIM').
      2.  A concise 'anomalyCategory' from this list: "Unusual Night Activity", "High Volume Burst", "Suspiciously High Call Duration", "Rapid SIM/IMEI Swapping", "IMEI Cloning Pattern", "SIM Box Indicators", "Dormancy Followed by Burst", "Unusual Roaming Activity", "Geographic Anomaly", "Zero Duration Calls", "High SMS Volume to Premium Numbers", "Other Suspicious Pattern". Use "Other Suspicious Pattern" if none fit well.
      3.  A 'description' explaining why this pattern is considered anomalous (2-3 sentences).
      4.  A 'severity' rating ('Low', 'Medium', 'High').
      5.  'supportingData': A small JSON object with 2-3 key data points from the input that directly support your finding (e.g., {"activeHours": "01:00-04:00", "percentageOfNightCalls": "90%"}, {"smsCount": 500, "timeWindow": "10 minutes"}, {"simChanges": 5, "timeWindowHours": 24}).

      Please return your findings as a JSON array of objects. Each object represents one anomaly.
      Example:
      {
        "id": "1234567890",
        "type": "Number",
        "anomalyCategory": "Unusual Night Activity",
        "description": "This number predominantly makes calls during late night hours, which is atypical for standard user behavior and could indicate automated or illicit activities.",
        "severity": "Medium",
        "supportingData": { "nightCallPercentage": "85%", "typicalHours": "01:00-05:00" }
      }

      If no anomalies are found for an entity, do not include it in the output. If no anomalies are found at all across all entities, return an empty JSON array: [].

      Here is the data:
      ${JSON.stringify(summarizedData, null, 2)}
    `;

    try {
      const response: GenerateContentResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-04-17", // Ensure this is the correct and available model
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          // Optional: Adjust temperature, topK, topP if needed for creativity vs. factuality
          // temperature: 0.3, 
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
        setAnomalyResults(parsedResults as AnomalyReport[]);
      } else {
        console.error("Gemini API returned non-array data:", parsedResults);
        setAnalysisError("Received unexpected data format from AI. Expected an array of anomalies.");
        setAnomalyResults([]);
      }

    } catch (e: any) {
      console.error("Error calling Gemini API for anomaly detection:", e);
      setAnalysisError(`Failed to analyze anomalies: ${e.message || 'Unknown error'}. Check console for details.`);
      setAnomalyResults([]);
    } finally {
      setIsLoadingAnomalies(false);
    }
  };

  if (contextIsLoading && behavioralFingerprints.length === 0) return <div className="flex justify-center items-center h-64"><Loader2 className="h-12 w-12 animate-spin text-primary" /><p className="ml-3 text-textSecondary">Loading initial data for analysis...</p></div>;
  if (contextError) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{contextError}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files to enable anomaly detection.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><AlertTriangle size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls' for anomaly detection.</p></div>;
  
  const getSeverityClass = (severity?: 'Low' | 'Medium' | 'High') => {
    switch (severity) {
      case 'High': return 'border-danger-dark bg-danger-lighter text-danger-darker';
      case 'Medium': return 'border-warning-dark bg-warning-lighter text-warning-darker';
      case 'Low': return 'border-info-dark bg-info-lighter text-info-darker';
      default: return 'border-neutral-dark bg-neutral-lighter text-neutral-darker';
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
                <ShieldAlert size={24} className="mr-2.5 text-primary" /> Anomaly Detection Center
                </div>
                <p className="text-sm text-textSecondary">Leverage AI to identify suspicious patterns and anomalies in your CDR data.</p>
            </div>
            <button 
                onClick={handleAnalyzeAnomalies} 
                disabled={isLoadingAnomalies}
                className="mt-3 sm:mt-0 px-5 py-2.5 text-sm bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all disabled:opacity-70 disabled:cursor-not-allowed"
            >
                {isLoadingAnomalies ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" /> 
                ) : (
                    <Zap size={16} className="mr-2" />
                )}
                {isLoadingAnomalies ? 'Analyzing...' : 'Analyze for Anomalies'}
            </button>
        </div>
      </div>

      {analysisError && (
        <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg border border-danger-light flex items-center">
          <AlertTriangle size={20} className="mr-2.5"/> {analysisError}
        </div>
      )}

      {isLoadingAnomalies && (
        <div className="flex flex-col items-center justify-center h-60 bg-surface rounded-xl border border-neutral-light shadow-md">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="mt-3 text-textSecondary">AI is analyzing data for anomalies... This may take a few moments.</p>
        </div>
      )}

      {!isLoadingAnomalies && !analysisError && anomalyResults.length === 0 && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
            <SearchCheck size={32} className="mb-3 text-neutral-DEFAULT"/>
            <p className="font-medium">Analysis complete. No significant anomalies detected, or analysis not yet run.</p>
            <p className="text-xs mt-1">Click "Analyze for Anomalies" to start the detection process.</p>
        </div>
      )}
      
      {!isLoadingAnomalies && anomalyResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-textPrimary">Detected Anomalies ({anomalyResults.length}):</h3>
          {anomalyResults.map((anomaly, index) => (
            <div key={index} className={`p-4 border-l-4 rounded-r-lg shadow-md hover:shadow-lg transition-shadow ${getSeverityClass(anomaly.severity)}`}>
              <div className="flex flex-col sm:flex-row justify-between items-start">
                <div>
                    <p className="text-sm font-semibold">
                        <span className="font-bold">{anomaly.anomalyCategory}</span> ({anomaly.type}: <span className="text-primary-dark">{anomaly.id}</span>)
                    </p>
                    <p className="text-xs mt-1">{anomaly.description}</p>
                </div>
                <span className={`mt-2 sm:mt-0 ml-0 sm:ml-3 px-2 py-0.5 text-[10px] font-medium rounded-full ${getSeverityClass(anomaly.severity)} border`}>
                    Severity: {anomaly.severity || 'N/A'}
                </span>
              </div>
              {anomaly.supportingData && Object.keys(anomaly.supportingData).length > 0 && (
                <div className="mt-2 pt-2 border-t border-current/20 text-xs">
                  <p className="font-medium">Supporting Data:</p>
                  <ul className="list-disc list-inside pl-2">
                    {Object.entries(anomaly.supportingData).map(([key, value]) => (
                      <li key={key} className="truncate" title={`${key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}: ${String(value)}`}>
                        <span className="font-semibold">{key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())}:</span> {String(value)}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AnomalyDetectionView;
