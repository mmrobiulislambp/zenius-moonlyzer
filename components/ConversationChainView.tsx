
import React, { useState, useEffect, useRef, useMemo } from 'react'; // Added useMemo
import { GitFork, Users, Clock, ArrowRight, ChevronDown, ChevronRight, Info, Filter, FileText, Watch, Download, PlayCircle, PauseCircle, SkipForward, SkipBack, Maximize2, Minimize2, Search, XCircle } from 'lucide-react'; // Added Search, XCircle
import { useCDRContext } from '../contexts/CDRContext';
import { ConversationChain, CallInChain, PlaybackState } from '../types';
import { formatDate } from '../utils/cdrUtils';
import { downloadCSV } from '../utils/downloadUtils'; 

const ConversationChainView: React.FC = () => {
  const { conversationChainAnalytics, isLoading, error, uploadedFiles, filesToAnalyze, activeFileTabId } = useCDRContext();
  const [expandedChains, setExpandedChains] = useState<Record<string, boolean>>({});
  const [searchTerm, setSearchTerm] = useState<string>('');
  
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    activeChainId: null,
    currentCallIndex: 0,
    isPlaying: false,
    playbackSpeed: 1, // 1x speed
  });

  const playbackIntervalRef = useRef<number | null>(null);

  const toggleChainExpansion = (chainId: string) => {
    setExpandedChains(prev => ({ ...prev, [chainId]: !prev[chainId] }));
    // If a chain is collapsed, stop its playback
    if (playbackState.activeChainId === chainId && expandedChains[chainId]) {
      setPlaybackState(prev => ({ ...prev, isPlaying: false, activeChainId: null }));
    }
  };
  
  const startPlayback = (chain: ConversationChain) => {
    if (playbackState.activeChainId === chain.id && playbackState.isPlaying) { // If already playing this chain, pause it
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
    } else { // Start or resume playback for this chain
      setPlaybackState({
        activeChainId: chain.id,
        currentCallIndex: playbackState.activeChainId === chain.id ? playbackState.currentCallIndex : 0, // Resume or start from 0
        isPlaying: true,
        playbackSpeed: 1,
      });
      if (!expandedChains[chain.id]) { // Ensure chain is expanded when playback starts
        setExpandedChains(prev => ({ ...prev, [chain.id]: true }));
      }
    }
  };

  const handleNextCall = (chain: ConversationChain) => {
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false, // Stop automatic play
      currentCallIndex: Math.min(prev.currentCallIndex + 1, chain.calls.length - 1),
    }));
  };

  const handlePrevCall = () => {
    setPlaybackState(prev => ({
      ...prev,
      isPlaying: false,
      currentCallIndex: Math.max(prev.currentCallIndex - 1, 0),
    }));
  };

  const filteredConversationChains = useMemo(() => {
    if (!searchTerm) return conversationChainAnalytics;
    const lowerSearchTerm = searchTerm.toLowerCase();
    return conversationChainAnalytics.filter(chain => 
      chain.participants.some(p => p.toLowerCase().includes(lowerSearchTerm))
    );
  }, [conversationChainAnalytics, searchTerm]);

  useEffect(() => {
    if (playbackState.isPlaying && playbackState.activeChainId) {
      const activeChain = filteredConversationChains.find(c => c.id === playbackState.activeChainId); // Use filtered list
      if (!activeChain) {
        setPlaybackState(prev => ({...prev, isPlaying: false, activeChainId: null}));
        return;
      }

      playbackIntervalRef.current = window.setInterval(() => {
        setPlaybackState(prev => {
          if (!prev.isPlaying || !activeChain) {
            if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
            return prev;
          }
          const nextIndex = prev.currentCallIndex + 1;
          if (nextIndex >= activeChain.calls.length) {
            if (playbackIntervalRef.current) clearInterval(playbackIntervalRef.current);
            return { ...prev, isPlaying: false, currentCallIndex: activeChain.calls.length - 1 }; // Stop at last call
          }
          return { ...prev, currentCallIndex: nextIndex };
        });
      }, 3000 / playbackState.playbackSpeed); // Adjust time per call based on speed
    } else {
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
        playbackIntervalRef.current = null;
      }
    }
    return () => { // Cleanup on unmount or when dependencies change
      if (playbackIntervalRef.current) {
        clearInterval(playbackIntervalRef.current);
      }
    };
  }, [playbackState.isPlaying, playbackState.activeChainId, playbackState.playbackSpeed, filteredConversationChains]);


  const getExportFilenameBase = () => {
    if (activeFileTabId) {
        const activeFile = uploadedFiles.find(f => f.id === activeFileTabId);
        return activeFile ? (activeFile.sourceName || activeFile.name).replace(/[^a-z0-9]/gi, '_').toLowerCase() : "current_file";
    } else if (filesToAnalyze.length === 1) {
        return (filesToAnalyze[0].sourceName || filesToAnalyze[0].name).replace(/[^a-z0-9]/gi, '_').toLowerCase();
    }
    return "all_selected_files";
  };

  const handleExportChainsSummary = () => {
    const headers = ["Chain ID", "Participants", "Depth", "Start Time", "End Time", "Total Call Duration (s)", "Overall Timespan (min)"];
    const data = filteredConversationChains.map(chain => [ // Use filtered list
        chain.id.substring(0, 8), 
        chain.participants.join(' <-> '), 
        String(chain.depth),
        formatDate(chain.startTime.toISOString()), 
        formatDate(chain.endTime.toISOString()),   
        String(chain.totalChainDuration),
        String(chain.overallTimespan),
    ]);
    downloadCSV(`conversation_chains_summary_${getExportFilenameBase()}_${searchTerm ? 'filtered_'+searchTerm : ''}.csv`, data, headers);
  };

  const handleExportChainCalls = (chain: ConversationChain) => {
    const headers = ["Caller", "Receiver", "Timestamp", "Duration (s)", "Usage Type", "Network Type", "Address", "Time Gap to Next (min)", "Original File", "Original Row"];
    const data = chain.calls.map(call => [
        call.caller, call.receiver, formatDate(call.timestamp.toISOString()), String(call.duration),
        call.usageType, call.networkType, call.address || "N/A",
        call.timeGapToNextCall !== undefined ? String(call.timeGapToNextCall) : "N/A",
        call.originalRecord.fileName, String(call.originalRecord.rowIndex)
    ]);
    downloadCSV(`chain_calls_${chain.participants.join('_vs_')}_${getExportFilenameBase()}.csv`, data, headers);
  };

  if (isLoading) return <div className="flex justify-center items-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-dark"></div><p className="ml-3 text-textSecondary">Analyzing conversation chains...</p></div>;
  if (error) return <div className="p-4 bg-danger-lighter text-danger-darker rounded-lg text-center border border-danger-light">{error}</div>;
  if (uploadedFiles.length === 0) return <div className="p-6 bg-info-lighter border border-info-light rounded-lg text-center text-info-dark flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please upload CDR files.</p></div>;
  if (filesToAnalyze.length === 0) return <div className="p-6 bg-warning-lighter border border-warning-light rounded-lg text-center text-warning-darker flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2" /><p className="font-medium">Please select files in 'Filter Controls'.</p></div>;
  
  if (conversationChainAnalytics.length > 0 && filteredConversationChains.length === 0 && searchTerm) {
    return (
        <div className="space-y-6">
            <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
                    <div>
                        <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <GitFork size={24} className="mr-2.5 text-primary" /> Conversation Chain Analysis </div>
                        <p className="text-sm text-textSecondary"> Found {conversationChainAnalytics.length} conversation chains. Max gap: 60 mins. Min length: 2 calls. </p>
                    </div>
                </div>
                 <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search size={16} className="text-neutral-DEFAULT" />
                    </div>
                    <input 
                        type="text" 
                        placeholder="Search by participant number..." 
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
                <p>No conversation chains found with participants matching "{searchTerm}".</p>
            </div>
        </div>
    );
  }

  if (conversationChainAnalytics.length === 0) return <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md"><Info size={28} className="mb-2 text-neutral-DEFAULT" /><p>No conversation chains found (max 60 min gap, min 2 calls).</p></div>;
  
  const formatDurationDisplay = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '0s'; const h = Math.floor(seconds / 3600); const m = Math.floor((seconds % 3600) / 60); const s = Math.floor(seconds % 60);
    let str = ''; if (h > 0) str += `${h}h `; if (m > 0 || h > 0) str += `${m}m `; str += `${s}s`; return str.trim() || '0s';
  };
  const formatTimespanDisplay = (minutes: number): string => {
    if (isNaN(minutes) || minutes < 0) return '0m'; const d = Math.floor(minutes / (60*24)); const h = Math.floor((minutes % (60*24)) / 60); const m = Math.floor(minutes % 60);
    let str = ''; if (d > 0) str += `${d}d `; if (h > 0 || d > 0) str += `${h}h `; str += `${m}m`; return str.trim() || '0m';
  };

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl"> 
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-3">
            <div>
                <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-1"> <GitFork size={24} className="mr-2.5 text-primary" /> Conversation Chain Analysis </div>
                <p className="text-sm text-textSecondary"> Found {conversationChainAnalytics.length} chains. {searchTerm && `(${filteredConversationChains.length} matching "${searchTerm}")`}</p>
            </div>
             {filteredConversationChains.length > 0 && (
                <button onClick={handleExportChainsSummary} className="mt-3 sm:mt-0 px-3.5 py-2 text-xs sm:text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark focus:outline-none focus:ring-2 focus:ring-secondary-light focus:ring-offset-1 flex items-center shadow-md hover:shadow-lg transition-all"> <Download size={15} className="mr-1.5" /> Export Chains Summary </button>
            )}
        </div>
        <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-neutral-DEFAULT" />
            </div>
            <input 
                type="text" 
                placeholder="Search by participant number..." 
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

      <div className="space-y-4">
        {filteredConversationChains.map((chain) => {
          const isPlaybackActiveForThisChain = playbackState.activeChainId === chain.id;
          const currentCallForPlayback = isPlaybackActiveForThisChain ? chain.calls[playbackState.currentCallIndex] : null;
          
          return (
            <div key={chain.id} className="bg-surface border border-neutral-light rounded-xl shadow-lg overflow-hidden hover:shadow-xl transition-shadow"> 
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-neutral-lightest/80 transition-colors" onClick={() => toggleChainExpansion(chain.id)} role="button" aria-expanded={!!expandedChains[chain.id]}>
                <div className="flex items-center min-w-0 mb-2 sm:mb-0"> {expandedChains[chain.id] ? <ChevronDown size={18} className="mr-2 text-neutral-DEFAULT" /> : <ChevronRight size={18} className="mr-2 text-neutral-DEFAULT" />} <Users size={17} className="mr-2 text-primary" />
                  <div className="truncate text-sm sm:text-base" title={chain.participants.join(' <-> ')}> 
                    <span className="font-semibold text-primary-dark">{chain.participants[0]}</span>
                    <ArrowRight size={14} className="inline mx-1.5 text-neutral-DEFAULT transform -rotate-45" />
                    <ArrowRight size={14} className="inline mx-1.5 text-neutral-DEFAULT transform rotate-45 -ml-2.5" />
                    <span className="font-semibold text-primary-dark">{chain.participants[1]}</span>
                  </div>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center text-xs text-textSecondary space-y-1 sm:space-y-0 sm:space-x-3 self-start sm:self-center ml-auto pl-2"> 
                  <span className="whitespace-nowrap flex items-center" title="Number of calls in chain"><Filter size={12} className="inline mr-1 text-neutral-DEFAULT"/>Depth: {chain.depth}</span>
                  <span className="whitespace-nowrap flex items-center" title="Total duration of calls in chain"><Clock size={12} className="inline mr-1 text-neutral-DEFAULT"/>Call Time: {formatDurationDisplay(chain.totalChainDuration)}</span>
                  <span className="whitespace-nowrap flex items-center" title="Overall time from first call to last call in chain"><Watch size={12} className="inline mr-1 text-neutral-DEFAULT"/>Chain Span: {formatTimespanDisplay(chain.overallTimespan)}</span>
                </div>
              </div>

              {expandedChains[chain.id] && (
                <div className="px-3 sm:px-4 pb-3 sm:pb-4 border-t border-neutral-light bg-neutral-lightest/60"> 
                  <div className="flex justify-between items-center text-xs text-textSecondary mt-2.5 mb-2">
                    <span>Start: {formatDate(chain.startTime.toISOString())}, End: {formatDate(chain.endTime.toISOString())}</span>
                    <div className="flex items-center gap-2">
                        <button 
                            onClick={() => startPlayback(chain)}
                            title={isPlaybackActiveForThisChain && playbackState.isPlaying ? "Pause Playback" : "Start Playback"}
                            className={`p-1.5 rounded-md text-xs flex items-center shadow-sm hover:shadow-md transition-all ${isPlaybackActiveForThisChain && playbackState.isPlaying ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-success-500 hover:bg-success-600 text-white'}`}
                        >
                            {isPlaybackActiveForThisChain && playbackState.isPlaying ? <PauseCircle size={14} className="mr-1"/> : <PlayCircle size={14} className="mr-1"/>}
                            {isPlaybackActiveForThisChain && playbackState.isPlaying ? "Pause" : "Playback"}
                        </button>
                        <button onClick={() => handleExportChainCalls(chain)} className="p-1.5 text-[11px] bg-info-lighter/60 text-info-dark rounded-md hover:bg-info-lighter/80 font-medium flex items-center shadow-sm"><Download size={13} className="inline mr-1"/>Export Calls</button>
                    </div>
                  </div>
                  
                  {isPlaybackActiveForThisChain && currentCallForPlayback ? (
                    <div className="my-3 p-3 bg-primary-lighter/30 border border-primary-light rounded-lg shadow-md">
                      <div className="text-center text-sm font-semibold text-primary-dark mb-3">
                        Call {playbackState.currentCallIndex + 1} of {chain.calls.length}
                      </div>
                      <div className="flex items-center justify-around mb-3 text-center">
                        {/* Caller Node */}
                        <div className={`p-3 border-2 rounded-lg w-32 truncate ${currentCallForPlayback.caller === chain.participants[0] ? 'border-success-dark bg-success-lighter' : 'border-info-dark bg-info-lighter'}`}>
                            <div className="font-bold text-sm text-textPrimary">{currentCallForPlayback.caller}</div>
                            <div className="text-xs text-textSecondary">Caller</div>
                        </div>
                        {/* Arrow */}
                        <ArrowRight size={32} className="text-neutral-dark mx-2"/>
                        {/* Receiver Node */}
                        <div className={`p-3 border-2 rounded-lg w-32 truncate ${currentCallForPlayback.receiver === chain.participants[0] ? 'border-success-dark bg-success-lighter' : 'border-info-dark bg-info-lighter'}`}>
                            <div className="font-bold text-sm text-textPrimary">{currentCallForPlayback.receiver}</div>
                            <div className="text-xs text-textSecondary">Receiver</div>
                        </div>
                      </div>
                      <div className="text-xs bg-surface p-2.5 rounded-md border border-neutral-light shadow-sm space-y-1">
                        <p><strong className="text-neutral-DEFAULT">Time:</strong> {formatDate(currentCallForPlayback.timestamp.toISOString())}</p>
                        <p><strong className="text-neutral-DEFAULT">Duration:</strong> {formatDurationDisplay(currentCallForPlayback.duration)}</p>
                        <p><strong className="text-neutral-DEFAULT">Type:</strong> {currentCallForPlayback.usageType} ({currentCallForPlayback.networkType})</p>
                        {currentCallForPlayback.address && <p className="truncate" title={currentCallForPlayback.address}><strong className="text-neutral-DEFAULT">Address:</strong> {currentCallForPlayback.address}</p>}
                        {currentCallForPlayback.timeGapToNextCall !== undefined && <p><strong className="text-neutral-DEFAULT">Gap to Next:</strong> {formatTimespanDisplay(currentCallForPlayback.timeGapToNextCall)}</p>}
                         <p><strong className="text-neutral-DEFAULT">Source:</strong> {currentCallForPlayback.originalRecord.fileName} (Row: {currentCallForPlayback.originalRecord.rowIndex})</p>
                      </div>
                      <div className="flex justify-center gap-3 mt-4">
                        <button onClick={() => handlePrevCall()} disabled={playbackState.currentCallIndex === 0} className="p-2 bg-neutral-light hover:bg-neutral-DEFAULT/40 rounded-full text-neutral-darker disabled:opacity-50 shadow-sm"><SkipBack size={16}/></button>
                        <button onClick={() => startPlayback(chain)} className={`p-2 rounded-full text-white shadow-sm ${playbackState.isPlaying ? 'bg-amber-500 hover:bg-amber-600' : 'bg-success-500 hover:bg-success-600'}`}>
                            {playbackState.isPlaying ? <PauseCircle size={18}/> : <PlayCircle size={18}/>}
                        </button>
                        <button onClick={() => handleNextCall(chain)} disabled={playbackState.currentCallIndex >= chain.calls.length - 1} className="p-2 bg-neutral-light hover:bg-neutral-DEFAULT/40 rounded-full text-neutral-darker disabled:opacity-50 shadow-sm"><SkipForward size={16}/></button>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-2.5 max-h-96 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent pr-1">
                      {chain.calls.map((call, callIndex) => (
                        <li key={call.id} className="p-2.5 bg-surface rounded-lg border border-neutral-light shadow-md hover:border-primary-light transition-colors">
                          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center">
                            <div className="text-xs mb-1 sm:mb-0 flex items-center">
                              <span className="font-semibold text-textPrimary">{call.caller}</span> 
                              <ArrowRight size={12} className="inline mx-1.5 text-accent-dark" /> 
                              <span className="font-semibold text-textPrimary">{call.receiver}</span> 
                            </div>
                            <div className="text-[10px] text-textSecondary"> {formatDate(call.timestamp.toISOString())} ({call.usageType}) </div>
                          </div>
                          <div className="text-[11px] text-neutral-DEFAULT mt-1.5"> Duration: <span className="font-medium text-textPrimary">{formatDurationDisplay(call.duration)}</span> | Network: <span className="font-medium text-textPrimary">{call.networkType}</span> {call.address && <span className="block truncate" title={call.address}>Addr: {call.address}</span>} </div>
                          {call.timeGapToNextCall !== undefined && callIndex < chain.calls.length -1 && (
                            <div className="text-[10px] text-accent-darker mt-2 text-center border-t border-dashed border-accent/40 pt-1.5"> 
                              <Clock size={10} className="inline mr-1" /> Gap to next call: {formatTimespanDisplay(call.timeGapToNextCall)} 
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ConversationChainView;