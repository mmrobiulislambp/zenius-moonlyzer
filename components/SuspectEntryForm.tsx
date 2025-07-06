
import React, { useState, useEffect } from 'react';
import { SuspectEntry } from '../types';
import { UserCircle, Smartphone, FileText, Save, XCircle, AlertTriangle } from 'lucide-react';

interface SuspectEntryFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (suspectData: Omit<SuspectEntry, 'id' | 'createdAt'>) => void;
  initialData?: SuspectEntry | null;
}

const SuspectEntryForm: React.FC<SuspectEntryFormProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [name, setName] = useState('');
  const [msisdns, setMsisdns] = useState(''); // Comma-separated string
  const [imeis, setImeis] = useState('');   // Comma-separated string
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setMsisdns(initialData.msisdns.join(', '));
      setImeis(initialData.imeis.join(', '));
      setNotes(initialData.notes || '');
    } else {
      setName('');
      setMsisdns('');
      setImeis('');
      setNotes('');
    }
    setFormError(null);
  }, [initialData, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim()) {
      setFormError("Suspect Name/Alias is required.");
      return;
    }
    const msisdnArray = msisdns.split(',').map(s => s.trim()).filter(s => s);
    const imeiArray = imeis.split(',').map(s => s.trim()).filter(s => s);

    if (msisdnArray.length === 0 && imeiArray.length === 0) {
      setFormError("At least one MSISDN or IMEI must be provided.");
      return;
    }
    // Basic validation for MSISDNs (e.g., must be digits, certain length)
    if (msisdnArray.some(m => !/^\d{11,15}$/.test(m))) {
        setFormError("Invalid MSISDN format. Ensure numbers are 11-15 digits.");
        return;
    }
    // Basic validation for IMEIs (e.g., must be digits, certain length)
    if (imeiArray.some(i => !/^\d{14,16}$/.test(i))) {
        setFormError("Invalid IMEI format. Ensure numbers are 14-16 digits.");
        return;
    }

    onSave({ name: name.trim(), msisdns: msisdnArray, imeis: imeiArray, notes: notes.trim() });
  };

  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300" 
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="suspect-form-title"
    >
      <div 
        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] p-6 border border-neutral-light flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-light">
          <h2 id="suspect-form-title" className="text-lg font-semibold text-textPrimary flex items-center">
            <UserCircle size={22} className="mr-2 text-primary"/> {initialData ? 'Edit Suspect' : 'Add New Suspect'}
          </h2>
          <button onClick={onClose} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50 transition-colors" aria-label="Close form">
            <XCircle size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-grow overflow-y-auto space-y-4 scrollbar-thin pr-2">
          {formError && (
            <div className="p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light text-xs flex items-center">
              <AlertTriangle size={16} className="mr-2"/> {formError}
            </div>
          )}
          <div>
            <label htmlFor="suspectName" className="block text-sm font-medium text-textSecondary mb-1">Name/Alias <span className="text-danger">*</span></label>
            <input type="text" id="suspectName" value={name} onChange={(e) => setName(e.target.value)} required className="w-full p-2 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
          </div>
          <div>
            <label htmlFor="suspectMsisdns" className="block text-sm font-medium text-textSecondary mb-1">MSISDN(s) <span className="text-textSecondary text-xs">(comma-separated)</span></label>
            <div className="relative">
                <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-DEFAULT opacity-80"/>
                <input type="text" id="suspectMsisdns" value={msisdns} onChange={(e) => setMsisdns(e.target.value)} placeholder="e.g., 01xxxxxxxxx, 01xxxxxxxxx" className="w-full p-2 pl-10 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
            </div>
          </div>
          <div>
            <label htmlFor="suspectImeis" className="block text-sm font-medium text-textSecondary mb-1">IMEI(s) <span className="text-textSecondary text-xs">(comma-separated)</span></label>
             <div className="relative">
                <Smartphone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-DEFAULT opacity-80"/>
                <input type="text" id="suspectImeis" value={imeis} onChange={(e) => setImeis(e.target.value)} placeholder="e.g., 35xxxxxxxxxxxxx, 86xxxxxxxxxxxxx" className="w-full p-2 pl-10 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm"/>
            </div>
          </div>
          <div>
            <label htmlFor="suspectNotes" className="block text-sm font-medium text-textSecondary mb-1">Notes</label>
            <div className="relative">
                <FileText size={16} className="absolute left-3 top-3 text-neutral-DEFAULT opacity-80"/>
                <textarea id="suspectNotes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Any relevant notes about this suspect..." className="w-full p-2 pl-10 border border-neutral-light rounded-md focus:ring-2 focus:ring-primary-light text-sm shadow-sm resize-y"/>
            </div>
          </div>
        </form>
        
        <div className="mt-6 pt-4 border-t border-neutral-light flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded-lg shadow-sm">Cancel</button>
            <button type="submit" onClick={handleSubmit} className="px-4 py-2 text-sm bg-primary hover:bg-primary-dark text-white rounded-lg shadow-md flex items-center">
                <Save size={16} className="mr-2"/> Save Suspect
            </button>
        </div>
      </div>
    </div>
  );
};

export default SuspectEntryForm;
