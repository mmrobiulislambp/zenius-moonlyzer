import React, { useState } from 'react';
import { KeyRound, CheckCircle, AlertTriangle, Info } from 'lucide-react';
import { useLicenseContext } from '../contexts/LicenseContext';

const LicenseManagerView: React.FC = () => {
  const { currentLicense, activateLicense } = useLicenseContext();
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const handleActivate = () => {
    if (!licenseKeyInput.trim()) {
      setStatusMessage({ type: 'error', message: 'Please enter a license key.' });
      return;
    }
    const result = activateLicense(licenseKeyInput.trim());
    if (result.success) {
      setStatusMessage({ type: 'success', message: result.message });
      setLicenseKeyInput(''); // Clear input on success
    } else {
      setStatusMessage({ type: 'error', message: result.message });
    }
  };

  return (
    <div className="p-6 bg-surface rounded-xl shadow-lg border border-neutral-light">
      <h2 className="text-xl font-semibold text-textPrimary mb-4 flex items-center">
        <KeyRound size={24} className="mr-3 text-primary" />
        License Management
      </h2>

      <div className="mb-6 p-4 bg-neutral-lightest rounded-lg border border-neutral-light">
        <p className="text-sm text-textSecondary">
          Your current license level is: 
          <span className={`font-semibold ml-1 ${
            currentLicense === 'PRO' ? 'text-success-dark' :
            currentLicense === 'STANDARD' ? 'text-info-dark' :
            'text-warning-dark'
          }`}>
            {currentLicense}
          </span>
        </p>
        {currentLicense !== 'PRO' && (
            <p className="text-xs text-textSecondary mt-1">
                Upgrade your license to unlock more features.
            </p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="licenseKey" className="block text-sm font-medium text-textSecondary mb-1">
            Enter License Key:
          </label>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              id="licenseKey"
              value={licenseKeyInput}
              onChange={(e) => setLicenseKeyInput(e.target.value)}
              placeholder="Enter your license key"
              className="flex-grow p-3 border border-neutral-light rounded-lg focus:ring-2 focus:ring-primary-light focus:border-primary-light text-sm shadow-sm bg-surface placeholder-neutral-DEFAULT"
            />
            <button
              onClick={handleActivate}
              disabled={!licenseKeyInput.trim()}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary-dark text-sm font-medium shadow-md hover:shadow-lg transition-all disabled:opacity-60 flex items-center justify-center"
            >
              <CheckCircle size={18} className="mr-2" />
              Activate License
            </button>
          </div>
        </div>

        {statusMessage && (
          <div className={`p-3 rounded-md border text-sm flex items-center ${
            statusMessage.type === 'success' ? 'bg-success-lighter text-success-darker border-success-light' :
            statusMessage.type === 'error' ? 'bg-danger-lighter text-danger-darker border-danger-light' :
            'bg-info-lighter text-info-darker border-info-light'
          }`}>
            {statusMessage.type === 'success' && <CheckCircle size={18} className="mr-2 flex-shrink-0" />}
            {statusMessage.type === 'error' && <AlertTriangle size={18} className="mr-2 flex-shrink-0" />}
            {statusMessage.type === 'info' && <Info size={18} className="mr-2 flex-shrink-0" />}
            {statusMessage.message}
          </div>
        )}

      </div>
    </div>
  );
};

export default LicenseManagerView;