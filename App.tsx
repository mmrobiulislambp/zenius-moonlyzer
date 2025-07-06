
import React, { useState, useMemo, useEffect } from 'react';
import { Database, LayoutDashboard, Share2, Link2, SignalHigh, Smartphone, GitFork, LocateFixed, TrendingUp, UserCog, Repeat, ShieldAlert, MapPinned, Users2, UserSearch, Map as MapRouteIcon, Globe, ListTree, Activity, PackageOpen, Route, Network, BrainCircuit, MapPin, TowerControl, Clock, ListFilter, Target, Thermometer, Replace, MessageSquare, Search as SearchIconLucide, Sparkles, CreditCard, BarChartHorizontalBig, Flag, Landmark, Pocket, Rocket, ListChecks, Layers, DatabaseZap, Mailbox, Download as DownloadIcon, Trash2, History as HistoryIcon, ClipboardList, Eye, Lock, KeyRound, SquareDashedBottomCode, Waypoints, ChevronDown, ChevronRight } from 'lucide-react'; 
// Removed: Compass icon import, ClipboardUser icon import
import FileUpload from './components/FileUpload';
import IPDRFileUpload from './components/IPDRFileUpload';
import LACFileUpload from './components/LACFileUpload';
import SMSFileUpload from './components/SMSFileUpload'; 
import NagadFileUpload from './components/NagadFileUpload';
import BkashFileUpload from './components/BkashFileUpload'; 
import RoketFileUpload from './components/RoketFileUpload'; 
// LocationInputFileUpload was already removed by user.
import LinkAnalysisView from './components/LinkAnalysisView'; 
import { Header } from './components/Layout';
import { Tab, Tabs } from './components/Tabs'; 
import { AnalyticsDashboard } from './components/AnalyticsDashboard'; 
import DataView from './components/DataView'; 
import TowerActivityView from './components/TowerActivityView'; 
import GraphView from './components/GraphView'; 
import DeviceAnalysisView from './components/DeviceAnalysisView'; 
import ConversationChainView from './components/ConversationChainView'; 
import LocationTimelineView from './components/LocationTimelineView'; 
import NumberActivityExplorer from './components/NumberActivityExplorer';
import BehavioralFingerprintView from './components/BehavioralFingerprintView'; 
import DeviceSwapView from './components/DeviceSwapView';
import AnomalyDetectionView from './components/AnomalyDetectionView';
import LocationContactAnalysisView from './components/LocationContactAnalysisView';
import SuspectProfilingView from './components/SuspectProfilingView'; 
import IPDRDataView from './components/IPDRDataView'; 
import GeoAnalysisView from './components/GeoAnalysisView';
import IPDRBrowsingBehaviorView from './components/IPDRBrowsingBehaviorView';
import IPDRAppUsageView from './components/IPDRAppUsageView';
import IPDRUserActivityView from './components/IPDRUserActivityView';
import IPDRIPAddressProfilerView from './components/IPDRIPAddressProfilerView';
import IPDRDeviceLinkageView from './components/IPDRDeviceLinkageView';
import IPDRDomainAnalysisView from './components/IPDRDomainAnalysisView';
import IPDRGeminiInsightsView from './components/IPDRGeminiInsightsView';
import LACDataView from './components/LACDataView'; 
import LACSameTimeSameTowerView from './components/LACSameTimeSameTowerView';
import LACFrequentPresenceView from './components/LACFrequentPresenceView';
import LACMultiSimImeiView from './components/LACMultiSimImeiView';
import LACCallSmsLinkView from './components/LACCallSmsLinkView';
import LACTimeBasedFilterView from './components/LACTimeBasedFilterView';
import LACSuspiciousPatternView from './components/LACSuspiciousPatternView';
import LACImeiChangeDetectView from './components/LACImeiChangeDetectView';
import LACTowerTravelPatternView from './components/LACTowerTravelPatternView';
import TowerDatabaseUploader from './components/TowerDatabaseUploader'; 
// SMS View Imports
import SMSDataView from './components/SMSDataView';
import SMSDashboardView from './components/SMSDashboardView';
import SMSRechargeView from './components/SMSRechargeView';
import SMSContentSearchView from './components/SMSContentSearchView';
import SMSContactLinksView from './components/SMSContactLinksView';
import SMSTimelineView from './components/SMSTimelineView';
import SMSAlertFlaggingView from './components/SMSAlertFlaggingView';
// Nagad View Imports
import NagadDataView from './components/NagadDataView'; 
import NagadTransactionDashboard from './components/NagadTransactionDashboard';
import NagadFrequentContactsView from './components/NagadFrequentContactsView';
import NagadNetworkVisualizer from './components/NagadNetworkVisualizer';
import NagadSuspiciousActivityView from './components/NagadSuspiciousActivityView';
import NagadTransactionTimelineView from './components/NagadTransactionTimelineView';
// bKash View Imports
import BkashDataView from './components/BkashDataView';
import BkashTransactionDashboard from './components/BkashTransactionDashboard';
import BkashNetworkVisualizer from './components/BkashNetworkVisualizer';
import BkashFrequentContactsView from './components/BkashFrequentContactsView';
import BkashSuspiciousActivityView from './components/BkashSuspiciousActivityView'; // Added
// Removed: import BkashTransactionTimeline from './components/BkashTransactionTimeline';
import MFSLandingView from './components/MFSLandingView'; // Added
import RoketDataView from './components/RoketDataView'; // Added
import UnifiedActivityTimelineView from './components/UnifiedActivityTimelineView'; // Added
import EntityProfilerView from './components/EntityProfilerView'; // Added EntityProfilerView
import WatchlistManagementView from './components/WatchlistManagementView'; // Added WatchlistManagementView
import LicenseManagerView from './components/LicenseManagerView'; // Added LicenseManagerView
import DuplicateDataRemovalView from './components/DuplicateDataRemovalView'; 
import BTSLocationSearchView from './components/BTSLocationSearchView';


import { MainView, AppView, RibbonGroupConfig } from './types'; 
import RibbonToolbar from './components/RibbonToolbar';
import { useCDRContext } from './contexts/CDRContext';
import { useIPDRContext } from './contexts/IPDRContext';
import { useLACContext } from './contexts/LACContext';
import { useSMSContext } from './contexts/SMSContext';
import { useNagadContext } from './contexts/NagadContext';
import { useBkashContext } from './contexts/BkashContext'; 
import { useRoketContext } from './contexts/RoketContext'; 
import { useLicenseContext, LicenseLevel } from './contexts/LicenseContext'; 


const PlaceholderView: React.FC<{ title: string; requiredLicense?: LicenseLevel }> = ({ title, requiredLicense }) => (
  <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary">
    <h2 className="text-lg font-semibold mb-2">{title}</h2>
    {requiredLicense ? (
      <div className="flex flex-col items-center mt-4">
        <Lock size={32} className="text-warning mb-2" />
        <p className="text-sm">This feature requires a <span className="font-semibold text-warning-dark">{requiredLicense}</span> license or higher.</p>
        <p className="text-xs mt-1">Contact sales for upgrade options.</p>
      </div>
    ) : (
      <p>This feature is coming soon or not available with your current license.</p>
    )}
  </div>
);


export const appViews: AppView[] = [
  // CDR Main Tabs
  { id: 'data', title: 'CDR Analysis', icon: <Database size={17} className="text-primary" />, category: 'cdr', isMainTab: true, parentViewId: undefined, requiredLicense: 'TRIAL' },
  
  // IPDR Main Tabs
  { id: 'ipdrAnalysis', title: 'IPDR Analysis', icon: <Globe size={17} className="text-accent"/>, category: 'ipdr', isMainTab: true, parentViewId: undefined, requiredLicense: 'STANDARD' },

  // LAC Main Tabs
  { id: 'lacAnalysis', title: 'LAC & Cell Analysis', icon: <TowerControl size={17} className="text-info"/>, category: 'lac', isMainTab: true, parentViewId: undefined, requiredLicense: 'STANDARD' },
  
  // SMS Main Tab
  { id: 'smsAnalysis', title: 'SMS Analysis', icon: <MessageSquare size={17} className="text-warning"/>, category: 'sms', isMainTab: true, parentViewId: undefined, requiredLicense: 'STANDARD' },

  // MFS Main Tab
  { id: 'mobileFinanceAnalysis', title: 'Mobile Finance Analysis', icon: <Landmark size={17} className="text-success"/>, category: 'mfs', isMainTab: true, parentViewId: undefined, requiredLicense: 'PRO' },

  // Unified Timeline Main Tab
  { id: 'unifiedActivityTimeline', title: 'Unified Timeline', icon: <HistoryIcon size={17} className="text-purple-500" />, category: 'unified', isMainTab: true, parentViewId: undefined, requiredLicense: 'PRO' },
  
  // Entity Profiler Main Tab
  { id: 'entityProfiler', title: 'Entity Profiler', icon: <ClipboardList size={17} className="text-red-500" />, category: 'profiler', isMainTab: true, parentViewId: undefined, requiredLicense: 'PRO' },

  // Watchlist Main Tab
  { id: 'watchlistManagement', title: 'Watchlist', icon: <Eye size={17} className="text-orange-500" />, category: 'watchlist', isMainTab: true, parentViewId: undefined, requiredLicense: 'STANDARD' },

  // License Management Main Tab
  { id: 'licenseManagement', title: 'License', icon: <KeyRound size={17} className="text-teal-500" />, category: 'license', isMainTab: true, parentViewId: undefined }, // No requiredLicense, always available

  
  // CDR Sub-views
  { id: 'data', title: 'CDR Data Grid', icon: <ListTree size={28} className="text-sky-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'TRIAL' },
  { id: 'summary', title: 'CDR Summary', icon: <LayoutDashboard size={28} className="text-teal-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'TRIAL' },
  { id: 'graph', title: 'Graph Analysis', icon: <Share2 size={28} className="text-blue-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'suspectProfiling', title: 'Suspect Profiling', icon: <UserSearch size={28} className="text-indigo-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'activityRanking', title: 'Activity Ranking', icon: <TrendingUp size={28} className="text-cyan-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'behavioralMatching', title: 'Behavioral Matching', icon: <UserCog size={28} className="text-sky-700" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'PRO' },
  { id: 'anomalyDetection', title: 'Anomaly Detection', icon: <ShieldAlert size={28} className="text-red-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'PRO' },
  { id: 'locationContactAnalysis', title: 'Location Contact', icon: <><MapPinned size={22} className="text-teal-700" /><Users2 size={22} className="text-teal-700 ml-0.5"/></>, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'towerActivity', title: 'Tower Activity', icon: <SignalHigh size={28} className="text-blue-700" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'deviceAnalysis', title: 'Device Analysis', icon: <Smartphone size={28} className="text-indigo-700" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'deviceSwaps', title: 'Device Swaps', icon: <Repeat size={28} className="text-cyan-700" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'interMatch', title: 'Inter-CDR Links', icon: <Link2 size={28} className="text-sky-500" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'TRIAL' },
  { id: 'conversationChains', title: 'Conversation Chains', icon: <GitFork size={28} className="text-blue-500" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'locationTimeline', title: 'Location Timeline', icon: <LocateFixed size={28} className="text-indigo-500" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'geoAnalysis', title: 'Geospatial Overview', icon: <MapRouteIcon size={28} className="text-teal-500" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'STANDARD' },
  { id: 'duplicateRemoval', title: 'Duplicate Removal', icon: <Layers size={28} className="text-orange-600" />, category: 'cdr', isMainTab: false, parentViewId: 'data', requiredLicense: 'TRIAL' }, 

  // IPDR Sub-views
  { id: 'ipdrDataView', title: 'IPDR Data Grid', icon: <Database size={28} className="text-yellow-500" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'STANDARD' },
  { id: 'ipdrUserActivity', title: 'User Activity', icon: <UserSearch size={28} className="text-amber-500" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'STANDARD' },
  { id: 'ipdrIpProfiler', title: 'IP Profiler', icon: <MapPin size={28} className="text-orange-500" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'PRO' },
  { id: 'ipdrDeviceLinkage', title: 'Device Linkage', icon: <Smartphone size={28} className="text-yellow-600" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'PRO' },
  { id: 'ipdrBrowsingBehavior', title: 'Browsing Behavior', icon: <Activity size={28} className="text-amber-600" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'STANDARD' },
  { id: 'ipdrAppUsage', title: 'Application Usage', icon: <PackageOpen size={28} className="text-orange-600" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'STANDARD' },
  { id: 'ipdrDomainAnalysis', title: 'Domain Analysis', icon: <Network size={28} className="text-yellow-700" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'PRO' },
  { id: 'ipdrGeminiInsights', title: 'AI-Powered Insights', icon: <BrainCircuit size={28} className="text-purple-500" />, category: 'ipdr', isMainTab: false, parentViewId: 'ipdrAnalysis', requiredLicense: 'PRO' },

  // LAC Sub-views
  { id: 'lacDataView', title: 'LAC Data Grid', icon: <ListTree size={28} className="text-cyan-500" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },
  { id: 'towerDatabase', title: 'Tower Database', icon: <DatabaseZap size={28} className="text-sky-500" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },
  { id: 'lacSameTimeSameTower', title: 'Same Time, Same Tower', icon: <><Users2 size={22} className="text-sky-500" /><Clock size={22} className="text-sky-500 ml-0.5" /></>, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },
  { id: 'lacFrequentPresence', title: 'Frequent Presence', icon: <Repeat size={28} className="text-blue-500" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'PRO' },
  { id: 'lacMultiSimImei', title: 'Multi-SIM IMEI Linkage', icon: <><Smartphone size={22} className="text-cyan-600" /><Users2 size={22} className="text-cyan-600 ml-0.5" /></>, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'PRO' },
  { id: 'lacCallSmsLink', title: 'Call/SMS Link Analysis', icon: <Share2 size={28} className="text-sky-600" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'PRO' },
  { id: 'lacTimeBasedFilter', title: 'Time-based Filtering', icon: <ListFilter size={28} className="text-blue-600" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },
  { id: 'lacSuspiciousPattern', title: 'Suspicious Patterns (AI)', icon: <BrainCircuit size={28} className="text-purple-600" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'PRO' },
  { id: 'lacImeiChangeDetect', title: 'IMEI Change Detector', icon: <><Smartphone size={22} className="text-cyan-700" /><Repeat size={22} className="text-cyan-700 ml-0.5" /></>, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'PRO' },
  { id: 'lacTowerTravelPattern', title: 'Tower Travel Pattern', icon: <Route size={28} className="text-sky-700" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },
  { id: 'btsLocationSearch', title: 'BTS Location Search', icon: <MapRouteIcon size={28} className="text-teal-500" />, category: 'lac', isMainTab: false, parentViewId: 'lacAnalysis', requiredLicense: 'STANDARD' },

  // SMS Sub-views
  { id: 'smsDataView', title: 'SMS Data Grid', icon: <ListTree size={28} className="text-yellow-500" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsDashboardView', title: 'SMS Dashboard', icon: <BarChartHorizontalBig size={28} className="text-amber-500" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsRechargeView', title: 'Recharge Tracker', icon: <CreditCard size={28} className="text-orange-500" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsContentSearch', title: 'Content Search', icon: <SearchIconLucide size={28} className="text-yellow-600" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsContactLinks', title: 'Contact Links', icon: <Users2 size={28} className="text-amber-600" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsTimelineView', title: 'Activity Timeline', icon: <Activity size={28} className="text-orange-600" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'STANDARD' },
  { id: 'smsAlertFlagging', title: 'Alert & Flagging (AI)', icon: <ShieldAlert size={28} className="text-red-600" />, category: 'sms', isMainTab: false, parentViewId: 'smsAnalysis', requiredLicense: 'PRO' },
  
  // MFS Service-Level Sub-views
  { id: 'nagadAnalysis', title: 'Nagad Analysis', icon: <Mailbox size={28} className="text-emerald-500" />, category: 'mfs', isMainTab: false, parentViewId: 'mobileFinanceAnalysis', isServiceGroup: true, requiredLicense: 'PRO' },
  { id: 'bkashAnalysis', title: 'bKash Analysis', icon: <Pocket size={28} className="text-pink-500" />, category: 'mfs', isMainTab: false, parentViewId: 'mobileFinanceAnalysis', isServiceGroup: true, requiredLicense: 'PRO' },
  { id: 'roketAnalysis', title: 'Roket Analysis', icon: <Rocket size={28} className="text-purple-500" />, category: 'mfs', isMainTab: false, parentViewId: 'mobileFinanceAnalysis', isServiceGroup: true, requiredLicense: 'PRO' },

  // MFS Tool-Level Sub-views
  { id: 'nagadDataGrid', title: 'Nagad Data Grid', icon: <ListTree size={28} className="text-green-500" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'nagadTransactionDashboard', title: 'Nagad Dashboard', icon: <LayoutDashboard size={28} className="text-emerald-500" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'nagadFrequentContacts', title: 'Frequent Contacts', icon: <Users2 size={28} className="text-teal-500" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'nagadNetworkVisualizer', title: 'Network Visualizer', icon: <Share2 size={28} className="text-green-600" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'nagadSuspiciousActivity', title: 'Suspicious Activity (AI)', icon: <ShieldAlert size={28} className="text-red-600" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'nagadTransactionTimeline', title: 'Transaction Timeline', icon: <ListChecks size={28} className="text-emerald-600" />, category: 'mfs', isMainTab: false, parentViewId: 'nagadAnalysis', requiredLicense: 'PRO' },
  { id: 'bkashDataGrid', title: 'bKash Data Grid', icon: <ListTree size={28} className="text-fuchsia-500" />, category: 'mfs', isMainTab: false, parentViewId: 'bkashAnalysis', requiredLicense: 'PRO' },
  { id: 'bkashTransactionDashboard', title: 'bKash Dashboard', icon: <LayoutDashboard size={28} className="text-pink-500" />, category: 'mfs', isMainTab: false, parentViewId: 'bkashAnalysis', requiredLicense: 'PRO' },
  { id: 'bkashFrequentContacts', title: 'Frequent Contacts', icon: <Users2 size={28} className="text-rose-500" />, category: 'mfs', isMainTab: false, parentViewId: 'bkashAnalysis', requiredLicense: 'PRO' },
  { id: 'bkashNetworkVisualizer', title: 'Network Visualizer', icon: <Share2 size={28} className="text-fuchsia-600" />, category: 'mfs', isMainTab: false, parentViewId: 'bkashAnalysis', requiredLicense: 'PRO' },
  { id: 'bkashSuspiciousActivity', title: 'Suspicious Activity (AI)', icon: <ShieldAlert size={28} className="text-red-600" />, category: 'mfs', isMainTab: false, parentViewId: 'bkashAnalysis', requiredLicense: 'PRO' },
  { id: 'roketDataGrid', title: 'Roket Data Grid', icon: <ListTree size={28} className="text-violet-500" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },
  { id: 'roketTransactionDashboard', title: 'Roket Dashboard', icon: <LayoutDashboard size={28} className="text-purple-500" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },
  { id: 'roketFrequentContacts', title: 'Frequent Contacts', icon: <Users2 size={28} className="text-indigo-500" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },
  { id: 'roketNetworkVisualizer', title: 'Network Visualizer', icon: <Share2 size={28} className="text-violet-600" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },
  { id: 'roketSuspiciousActivity', title: 'Suspicious Activity (AI)', icon: <ShieldAlert size={28} className="text-red-600" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },
  { id: 'roketTransactionTimeline', title: 'Roket Transaction Timeline', icon: <ListChecks size={28} className="text-purple-600" />, category: 'mfs', isMainTab: false, parentViewId: 'roketAnalysis', requiredLicense: 'PRO' },

  // Unified Timeline Sub-views
  { id: 'unifiedActivityTimeline', title: 'Timeline View', icon: <HistoryIcon size={28} className="text-purple-600" />, category: 'unified', isMainTab: false, parentViewId: 'unifiedActivityTimeline', requiredLicense: 'PRO' },
  
  // Entity Profiler Sub-views
  { id: 'entityProfiler', title: 'Profiler View', icon: <ClipboardList size={28} className="text-red-600" />, category: 'profiler', isMainTab: false, parentViewId: 'entityProfiler', requiredLicense: 'PRO' },

  // Watchlist Sub-views
  { id: 'watchlistManagement', title: 'Manage Watchlist', icon: <Eye size={28} className="text-orange-600" />, category: 'watchlist', isMainTab: false, parentViewId: 'watchlistManagement', requiredLicense: 'STANDARD' },

  // License Management Sub-view (it's also its own main tab)
  { id: 'licenseManagement', title: 'Manage License', icon: <KeyRound size={28} className="text-teal-600" />, category: 'license', isMainTab: false, parentViewId: 'licenseManagement' },
];

const CollapsibleSection: React.FC<{ title: string; icon: React.ReactNode; isOpen: boolean; onToggle: () => void; children: React.ReactNode }> = ({ title, icon, isOpen, onToggle, children }) => (
    <div className="border border-neutral-light rounded-lg bg-surface shadow-sm">
      <button
        className="w-full flex items-center justify-between p-2 text-left text-sm font-semibold text-textPrimary hover:bg-neutral-lightest focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="flex items-center">
          {icon}
          <span className="ml-2">{title}</span>
        </span>
        {isOpen ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
      </button>
      {isOpen && <div className="p-1 border-t border-neutral-light">{children}</div>}
    </div>
);


const App: React.FC = () => {
  const [activeMainTabView, setActiveMainTabView] = useState<MainView>('data');
  const [activeContentView, setActiveContentView] = useState<MainView>('data');
  const { isFeatureAllowed } = useLicenseContext();
  const [openUploads, setOpenUploads] = useState<Record<string, boolean>>({
      cdr: true,
      ipdr: false,
      lac: false,
      sms: false,
      mfs: false,
  });

  const toggleUploadSection = (section: string) => {
    setOpenUploads(prev => ({...prev, [section]: !prev[section]}));
  };

  const handleSelectMainTab = (viewId: MainView) => {
    const firstSubView = appViews.find(v => v.parentViewId === viewId && !v.isServiceGroup && isFeatureAllowed(v.requiredLicense));
    setActiveMainTabView(viewId);
    setActiveContentView(firstSubView ? firstSubView.id : viewId);
  };

  const handleSelectContentView = (viewId: MainView) => {
    setActiveContentView(viewId);
  };
  
  const onRibbonAction = (actionType: string, targetViewId?: string) => {
    const targetView = appViews.find(v => v.id === targetViewId);
    if (targetViewId && targetView && actionType === 'navigateToView') {
      handleSelectContentView(targetViewId as MainView);
    }
  };
  
  const ribbonGroups: RibbonGroupConfig[] = useMemo(() => {
    const subViews = appViews.filter(v => v.parentViewId === activeMainTabView && isFeatureAllowed(v.requiredLicense));
    if (subViews.length === 0) return [];
    
    if (activeMainTabView === 'mobileFinanceAnalysis') {
        const serviceGroups = subViews.filter(v => v.isServiceGroup);
        return serviceGroups.map(sg => ({
            id: sg.id,
            name: sg.title,
            actions: appViews
                .filter(v => v.parentViewId === sg.id && isFeatureAllowed(v.requiredLicense))
                .map(v => ({
                    id: `navigateToView_${v.id}`,
                    label: v.title,
                    icon: v.icon,
                    actionType: 'navigateToView',
                    targetViewId: v.id,
                    displayType: 'large'
                }))
        }));
    }
    
    return [{
        id: activeMainTabView,
        actions: subViews.map(v => ({
            id: `navigateToView_${v.id}`,
            label: v.title,
            icon: v.icon,
            actionType: 'navigateToView',
            targetViewId: v.id,
            displayType: 'large'
        }))
    }];
  }, [activeMainTabView, isFeatureAllowed]);

  const renderView = (view: MainView) => {
    if (!isFeatureAllowed(appViews.find(v => v.id === view)?.requiredLicense)) {
      return <PlaceholderView title="Access Denied" requiredLicense={appViews.find(v => v.id === view)?.requiredLicense} />;
    }
    switch (view) {
      // CDR
      case 'data': return <DataView />;
      case 'summary': return <AnalyticsDashboard />;
      case 'graph': return <GraphView />;
      case 'interMatch': return <LinkAnalysisView />;
      case 'towerActivity': return <TowerActivityView />;
      case 'deviceAnalysis': return <DeviceAnalysisView />;
      case 'conversationChains': return <ConversationChainView />;
      case 'locationTimeline': return <LocationTimelineView />;
      case 'activityRanking': return <NumberActivityExplorer setActiveView={handleSelectContentView} />;
      case 'behavioralMatching': return <BehavioralFingerprintView />;
      case 'deviceSwaps': return <DeviceSwapView />;
      case 'anomalyDetection': return <AnomalyDetectionView />;
      case 'locationContactAnalysis': return <LocationContactAnalysisView />;
      case 'suspectProfiling': return <SuspectProfilingView />;
      case 'geoAnalysis': return <GeoAnalysisView />;
      case 'duplicateRemoval': return <DuplicateDataRemovalView />;
      // IPDR
      case 'ipdrAnalysis': return <IPDRDataView />;
      case 'ipdrDataView': return <IPDRDataView />;
      case 'ipdrUserActivity': return <IPDRUserActivityView />;
      case 'ipdrIpProfiler': return <IPDRIPAddressProfilerView />;
      case 'ipdrDeviceLinkage': return <IPDRDeviceLinkageView />;
      case 'ipdrBrowsingBehavior': return <IPDRBrowsingBehaviorView />;
      case 'ipdrAppUsage': return <IPDRAppUsageView />;
      case 'ipdrDomainAnalysis': return <IPDRDomainAnalysisView />;
      case 'ipdrGeminiInsights': return <IPDRGeminiInsightsView />;
      // LAC
      case 'lacAnalysis': return <LACDataView />;
      case 'lacDataView': return <LACDataView />;
      case 'lacSameTimeSameTower': return <LACSameTimeSameTowerView />;
      case 'lacFrequentPresence': return <LACFrequentPresenceView />;
      case 'lacMultiSimImei': return <LACMultiSimImeiView />;
      case 'lacCallSmsLink': return <LACCallSmsLinkView />;
      case 'lacTimeBasedFilter': return <LACTimeBasedFilterView />;
      case 'lacSuspiciousPattern': return <LACSuspiciousPatternView />;
      case 'lacImeiChangeDetect': return <LACImeiChangeDetectView />;
      case 'lacTowerTravelPattern': return <LACTowerTravelPatternView />;
      case 'towerDatabase': return <TowerDatabaseUploader />;
      case 'btsLocationSearch': return <BTSLocationSearchView />;
      // SMS
      case 'smsAnalysis': return <SMSDataView />;
      case 'smsDataView': return <SMSDataView />;
      case 'smsDashboardView': return <SMSDashboardView />;
      case 'smsRechargeView': return <SMSRechargeView />;
      case 'smsContentSearch': return <SMSContentSearchView />;
      case 'smsContactLinks': return <SMSContactLinksView />;
      case 'smsTimelineView': return <SMSTimelineView />;
      case 'smsAlertFlagging': return <SMSAlertFlaggingView />;
      // MFS
      case 'mobileFinanceAnalysis': return <MFSLandingView />;
      case 'nagadAnalysis': return <NagadDataView />;
      case 'bkashAnalysis': return <BkashDataView />;
      case 'roketAnalysis': return <RoketDataView />;
      case 'nagadDataGrid': return <NagadDataView />;
      case 'nagadTransactionDashboard': return <NagadTransactionDashboard />;
      case 'nagadFrequentContacts': return <NagadFrequentContactsView />;
      case 'nagadNetworkVisualizer': return <NagadNetworkVisualizer />;
      case 'nagadSuspiciousActivity': return <NagadSuspiciousActivityView />;
      case 'nagadTransactionTimeline': return <NagadTransactionTimelineView />;
      case 'bkashDataGrid': return <BkashDataView />;
      case 'bkashTransactionDashboard': return <BkashTransactionDashboard />;
      case 'bkashFrequentContacts': return <BkashFrequentContactsView />;
      case 'bkashNetworkVisualizer': return <BkashNetworkVisualizer />;
      case 'bkashSuspiciousActivity': return <BkashSuspiciousActivityView />;
      case 'roketDataGrid': case 'roketTransactionDashboard': case 'roketFrequentContacts': case 'roketNetworkVisualizer': case 'roketSuspiciousActivity': case 'roketTransactionTimeline':
        return <RoketDataView />;
      // Unified & Others
      case 'unifiedActivityTimeline': return <UnifiedActivityTimelineView />;
      case 'entityProfiler': return <EntityProfilerView />;
      case 'watchlistManagement': return <WatchlistManagementView />;
      case 'licenseManagement': return <LicenseManagerView />;
      default:
        return <div className="p-6 bg-neutral-lightest rounded-lg"><h2 className="text-xl font-bold">View Not Found</h2><p>The selected view '{view}' is not implemented or has been removed.</p></div>;
    }
  };

  const mainViews = useMemo(() => appViews.filter(v => v.isMainTab), []);

  return (
    <div className="flex flex-col h-screen bg-background text-textPrimary">
      <Header title="Zenius Moonlyzer Pro" className="flex-shrink-0" />
      <div className="flex flex-row flex-grow min-h-0">
        <aside className="w-80 flex-shrink-0 bg-neutral-lightest border-r border-neutral-light p-2 flex flex-col space-y-2 overflow-y-auto scrollbar-thin">
           <h2 className="text-lg font-bold text-textPrimary px-2 pt-2 pb-3 border-b border-neutral-light">File Management</h2>
           <CollapsibleSection title="CDR" icon={<Database size={16} className="text-primary"/>} isOpen={openUploads.cdr} onToggle={() => toggleUploadSection('cdr')}>
              <FileUpload />
           </CollapsibleSection>
           <CollapsibleSection title="IPDR" icon={<Globe size={16} className="text-accent"/>} isOpen={openUploads.ipdr} onToggle={() => toggleUploadSection('ipdr')}>
              <IPDRFileUpload />
           </CollapsibleSection>
            <CollapsibleSection title="LAC/Cell" icon={<TowerControl size={16} className="text-info"/>} isOpen={openUploads.lac} onToggle={() => toggleUploadSection('lac')}>
              <LACFileUpload />
           </CollapsibleSection>
           <CollapsibleSection title="SMS" icon={<MessageSquare size={16} className="text-warning"/>} isOpen={openUploads.sms} onToggle={() => toggleUploadSection('sms')}>
              <SMSFileUpload />
           </CollapsibleSection>
            <CollapsibleSection title="Mobile Finance" icon={<Landmark size={16} className="text-success"/>} isOpen={openUploads.mfs} onToggle={() => toggleUploadSection('mfs')}>
              <div className="space-y-4 p-2">
                <NagadFileUpload />
                <BkashFileUpload />
                <RoketFileUpload />
              </div>
           </CollapsibleSection>
        </aside>
        <div className="flex-1 flex flex-col min-w-0">
            <div className="relative z-20 flex items-center p-3 border-b border-neutral-light shadow-sm bg-surface">
              <Tabs>
                {mainViews.map(view => (
                  isFeatureAllowed(view.requiredLicense) ? (
                    <Tab key={view.id} title={view.title} icon={view.icon} isActive={activeMainTabView === view.id} onClick={() => handleSelectMainTab(view.id)} />
                  ) : null
                ))}
              </Tabs>
            </div>
            <RibbonToolbar 
              activeMainTabView={activeMainTabView} 
              groups={ribbonGroups} 
              onAction={(actionType, targetViewId, actionId) => onRibbonAction(actionType, targetViewId)}
              activeContentView={activeContentView}
            />
            <main className="flex-grow p-4 overflow-y-auto main-view-container scrollbar-thin bg-background">
              {renderView(activeContentView)}
            </main>
        </div>
      </div>
    </div>
  );
};

export default App;
