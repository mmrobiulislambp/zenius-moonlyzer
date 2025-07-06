
import React, { useState, useEffect } from 'react';
import { Search, CalendarDays, ListFilter as ListFilterIcon, FileCheck2, RotateCcw, CheckCircle, DollarSign, ArrowUpDown } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { BkashFilterState } from '../types';

const BkashFilterControls: React.FC = () => {
  const { bkashFilterState, setBkashFilterState, getUniqueBkashValues, uploadedBkashFiles } = useBkashContext();
  
  const [localFilters, setLocalFilters] = useState<BkashFilterState>(bkashFilterState);

  useEffect(() => {
    setLocalFilters(bkashFilterState);
  }, [bkashFilterState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setLocalFilters(prev => {
        const currentValues = prev[name as keyof BkashFilterState] as string[] || [];
        if (checked) {
          return { ...prev, [name]: [...currentValues, value] };
        } else {
          return { ...prev, [name]: currentValues.filter(v => v !== value) };
        }
      });
    } else if (type === 'number') {
       setLocalFilters(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
    } else {
      setLocalFilters(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const applyFilters = () => {
    setBkashFilterState(localFilters);
  };

  const resetFilters = () => {
    const initialFilterState: BkashFilterState = {
      searchTerm: '',
      selectedFileIds: uploadedBkashFiles.map(f => f.id), 
      dateFrom: undefined,
      dateTo: undefined,
      txnTypes: [],
      drCrTypes: [],
      minTxnAmount: null,
      maxTxnAmount: null,
    };
    setLocalFilters(initialFilterState);
    setBkashFilterState(initialFilterState);
  };

  const uniqueTxnTypes = getUniqueBkashValues('TXN_TYPE');
  const uniqueDrCrTypes: ('CREDIT' | 'DEBIT' | '')[] = ['', 'CREDIT', 'DEBIT'];


  return (
    <div className="p-4 sm:p-5 bg-pink-50/70 border border-pink-200 rounded-xl shadow-lg mb-6 space-y-5">
      <div className="flex items-center text-lg font-semibold text-pink-700 mb-1">
        <ListFilterIcon size={22} className="mr-2"/> bKash Filter Controls
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-4">
        <div className="space-y-1.5">
          <label htmlFor="searchTermBkash" className="block text-xs font-medium text-pink-600">Search Term</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" />
            <input type="text" name="searchTerm" id="searchTermBkash" value={localFilters.searchTerm} onChange={handleInputChange} className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm" placeholder="TXN ID, Account, Status..." />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dateFromBkash" className="block text-xs font-medium text-pink-600">Date From</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" />
            <input type="date" name="dateFrom" id="dateFromBkash" value={localFilters.dateFrom || ''} onChange={handleInputChange} className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm accent-pink-500" />
          </div>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="dateToBkash" className="block text-xs font-medium text-pink-600">Date To</label>
          <div className="relative">
            <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" />
            <input type="date" name="dateTo" id="dateToBkash" value={localFilters.dateTo || ''} onChange={handleInputChange} className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm accent-pink-500" />
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-pink-600">Transaction Amount</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" /><input type="number" name="minTxnAmount" value={localFilters.minTxnAmount ?? ''} onChange={handleInputChange} placeholder="Min" className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm"/></div>
            <div className="relative"><DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" /><input type="number" name="maxTxnAmount" value={localFilters.maxTxnAmount ?? ''} onChange={handleInputChange} placeholder="Max" className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm"/></div>
          </div>
        </div>
        
        <div className="space-y-1.5">
          <label htmlFor="drCrTypesBkash" className="block text-xs font-medium text-pink-600">DR/CR Type</label>
            <div className="relative">
                 <ArrowUpDown className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" />
                 <select name="drCrTypes" id="drCrTypesBkash" value={(localFilters.drCrTypes && localFilters.drCrTypes.length > 0) ? localFilters.drCrTypes[0] : ''} onChange={(e) => setLocalFilters(prev => ({...prev, drCrTypes: e.target.value ? [e.target.value as ('' | 'CREDIT' | 'DEBIT')] : []}))} className="block w-full pl-9 pr-3 py-2 border border-pink-300 rounded-md focus:outline-none focus:ring-2 focus:ring-pink-400 text-sm shadow-sm appearance-none" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-chevron-down' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1em'}}>
                    {uniqueDrCrTypes.map(type => (<option key={type} value={type}>{type || 'All Types'}</option>))}
                 </select>
            </div>
        </div>
      </div>
      
      {uniqueTxnTypes.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-pink-200">
            <h4 className="text-xs font-semibold text-pink-600 flex items-center"><ListFilterIcon size={15} className="mr-1.5"/>Transaction Types</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-pink-200 p-1">
            {uniqueTxnTypes.map(type => (
                <label key={type} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-pink-700 cursor-pointer">
                <input type="checkbox" name="txnTypes" value={type} checked={localFilters.txnTypes?.includes(type) || false} onChange={handleInputChange} className="h-3.5 w-3.5 text-pink-500 border-pink-300 rounded focus:ring-1 focus:ring-pink-500"/>
                <span>{type}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      {uploadedBkashFiles.length > 1 && (
        <div className="space-y-2 pt-3 border-t border-pink-200">
            <h4 className="text-xs font-semibold text-pink-600 flex items-center"><FileCheck2 size={15} className="mr-1.5"/>Filter by bKash Files</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-pink-200 p-1">
            {uploadedBkashFiles.map(file => (
                <label key={file.id} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-pink-700 cursor-pointer">
                <input type="checkbox" name="selectedFileIds" value={file.id} checked={localFilters.selectedFileIds.includes(file.id)} onChange={handleInputChange} className="h-3.5 w-3.5 text-pink-500 border-pink-300 rounded focus:ring-1 focus:ring-pink-500"/>
                <span className="truncate max-w-xs" title={file.sourceName || file.name}>{file.sourceName || file.name}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-pink-200">
        <button onClick={resetFilters} className="px-4 py-2 text-sm font-medium text-pink-700 bg-pink-100 border border-pink-300 rounded-lg shadow-sm hover:bg-pink-200 flex items-center justify-center transition-colors"> <RotateCcw size={16} className="mr-1.5"/>Reset Filters </button>
        <button onClick={applyFilters} className="px-4 py-2 text-sm font-medium text-white bg-pink-500 border border-transparent rounded-lg shadow-sm hover:bg-pink-600 flex items-center justify-center transition-colors"> <CheckCircle size={16} className="mr-1.5"/>Apply Filters </button>
      </div>
    </div>
  );
};

export default BkashFilterControls;
