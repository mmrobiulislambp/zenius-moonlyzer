import { ReactNode } from 'react';

// ===================================
// ===== General App & UI Types ======
// ===================================

export type LicenseLevel = 'TRIAL' | 'STANDARD' | 'PRO';
export type MainView = string;

export interface AppView {
  id: MainView;
  title: string;
  icon: ReactNode;
  category: string;
  isMainTab: boolean;
  parentViewId: MainView | undefined;
  requiredLicense?: LicenseLevel;
  isServiceGroup?: boolean;
}

export interface RibbonActionConfig {
  id: string;
  label: string;
  icon: ReactNode;
  actionType: 'navigateToView' | 'customAction';
  targetViewId?: string;
  customActionId?: string;
  displayType: 'large' | 'small';
  disabled?: boolean;
  tooltip?: string;
  showOnTabs?: MainView[];
}

export interface RibbonGroupConfig {
  id: string;
  name?: string;
  actions: RibbonActionConfig[];
}

export interface PlaybackState {
  activeChainId: string | null;
  currentCallIndex: number;
  isPlaying: boolean;
  playbackSpeed: number;
}


// ===============================
// ===== Data Record Types =======
// ===============================

// --- CDR (Call Detail Record) ---
export interface CDRRecord {
  id: string; 
  sourceFileId: string;
  fileName: string; 
  rowIndex: number;
  START_DTTIME: string;
  PROVIDER_NAME: string;
  APARTY: string;
  BPARTY: string;
  CALL_DURATION: string;
  USAGE_TYPE: string;
  NETWORK_TYPE: string;
  MCCSTARTA: string;
  MNCSTARTA: string;
  LACSTARTA: string;
  CISTARTA: string;
  IMEI: string;
  IMSI: string;
  ADDRESS: string;
  latitude?: number;
  longitude?: number;
  derivedLocationSource?: 'towerDB' | 'original';
  [key: string]: any;
}

export interface UploadedFile { // For CDR
  id: string;
  name: string;
  sourceName: string;
  records: CDRRecord[];
  headers: string[]; 
}

// --- LAC (Location Area Code) Data ---
export interface LACRecord {
    id: string;
    sourceFileId: string;
    fileName: string;
    rowIndex: number;
    DATE_TIME: string;
    MSISDN: string;
    OTHER_PARTY_NUMBER?: string;
    USAGE_TYPE: string;
    CALL_DURATION?: number;
    LAC: string;
    CELL_ID: string;
    IMEI?: string;
    ADDRESS?: string;
    latitude?: number;
    longitude?: number;
    derivedLocationSource?: 'towerDB' | 'original';
    [key: string]: any;
}

export interface UploadedLACFile {
    id: string;
    name: string;
    sourceName: string;
    records: LACRecord[];
    headers: string[];
}

// --- SMS (Short Message Service) Data ---
export interface SMSRecord {
    id: string;
    sourceFileId: string;
    fileName: string;
    rowIndex: number;
    Timestamp: string;
    PrimaryUserInRecord: string;
    OtherPartyOrServiceInRecord: string;
    Initiator: string;
    Recipient: string;
    OriginalDirection: 'SMSMO' | 'SMSMT' | string;
    Content: string;
    [key: string]: any;
}

export interface UploadedSMSFile {
    id: string;
    name: string;
    sourceName: string;
    records: SMSRecord[];
    headers: string[];
}

// --- IPDR (Internet Protocol Detail Record) ---
export interface IPDRRecord {
  id: string;
  sourceFileId: string;
  fileName: string;
  rowIndex: number;
  publicIP?: string;
  publicPort?: number;
  natBeginTime?: string;
  natEndTime?: string;
  startTime?: string;
  endTime?: string;
  imsi?: string;
  msisdn?: string;
  imeisv?: string;
  msIP?: string;
  msPort?: number;
  serverIP?: string;
  serverPort?: number;
  cgi?: string;
  sai?: string;
  ecgi?: string;
  uplinkTrafficByte?: number;
  downlinkTrafficByte?: number;
  categoryType?: string;
  applicationType?: string;
  url?: string;
  [key: string]: any;
}

export interface UploadedIPDRFile {
  id: string;
  name: string;
  sourceName: string;
  records: IPDRRecord[];
  headers: string[];
}

// --- Nagad (MFS) ---
export interface NagadRecord {
  id: string;
  sourceFileId: string;
  fileName: string;
  rowIndex: number;
  si: string;
  TXN_DATE_TIME: string;
  TXN_ID: string;
  TXN_TYPE: string;
  STATEMENT_FOR_ACC: string;
  TXN_WITH_ACC: string;
  CHANNEL: string;
  REFERENCE: string;
  TXN_TYPE_DR_CR: 'CREDIT' | 'DEBIT' | '';
  TXN_AMT: number;
  AVAILABLE_BLC_AFTER_TXN: number;
  STATUS: string;
  [key: string]: any;
}

export interface UploadedNagadFile {
  id: string;
  name: string;
  sourceName: string;
  records: NagadRecord[];
  headers: string[];
}

// --- bKash (MFS) ---
export interface BkashRecord {
    id: string;
    sourceFileId: string;
    fileName: string;
    rowIndex: number;
    sl?: string;
    trxId: string;
    transactionDate: string;
    trxType: string;
    sender: string;
    receiver: string;
    receiverName?: string;
    reference?: string;
    transactedAmount: number;
    fee: number;
    balance: number;
    transactionDirection?: 'DEBIT' | 'CREDIT' | 'OTHER';
    [key: string]: any;
}

export interface UploadedBkashFile {
  id: string;
  name: string;
  sourceName: string;
  records: BkashRecord[];
  headers: string[];
}

// --- Roket (MFS) ---
export interface RoketRecord {
    id: string;
    sourceFileId: string;
    fileName: string;
    rowIndex: number;
    [key: string]: any;
}

export interface UploadedRoketFile {
  id: string;
  name: string;
  sourceName: string;
  records: RoketRecord[];
  headers: string[];
}


// ===============================
// ===== Filter State Types ======
// ===============================

export interface FilterState { // For CDR
  searchTerm: string;
  dateFrom: string;
  dateTo: string;
  usageTypes: string[];
  networkTypes: string[];
  minDuration: number | null;
  maxDuration: number | null;
  selectedFileIds: string[];
}

export interface LACFilterState {
    searchTerm: string;
    selectedFileIds: string[];
    dateFrom?: string;
    dateTo?: string;
    usageTypes?: string[];
    lac?: string;
    cellId?: string;
}

export interface SMSFilterState {
    searchTerm: string;
    filterByNumber: string;
    contentKeyword: string;
    selectedFileIds: string[];
    dateFrom?: string;
    dateTo?: string;
    direction?: 'SMSMO' | 'SMSMT' | '';
}

export interface IPDRFilterState {
  searchTerm: string;
  selectedFileIds: string[];
  dateFrom?: string;
  dateTo?: string;
  serverIPs?: string[];
  applicationTypes?: string[];
}

export interface NagadFilterState {
  searchTerm: string;
  selectedFileIds: string[];
  dateFrom?: string;
  dateTo?: string;
  txnTypes?: string[];
  channels?: string[];
  drCrTypes?: ('' | 'CREDIT' | 'DEBIT')[];
  minTxnAmount?: number | null;
  maxTxnAmount?: number | null;
}

export interface BkashFilterState {
  searchTerm: string;
  selectedFileIds: string[];
  dateFrom?: string;
  dateTo?: string;
  txnTypes?: string[];
  drCrTypes?: ('DEBIT' | 'CREDIT' | 'OTHER' | '')[];
  minTxnAmount?: number | null;
  maxTxnAmount?: number | null;
}

export interface RoketFilterState {
  searchTerm: string;
  selectedFileIds: string[];
}


// ===================================
// ===== Analysis & Context Types ====
// ===================================
export interface CDRContextType {
  uploadedFiles: UploadedFile[];
  addFile: (file: UploadedFile) => void;
  removeFile: (fileId: string) => void;
  removeAllCDRFiles: () => void;
  removeRecordsByIds: (recordIdsToRemove: string[]) => void;
  updateFileSourceName: (fileId: string, newSourceName: string) => void;
  allRecords: CDRRecord[];
  filteredRecords: CDRRecord[];
  globallyFilteredRecords: CDRRecord[];
  filterState: FilterState;
  setFilterState: React.Dispatch<React.SetStateAction<FilterState>>;
  linkAnalysisResults: LinkAnalysisResult[];
  graphData: GraphData;
  cellTowerAnalytics: CellTowerAnalyticsData[];
  deviceAnalyticsData: DeviceAnalyticsData[];
  conversationChainAnalytics: ConversationChain[];
  locationTimelineData: LocationEvent[];
  behavioralFingerprints: BehavioralFingerprint[];
  simCardAnalytics: SimCardAnalyticsData[];
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
  getUniqueValues: (key: keyof CDRRecord) => string[];
  filesToAnalyze: UploadedFile[];
  
  // Graph specific context
  hiddenNodeIds: Set<string>;
  hideNode: (nodeId: string) => void;
  showNode: (nodeId: string) => void; 
  resetHiddenNodes: () => void;
  customNodeLabels: Map<string, string>;
  setCustomNodeLabel: (nodeId: string, label: string) => void;
  removeCustomNodeLabel: (nodeId: string) => void; 
  clearCustomNodeLabels: () => void; 
  customEdgeColors: Map<string, string>; 
  setCustomEdgeColor: (edgeId: string, color: string) => void; 
  removeCustomEdgeColor: (edgeId: string) => void; 
  clearAllCustomEdgeColors: () => void; 
  hiddenEdgeIds: Set<string>;
  hideEdge: (edgeId: string) => void;
  showEdge: (edgeId: string) => void;
  showAllHiddenEdges: () => void;
  customNodeColors: Map<string, string>;
  setCustomNodeColor: (nodeId: string, color: string) => void;
  removeCustomNodeColor: (nodeId: string) => void;
  clearAllCustomNodeColors: () => void;
  customNodeBaseIcons: Map<string, string>;
  setCustomNodeBaseIcon: (nodeId: string, iconKey: string) => void;
  removeCustomNodeBaseIcon: (nodeId: string) => void;
  clearAllCustomNodeBaseIcons: () => void;

  // Data View specific context for file tabs
  activeFileTabId: string | null;
  setActiveFileTabId: (fileId: string | null) => void;

  // For cross-view interactions
  targetNodeForGraphView: string | null;
  setTargetNodeForGraphView: (nodeId: string | null) => void;
  targetNumberForBehavioralProfile: string | null;
  setTargetNumberForBehavioralProfile: (number: string | null) => void;

  // For GraphView layout selection
  activeGraphLayout: string;
  setActiveGraphLayout: (layout: string) => void;
  isGraphDataTrimmed: boolean;
}


// --- Link Analysis ---
export interface DetailedFileInteraction {
  fileId: string;
  fileName: string;
  sourceName: string;
  contactedBParties: string[];
  callingAParties: string[];
  associatedLACs: string[];
  associatedCellIds: string[];
  associatedIMEIs: string[];
  associatedAddresses: string[];
  recordCountInFile: number;
}

export interface LinkAnalysisResult {
  number: string;
  files: Array<{
    fileName: string;
    fileId: string;
    sourceName: string;
    asAPartyCount: number;
    asBPartyCount: number;
    records: CDRRecord[];
  }>;
  totalOccurrences: number;
  isCommonAcrossAllSelectedFiles?: boolean;
  commonNumberDetails?: DetailedFileInteraction[];
}

// --- Graph Visualization ---
export interface GraphNode {
  id: string;
  label: string;
  originalId?: string;
  type: 'phoneNumber' | 'account';
  callCount?: number;
  fileIds?: string[];
  sourceNames?: string[];
  isHub?: boolean;
  hidden?: boolean;
  outgoingCalls?: number;
  incomingCalls?: number;
  totalDuration?: number;
  firstSeenTimestamp?: number;
  lastSeenTimestamp?: number;
  associatedTowers?: string[];
  rawFileNames?: string[];
  isAPartyNode?: boolean;
  imei?: string;
  isStatementAccount?: boolean;
  transactionCount?: number;
  totalAmount?: number;
  customColor?: string;
  customIcon?: string;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  callCount?: number;
  durationSum?: number;
  usageType?: string;
  firstCallTimestamp?: number;
  lastCallTimestamp?: number;
  rawFileNamesForEdge?: string[];
  transactionTypes?: Set<string>;
}

export interface GraphData {
  nodes: { data: GraphNode }[];
  edges: { data: GraphEdge }[];
}

export interface NodeContextMenuData {
  visible: boolean;
  x: number;
  y: number;
  nodeId: string | null;
  currentLabel: string | null;
  showNodeColorPalette?: boolean;
  showNodeIconPalette?: boolean;
}

export interface EdgeContextMenuData {
  visible: boolean;
  x: number;
  y: number;
  edgeId: string | null;
  showEdgeColorPalette: boolean;
}

// --- Tower & Device Analysis ---
export interface HourlyActivity {
  hour: number;
  name: string;
  callCount: number;
  totalDuration: number;
}

export interface CellTowerAnalyticsData {
  id: string;
  lac: string;
  cid: string;
  address?: string;
  recordCount: number;
  totalCallDuration: number;
  uniqueAParties: Set<string>;
  uniqueBParties: Set<string>;
  hourlyBreakdown: HourlyActivity[];
  associatedRecords: CDRRecord[];
  firstSeen?: Date;
  lastSeen?: Date;
  latitude?: number;
  longitude?: number;
}

export interface SimChangeEvent {
  timestamp: Date;
  previousSim: string;
  newSim: string;
}

export interface AssociatedSimInfo {
  simIdentifier: string;
  type: 'IMSI' | 'APARTY';
  count: number;
  firstSeen?: Date;
  lastSeen?: Date;
}

export interface ContactedPartyByDevice {
  partyNumber: string;
  count: number;
  viaSims: string[];
}

export interface DeviceAnalyticsData {
  imei: string;
  recordCount: number;
  associatedSims: AssociatedSimInfo[];
  contactedParties: ContactedPartyByDevice[];
  hourlyBreakdown: HourlyActivity[];
  firstSeen?: Date;
  lastSeen?: Date;
  usageDates: Date[];
  simChangeHistory: SimChangeEvent[];
}

export interface ImeiChangeEvent {
    timestamp: Date;
    previousImei: string;
    newImei: string;
    recordId: string;
}

export interface AssociatedImeiInfo {
    imei: string;
    count: number;
    firstSeen?: Date;
    lastSeen?: Date;
}

export interface SimCardAnalyticsData {
    simIdentifier: string;
    type: 'IMSI' | 'APARTY';
    recordCount: number;
    associatedImeis: AssociatedImeiInfo[];
    imeiChangeHistory: ImeiChangeEvent[];
    firstSeenOverall?: Date;
    lastSeenOverall?: Date;
}

// --- Conversation Chains ---
export interface CallInChain {
  id: string;
  caller: string;
  receiver: string;
  timestamp: Date;
  duration: number;
  usageType?: string;
  networkType?: string;
  address?: string;
  originalRecord: CDRRecord;
  timeGapToNextCall?: number;
}

export interface ConversationChain {
  id: string;
  calls: CallInChain[];
  participants: string[];
  startTime: Date;
  endTime: Date;
  totalChainDuration: number;
  overallTimespan: number;
  depth: number;
}

// --- Location Timeline ---
export interface LocationEvent {
  id: string;
  timestamp: Date;
  aparty: string;
  bparty?: string;
  usageType?: string;
  locationId: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  durationApproximationMinutes: number;
  sourceFileId: string;
  fileName: string;
  derivedLocationSource?: 'towerDB' | 'original';
}

// --- Behavioral Fingerprinting ---
export interface ActivityPattern {
  name: string;
  count: number;
}
export type Directionality = 'incoming' | 'outgoing' | 'balanced' | 'n/a';
export interface TopTowerInfo {
  towerId: string;
  count: number;
  address?: string;
}
export interface BehavioralFingerprint {
  number: string;
  totalInteractions: number;
  hourlyActivity: ActivityPattern[];
  dailyActivity: ActivityPattern[];
  avgCallDurationSeconds: number;
  callDirectionality: Directionality;
  smsDirectionality: Directionality;
  topTowers: TopTowerInfo[];
  primaryActivityFocus: 'call' | 'sms' | 'mixed' | 'n/a';
  dominantTimeSlot: 'morning' | 'afternoon' | 'evening' | 'night' | 'varied' | 'n/a';
}
export interface SimilarityComponent {
  metricName: string;
  score: number;
  valueA: string | number;
  valueB: string | number;
  description: string;
}
export interface FingerprintComparisonResult {
  numberA: string;
  numberB: string;
  fingerprintA: BehavioralFingerprint;
  fingerprintB: BehavioralFingerprint;
  similarityComponents: SimilarityComponent[];
  overallSimilarityScore: number;
}

// --- Number Activity Explorer ---
export interface TopContact {
  number: string;
  count: number;
}
export interface NumberActivityStats {
  number: string;
  outgoingCalls: number;
  incomingCalls: number;
  totalCalls: number;
  totalCallDuration: number;
  outgoingSMS: number;
  incomingSMS: number;
  totalSMS: number;
  uniqueCallContacts: number;
  uniqueSmsContacts: number;
  firstSeen?: Date;
  lastSeen?: Date;
}
export interface DetailedNumberActivityForModal {
  baseStats: NumberActivityStats;
  totalOutgoingCallDuration: number;
  totalIncomingCallDuration: number;
  avgOutgoingCallDuration: number;
  avgIncomingCallDuration: number;
  topOutgoingCallContacts: TopContact[];
  topIncomingCallContacts: TopContact[];
  hourlyCallActivity: ActivityPattern[];
  topOutgoingSmsContacts: TopContact[];
  topIncomingSmsContacts: TopContact[];
  hourlySmsActivity: ActivityPattern[];
}

// --- Anomaly Detection ---
export interface AnomalyReport {
  id: string;
  type: 'Number' | 'IMEI' | 'SIM';
  anomalyCategory: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  supportingData?: Record<string, any>;
  suggestedAction?: string;
}
export interface LACAnomalyReport {
  entityId: string;
  patternType: string;
  description: string;
  severity: 'Low' | 'Medium' | 'High';
  supportingData?: Record<string, any>;
  lacCellId?: string;
}
export interface EntitySummaryForAnomalyDetection {
  entityId: string;
  entityType: 'Number' | 'IMEI' | 'SIM';
  totalInteractions: number;
  firstSeen?: string;
  lastSeen?: string;
  avgCallDurationSeconds?: number;
  callDirectionality?: Directionality;
  smsDirectionality?: Directionality;
  primaryActivityFocus?: 'call' | 'sms' | 'mixed' | 'n/a';
  dominantTimeSlot?: 'morning' | 'afternoon' | 'evening' | 'night' | 'varied' | 'n/a';
  topTowers?: TopTowerInfo[];
  associatedSimsCount?: number;
  associatedImeisCount?: number;
  simChangeCount?: number;
  imeiChangeCount?: number;
  simChangeTimestamps?: string[];
  imeiChangeTimestamps?: string[];
  hourlyActivity?: ActivityPattern[];
  dailyActivity?: ActivityPattern[];
}

// --- Suspect Profiling (New) ---
export interface SuspectProfileData {
  id: string;
  type: 'Number' | 'IMEI';
  general: {
    firstSeen: string;
    lastSeen: string;
    totalRecords: number;
    sourceFiles: string[];
  };
  communicationStats: {
    outgoingCalls: number;
    incomingCalls: number;
    totalCallDuration: number; // in seconds
    outgoingSms: number;
    incomingSms: number;
    uniqueCallContacts: number;
    uniqueSmsContacts: number;
  };
  deviceAssociations: {
    associatedEntities: string[];
  };
  activityPatterns: {
    dominantTimeSlot: string;
    hourlyActivity: { hour: string; interactions: number }[];
    dailyActivity: { day: string; interactions: number }[];
  };
  locationInsights: {
    topTowers: { towerId: string; count: number; address?: string }[];
  };
}


// --- SMS Analysis ---
export interface SMSAnalysisResult {
  smsId: string;
  isFlagged: boolean;
  flagType: 'obscene' | 'violent' | null;
  category: 'Normal' | 'Sensitive' | 'Adult' | 'Criminal';
  reason: string | null;
}

// --- Map Related ---
export interface MapMarkerData {
  id: string;
  position: { lat: number, lng: number };
  title: string;
  infoContent?: string;
  icon?: any;
  label?: any;
}
export interface MapPathData {
  id: string;
  coordinates: { lat: number; lng: number }[];
  strokeColor?: string;
  strokeWeight?: number;
  strokeOpacity?: number;
}
export interface TowerInfo {
  id: string;
  lac: string;
  ci: string;
  latitude: number;
  longitude: number;
  address?: string;
  operator?: string;
  technology?: string;
}

// --- Location Contact Analysis ---
export interface LocationContactDetail {
    contactNumber: string;
    callCountInNewLocation: number;
    totalDurationInNewLocation: number;
    associatedNewLocationTowers: string[];
    firstCallTimestampInNewLocation?: number;
    lastCallTimestampInNewLocation?: number;
}
export interface LocationContactAnalysis {
    targetAParty: string;
    homeTowersIdentified: string[];
    homeContactsIdentified: Set<string>;
    newLocationTowersActive: string[];
    newContactsMade: LocationContactDetail[];
    maintainedHomeContacts: LocationContactDetail[];
}

// --- Watchlist ---
export interface SuspectEntry {
  id: string;
  name: string;
  msisdns: string[];
  imeis: string[];
  notes?: string;
  createdAt: string;
}
export interface WatchlistContextType {
  suspects: SuspectEntry[];
  addSuspect: (suspectData: Omit<SuspectEntry, 'id' | 'createdAt'>) => void;
  updateSuspect: (id: string, updates: Partial<Omit<SuspectEntry, 'id' | 'createdAt'>>) => void;
  deleteSuspect: (id: string) => void;
  isWatched: (identifier: string) => SuspectEntry | null;
}

// --- Context Types ---
export interface LACContextType {
    uploadedLACFiles: UploadedLACFile[];
    addLACFile: (file: UploadedLACFile) => void;
    removeLACFile: (fileId: string) => void;
    removeAllLACFiles: () => void;
    updateLACFileSourceName: (fileId: string, newSourceName: string) => void;
    allLACRecords: LACRecord[];
    filteredLACRecords: LACRecord[];
    globallyFilteredLACRecords: LACRecord[];
    lacFilterState: LACFilterState;
    setLACFilterState: React.Dispatch<React.SetStateAction<LACFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueLACValues: (key: keyof LACRecord) => string[];
    towerDatabase: TowerInfo[];
    loadTowerDatabase: (towers: TowerInfo[]) => void;
    clearTowerDatabase: () => void;
    getTowerInfo: (lac: string, ci: string) => TowerInfo | undefined;
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}
export interface IPDRContextType {
    uploadedIPDRFiles: UploadedIPDRFile[];
    addIPDRFile: (file: UploadedIPDRFile) => void;
    removeIPDRFile: (fileId: string) => void;
    removeAllIPDRFiles: () => void;
    updateIPDRFileSourceName: (fileId: string, newSourceName: string) => void;
    allIPDRRecords: IPDRRecord[];
    filteredIPDRRecords: IPDRRecord[];
    globallyFilteredIPDRRecords: IPDRRecord[];
    ipdrFilterState: IPDRFilterState;
    setIPDRFilterState: React.Dispatch<React.SetStateAction<IPDRFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueIPDRValues: (key: keyof IPDRRecord) => string[];
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}
export interface SMSContextType {
    uploadedSMSFiles: UploadedSMSFile[];
    addSMSFile: (file: UploadedSMSFile) => void;
    removeSMSFile: (fileId: string) => void;
    removeAllSMSFiles: () => void;
    updateSMSFileSourceName: (fileId: string, newSourceName: string) => void;
    allSMSRecords: SMSRecord[];
    filteredSMSRecords: SMSRecord[];
    globallyFilteredSMSRecords: SMSRecord[];
    smsFilterState: SMSFilterState;
    setSMSFilterState: React.Dispatch<React.SetStateAction<SMSFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueSMSValues: (key: keyof SMSRecord) => string[];
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}
export interface NagadContextType {
    uploadedNagadFiles: UploadedNagadFile[];
    addNagadFile: (file: UploadedNagadFile) => void;
    removeNagadFile: (fileId: string) => void;
    removeAllNagadFiles: () => void;
    updateNagadFileSourceName: (fileId: string, newSourceName: string) => void;
    allNagadRecords: NagadRecord[];
    filteredNagadRecords: NagadRecord[];
    globallyFilteredNagadRecords: NagadRecord[];
    nagadFilterState: NagadFilterState;
    setNagadFilterState: React.Dispatch<React.SetStateAction<NagadFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueNagadValues: (key: keyof NagadRecord) => string[];
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}
export interface BkashContextType {
    uploadedBkashFiles: UploadedBkashFile[];
    addBkashFile: (file: UploadedBkashFile) => void;
    removeBkashFile: (fileId: string) => void;
    removeAllBkashFiles: () => void;
    updateBkashFileSourceName: (fileId: string, newSourceName: string) => void;
    allBkashRecords: BkashRecord[];
    filteredBkashRecords: BkashRecord[];
    globallyFilteredBkashRecords: BkashRecord[];
    bkashFilterState: BkashFilterState;
    setBkashFilterState: React.Dispatch<React.SetStateAction<BkashFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueBkashValues: (key: keyof BkashRecord) => string[];
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}
export interface RoketContextType {
    uploadedRoketFiles: UploadedRoketFile[];
    addRoketFile: (file: UploadedRoketFile) => void;
    removeRoketFile: (fileId: string) => void;
    removeAllRoketFiles: () => void;
    updateRoketFileSourceName: (fileId: string, newSourceName: string) => void;
    allRoketRecords: RoketRecord[];
    filteredRoketRecords: RoketRecord[];
    roketFilterState: RoketFilterState;
    setRoketFilterState: React.Dispatch<React.SetStateAction<RoketFilterState>>;
    isLoading: boolean;
    setIsLoading: (loading: boolean) => void;
    error: string | null;
    setError: (error: string | null) => void;
    getUniqueRoketValues: (key: keyof RoketRecord) => string[];
    activeFileTabId: string | null;
    setActiveFileTabId: (id: string | null) => void;
}

// --- Sort Configs ---
export type SortConfig = {
  key: keyof CDRRecord | null;
  direction: 'ascending' | 'descending';
};
export interface NagadSortConfig {
  key: keyof NagadRecord | null;
  direction: 'ascending' | 'descending';
}
export interface BkashSortConfig {
  key: keyof BkashRecord | null;
  direction: 'ascending' | 'descending';
}
export interface RoketSortConfig {
  key: keyof RoketRecord | string | null;
  direction: 'ascending' | 'descending';
}

// --- Unified/Entity Profiler Types ---
export interface EntityProfilerData {
    id: string;
    type: 'MSISDN' | 'IMEI';
    profileGeneratedAt: Date;
    general: {
        firstSeen?: Date;
        lastSeen?: Date;
        dataSources: string[];
        totalRecordsAcrossSources: number;
    };
    cdrData?: {
        associatedEntities: { id: string; type: 'MSISDN' | 'IMEI'; count: number }[];
        callStats: { outgoing: number; incoming: number; totalDurationSeconds: number; uniqueContacts: number; };
        smsStatsCDR: { outgoing: number; incoming: number; uniqueContacts: number; };
        topCallContactsCDR: { number: string; count: number; duration: number }[];
        topSmsContactsCDR: { number: string; count: number }[];
        topTowersCDR: TopTowerInfo[];
    };
    dedicatedSmsData?: {
        totalMessages: number;
        topContactsSMS: { number: string; sentTo: number; receivedFrom: number; total: number }[];
    };
    mfsDataList?: {
        serviceName: 'Nagad' | 'bKash' | 'Roket';
        accountHolderNumber?: string;
        relatedMfsAccount?: string;
        transactionCount: number;
        totalSentAmount: number;
        totalReceivedAmount: number;
        topInteractingPartners: { partnerAccount: string; totalAmount: number; txnCount: number, direction: 'sent_to' | 'received_from'}[];
    }[];
    lacData?: {
        distinctTowersVisited: number;
        topFrequentTowersLAC: { towerId: string; count: number; address?: string; firstSeen: Date | null, lastSeen: Date | null }[];
    };
}
export interface UnifiedEvent {
  id: string;
  timestamp: Date;
  type: 'CDR_CALL' | 'CDR_SMS' | 'SMS_MESSAGE' | 'NAGAD_TXN' | 'BKASH_TXN' | 'LAC_EVENT' | 'IPDR_SESSION' | 'ROKET_TXN';
  icon: ReactNode;
  title: string;
  details: Record<string, string | number | undefined>;
  originalRecord: any;
}
export interface MFSFrequentContactInteractionDetail {
  contactAccountNumber: string;
  sentFromStatementCount: number;
  sentFromStatementAmount: number;
  receivedByStatementCount: number;
  receivedByStatementAmount: number;
  totalInteractions: number;
  firstInteractionDate?: Date;
  lastInteractionDate?: Date;
}


// Misc / Legacy
export const EXPECTED_HEADERS: (keyof Omit<CDRRecord, 'id'|'sourceFileId'|'fileName'|'rowIndex'|'latitude'|'longitude'|'derivedLocationSource'>)[] = [
  'START_DTTIME', 'PROVIDER_NAME', 'APARTY', 'BPARTY', 'CALL_DURATION', 
  'USAGE_TYPE', 'NETWORK_TYPE', 'MCCSTARTA', 'MNCSTARTA', 'LACSTARTA', 
  'CISTARTA', 'IMEI', 'IMSI', 'ADDRESS'
];
