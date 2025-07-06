import React, { createContext, useState, useContext, useCallback, ReactNode, useMemo, useEffect, useRef } from 'react';
import { CDRContextType, CDRRecord, UploadedFile, FilterState, LinkAnalysisResult, GraphData, GraphNode, GraphEdge, DetailedFileInteraction, CellTowerAnalyticsData, HourlyActivity as GenericHourlyActivity, DeviceAnalyticsData, AssociatedSimInfo, ContactedPartyByDevice, ConversationChain, CallInChain, LocationEvent, BehavioralFingerprint, ActivityPattern, Directionality, TopTowerInfo, SimChangeEvent, SimCardAnalyticsData, AssociatedImeiInfo, ImeiChangeEvent } from '../types';
import { parseDateTime, isValidCDRRecord, isOutgoingCallType, isIncomingCallType, isOutgoingSMSType, isIncomingSMSType, isAnyCall, isAnySMS } from '../utils/cdrUtils'; 
import { v4 as uuidv4 } from 'uuid';
import { useLACContext } from './LACContext'; // Added to access tower data for enrichment

const MAX_RECORDS_FOR_GRAPH = 15000;

const CDRContext = createContext<CDRContextType | undefined>(undefined);

export const CDRProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [filterState, setFilterState] = useState<FilterState>({
    searchTerm: '',
    dateFrom: '',
    dateTo: '',
    usageTypes: [],
    networkTypes: [],
    minDuration: null,
    maxDuration: null,
    selectedFileIds: [],
  });

  const [hiddenNodeIds, setHiddenNodeIds] = useState<Set<string>>(new Set());
  const [customNodeLabels, setCustomNodeLabels] = useState<Map<string, string>>(new Map());
  const [customEdgeColors, setCustomEdgeColors] = useState<Map<string, string>>(new Map());
  const [hiddenEdgeIds, setHiddenEdgeIds] = useState<Set<string>>(new Set());
  const [activeFileTabId, setActiveFileTabId] = useState<string | null>(null);

  const [targetNodeForGraphView, setTargetNodeForGraphView] = useState<string | null>(null);
  const [targetNumberForBehavioralProfile, setTargetNumberForBehavioralProfile] = useState<string | null>(null);
  
  const [activeGraphLayout, setActiveGraphLayout] = useState<string>('cose');
  const [isGraphDataTrimmed, setIsGraphDataTrimmed] = useState(false);

  // New states for node colors and icons
  const [customNodeColors, setCustomNodeColors] = useState<Map<string, string>>(new Map());
  const [customNodeBaseIcons, setCustomNodeBaseIcons] = useState<Map<string, string>>(new Map());


  const lacContext = useLACContext(); 

  const enrichRecordWithTowerData = useCallback((record: CDRRecord): CDRRecord => {
    if (lacContext.towerDatabase.length > 0 && record.LACSTARTA && record.CISTARTA) {
      const towerInfo = lacContext.getTowerInfo(record.LACSTARTA, record.CISTARTA);
      if (towerInfo) {
        const newRecord = { ...record };
        let changed = false;
        if (!newRecord.ADDRESS || newRecord.ADDRESS.toLowerCase() === 'n/a') {
          newRecord.ADDRESS = towerInfo.address || 'N/A (from Tower DB)';
          changed = true;
        }
        if (towerInfo.latitude && (newRecord.latitude === undefined || isNaN(newRecord.latitude))) {
          newRecord.latitude = towerInfo.latitude;
          changed = true;
        }
        if (towerInfo.longitude && (newRecord.longitude === undefined || isNaN(newRecord.longitude))) {
          newRecord.longitude = towerInfo.longitude;
          changed = true;
        }
        if (changed) {
          newRecord.derivedLocationSource = 'towerDB';
        }
        return newRecord;
      }
    }
    return record;
  }, [lacContext]);

  const allRecords = useMemo(() => {
    return uploadedFiles.flatMap((file) => file.records.map(enrichRecordWithTowerData));
  }, [uploadedFiles, enrichRecordWithTowerData]);

  const filesToAnalyze = useMemo(() => {
    return filterState.selectedFileIds.length > 0 
      ? uploadedFiles.filter(f => filterState.selectedFileIds.includes(f.id))
      : uploadedFiles; 
  }, [uploadedFiles, filterState.selectedFileIds]);
  
  const globallyFilteredRecords = useMemo(() => { 
    let recordsToProcess = filesToAnalyze.flatMap(f => f.records.map(enrichRecordWithTowerData));
    return recordsToProcess.filter((record) => {
      if (!isValidCDRRecord(record)) return false; 
      const searchTermLower = filterState.searchTerm.toLowerCase();
      if (filterState.searchTerm && 
          !record.APARTY.toLowerCase().includes(searchTermLower) &&
          !(record.BPARTY && record.BPARTY.toLowerCase().includes(searchTermLower)) &&
          !(record.ADDRESS && record.ADDRESS.toLowerCase().includes(searchTermLower)) &&
          !(record.IMEI && record.IMEI.toLowerCase().includes(searchTermLower)) &&
          !(record.IMSI && record.IMSI.toLowerCase().includes(searchTermLower)) &&
          !(record.PROVIDER_NAME && record.PROVIDER_NAME.toLowerCase().includes(searchTermLower))
      ) return false;
      if (filterState.dateFrom) {
        const recordDate = parseDateTime(record.START_DTTIME);
        const fromDate = new Date(filterState.dateFrom);
        if (recordDate && recordDate < fromDate) return false;
      }
      if (filterState.dateTo) {
        const recordDate = parseDateTime(record.START_DTTIME);
        const toDate = new Date(filterState.dateTo);
        toDate.setHours(23, 59, 59, 999); 
        if (recordDate && recordDate > toDate) return false;
      }
      if (filterState.usageTypes.length > 0 && !filterState.usageTypes.includes(record.USAGE_TYPE)) return false;
      if (filterState.networkTypes.length > 0 && record.NETWORK_TYPE && !filterState.networkTypes.includes(record.NETWORK_TYPE)) return false;
      const duration = parseInt(record.CALL_DURATION, 10);
      if (filterState.minDuration !== null && (isNaN(duration) || duration < filterState.minDuration)) return false;
      if (filterState.maxDuration !== null && (isNaN(duration) || duration > filterState.maxDuration)) return false;
      return true;
    });
  }, [filesToAnalyze, filterState, enrichRecordWithTowerData]);

  const graphData = useMemo((): GraphData => { 
    let recordsForGraph = globallyFilteredRecords;
    
    if (recordsForGraph.length > MAX_RECORDS_FOR_GRAPH) {
        recordsForGraph = recordsForGraph.slice(0, MAX_RECORDS_FOR_GRAPH);
        setIsGraphDataTrimmed(true);
    } else {
        setIsGraphDataTrimmed(false);
    }

    const nodesMap = new Map<string, { id: string; type: 'phoneNumber'; callCount: number; fileIds: Set<string>; sourceNames: Set<string>; rawFileNames: Set<string>; outgoingCalls: number; incomingCalls: number; totalDuration: number; firstSeenTimestamp?: number; lastSeenTimestamp?: number; associatedTowers: Set<string>; }>(); 
    const edgesMap = new Map<string, GraphEdge & { firstCallTimestamp?: number; lastCallTimestamp?: number; rawFileNamesForEdgeSet?: Set<string>;}>();
    
    if (filesToAnalyze.length === 0) return { nodes: [], edges: [] };

    const allRecordsFromFilesToAnalyze = filesToAnalyze.flatMap(file => file.records);
    
    const aPartiesInAnalyzedFiles = new Set<string>();
    filesToAnalyze.forEach(file => {
      file.records.forEach(record => { if(record.APARTY) aPartiesInAnalyzedFiles.add(record.APARTY.trim()); });
    });

    allRecordsFromFilesToAnalyze.forEach(record => { 
        if (!isValidCDRRecord(record)) return; 
        [record.APARTY, record.BPARTY].forEach(numStr => { 
            if (numStr && typeof numStr === 'string' && numStr.trim() !== '') { 
                const num = numStr.trim(); 
                if (!nodesMap.has(num)) { 
                    nodesMap.set(num, { id: num, type: 'phoneNumber', callCount: 0, fileIds: new Set(), sourceNames: new Set(), rawFileNames: new Set(), outgoingCalls: 0, incomingCalls: 0, totalDuration: 0, associatedTowers: new Set(), }); 
                } 
                const nodeData = nodesMap.get(num)!; 
                const file = uploadedFiles.find(f => f.id === record.sourceFileId);
                if(file) {
                    nodeData.fileIds.add(file.id); 
                    nodeData.sourceNames.add(file.sourceName || file.name); 
                    nodeData.rawFileNames.add(file.name); 
                }
            } 
        }); 
    });
    
    recordsForGraph.forEach(record => { 
        if (!isValidCDRRecord(record) || !record.APARTY || !record.BPARTY || record.APARTY.trim() === '' || record.BPARTY.trim() === '') return; 
        const sourceNum = record.APARTY.trim(); 
        const targetNum = record.BPARTY.trim(); 
        
        const recordTimestamp = parseDateTime(record.START_DTTIME)?.getTime(); 
        const recordDuration = parseInt(record.CALL_DURATION, 10) || 0; 
        const usageType = record.USAGE_TYPE; 

        const updateNodeStats = (num: string, isSourceOfRecord: boolean) => { 
            const nodeProcData = nodesMap.get(num); 
            if (nodeProcData) { 
                nodeProcData.callCount++; 
                nodeProcData.totalDuration += recordDuration; 
                if (recordTimestamp) { 
                    if (!nodeProcData.firstSeenTimestamp || recordTimestamp < nodeProcData.firstSeenTimestamp) nodeProcData.firstSeenTimestamp = recordTimestamp; 
                    if (!nodeProcData.lastSeenTimestamp || recordTimestamp > nodeProcData.lastSeenTimestamp) nodeProcData.lastSeenTimestamp = recordTimestamp; 
                } 
                if (record.LACSTARTA && record.CISTARTA) nodeProcData.associatedTowers.add(`${record.LACSTARTA}-${record.CISTARTA}`); 
                
                if (isOutgoingCallType(usageType) || isOutgoingSMSType(usageType)) {
                    if(isSourceOfRecord) nodeProcData.outgoingCalls++; else nodeProcData.incomingCalls++;
                } else if (isIncomingCallType(usageType) || isIncomingSMSType(usageType)) {
                    if(isSourceOfRecord) nodeProcData.incomingCalls++; else nodeProcData.outgoingCalls++;
                }
            } 
        }; 
        updateNodeStats(sourceNum, true); 
        updateNodeStats(targetNum, false); 

        const edgeKey = `${sourceNum}-${targetNum}-${usageType || "N/A"}`; 
        let edge = edgesMap.get(edgeKey); 
        if (!edge) { 
            edge = { id: edgeKey, source: sourceNum, target: targetNum, usageType: usageType || "N/A", callCount: 0, durationSum: 0, label: '', rawFileNamesForEdgeSet: new Set<string>(), }; 
        } 
        edge.callCount! += 1; 
        edge.durationSum! += recordDuration; 
        edge.label = `${edge.callCount} ${edge.usageType || ''}, ${Math.round(edge.durationSum! / 60)} min`.trim(); 
        edge.rawFileNamesForEdgeSet!.add(record.fileName); 
        if (recordTimestamp) { 
            if (!edge.firstCallTimestamp || recordTimestamp < edge.firstCallTimestamp) edge.firstCallTimestamp = recordTimestamp; 
            if (!edge.lastCallTimestamp || recordTimestamp > edge.lastCallTimestamp) edge.lastCallTimestamp = recordTimestamp; 
        } 
        edgesMap.set(edgeKey, edge); 
    });
    
    const finalNodes = Array.from(nodesMap.values())
      .filter(procNode => procNode.callCount > 0 || globallyFilteredRecords.some(r => r.APARTY === procNode.id || r.BPARTY === procNode.id) || nodesMap.has(procNode.id))
      .map(procNode => { 
        const statsLabel = `O:${procNode.outgoingCalls} | I:${procNode.incomingCalls}`;
        let mainLabelPart = procNode.id;
        const customName = customNodeLabels.get(procNode.id);
        if (customName && customName.trim() !== "") {
            mainLabelPart = `${customName.trim()} (${procNode.id})`;
        }

        let displayLabel = "";
        const isAParty = aPartiesInAnalyzedFiles.has(procNode.id);
        let imeiForNode: string | undefined = undefined;

        if (isAParty) {
            const apartyRecord = allRecordsFromFilesToAnalyze.find(r => r.APARTY === procNode.id && r.IMEI && r.IMEI.trim() !== '' && r.IMEI.toLowerCase() !== 'n/a');
            imeiForNode = apartyRecord ? apartyRecord.IMEI : undefined;
            
            displayLabel = mainLabelPart; 
            if (imeiForNode) {
                displayLabel += `\nIMEI: ${imeiForNode}`;
            }
            displayLabel += `\n${statsLabel}`;
        } else {
            displayLabel = `${mainLabelPart}\n${statsLabel}`;
        }
        
        const hubThreshold = Math.max(10, (recordsForGraph.length / (filesToAnalyze.length > 0 ? filesToAnalyze.length : 1)) * 0.05); 
        return { 
            data: { 
                id: procNode.id, 
                label: displayLabel, 
                originalId: procNode.id, 
                type: procNode.type, 
                callCount: procNode.callCount, 
                fileIds: Array.from(procNode.fileIds), 
                sourceNames: Array.from(procNode.sourceNames), 
                rawFileNames: Array.from(procNode.rawFileNames), 
                isHub: procNode.fileIds.size > (filesToAnalyze.length > 1 ? 1 : 0) || procNode.callCount > hubThreshold, 
                hidden: false, 
                outgoingCalls: procNode.outgoingCalls, 
                incomingCalls: procNode.incomingCalls, 
                totalDuration: procNode.totalDuration, 
                firstSeenTimestamp: procNode.firstSeenTimestamp, 
                lastSeenTimestamp: procNode.lastSeenTimestamp, 
                associatedTowers: Array.from(procNode.associatedTowers),
                isAPartyNode: isAParty,
                imei: imeiForNode, 
            } as GraphNode 
        }; 
    });
    
    const finalEdges = Array.from(edgesMap.values()).filter(edge => finalNodes.some(n => n.data.id === edge.source) && finalNodes.some(n => n.data.id === edge.target)).map(edge => ({ data: { ...edge, rawFileNamesForEdge: Array.from(edge.rawFileNamesForEdgeSet || new Set()), rawFileNamesForEdgeSet: undefined } as GraphEdge })); 
    finalEdges.forEach(e => delete (e.data as any).rawFileNamesForEdgeSet); 
    return { nodes: finalNodes, edges: finalEdges };
  }, [filesToAnalyze, globallyFilteredRecords, uploadedFiles, customNodeLabels]); 


  const showAllHiddenEdges = useCallback(() => {
    const previouslyHiddenEdges = Array.from(hiddenEdgeIds);
    setHiddenEdgeIds(new Set()); 

    const nodesToPotentiallyUnHide = new Set<string>();
    previouslyHiddenEdges.forEach(edgeId => {
        const edge = graphData.edges.find(e => e.data.id === edgeId);
        if (edge) {
            nodesToPotentiallyUnHide.add(edge.data.source);
            nodesToPotentiallyUnHide.add(edge.data.target);
        }
    });
    
    setHiddenNodeIds(prevHiddenNodeIds => {
        const newHiddenNodes = new Set(prevHiddenNodeIds);
        nodesToPotentiallyUnHide.forEach(nodeId => {
            newHiddenNodes.delete(nodeId); 
        });
        return newHiddenNodes;
    });
  }, [hiddenEdgeIds, graphData.edges]); 


  const addFile = useCallback((file: UploadedFile) => {
    setUploadedFiles((currentUploadedFiles) => {
      const enrichedRecords = file.records.map(enrichRecordWithTowerData);
      const enrichedFile = { ...file, records: enrichedRecords };
      const newUploadedFiles = [...currentUploadedFiles, enrichedFile];
      const isFirstFileOverall = currentUploadedFiles.length === 0;

      setFilterState(prevFilterState => ({
        ...prevFilterState,
        selectedFileIds: isFirstFileOverall
                         ? [enrichedFile.id]
                         : [...new Set([...prevFilterState.selectedFileIds, enrichedFile.id])]
      }));

      if (isFirstFileOverall) {
        setActiveFileTabId(enrichedFile.id);
      }
      return newUploadedFiles;
    });
  }, [enrichRecordWithTowerData, setActiveFileTabId]);

  const removeFile = useCallback((fileId: string) => {
    setUploadedFiles(currentUploadedFiles => {
      const newUploadedFiles = currentUploadedFiles.filter(f => f.id !== fileId);
      setFilterState(currentFilterState => {
        const newSelectedFileIds = currentFilterState.selectedFileIds.filter(id => id !== fileId);
        
        if (activeFileTabId === fileId) {
          if (newSelectedFileIds.length > 0) {
            const stillSelectedAndRemaining = newUploadedFiles.filter(f => newSelectedFileIds.includes(f.id));
            if (stillSelectedAndRemaining.length > 0) {
              setActiveFileTabId(stillSelectedAndRemaining[0].id);
            } else {
              setActiveFileTabId(newSelectedFileIds[0]); // Fallback to first of new selected
            }
          } else if (newUploadedFiles.length > 0) {
            setActiveFileTabId(newUploadedFiles[0].id); // Fallback to first of any remaining uploaded
          } else {
            setActiveFileTabId(null);
          }
        }
        return { ...currentFilterState, selectedFileIds: newSelectedFileIds };
      });
      return newUploadedFiles;
    });
  }, [activeFileTabId, setActiveFileTabId]);

  const resetHiddenNodes = useCallback(() => setHiddenNodeIds(new Set()), []);
  const clearCustomNodeLabels = useCallback(() => setCustomNodeLabels(new Map()), []);
  const clearAllCustomEdgeColors = useCallback(() => setCustomEdgeColors(new Map()), []);
  const clearAllCustomNodeColors = useCallback(() => setCustomNodeColors(new Map()), []);
  const clearAllCustomNodeBaseIcons = useCallback(() => setCustomNodeBaseIcons(new Map()), []);
  

  const removeAllCDRFiles = useCallback(() => {
    setUploadedFiles([]);
    setFilterState({
      searchTerm: '', dateFrom: '', dateTo: '', usageTypes: [], networkTypes: [],
      minDuration: null, maxDuration: null, selectedFileIds: [], 
    });
    setActiveFileTabId(null); setError(null); 
    resetHiddenNodes(); clearCustomNodeLabels(); clearAllCustomEdgeColors(); showAllHiddenEdges();
    clearAllCustomNodeColors(); clearAllCustomNodeBaseIcons(); // Clear new custom states
    setTargetNodeForGraphView(null); setTargetNumberForBehavioralProfile(null);
    setActiveGraphLayout('cose'); // Reset layout on clearing all data
  }, [resetHiddenNodes, clearCustomNodeLabels, clearAllCustomEdgeColors, showAllHiddenEdges, clearAllCustomNodeColors, clearAllCustomNodeBaseIcons, setActiveFileTabId, setError, setTargetNodeForGraphView, setTargetNumberForBehavioralProfile, setActiveGraphLayout]);


  const updateFileSourceName = useCallback((fileId: string, newSourceName: string) => {
    setUploadedFiles(prevFiles => prevFiles.map(f => f.id === fileId ? { ...f, sourceName: newSourceName } : f));
  }, []);

  const removeRecordsByIds = useCallback((recordIdsToRemove: string[]) => {
    const idsToRemoveSet = new Set(recordIdsToRemove);
    setUploadedFiles(prevFiles => 
      prevFiles.map(file => ({
        ...file, records: file.records.filter(record => !idsToRemoveSet.has(record.id))
      })).filter(file => file.records.length > 0) 
    );
  }, []);


  const filteredRecords = useMemo(() => { 
    if (activeFileTabId) {
      const activeFile = filesToAnalyze.find(f => f.id === activeFileTabId);
      if (activeFile) {
        return activeFile.records.map(enrichRecordWithTowerData).filter((record) => {
          if (!isValidCDRRecord(record)) return false;
          const searchTermLower = filterState.searchTerm.toLowerCase();
          if (filterState.searchTerm && 
              !record.APARTY.toLowerCase().includes(searchTermLower) &&
              !(record.BPARTY && record.BPARTY.toLowerCase().includes(searchTermLower)) &&
              !(record.ADDRESS && record.ADDRESS.toLowerCase().includes(searchTermLower)) &&
              !(record.IMEI && record.IMEI.toLowerCase().includes(searchTermLower)) &&
              !(record.IMSI && record.IMSI.toLowerCase().includes(searchTermLower)) &&
              !(record.PROVIDER_NAME && record.PROVIDER_NAME.toLowerCase().includes(searchTermLower))
          ) return false;
          if (filterState.dateFrom) {
            const recordDate = parseDateTime(record.START_DTTIME);
            const fromDate = new Date(filterState.dateFrom);
            if (recordDate && recordDate < fromDate) return false;
          }
          if (filterState.dateTo) {
            const recordDate = parseDateTime(record.START_DTTIME);
            const toDate = new Date(filterState.dateTo);
            toDate.setHours(23, 59, 59, 999); 
            if (recordDate && recordDate > toDate) return false;
          }
          if (filterState.usageTypes.length > 0 && !filterState.usageTypes.includes(record.USAGE_TYPE)) return false;
          if (filterState.networkTypes.length > 0 && record.NETWORK_TYPE && !filterState.networkTypes.includes(record.NETWORK_TYPE)) return false;
          const duration = parseInt(record.CALL_DURATION, 10);
          if (filterState.minDuration !== null && (isNaN(duration) || duration < filterState.minDuration)) return false;
          if (filterState.maxDuration !== null && (isNaN(duration) || duration > filterState.maxDuration)) return false;
          return true;
        });
      }
    }
    const currentPath = (document.getElementById('root')?.closest('[data-active-view]') as HTMLElement)?.dataset?.activeView;
    if (currentPath === 'data') return []; 
    return globallyFilteredRecords; 
  }, [globallyFilteredRecords, activeFileTabId, filesToAnalyze, filterState, enrichRecordWithTowerData]); 

  const locationTimelineData = useMemo((): LocationEvent[] => { 
    if (globallyFilteredRecords.length === 0) return [];
    const recordsWithValidLocation = globallyFilteredRecords.filter( record => isValidCDRRecord(record) && record.APARTY && record.APARTY.trim() !== '' && record.LACSTARTA && record.LACSTARTA.trim() !== '' && record.CISTARTA && record.CISTARTA.trim() !== '' && parseDateTime(record.START_DTTIME) !== null );
    const sortedRecords = [...recordsWithValidLocation].sort((a, b) => { if (a.APARTY < b.APARTY) return -1; if (a.APARTY > b.APARTY) return 1; return (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0); });
    const tempEvents: LocationEvent[] = [];
    for (let i = 0; i < sortedRecords.length; i++) {
      const currentRecord = sortedRecords[i]; const timestamp = parseDateTime(currentRecord.START_DTTIME)!; const locationId = `${currentRecord.LACSTARTA}-${currentRecord.CISTARTA}`;
      let durationApproximationMinutes = 1;
      if (i + 1 < sortedRecords.length) { const nextRecord = sortedRecords[i + 1]; if (nextRecord.APARTY === currentRecord.APARTY && `${nextRecord.LACSTARTA}-${nextRecord.CISTARTA}` === locationId) { const nextTimestamp = parseDateTime(nextRecord.START_DTTIME)!; durationApproximationMinutes = (nextTimestamp.getTime() - timestamp.getTime()) / (1000 * 60); }}
      let latitude: number | undefined = currentRecord.latitude; let longitude: number | undefined = currentRecord.longitude;
      const event: LocationEvent = { id: currentRecord.id, timestamp, aparty: currentRecord.APARTY, bparty: currentRecord.BPARTY || undefined, usageType: currentRecord.USAGE_TYPE || undefined, locationId, address: currentRecord.ADDRESS || undefined, latitude, longitude, durationApproximationMinutes: Math.max(1, parseFloat(durationApproximationMinutes.toFixed(2))), sourceFileId: currentRecord.sourceFileId, fileName: currentRecord.fileName, derivedLocationSource: currentRecord.derivedLocationSource, };
      tempEvents.push(event);
    } return tempEvents;
  }, [globallyFilteredRecords]);

  const linkAnalysisResults = useMemo((): LinkAnalysisResult[] => { 
    if (filesToAnalyze.length === 0) return [];
    const numberMap = new Map<string, LinkAnalysisResult['files']>();
    filesToAnalyze.forEach(file => { file.records.forEach(record => { if (!isValidCDRRecord(record)) return; const processNumber = (num: string, role: 'APARTY' | 'BPARTY') => { if (!num || typeof num !== 'string' || num.trim() === '') return; let fileEntries = numberMap.get(num) || []; let fileEntry = fileEntries.find(e => e.fileId === file.id); if (!fileEntry) { fileEntry = { fileName: file.name, fileId: file.id, sourceName: file.sourceName, asAPartyCount: 0, asBPartyCount: 0, records: [] }; fileEntries.push(fileEntry); } if (role === 'APARTY') fileEntry.asAPartyCount++; if (role === 'BPARTY') fileEntry.asBPartyCount++; numberMap.set(num, fileEntries); }; processNumber(record.APARTY, 'APARTY'); if (record.BPARTY) processNumber(record.BPARTY, 'BPARTY'); }); });
    const results: LinkAnalysisResult[] = [];
    numberMap.forEach((fileOccurrencesData, number) => { const appearsInMultipleFilesRaw = fileOccurrencesData.length > 1; const isCallerAndReceiverInSingleFileRaw = fileOccurrencesData.length === 1 && fileOccurrencesData[0].asAPartyCount > 0 && fileOccurrencesData[0].asBPartyCount > 0; const isCommonAcrossAll = filesToAnalyze.length > 0 && fileOccurrencesData.length === filesToAnalyze.length; const isPresentInFilteredGlobalScope = globallyFilteredRecords.some(fr => fr.APARTY === number || fr.BPARTY === number); if ((appearsInMultipleFilesRaw || isCallerAndReceiverInSingleFileRaw || isCommonAcrossAll) && isPresentInFilteredGlobalScope) { const totalOccurrences = fileOccurrencesData.reduce((sum, f) => sum + f.asAPartyCount + f.asBPartyCount, 0); if (isCommonAcrossAll) { const detailsForCommonNumber: DetailedFileInteraction[] = []; const filesPropertyForCommonLinkPayload: LinkAnalysisResult['files'] = []; filesToAnalyze.forEach(fileInAnalysis => { const recordsInThisFileForNumberRaw = fileInAnalysis.records.filter(r => isValidCDRRecord(r) && (r.APARTY === number || r.BPARTY === number)); const contactedBParties = new Set<string>(); const callingAParties = new Set<string>(); const associatedLACs = new Set<string>(); const associatedCellIds = new Set<string>(); const associatedIMEIs = new Set<string>(); const associatedAddresses = new Set<string>(); recordsInThisFileForNumberRaw.forEach(r => { if (r.APARTY === number && r.BPARTY) contactedBParties.add(r.BPARTY); if (r.BPARTY === number && r.APARTY) callingAParties.add(r.APARTY); if (r.LACSTARTA) associatedLACs.add(r.LACSTARTA); if (r.CISTARTA) associatedCellIds.add(r.CISTARTA); if (r.IMEI) associatedIMEIs.add(r.IMEI); if (r.ADDRESS) associatedAddresses.add(r.ADDRESS); }); detailsForCommonNumber.push({ fileId: fileInAnalysis.id, fileName: fileInAnalysis.name, sourceName: fileInAnalysis.sourceName, contactedBParties: Array.from(contactedBParties).sort(), callingAParties: Array.from(callingAParties).sort(), associatedLACs: Array.from(associatedLACs).sort(), associatedCellIds: Array.from(associatedCellIds).sort(), associatedIMEIs: Array.from(associatedIMEIs).sort(), associatedAddresses: Array.from(associatedAddresses).sort(), recordCountInFile: recordsInThisFileForNumberRaw.length, }); const rawOccurrenceEntry = fileOccurrencesData.find(fod => fod.fileId === fileInAnalysis.id); filesPropertyForCommonLinkPayload.push({ fileId: fileInAnalysis.id, fileName: fileInAnalysis.name, sourceName: fileInAnalysis.sourceName, asAPartyCount: rawOccurrenceEntry?.asAPartyCount || 0, asBPartyCount: rawOccurrenceEntry?.asBPartyCount || 0, records: recordsInThisFileForNumberRaw }); }); results.push({ number, files: filesPropertyForCommonLinkPayload, totalOccurrences, isCommonAcrossAllSelectedFiles: true, commonNumberDetails: detailsForCommonNumber }); } else { const finalFileEntriesForOtherLinks = fileOccurrencesData.map(fe_raw => ({ ...fe_raw, records: globallyFilteredRecords.filter(fr_filtered => fr_filtered.sourceFileId === fe_raw.fileId && (fr_filtered.APARTY === number || fr_filtered.BPARTY === number)) })).filter(fe_processed => fe_processed.records.length > 0); if (finalFileEntriesForOtherLinks.length > 0) { results.push({ number, files: finalFileEntriesForOtherLinks, totalOccurrences, isCommonAcrossAllSelectedFiles: false, commonNumberDetails: undefined }); } } } });
    return results.sort((a,b) => { if (a.isCommonAcrossAllSelectedFiles && !b.isCommonAcrossAllSelectedFiles) return -1; if (!a.isCommonAcrossAllSelectedFiles && b.isCommonAcrossAllSelectedFiles) return 1; return b.totalOccurrences - a.totalOccurrences; });
  }, [filesToAnalyze, globallyFilteredRecords]); 

  const hideNode = useCallback((nodeId: string) => setHiddenNodeIds(prev => new Set(prev).add(nodeId)), []);
  const showNode = useCallback((nodeId: string) => setHiddenNodeIds(prev => { const newSet = new Set(prev); newSet.delete(nodeId); return newSet; }), []);
  const setCustomNodeLabel = useCallback((nodeId: string, label: string) => setCustomNodeLabels(prev => new Map(prev).set(nodeId, label)), []);
  const removeCustomNodeLabel = useCallback((nodeId: string) => setCustomNodeLabels(prev => { const newMap = new Map(prev); newMap.delete(nodeId); return newMap; }), []);
  const setCustomEdgeColor = useCallback((edgeId: string, color: string) => setCustomEdgeColors(prev => new Map(prev).set(edgeId, color)), []);
  const removeCustomEdgeColor = useCallback((edgeId: string) => setCustomEdgeColors(prev => { const newMap = new Map(prev); newMap.delete(edgeId); return newMap; }), []);
  
  const setCustomNodeColor = useCallback((nodeId: string, color: string) => setCustomNodeColors(prev => new Map(prev).set(nodeId, color)), []);
  const removeCustomNodeColor = useCallback((nodeId: string) => setCustomNodeColors(prev => { const newMap = new Map(prev); newMap.delete(nodeId); return newMap; }), []);
  
  const setCustomNodeBaseIcon = useCallback((nodeId: string, iconKey: string) => setCustomNodeBaseIcons(prev => new Map(prev).set(nodeId, iconKey)), []);
  const removeCustomNodeBaseIcon = useCallback((nodeId: string) => setCustomNodeBaseIcons(prev => { const newMap = new Map(prev); newMap.delete(nodeId); return newMap; }), []);


  const hideEdge = useCallback((edgeIdToHide: string) => {
    const newHiddenEdgeIds = new Set(hiddenEdgeIds).add(edgeIdToHide);
    const edge = graphData.edges.find(e => e.data.id === edgeIdToHide);
    if (!edge) {
      setHiddenEdgeIds(newHiddenEdgeIds); 
      return;
    }

    const sourceId = edge.data.source;
    const targetId = edge.data.target;
    const newHiddenNodeIds = new Set(hiddenNodeIds);

    const checkAndHideNode = (nodeId: string) => {
      const connectedEdges = graphData.edges.filter(e => e.data.source === nodeId || e.data.target === nodeId);
      const allConnectedEdgesHidden = connectedEdges.every(e => newHiddenEdgeIds.has(e.data.id));
      if (allConnectedEdgesHidden && connectedEdges.length > 0) {
        newHiddenNodeIds.add(nodeId);
      }
    };

    checkAndHideNode(sourceId);
    checkAndHideNode(targetId);
    
    setHiddenEdgeIds(newHiddenEdgeIds);
    setHiddenNodeIds(newHiddenNodeIds);
  }, [hiddenEdgeIds, hiddenNodeIds, graphData.edges]);


  const showEdge = useCallback((edgeIdToShow: string) => {
    const newHiddenEdgeIds = new Set(hiddenEdgeIds);
    newHiddenEdgeIds.delete(edgeIdToShow);
    setHiddenEdgeIds(newHiddenEdgeIds);

    const edge = graphData.edges.find(e => e.data.id === edgeIdToShow);
    if (edge) {
      const sourceId = edge.data.source;
      const targetId = edge.data.target;
      setHiddenNodeIds(prevHiddenNodeIds => {
        const newHiddenNodes = new Set(prevHiddenNodeIds);
        newHiddenNodes.delete(sourceId);
        newHiddenNodes.delete(targetId);
        return newHiddenNodes;
      });
    }
  }, [hiddenEdgeIds, graphData.edges]);
  
  const cellTowerAnalytics = useMemo((): CellTowerAnalyticsData[] => { 
    const recordsForAnalysis = globallyFilteredRecords; const towerMap = new Map<string, CellTowerAnalyticsData>();
    recordsForAnalysis.forEach(record => { if (!isValidCDRRecord(record) || !record.LACSTARTA || !record.CISTARTA) return; const towerId = `${record.LACSTARTA}-${record.CISTARTA}`; if (!towerMap.has(towerId)) { const hourlyBreakdownTemplate: GenericHourlyActivity[] = Array(24).fill(null).map((_, i) => ({ hour: i, name: `${String(i).padStart(2, '0')}:00`, callCount: 0, totalDuration: 0 })); towerMap.set(towerId, { id: towerId, lac: record.LACSTARTA, cid: record.CISTARTA, address: record.ADDRESS || undefined, recordCount: 0, totalCallDuration: 0, uniqueAParties: new Set<string>(), uniqueBParties: new Set<string>(), hourlyBreakdown: hourlyBreakdownTemplate, associatedRecords: [], latitude: record.latitude, longitude: record.longitude, }); } const towerData = towerMap.get(towerId)!; towerData.recordCount++; const callDuration = parseInt(record.CALL_DURATION, 10) || 0; towerData.totalCallDuration += callDuration; if (record.APARTY) towerData.uniqueAParties.add(record.APARTY); if (record.BPARTY) towerData.uniqueBParties.add(record.BPARTY); towerData.associatedRecords.push(record); const recordDate = parseDateTime(record.START_DTTIME); if (recordDate) { const hour = recordDate.getHours(); towerData.hourlyBreakdown[hour].callCount++; towerData.hourlyBreakdown[hour].totalDuration += callDuration; if (!towerData.firstSeen || recordDate < towerData.firstSeen) towerData.firstSeen = recordDate; if (!towerData.lastSeen || recordDate > towerData.lastSeen) towerData.lastSeen = recordDate; } if (record.derivedLocationSource === 'towerDB' && record.ADDRESS && record.ADDRESS !== 'N/A (from Tower DB)') { towerData.address = record.ADDRESS; towerData.latitude = record.latitude; towerData.longitude = record.longitude; } else if ((!towerData.address || towerData.address.toLowerCase() === 'n/a') && record.ADDRESS) { towerData.address = record.ADDRESS; } });
    return Array.from(towerMap.values()).sort((a, b) => b.recordCount - a.recordCount);
  }, [globallyFilteredRecords]);

  const deviceAnalyticsData = useMemo((): DeviceAnalyticsData[] => { 
    const recordsForAnalysis = globallyFilteredRecords; const imeiMap = new Map<string, Omit<DeviceAnalyticsData, 'simChangeHistory'> & { usageDatesSet?: Set<string>; recordsForImei: CDRRecord[] }>();
    recordsForAnalysis.forEach(record => { if (!isValidCDRRecord(record) || !record.IMEI || record.IMEI.trim() === '' || record.IMEI.trim().toLowerCase() === 'n/a') return; const imei = record.IMEI.trim(); if (!imeiMap.has(imei)) { const hourlyBreakdownTemplate: GenericHourlyActivity[] = Array(24).fill(null).map((_, i) => ({ hour: i, name: `${String(i).padStart(2, '0')}:00`, callCount: 0, totalDuration: 0, })); imeiMap.set(imei, { imei: imei, recordCount: 0, associatedSims: [], contactedParties: [], hourlyBreakdown: hourlyBreakdownTemplate, usageDates: [], usageDatesSet: new Set<string>(), recordsForImei: [] }); } const deviceData = imeiMap.get(imei)!; deviceData.recordCount++; deviceData.recordsForImei.push(record); const recordDate = parseDateTime(record.START_DTTIME); if (recordDate) { deviceData.usageDatesSet!.add(recordDate.toISOString().split('T')[0]); const hour = recordDate.getHours(); deviceData.hourlyBreakdown[hour].callCount++; if (!deviceData.firstSeen || recordDate < deviceData.firstSeen) deviceData.firstSeen = recordDate; if (!deviceData.lastSeen || recordDate > deviceData.lastSeen) deviceData.lastSeen = recordDate; } const simIdentifier = record.IMSI || record.APARTY; if (simIdentifier) { let simInfo = deviceData.associatedSims.find(s => s.simIdentifier === simIdentifier); if (!simInfo) { simInfo = { simIdentifier, type: record.IMSI ? 'IMSI' : 'APARTY', count: 0 }; deviceData.associatedSims.push(simInfo); } simInfo.count++; if (recordDate) { if (!simInfo.firstSeen || recordDate < simInfo.firstSeen) simInfo.firstSeen = recordDate; if (!simInfo.lastSeen || recordDate > simInfo.lastSeen) simInfo.lastSeen = recordDate; } } if (record.APARTY && record.BPARTY && record.IMEI === imei) { let partyInfo = deviceData.contactedParties.find(p => p.partyNumber === record.BPARTY); if (!partyInfo) { partyInfo = { partyNumber: record.BPARTY, count: 0, viaSims: [] }; deviceData.contactedParties.push(partyInfo); } partyInfo.count++; if (simIdentifier && !partyInfo.viaSims.includes(simIdentifier)) partyInfo.viaSims.push(simIdentifier); } });
    const finalDeviceData: DeviceAnalyticsData[] = [];
    imeiMap.forEach(deviceProcData => { deviceProcData.associatedSims.sort((a,b) => b.count - a.count); deviceProcData.contactedParties.sort((a,b) => b.count - a.count); const simChangeHistory: SimChangeEvent[] = []; if (deviceProcData.recordsForImei.length > 0) { const sortedRecordsForImei = [...deviceProcData.recordsForImei].sort((a,b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0)); let lastKnownSimForImei: string | undefined = undefined; for (const record of sortedRecordsForImei) { const currentSimForRecord = record.IMSI?.trim() || record.APARTY?.trim(); const recordTimestamp = parseDateTime(record.START_DTTIME); if (currentSimForRecord && recordTimestamp) { if (lastKnownSimForImei !== undefined && lastKnownSimForImei !== currentSimForRecord) { simChangeHistory.push({ timestamp: recordTimestamp, previousSim: lastKnownSimForImei, newSim: currentSimForRecord }); } lastKnownSimForImei = currentSimForRecord; } } } finalDeviceData.push({ imei: deviceProcData.imei, recordCount: deviceProcData.recordCount, associatedSims: deviceProcData.associatedSims, contactedParties: deviceProcData.contactedParties, hourlyBreakdown: deviceProcData.hourlyBreakdown, firstSeen: deviceProcData.firstSeen, lastSeen: deviceProcData.lastSeen, usageDates: Array.from(deviceProcData.usageDatesSet || new Set<string>()).sort().map(dateStr => new Date(dateStr + 'T00:00:00Z')), simChangeHistory: simChangeHistory }); });
    return finalDeviceData.sort((a, b) => b.recordCount - a.recordCount);
  }, [globallyFilteredRecords]);

  const conversationChainAnalytics = useMemo((): ConversationChain[] => { 
    const records = [...globallyFilteredRecords].sort((a,b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0)); const chains: ConversationChain[] = []; const MAX_GAP_MINUTES = 60; const MIN_CHAIN_LENGTH = 2; const processedRecordIds = new Set<string>();
    for (let i = 0; i < records.length; i++) { const initialCall = records[i]; if (processedRecordIds.has(initialCall.id) || !isValidCDRRecord(initialCall)) continue; const initialCallTime = parseDateTime(initialCall.START_DTTIME); if (!initialCallTime || !initialCall.APARTY || !initialCall.BPARTY || !initialCall.APARTY.trim() || !initialCall.BPARTY.trim()) continue; const party1 = initialCall.APARTY.trim(); const party2 = initialCall.BPARTY.trim(); let currentChainCalls: CallInChain[] = [{ id: initialCall.id, caller: party1, receiver: party2, timestamp: initialCallTime, duration: parseInt(initialCall.CALL_DURATION, 10) || 0, usageType: initialCall.USAGE_TYPE, networkType: initialCall.NETWORK_TYPE || "N/A", address: initialCall.ADDRESS, originalRecord: initialCall, }]; let lastCallInChain = currentChainCalls[0]; for (let j = i + 1; j < records.length; j++) { const nextPotentialCall = records[j]; if (!isValidCDRRecord(nextPotentialCall)) continue; const nextPotentialCallTime = parseDateTime(nextPotentialCall.START_DTTIME); if (!nextPotentialCallTime || !nextPotentialCall.APARTY || !nextPotentialCall.BPARTY || !nextPotentialCall.APARTY.trim() || !nextPotentialCall.BPARTY.trim()) continue; const nextCaller = nextPotentialCall.APARTY.trim(); const nextReceiver = nextPotentialCall.BPARTY.trim(); const isBetweenSameParties = (nextCaller === party1 && nextReceiver === party2) || (nextCaller === party2 && nextReceiver === party1); if (isBetweenSameParties) { const timeDiffMinutes = (nextPotentialCallTime.getTime() - lastCallInChain.timestamp.getTime()) / (1000 * 60); if (timeDiffMinutes >= 0 && timeDiffMinutes <= MAX_GAP_MINUTES) { const callToAdd: CallInChain = { id: nextPotentialCall.id, caller: nextCaller, receiver: nextReceiver, timestamp: nextPotentialCallTime, duration: parseInt(nextPotentialCall.CALL_DURATION, 10) || 0, usageType: nextPotentialCall.USAGE_TYPE, networkType: nextPotentialCall.NETWORK_TYPE || "N/A", address: nextPotentialCall.ADDRESS, originalRecord: nextPotentialCall, timeGapToNextCall: undefined, }; if (currentChainCalls.length > 0) currentChainCalls[currentChainCalls.length - 1].timeGapToNextCall = parseFloat(timeDiffMinutes.toFixed(2)); currentChainCalls.push(callToAdd); lastCallInChain = callToAdd; } else if (timeDiffMinutes > MAX_GAP_MINUTES) break; } } if (currentChainCalls.length >= MIN_CHAIN_LENGTH) { const participants = Array.from(new Set([party1, party2])); let totalChainDuration = 0; currentChainCalls.forEach(call => { totalChainDuration += call.duration; processedRecordIds.add(call.id); }); const startTime = currentChainCalls[0].timestamp; const endTime = currentChainCalls[currentChainCalls.length - 1].timestamp; const overallTimespan = (endTime.getTime() - startTime.getTime()) / (1000 * 60); chains.push({ id: uuidv4(), calls: currentChainCalls, participants: participants, startTime, endTime, totalChainDuration, overallTimespan: parseFloat(overallTimespan.toFixed(2)), depth: currentChainCalls.length, }); } }
    return chains.sort((a,b) => b.depth - a.depth || a.startTime.getTime() - b.startTime.getTime());
  }, [globallyFilteredRecords]);

  const behavioralFingerprints = useMemo((): BehavioralFingerprint[] => { 
    const records = globallyFilteredRecords; if (records.length === 0) return []; const numberStats: Map<string, { records: CDRRecord[]; hourly: number[]; daily: number[]; callDurations: number[]; outgoingCalls: number; incomingCalls: number; outgoingSMS: number; incomingSMS: number; towers: Map<string, { count: number, address?: string }>; totalCalls: number; totalSMS: number; }> = new Map(); const getStat = (num: string) => { if (!numberStats.has(num)) { numberStats.set(num, { records: [], hourly: Array(24).fill(0), daily: Array(7).fill(0), callDurations: [], outgoingCalls: 0, incomingCalls: 0, outgoingSMS: 0, incomingSMS: 0, towers: new Map(), totalCalls: 0, totalSMS: 0 }); } return numberStats.get(num)!; }; records.forEach(record => { if (!isValidCDRRecord(record)) return; const aparty = record.APARTY.trim(); const bparty = record.BPARTY ? record.BPARTY.trim() : null; const usageType = record.USAGE_TYPE; const processNumberForFingerprint = (num: string, isRecordAParty: boolean) => { const stat = getStat(num); stat.records.push(record); const dateTime = parseDateTime(record.START_DTTIME); if (dateTime) { stat.hourly[dateTime.getHours()]++; stat.daily[dateTime.getDay()]++; } if (isAnyCall(usageType)) { stat.totalCalls++; const duration = parseInt(record.CALL_DURATION, 10); if (!isNaN(duration) && duration >=0) stat.callDurations.push(duration); if (isRecordAParty) { if (isOutgoingCallType(usageType)) stat.outgoingCalls++; else if (isIncomingCallType(usageType)) stat.incomingCalls++; } else { if (isOutgoingCallType(usageType)) stat.incomingCalls++; else if (isIncomingCallType(usageType)) stat.outgoingCalls++; } } else if (isAnySMS(usageType)) { stat.totalSMS++; if (isRecordAParty) { if (isOutgoingSMSType(usageType)) stat.outgoingSMS++; else if (isIncomingSMSType(usageType)) stat.incomingSMS++; } else { if (isOutgoingSMSType(usageType)) stat.incomingSMS++; else if (isIncomingSMSType(usageType)) stat.outgoingSMS++; } } if (record.LACSTARTA && record.CISTARTA) { const towerId = `${record.LACSTARTA}-${record.CISTARTA}`; const towerInfo = stat.towers.get(towerId) || { count: 0, address: record.ADDRESS }; towerInfo.count++; if ((!towerInfo.address || towerInfo.address.toLowerCase() === 'n/a') && record.ADDRESS && record.ADDRESS.toLowerCase() !== 'n/a') { towerInfo.address = record.ADDRESS; } stat.towers.set(towerId, towerInfo); }}; if (aparty) processNumberForFingerprint(aparty, true); if (bparty) processNumberForFingerprint(bparty, false); }); const fingerprints: BehavioralFingerprint[] = []; const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; numberStats.forEach((stat, num) => { const totalInteractions = stat.records.length; if (totalInteractions === 0) return; const hourlyActivity: ActivityPattern[] = stat.hourly.map((count, i) => ({ name: `${String(i).padStart(2, '0')}:00`, count })); const dailyActivity: ActivityPattern[] = stat.daily.map((count, i) => ({ name: dayNames[i], count })); const avgCallDurationSeconds = stat.callDurations.length > 0 ? stat.callDurations.reduce((a, b) => a + b, 0) / stat.callDurations.length : 0; let callDirectionality: BehavioralFingerprint['callDirectionality'] = 'n/a'; if (stat.totalCalls > 0) { const ratio = stat.outgoingCalls / stat.totalCalls; if (ratio > 0.7) callDirectionality = 'outgoing'; else if (ratio < 0.3) callDirectionality = 'incoming'; else callDirectionality = 'balanced'; } let smsDirectionality: BehavioralFingerprint['smsDirectionality'] = 'n/a'; if (stat.totalSMS > 0) { const ratio = stat.outgoingSMS / stat.totalSMS; if (ratio > 0.7) smsDirectionality = 'outgoing'; else if (ratio < 0.3) smsDirectionality = 'incoming'; else smsDirectionality = 'balanced'; } const topTowers: TopTowerInfo[] = Array.from(stat.towers.entries()).sort(([, a], [, b]) => b.count - a.count).slice(0, 3).map(([towerId, info]) => ({ towerId, count: info.count, address: info.address })); let primaryActivityFocus: BehavioralFingerprint['primaryActivityFocus'] = 'n/a'; if (stat.totalCalls > 0 && stat.totalSMS === 0) primaryActivityFocus = 'call'; else if (stat.totalSMS > 0 && stat.totalCalls === 0) primaryActivityFocus = 'sms'; else if (stat.totalCalls > 0 && stat.totalSMS > 0) primaryActivityFocus = 'mixed'; let dominantTimeSlot: BehavioralFingerprint['dominantTimeSlot'] = 'n/a'; const hourlyCounts = stat.hourly; if (totalInteractions > 0) { const slots = { morning: 0, afternoon: 0, evening: 0, night: 0 }; hourlyCounts.forEach((count, hour) => { if (hour >= 6 && hour < 12) slots.morning += count; else if (hour >= 12 && hour < 18) slots.afternoon += count; else if (hour >= 18 && hour < 22) slots.evening += count; else slots.night += count; }); const maxSlotCount = Math.max(...Object.values(slots)); const dominantSlots = (Object.keys(slots) as (keyof typeof slots)[]).filter(s => slots[s] === maxSlotCount); if (dominantSlots.length === 1 && maxSlotCount > 0) dominantTimeSlot = dominantSlots[0]; else if (dominantSlots.length > 1 && maxSlotCount > 0) dominantTimeSlot = 'varied'; } fingerprints.push({ number: num, totalInteractions, hourlyActivity, dailyActivity, avgCallDurationSeconds: parseFloat(avgCallDurationSeconds.toFixed(2)), callDirectionality, smsDirectionality, topTowers, primaryActivityFocus, dominantTimeSlot, }); });
    return fingerprints.sort((a, b) => b.totalInteractions - a.totalInteractions);
  }, [globallyFilteredRecords]);

  const simCardAnalytics = useMemo((): SimCardAnalyticsData[] => { 
    const recordsForAnalysis = globallyFilteredRecords; const simMap = new Map<string, { type: 'IMSI' | 'APARTY'; recordsForSim: CDRRecord[]; firstSeenOverall?: Date; lastSeenOverall?: Date; associatedImeisMap: Map<string, AssociatedImeiInfo>; }>();
    recordsForAnalysis.forEach(record => { if (!isValidCDRRecord(record)) return; const simId = record.IMSI?.trim() || record.APARTY?.trim(); const simType = record.IMSI?.trim() ? 'IMSI' : 'APARTY'; if (!simId) return; if (!simMap.has(simId)) { simMap.set(simId, { type: simType, recordsForSim: [], associatedImeisMap: new Map<string, AssociatedImeiInfo>() }); } const simData = simMap.get(simId)!; simData.recordsForSim.push(record); const recordDate = parseDateTime(record.START_DTTIME); if (recordDate) { if (!simData.firstSeenOverall || recordDate < simData.firstSeenOverall) simData.firstSeenOverall = recordDate; if (!simData.lastSeenOverall || recordDate > simData.lastSeenOverall) simData.lastSeenOverall = recordDate; } if (record.IMEI && record.IMEI.trim() !== '' && record.IMEI.trim().toLowerCase() !== 'n/a') { const imei = record.IMEI.trim(); let imeiInfo = simData.associatedImeisMap.get(imei); if (!imeiInfo) { imeiInfo = { imei, count: 0 }; simData.associatedImeisMap.set(imei, imeiInfo); } imeiInfo.count++; if (recordDate) { if (!imeiInfo.firstSeen || recordDate < imeiInfo.firstSeen) imeiInfo.firstSeen = recordDate; if (!imeiInfo.lastSeen || recordDate > imeiInfo.lastSeen) imeiInfo.lastSeen = recordDate; } } });
    const finalSimData: SimCardAnalyticsData[] = [];
    simMap.forEach((simProcData, simIdentifier) => { const imeiChangeHistory: ImeiChangeEvent[] = []; if (simProcData.recordsForSim.length > 0) { const sortedRecordsForSim = [...simProcData.recordsForSim].sort((a, b) => (parseDateTime(a.START_DTTIME)?.getTime() || 0) - (parseDateTime(b.START_DTTIME)?.getTime() || 0)); let lastKnownImeiForSim: string | undefined = undefined; for (const record of sortedRecordsForSim) { const currentImeiForRecord = record.IMEI.trim(); const recordTimestamp = parseDateTime(record.START_DTTIME); if (currentImeiForRecord && currentImeiForRecord.toLowerCase() !== 'n/a' && recordTimestamp) { if (lastKnownImeiForSim !== undefined && lastKnownImeiForSim !== currentImeiForRecord) { imeiChangeHistory.push({ timestamp: recordTimestamp, previousImei: lastKnownImeiForSim, newImei: currentImeiForRecord, recordId: record.id }); } lastKnownImeiForSim = currentImeiForRecord; } } } const associatedImeis = Array.from(simProcData.associatedImeisMap.values()).sort((a,b) => b.count - a.count); finalSimData.push({ simIdentifier, type: simProcData.type, recordCount: simProcData.recordsForSim.length, associatedImeis, imeiChangeHistory, firstSeenOverall: simProcData.firstSeenOverall, lastSeenOverall: simProcData.lastSeenOverall, }); });
    return finalSimData.sort((a,b) => b.imeiChangeHistory.length - a.imeiChangeHistory.length || b.associatedImeis.length - a.associatedImeis.length || b.recordCount - a.recordCount);
  }, [globallyFilteredRecords]);

  const getUniqueValues = useCallback((key: keyof CDRRecord): string[] => {
    const values = new Set<string>();
    allRecords.forEach(record => {
      const val = record[key];
      if (val !== undefined && val !== null) values.add(String(val));
    });
    return Array.from(values).sort();
  }, [allRecords]);

  return (
    <CDRContext.Provider value={{ 
      uploadedFiles, addFile, removeFile, removeAllCDRFiles, updateFileSourceName, removeRecordsByIds, 
      allRecords, filteredRecords, globallyFilteredRecords,
      filterState, setFilterState, linkAnalysisResults, graphData,
      cellTowerAnalytics, deviceAnalyticsData, conversationChainAnalytics,
      locationTimelineData, behavioralFingerprints, simCardAnalytics,
      isLoading, setIsLoading, error: error, setError: setError, 
      getUniqueValues, filesToAnalyze,
      hiddenNodeIds, hideNode, showNode, resetHiddenNodes,
      customNodeLabels, setCustomNodeLabel, removeCustomNodeLabel, clearCustomNodeLabels,
      customEdgeColors, setCustomEdgeColor, removeCustomEdgeColor, clearAllCustomEdgeColors,
      hiddenEdgeIds, hideEdge, showEdge, showAllHiddenEdges,
      customNodeColors, setCustomNodeColor, removeCustomNodeColor, clearAllCustomNodeColors, // Added node color functions
      customNodeBaseIcons, setCustomNodeBaseIcon, removeCustomNodeBaseIcon, clearAllCustomNodeBaseIcons, // Added node icon functions
      activeFileTabId, setActiveFileTabId,
      targetNodeForGraphView, setTargetNodeForGraphView,
      targetNumberForBehavioralProfile, setTargetNumberForBehavioralProfile,
      activeGraphLayout, setActiveGraphLayout,
      isGraphDataTrimmed
    }}>
      {children}
    </CDRContext.Provider>
  );
};

export const useCDRContext = (): CDRContextType => {
  const context = useContext(CDRContext);
  if (!context) throw new Error('useCDRContext must be used within a CDRProvider');
  return context;
};