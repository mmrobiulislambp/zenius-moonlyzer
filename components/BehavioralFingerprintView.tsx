
import React, { useState, useMemo, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { UserCog, Users, Percent, AlertTriangle, Info, Download, Search, BarChart2, CalendarDays, Clock, Smartphone, GitMerge, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { useCDRContext } from '../contexts/CDRContext';
import { BehavioralFingerprint, ActivityPattern, SimilarityComponent, FingerprintComparisonResult } from '../types';
import { downloadCSV } from '../utils/downloadUtils';

const COLORS_PROFILE_A = "#3b82f6"; // primary-DEFAULT
const COLORS_PROFILE_B = "#10b981"; // secondary-DEFAULT

// Helper: Cosine Similarity
const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (vecA.length !== vecB.length || vecA.length === 0) return 0;
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0 || normB === 0) return 0; // Avoid division by zero if one vector is all zeros
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
};

// Helper: Jaccard Index for Top Towers (simple version based on IDs)
const jaccardIndexTowers = (towersA: BehavioralFingerprint['topTowers'], towersB: BehavioralFingerprint['topTowers']): number => {
  const idsA = new Set(towersA.map(t => t.towerId));
  const idsB = new Set(towersB.map(t => t.towerId));
  if (idsA.size === 0 && idsB.size === 0) return 1; // Both have no towers, considered similar in this aspect
  if (idsA.size === 0 || idsB.size === 0) return 0; // One has towers, other doesn't

  const intersection = new Set([...idsA].filter(id => idsB.has(id)));
  const union = new Set([...idsA, ...idsB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
};

const calculateSimilarity = (fpA: BehavioralFingerprint, fpB: BehavioralFingerprint): FingerprintComparisonResult => {
    const components: SimilarityComponent[] = [];
    const weights = {
        hourly: 0.25, daily: 0.15, avgDuration: 0.10, activityFocus: 0.05,
        dominantTime: 0.10, topTowers: 0.15, callDirection: 0.10, smsDirection: 0.05,
    };
    // Normalize activity counts for fair comparison (sum to 1, or use proportions)
    const normalizePattern = (pattern: ActivityPattern[]) => {
        const total = pattern.reduce((sum, p) => sum + p.count, 0);
        return total === 0 ? pattern.map(() => 0) : pattern.map(p => p.count / total);
    };

    // 1. Hourly Activity
    const hourlyA = normalizePattern(fpA.hourlyActivity);
    const hourlyB = normalizePattern(fpB.hourlyActivity);
    const hourlySim = cosineSimilarity(hourlyA, hourlyB);
    components.push({ metricName: "Hourly Activity Pattern", score: hourlySim, valueA: "Chart", valueB: "Chart", description: "Similarity of activity distribution throughout the day." });

    // 2. Daily Activity
    const dailyA = normalizePattern(fpA.dailyActivity);
    const dailyB = normalizePattern(fpB.dailyActivity);
    const dailySim = cosineSimilarity(dailyA, dailyB);
    components.push({ metricName: "Daily Activity Pattern", score: dailySim, valueA: "Chart", valueB: "Chart", description: "Similarity of activity distribution across days of the week." });
    
    // 3. Average Call Duration
    let durationSim = 0;
    if (fpA.avgCallDurationSeconds > 0 && fpB.avgCallDurationSeconds > 0) {
        durationSim = 1 - Math.abs(fpA.avgCallDurationSeconds - fpB.avgCallDurationSeconds) / Math.max(fpA.avgCallDurationSeconds, fpB.avgCallDurationSeconds);
    } else if (fpA.avgCallDurationSeconds === 0 && fpB.avgCallDurationSeconds === 0) {
        durationSim = 1; // Both zero, perfect match for this metric
    } // else 0 if one is zero and other is not
    components.push({ metricName: "Avg. Call Duration", score: durationSim, valueA: `${fpA.avgCallDurationSeconds.toFixed(0)}s`, valueB: `${fpB.avgCallDurationSeconds.toFixed(0)}s`, description: "Similarity in average length of calls." });

    // 4. Activity Focus (Call/SMS/Mixed)
    const focusSim = fpA.primaryActivityFocus === fpB.primaryActivityFocus ? 1 : 0;
    components.push({ metricName: "Primary Activity Focus", score: focusSim, valueA: fpA.primaryActivityFocus, valueB: fpB.primaryActivityFocus, description: "Match in primary type of communication (Call/SMS/Mixed)." });

    // 5. Dominant Time Slot
    const timeSlotSim = fpA.dominantTimeSlot === fpB.dominantTimeSlot ? 1 : (fpA.dominantTimeSlot === 'varied' || fpB.dominantTimeSlot === 'varied' ? 0.3 : 0); // Simplified
    components.push({ metricName: "Dominant Time Slot", score: timeSlotSim, valueA: fpA.dominantTimeSlot, valueB: fpB.dominantTimeSlot, description: "Match in the most active part of the day." });

    // 6. Top Towers
    const towerSim = jaccardIndexTowers(fpA.topTowers, fpB.topTowers);
    components.push({ metricName: "Top Towers Overlap", score: towerSim, valueA: fpA.topTowers.map(t=>t.towerId).join(', ') || "None", valueB: fpB.topTowers.map(t=>t.towerId).join(', ') || "None", description: "Overlap in the most frequently used cell towers." });

    // 7. Call Directionality
    const callDirSim = (fpA.callDirectionality === 'n/a' && fpB.callDirectionality === 'n/a') ? 1 : (fpA.callDirectionality === fpB.callDirectionality ? 1 : 0);
    components.push({ metricName: "Call Directionality", score: callDirSim, valueA: fpA.callDirectionality, valueB: fpB.callDirectionality, description: "Similarity in call direction (Outgoing/Incoming/Balanced)." });
    
    // 8. SMS Directionality
    const smsDirSim = (fpA.smsDirectionality === 'n/a' && fpB.smsDirectionality === 'n/a') ? 1 : (fpA.smsDirectionality === fpB.smsDirectionality ? 1 : 0);
    components.push({ metricName: "SMS Directionality", score: smsDirSim, valueA: fpA.smsDirectionality, valueB: fpB.smsDirectionality, description: "Similarity in SMS direction (Outgoing/Incoming/Balanced)." });

    let overallScore = 0;
    components.forEach(comp => {
        overallScore += comp.score * (weights[comp.metricName.toLowerCase().replace(/\s+/g, '').replace('avg.callduration','avgduration').replace('pattern','').replace('overlap','') as keyof typeof weights] || 0);
    });
    
    // Confidence modulator (very basic)
    const minInteractions = Math.min(fpA.totalInteractions, fpB.totalInteractions);
    if (minInteractions < 10) { // If either number has very few interactions
        overallScore *= 0.7; // Reduce confidence
        components.push({ metricName: "Confidence Adjustment", score: 0.7, valueA: `Interactions: ${fpA.totalInteractions}`, valueB: `Interactions: ${fpB.totalInteractions}`, description: "Reduced confidence due to low interaction count for one or both numbers (<10)." });
    }


    return {
        numberA: fpA.number, numberB: fpB.number,
        fingerprintA: fpA, fingerprintB: fpB,
        similarityComponents: components,
        overallSimilarityScore: Math.min(100, Math.max(0, parseFloat((overallScore * 100).toFixed(1))))
    };
};


const BehavioralFingerprintView: React.FC = () => {
  const { behavioralFingerprints, isLoading, error, uploadedFiles, filesToAnalyze, targetNumberForBehavioralProfile, setTargetNumberForBehavioralProfile } = useCDRContext();
  const [selectedNumberA, setSelectedNumberA] = useState<string>('');
  const [selectedNumberB, setSelectedNumberB] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<FingerprintComparisonResult | null>(null);

  useEffect(() => {
    if (targetNumberForBehavioralProfile && behavioralFingerprints.some(fp => fp.number === targetNumberForBehavioralProfile)) {
      setSelectedNumberA(targetNumberForBehavioralProfile);
      setSelectedNumberB(''); // Clear B so user can pick
      setComparisonResult(null); // Clear previous comparison
      setTargetNumberForBehavioralProfile(null); // Reset the target
      // Optionally, scroll into view or provide a visual cue
      const selectElement = document.getElementById('selectNumberA');
      if (selectElement) {
        selectElement.focus();
      }
    }
  }, [targetNumberForBehavioralProfile, setTargetNumberForBehavioralProfile, behavioralFingerprints]);

  const handleCompare = () => {
    if (!selectedNumberA || !selectedNumberB || selectedNumberA === selectedNumberB) {
      setComparisonResult(null);
      alert("Please select two different numbers to compare.");
      return;
    }
    const fpA = behavioralFingerprints.find(fp => fp.number === selectedNumberA);
    const fpB = behavioralFingerprints.find(fp => fp.number === selectedNumberB);

    if (fpA && fpB) {
      setComparisonResult(calculateSimilarity(fpA, fpB));
    } else {
      alert("Could not find fingerprint data for one or both selected numbers.");
    }
  };

  const handleExportComparison = () => {
    if (!comparisonResult) return;
    const { numberA, numberB, similarityComponents, overallSimilarityScore, fingerprintA, fingerprintB } = comparisonResult;
    
    const headers = ["Metric", `Number A: ${numberA}`, `Number B: ${numberB}`, "Component Score (0-1)", "Description"];
    const data = similarityComponents.map(comp => [
        comp.metricName,
        String(comp.valueA === "Chart" ? `${comp.metricName} Data (see details)` : comp.valueA),
        String(comp.valueB === "Chart" ? `${comp.metricName} Data (see details)` : comp.valueB),
        String(comp.score.toFixed(3)),
        comp.description || ""
    ]);
    data.push(["---", "---", "---", "---", "---"]);
    data.push(["Overall Similarity Score (%)", String(overallSimilarityScore), "", "", "Weighted average of component scores."]);

    const fingerprintDetails = (fp: BehavioralFingerprint, num: string): string[][] => [
        [`Fingerprint Details for ${num}`, ""],
        ["Total Interactions", String(fp.totalInteractions)],
        ["Avg Call Duration (s)", String(fp.avgCallDurationSeconds)],
        ["Call Directionality", fp.callDirectionality],
        ["SMS Directionality", fp.smsDirectionality],
        ["Primary Activity Focus", fp.primaryActivityFocus],
        ["Dominant Time Slot", fp.dominantTimeSlot],
        ["Top Towers", fp.topTowers.map(t => `${t.towerId} (${t.count})`).join('; ') || "None"],
        ["Hourly Activity", fp.hourlyActivity.map(h => `${h.name}:${h.count}`).join('; ')],
        ["Daily Activity", fp.dailyActivity.map(d => `${d.name}:${d.count}`).join('; ')],
    ];
    
    const dataA = fingerprintDetails(fingerprintA, numberA);
    const dataB = fingerprintDetails(fingerprintB, numberB);
    
    // Combine details into the CSV, ensuring proper alignment if possible or just appending
    const combinedData: string[][] = [...data];
    combinedData.push(["---", "---", "---", "---", "---"]);
    combinedData.push(["Detailed Profile A", "", "", "", ""]);
    dataA.forEach(row => combinedData.push([row[0], row[1], "", "", ""]));
    combinedData.push(["---", "---", "---", "---", "---"]);
    combinedData.push(["Detailed Profile B", "", "", "", ""]);
    dataB.forEach(row => combinedData.push(["", "", row[0], row[1], ""]));


    downloadCSV(`behavioral_comparison_${numberA}_vs_${numberB}.csv`, combinedData, headers);
  };

  const uniqueNumbers = useMemo(() => behavioralFingerprints.map(fp => fp.number).sort(), [behavioralFingerprints]);

  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Loading behavioral data...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><AlertTriangle size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls'.</p></div>;
  if (behavioralFingerprints.length === 0) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No behavioral data to analyze. Ensure records have AParty/BParty and timestamps.</p></div>;

  const SmallBarChart = ({ data, color, title }: { data: ActivityPattern[], color: string, title: string }) => (
    <div className="h-28 w-full"> {/* Ensure fixed height */}
      <p className="text-xs text-textSecondary text-center mb-1">{title}</p>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
          <CartesianGrid strokeDasharray="2 2" strokeOpacity={0.5} />
          <XAxis dataKey="name" tick={{ fontSize: 8 }} interval={data.length > 12 ? Math.floor(data.length/6) : 0} />
          <YAxis tick={{ fontSize: 8 }} allowDecimals={false}/>
          <Bar dataKey="count" fill={color} radius={[3, 3, 0, 0]} barSize={data.length > 12 ? 6: 10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
  
  const renderFingerprintDetails = (fp: BehavioralFingerprint, color: string, numberLabel: string) => (
    <div className="space-y-3 p-3 border border-neutral-light rounded-lg bg-neutral-lightest/50">
        <h4 className="text-base font-semibold text-textPrimary">Profile: <span style={{color}}>{numberLabel}</span></h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div><strong className="text-neutral-dark">Total Interactions:</strong> {fp.totalInteractions}</div>
            <div><strong className="text-neutral-dark">Avg Call Duration:</strong> {fp.avgCallDurationSeconds.toFixed(0)}s</div>
            <div><strong className="text-neutral-dark">Call Direction:</strong> {fp.callDirectionality}</div>
            <div><strong className="text-neutral-dark">SMS Direction:</strong> {fp.smsDirectionality}</div>
            <div><strong className="text-neutral-dark">Activity Focus:</strong> {fp.primaryActivityFocus}</div>
            <div><strong className="text-neutral-dark">Dominant Time Slot:</strong> {fp.dominantTimeSlot}</div>
        </div>
        <div>
          <strong className="text-neutral-dark text-xs">Top Towers:</strong>
          {fp.topTowers.length > 0 ? (
            <ul className="list-disc list-inside text-xs ml-1">
              {fp.topTowers.map(t => <li key={t.towerId} title={t.address}>{t.towerId} ({t.count} records)</li>)}
            </ul>
          ) : <span className="text-xs"> None</span>}
        </div>
        <SmallBarChart data={fp.hourlyActivity} color={color} title="Hourly Activity" />
        <SmallBarChart data={fp.dailyActivity} color={color} title="Daily Activity" />
    </div>
  );


  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1">
          <UserCog size={24} className="mr-2.5 text-primary" /> Behavioral Profile Comparison
        </div>
        <p className="text-sm text-textSecondary">Compare behavioral patterns of two numbers. Similarity scores are indicative and based on heuristics.</p>
      </div>

      <div className="p-4 bg-surface border border-neutral-light rounded-xl shadow-lg space-y-3 sm:space-y-0 sm:flex sm:items-end sm:gap-4">
        <div className="flex-1 min-w-0">
          <label htmlFor="selectNumberA" className="block text-xs font-medium text-textSecondary mb-1">Select Number A:</label>
          <select id="selectNumberA" value={selectedNumberA} onChange={e => setSelectedNumberA(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary shadow-sm">
            <option value="">-- Select Number A --</option>
            {uniqueNumbers.map(num => <option key={`A-${num}`} value={num}>{num}</option>)}
          </select>
        </div>
        <div className="text-2xl font-light text-neutral-DEFAULT px-2 hidden sm:block">&amp;</div>
        <div className="flex-1 min-w-0">
          <label htmlFor="selectNumberB" className="block text-xs font-medium text-textSecondary mb-1">Select Number B:</label>
          <select id="selectNumberB" value={selectedNumberB} onChange={e => setSelectedNumberB(e.target.value)} className="w-full p-2.5 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary shadow-sm">
            <option value="">-- Select Number B --</option>
            {uniqueNumbers.filter(num => num !== selectedNumberA).map(num => <option key={`B-${num}`} value={num}>{num}</option>)}
          </select>
        </div>
        <button onClick={handleCompare} disabled={!selectedNumberA || !selectedNumberB || selectedNumberA === selectedNumberB} className="w-full sm:w-auto px-6 py-2.5 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-60">
          <GitMerge size={18} className="inline mr-2" />Compare
        </button>
      </div>

      {comparisonResult && (
        <div className="p-4 sm:p-6 bg-surface border border-neutral-light rounded-xl shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row justify-between items-center pb-3 border-b border-neutral-light">
            <div>
                <h3 className="text-lg font-semibold text-textPrimary">Comparison Result: <span className="text-primary">{comparisonResult.numberA}</span> vs <span className="text-secondary">{comparisonResult.numberB}</span></h3>
                <div className={`mt-1.5 text-2xl font-bold ${comparisonResult.overallSimilarityScore >= 75 ? 'text-success-dark' : (comparisonResult.overallSimilarityScore >= 50 ? 'text-warning-dark' : 'text-danger-dark')}`}>
                    Overall Similarity: {comparisonResult.overallSimilarityScore.toFixed(1)}%
                </div>
                 {comparisonResult.overallSimilarityScore >= 75 && <div className="mt-1 text-sm text-success-dark flex items-center"><CheckCircle size={16} className="mr-1.5"/>Potential Behavioral Link Detected.</div>}
                 {comparisonResult.overallSimilarityScore < 50 && <div className="mt-1 text-sm text-danger-dark flex items-center"><XCircle size={16} className="mr-1.5"/>Low Behavioral Similarity.</div>}
            </div>
            <button onClick={handleExportComparison} className="mt-3 sm:mt-0 px-4 py-2 text-xs bg-accent text-white rounded-lg hover:bg-accent-dark focus:outline-none focus:ring-2 focus:ring-accent-light flex items-center shadow-md"><Download size={14} className="mr-1.5"/>Export Comparison</button>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {renderFingerprintDetails(comparisonResult.fingerprintA, COLORS_PROFILE_A, comparisonResult.numberA)}
            {renderFingerprintDetails(comparisonResult.fingerprintB, COLORS_PROFILE_B, comparisonResult.numberB)}
          </div>

          <div>
            <h4 className="text-base font-semibold text-textPrimary mb-2">Similarity Breakdown:</h4>
            <div className="space-y-1.5 text-xs">
              {comparisonResult.similarityComponents.map(comp => (
                <div key={comp.metricName} className="p-2 border border-neutral-light rounded-md bg-neutral-lightest/30 flex justify-between items-center hover:bg-neutral-lightest/60">
                  <div className="flex-1">
                    <span className="font-medium text-textPrimary">{comp.metricName}: </span>
                    <span className="text-neutral-dark">{(comp.score * 100).toFixed(1)}%</span>
                    {comp.description && <p className="text-[10px] text-textSecondary italic mt-0.5">{comp.description}</p>}
                  </div>
                  {comp.metricName !== "Confidence Adjustment" && (comp.valueA !== "Chart" || comp.valueB !== "Chart") && (
                    <div className="text-right ml-2 space-y-0.5 min-w-[120px] sm:min-w-[160px]">
                         {comp.valueA !== "Chart" && <p className="truncate" title={String(comp.valueA)}><span className="font-semibold" style={{color: COLORS_PROFILE_A}}>{comparisonResult.numberA.slice(-4)}:</span> {String(comp.valueA)}</p>}
                         {comp.valueB !== "Chart" && <p className="truncate" title={String(comp.valueB)}><span className="font-semibold" style={{color: COLORS_PROFILE_B}}>{comparisonResult.numberB.slice(-4)}:</span> {String(comp.valueB)}</p>}
                    </div>
                  )}
                </div>
              ))}
            </div>
             <p className="text-[10px] text-textSecondary mt-3 text-center italic">Note: Similarity scores are heuristic and intended for indicative analysis. Low interaction counts can affect reliability.</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default BehavioralFingerprintView;