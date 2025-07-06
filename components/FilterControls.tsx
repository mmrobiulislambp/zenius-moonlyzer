
import React, { useState, useEffect } from 'react';
import { Search, CalendarDays, Clock, Smartphone, Wifi, FileCheck2, RotateCcw, CheckCircle, ListFilter } from 'lucide-react'; // Added ListFilter
import { useCDRContext } from '../contexts/CDRContext';
import { FilterState } from '../types';

const FilterControls: React.FC = () => {
  const { filterState, setFilterState, getUniqueValues, uploadedFiles } = useCDRContext();
  
  const [localFilters, setLocalFilters] = useState<FilterState>(filterState);

  useEffect(() => {
    setLocalFilters(filterState);
  }, [filterState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setLocalFilters(prev => {
        const currentValues = prev[name as keyof FilterState] as string[] || [];
        if (checked) {
          return { ...prev, [name]: [...currentValues, value] };
        } else {
          return { ...prev, [name]: currentValues.filter(v => v !== value) };
        }
      });
    } else if (type === 'number') {
       setLocalFilters(prev => ({ ...prev, [name]: value === '' ? null : Number(value) }));
    }
    else {
      setLocalFilters(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const applyFilters = () => {
    setFilterState(localFilters);
  };

  const resetFilters = () => {
    const initialFilterState: FilterState = {
      searchTerm: '',
      dateFrom: '',
      dateTo: '',
      usageTypes: [],
      networkTypes: [],
      minDuration: null,
      maxDuration: null,
      selectedFileIds: uploadedFiles.map(f => f.id), 
    };
    setLocalFilters(initialFilterState);
    setFilterState(initialFilterState);
  };

  const uniqueUsageTypes = getUniqueValues('USAGE_TYPE');
  const uniqueNetworkTypes = getUniqueValues('NETWORK_TYPE');

  return (
    <div className="p-4 sm:p-5 bg-neutral-lightest/70 border border-neutral-light rounded-xl shadow-lg mb-6 space-y-5"> {/* Enhanced panel style */}
      <div className="flex items-center text-lg font-semibold text-textPrimary mb-1">
        <ListFilter size={22} className="mr-2 text-primary"/> Filter Controls
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-4"> {/* Adjusted grid for more items */}
        {/* Search Term */}
        <div className="space-y-1.5"> {/* Increased spacing */}
          <label htmlFor="searchTerm" className="block text-xs font-medium text-textSecondary">Search Term</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="text"
              name="searchTerm"
              id="searchTerm"
              value={localFilters.searchTerm}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"
              placeholder="APARTY, BPARTY, Address etc."
            />
          </div>
        </div>

        {/* Date From */}
        <div className="space-y-1.5">
          <label htmlFor="dateFrom" className="block text-xs font-medium text-textSecondary">Date From</label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarDays className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="date"
              name="dateFrom"
              id="dateFrom"
              value={localFilters.dateFrom}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary accent-primary shadow-sm"
            />
          </div>
        </div>

        {/* Date To */}
        <div className="space-y-1.5">
          <label htmlFor="dateTo" className="block text-xs font-medium text-textSecondary">Date To</label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarDays className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="date"
              name="dateTo"
              id="dateTo"
              value={localFilters.dateTo}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary accent-primary shadow-sm"
            />
          </div>
        </div>
        
        {/* Call Duration */}
        <div className="space-y-1.5">
          <label className="block text-xs font-medium text-textSecondary">Call Duration (seconds)</label>
          <div className="grid grid-cols-2 gap-3">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"> <Clock className="h-4 w-4 text-neutral-DEFAULT" /></div>
              <input type="number" name="minDuration" value={localFilters.minDuration ?? ''} onChange={handleInputChange} placeholder="Min" className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"/>
            </div>
            <div className="relative">
               <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"> <Clock className="h-4 w-4 text-neutral-DEFAULT" /></div>
              <input type="number" name="maxDuration" value={localFilters.maxDuration ?? ''} onChange={handleInputChange} placeholder="Max" className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"/>
            </div>
          </div>
        </div>
      </div>
      
      {/* Usage Types */}
      {uniqueUsageTypes.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-neutral-light">
            <h4 className="text-xs font-semibold text-textSecondary flex items-center"><Smartphone size={15} className="mr-1.5 text-primary"/>Usage Types</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent p-1"> {/* Added scroll */}
            {uniqueUsageTypes.map(type => (
                <label key={type} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-textPrimary cursor-pointer">
                <input
                    type="checkbox"
                    name="usageTypes"
                    value={type}
                    checked={localFilters.usageTypes.includes(type)}
                    onChange={handleInputChange}
                    className="h-3.5 w-3.5 text-primary border-neutral-DEFAULT rounded focus:ring-1 focus:ring-primary focus:ring-offset-1"
                />
                <span>{type}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      {/* Network Types */}
      {uniqueNetworkTypes.length > 0 && (
        <div className="space-y-2 pt-3 border-t border-neutral-light">
            <h4 className="text-xs font-semibold text-textSecondary flex items-center"><Wifi size={15} className="mr-1.5 text-primary"/>Network Types</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent p-1"> {/* Added scroll */}
            {uniqueNetworkTypes.map(type => (
                <label key={type} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-textPrimary cursor-pointer">
                <input
                    type="checkbox"
                    name="networkTypes"
                    value={type}
                    checked={localFilters.networkTypes.includes(type)}
                    onChange={handleInputChange}
                    className="h-3.5 w-3.5 text-primary border-neutral-DEFAULT rounded focus:ring-1 focus:ring-primary focus:ring-offset-1"
                />
                <span>{type}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      {/* File Selection */}
      {uploadedFiles.length > 1 && (
        <div className="space-y-2 pt-3 border-t border-neutral-light">
            <h4 className="text-xs font-semibold text-textSecondary flex items-center"><FileCheck2 size={15} className="mr-1.5 text-primary"/>Filter by Files</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent p-1"> {/* Added scroll */}
            {uploadedFiles.map(file => (
                <label key={file.id} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-textPrimary cursor-pointer">
                <input
                    type="checkbox"
                    name="selectedFileIds"
                    value={file.id}
                    checked={localFilters.selectedFileIds.includes(file.id)}
                    onChange={handleInputChange}
                    className="h-3.5 w-3.5 text-primary border-neutral-DEFAULT rounded focus:ring-1 focus:ring-primary focus:ring-offset-1"
                />
                <span className="truncate max-w-xs" title={file.sourceName || file.name}>{file.sourceName || file.name}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-neutral-light">
        <button
          onClick={resetFilters}
          className="px-4 py-2 text-sm font-medium text-textPrimary bg-surface border border-neutral-light rounded-lg shadow-sm hover:bg-neutral-lighter focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-light flex items-center justify-center transition-colors"
        >
          <RotateCcw size={16} className="mr-1.5"/>Reset Filters
        </button>
        <button
          onClick={applyFilters}
          className="px-4 py-2 text-sm font-medium text-white bg-primary border border-transparent rounded-lg shadow-sm hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-primary-dark flex items-center justify-center transition-colors"
        >
          <CheckCircle size={16} className="mr-1.5"/>Apply Filters
        </button>
      </div>
    </div>
  );
};

export default FilterControls;