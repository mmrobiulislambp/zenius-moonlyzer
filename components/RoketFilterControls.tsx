
import React, { useState, useEffect } from 'react';
import { Search, FileCheck2, RotateCcw, CheckCircle, ListFilter as ListFilterIcon } from 'lucide-react';
import { useRoketContext } from '../contexts/RoketContext'; 
import { RoketFilterState } from '../types'; 

const RoketFilterControls: React.FC = () => {
  const { roketFilterState, setRoketFilterState, uploadedRoketFiles } = useRoketContext(); 
  
  const [localFilters, setLocalFilters] = useState<RoketFilterState>(roketFilterState);

  useEffect(() => {
    setLocalFilters(roketFilterState);
  }, [roketFilterState]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    if (type === 'checkbox') {
      const { checked } = e.target as HTMLInputElement;
      setLocalFilters(prev => {
        const currentValues = prev[name as keyof RoketFilterState] as string[] || [];
        if (checked) {
          return { ...prev, [name]: [...currentValues, value] };
        } else {
          return { ...prev, [name]: currentValues.filter(v => v !== value) };
        }
      });
    } else {
      setLocalFilters(prev => ({ ...prev, [name]: value }));
    }
  };
  
  const applyFilters = () => {
    setRoketFilterState(localFilters);
  };

  const resetFilters = () => {
    const initialFilterState: RoketFilterState = {
      searchTerm: '',
      selectedFileIds: uploadedRoketFiles.map(f => f.id), 
    };
    setLocalFilters(initialFilterState);
    setRoketFilterState(initialFilterState);
  };

  return (
    <div className="p-4 sm:p-5 bg-purple-50/70 border border-purple-200 rounded-xl shadow-lg mb-6 space-y-5">
      <div className="flex items-center text-lg font-semibold text-purple-700 mb-1">
        <ListFilterIcon size={22} className="mr-2"/> Roket Filter Controls
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-5 gap-y-4">
        <div className="space-y-1.5 col-span-1 md:col-span-2"> {/* Search Term takes more space initially */}
          <label htmlFor="searchTermRoket" className="block text-xs font-medium text-purple-600">Search Term</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-DEFAULT" />
            <input 
                type="text" 
                name="searchTerm" 
                id="searchTermRoket" 
                value={localFilters.searchTerm} 
                onChange={handleInputChange} 
                className="block w-full pl-9 pr-3 py-2 border border-purple-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm shadow-sm" 
                placeholder="Search Roket data..." 
            />
          </div>
        </div>
        {/* Add other Roket-specific filter inputs here as they become known */}
      </div>
      
      {uploadedRoketFiles.length > 1 && (
        <div className="space-y-2 pt-3 border-t border-purple-200">
            <h4 className="text-xs font-semibold text-purple-600 flex items-center"><FileCheck2 size={15} className="mr-1.5"/>Filter by Roket Files</h4>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 max-h-28 overflow-y-auto scrollbar-thin scrollbar-thumb-purple-200 p-1">
            {uploadedRoketFiles.map(file => (
                <label key={file.id} className="flex items-center space-x-1.5 text-xs text-textSecondary hover:text-purple-700 cursor-pointer">
                <input 
                    type="checkbox" 
                    name="selectedFileIds" 
                    value={file.id} 
                    checked={localFilters.selectedFileIds.includes(file.id)} 
                    onChange={handleInputChange} 
                    className="h-3.5 w-3.5 text-purple-500 border-purple-300 rounded focus:ring-1 focus:ring-purple-500"
                />
                <span className="truncate max-w-xs" title={file.sourceName || file.name}>{file.sourceName || file.name}</span>
                </label>
            ))}
            </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-purple-200">
        <button 
            onClick={resetFilters} 
            className="px-4 py-2 text-sm font-medium text-purple-700 bg-purple-100 border border-purple-300 rounded-lg shadow-sm hover:bg-purple-200 flex items-center justify-center transition-colors"
        > 
            <RotateCcw size={16} className="mr-1.5"/>Reset Filters 
        </button>
        <button 
            onClick={applyFilters} 
            className="px-4 py-2 text-sm font-medium text-white bg-purple-500 border border-transparent rounded-lg shadow-sm hover:bg-purple-600 flex items-center justify-center transition-colors"
        > 
            <CheckCircle size={16} className="mr-1.5"/>Apply Filters 
        </button>
      </div>
    </div>
  );
};

export default RoketFilterControls;
