
import React, { useState, useContext } from 'react';
import { Eye, UserPlus, Edit3, Trash2, Info, AlertTriangle, CheckCircle } from 'lucide-react';
import { WatchlistContext } from '../contexts/WatchlistContext';
import { SuspectEntry } from '../types';
import SuspectEntryForm from './SuspectEntryForm';

const WatchlistManagementView: React.FC = () => {
  const context = useContext(WatchlistContext);

  if (!context) {
    return <div className="p-4 text-danger-dark">Watchlist context is not available.</div>;
  }

  const { suspects, addSuspect, updateSuspect, deleteSuspect } = context;
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingSuspect, setEditingSuspect] = useState<SuspectEntry | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState<string | null>(null);

  const handleOpenForm = (suspectToEdit?: SuspectEntry) => {
    setEditingSuspect(suspectToEdit || null);
    setIsFormOpen(true);
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingSuspect(null);
  };

  const handleSaveSuspect = (suspectData: Omit<SuspectEntry, 'id' | 'createdAt'>) => {
    if (editingSuspect) {
      updateSuspect(editingSuspect.id, suspectData);
      setShowSuccessMessage(`Suspect "${suspectData.name}" updated successfully.`);
    } else {
      addSuspect(suspectData);
      setShowSuccessMessage(`Suspect "${suspectData.name}" added successfully.`);
    }
    handleCloseForm();
    setTimeout(() => setShowSuccessMessage(null), 3000);
  };

  const handleDeleteSuspect = (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete suspect "${name}"? This action cannot be undone.`)) {
      deleteSuspect(id);
      setShowSuccessMessage(`Suspect "${name}" deleted successfully.`);
      setTimeout(() => setShowSuccessMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 bg-surface border border-neutral-light rounded-xl shadow-xl">
        <div className="flex flex-col sm:flex-row justify-between items-center">
          <div className="flex items-center text-xl sm:text-2xl font-semibold text-textPrimary mb-3 sm:mb-0">
            <Eye size={24} className="mr-2.5 text-orange-500" /> Suspect Watchlist Management
          </div>
          <button
            onClick={() => handleOpenForm()}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-primary-light flex items-center shadow-md text-sm"
          >
            <UserPlus size={16} className="mr-2" /> Add New Suspect
          </button>
        </div>
      </div>

      {showSuccessMessage && (
        <div className="p-3 bg-success-lighter text-success-darker rounded-lg border border-success-light flex items-center shadow-md">
          <CheckCircle size={18} className="mr-2"/> {showSuccessMessage}
        </div>
      )}

      {isFormOpen && (
        <SuspectEntryForm
          isOpen={isFormOpen}
          onClose={handleCloseForm}
          onSave={handleSaveSuspect}
          initialData={editingSuspect}
        />
      )}

      {suspects.length === 0 && !isFormOpen && (
        <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[150px] shadow-md">
          <Info size={28} className="mb-2 text-neutral-DEFAULT" />
          <p>No suspects currently in the watchlist.</p>
          <p className="text-xs mt-1">Click "Add New Suspect" to start building your watchlist.</p>
        </div>
      )}

      {suspects.length > 0 && (
        <div className="bg-surface shadow-xl rounded-xl border border-neutral-light overflow-x-auto">
          <table className="min-w-full divide-y divide-neutral-light">
            <thead className="bg-neutral-lightest">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Name/Alias</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">MSISDN(s)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">IMEI(s)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Notes</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Created At</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-textPrimary uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-surface divide-y divide-neutral-light">
              {suspects.map((suspect) => (
                <tr key={suspect.id} className="hover:bg-neutral-lightest/50">
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-textPrimary font-medium">{suspect.name}</td>
                  <td className="px-4 py-3 text-xs text-textSecondary max-w-xs truncate" title={suspect.msisdns.join(', ')}>{suspect.msisdns.join(', ')}</td>
                  <td className="px-4 py-3 text-xs text-textSecondary max-w-xs truncate" title={suspect.imeis.join(', ')}>{suspect.imeis.join(', ')}</td>
                  <td className="px-4 py-3 text-xs text-textSecondary max-w-sm truncate" title={suspect.notes}>{suspect.notes || 'N/A'}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-textSecondary">{new Date(suspect.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs space-x-2">
                    <button onClick={() => handleOpenForm(suspect)} className="text-primary-dark hover:text-primary-darker p-1 hover:bg-primary-lighter/50 rounded-md" title="Edit Suspect">
                      <Edit3 size={16} />
                    </button>
                    <button onClick={() => handleDeleteSuspect(suspect.id, suspect.name)} className="text-danger hover:text-danger-dark p-1 hover:bg-danger-lighter/50 rounded-md" title="Delete Suspect">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default WatchlistManagementView;
