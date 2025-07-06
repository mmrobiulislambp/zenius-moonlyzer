
import React, { useState, useEffect } from 'react';
import { Search, CalendarDays, MessageCircle, Inbox, Send, FileCheck2, RotateCcw, CheckCircle, ListFilter, User } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { SMSFilterState } from '../types';

const SMSFilterControls: React.FC = () => {
  const { smsFilterState, setSMSFilterState, getUniqueSMSValues, uploadedSMSFiles } = useSMSContext();
  
  const [localFilters, setLocalFilters] = useState<SMSFilterState>(smsFilterState);

  useEffect(() => {
    setLocalFilters(smsFilterState);
  }, [smsFilterState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setLocalFilters(prev => ({ ...prev, [name]: value }));
  };

  const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, checked } = e.target;
    setLocalFilters(prev => {
      const currentValues = prev[name as keyof SMSFilterState] as string[] || [];
      if (checked) {
        return { ...prev, [name]: [...currentValues, value] };
      } else {
        return { ...prev, [name]: currentValues.filter(v => v !== value) };
      }
    });
  };
  
  const applyFilters = () => {
    setSMSFilterState(localFilters);
  };

  const resetFilters = () => {
    const initialFilterState: SMSFilterState = {
      searchTerm: '',
      filterByNumber: '',
      contentKeyword: '',
      selectedFileIds: uploadedSMSFiles.map(f => f.id), 
      dateFrom: undefined,
      dateTo: undefined,
      direction: '',
    };
    setLocalFilters(initialFilterState);
    setSMSFilterState(initialFilterState);
  };

  return (
    <div className="p-4 sm:p-5 bg-neutral-lightest/70 border border-neutral-light rounded-xl shadow-lg mb-6 space-y-5">
      <div className="flex items-center text-lg font-semibold text-textPrimary mb-1">
        <ListFilter size={22} className="mr-2 text-primary"/> SMS Filter Controls
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-4">
        {/* Search Term (General) */}
        <div className="space-y-1.5">
          <label htmlFor="searchTermSms" className="block text-xs font-medium text-textSecondary">General Search</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="text"
              name="searchTerm"
              id="searchTermSms"
              value={localFilters.searchTerm}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"
              placeholder="Sender, Recipient, Content..."
            />
          </div>
        </div>
        
        {/* Filter by Specific Number */}
        <div className="space-y-1.5">
          <label htmlFor="filterByNumber" className="block text-xs font-medium text-textSecondary">Filter by Number</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <User className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="text"
              name="filterByNumber"
              id="filterByNumber"
              value={localFilters.filterByNumber}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"
              placeholder="Enter specific number"
            />
          </div>
        </div>

        {/* Content Keyword */}
        <div className="space-y-1.5">
          <label htmlFor="contentKeyword" className="block text-xs font-medium text-textSecondary">Content Keyword</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MessageCircle className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="text"
              name="contentKeyword"
              id="contentKeyword"
              value={localFilters.contentKeyword}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary placeholder-neutral-DEFAULT shadow-sm"
              placeholder="Search in message content"
            />
          </div>
        </div>

        {/* Date From */}
        <div className="space-y-1.5">
          <label htmlFor="dateFromSms" className="block text-xs font-medium text-textSecondary">Date From</label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarDays className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="date"
              name="dateFrom"
              id="dateFromSms"
              value={localFilters.dateFrom || ''}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary accent-primary shadow-sm"
            />
          </div>
        </div>

        {/* Date To */}
        <div className="space-y-1.5">
          <label htmlFor="dateToSms" className="block text-xs font-medium text-textSecondary">Date To</label>
          <div className="relative">
             <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <CalendarDays className="h-4 w-4 text-neutral-DEFAULT" />
            </div>
            <input
              type="date"
              name="dateTo"
              id="dateToSms"
              value={localFilters.dateTo || ''}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary accent-primary shadow-sm"
            />
          </div>
        </div>
        
        {/* Direction Filter */}
        <div className="space-y-1.5">
          <label htmlFor="directionSms" className="block text-xs font-medium text-textSecondary">Direction</label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Send className="h-4 w-4 text-neutral-DEFAULT" /> {/* Using Send as a general direction icon */}
            </div>
            <select
              name="direction"
              id="directionSms"
              value={localFilters.direction || ''}
              onChange={handleInputChange}
              className="block w-full pl-9 pr-3 py-2 border border-neutral-light rounded-md focus:outline-none focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm bg-surface text-textPrimary shadow-sm appearance-none"
              style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' fill='currentColor' class='bi bi-chevron-down' viewBox='0 0 16 16'%3E%3Cpath fill-rule='evenodd' d='M1.646 4.646a.5.5 0 0 1 .708 0L8 10.293l5.646-5.647a.5.5 0 0 1 .708.708l-6 6a.5.5 0 0 1-.708 0l-6-6a.5.5 0 0 1 0-.708z'/%3E%3C/svg%3E")`, backgroundPosition: 'right 0.75rem center', backgroundRepeat: 'no-repeat', backgroundSize: '1em'}}
            >
              <option value="">All Directions</option>
              <option value="SMSMO">Outgoing (SMSMO)</option>
              <option value="SMSMT">Incoming (SMSMT)</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* File Selection */}
      {uploadedSMSFiles.length > 1 && (
        <div className="space-y-2 pt-3 border-t border-neutral-light">
            <h4 className="text-xs font-semibold text-textSecondary flex items-center"><FileCheck2 size={15} className="mr-1.5 text-primary"/>Filter by SMS Files</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-light scrollbar-track-transparent p-1">
            {uploadedSMSFiles.map(file => (
                <label key={file.id} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-textPrimary cursor-pointer">
                <input
                    type="checkbox"
                    name="selectedFileIds" // This name must match the key in SMSFilterState
                    value={file.id}
                    checked={localFilters.selectedFileIds.includes(file.id)}
                    onChange={handleCheckboxChange} // Use specific handler for checkboxes
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
          <CheckCircle size={16} className="mr-1.5"/>Apply SMS Filters
        </button>
      </div>
    </div>
  );
};

export default SMSFilterControls;
