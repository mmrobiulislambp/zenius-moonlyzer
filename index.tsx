
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { CDRProvider } from './contexts/CDRContext';
import { IPDRProvider } from './contexts/IPDRContext';
import { LACProvider } from './contexts/LACContext';
import { SMSProvider } from './contexts/SMSContext';
import { NagadProvider } from './contexts/NagadContext';
import { BkashProvider } from './contexts/BkashContext'; // Added
import { RoketProvider } from './contexts/RoketContext'; // Added
import { WatchlistProvider } from './contexts/WatchlistContext'; // Added WatchlistProvider
import { LicenseProvider } from './contexts/LicenseContext'; // Added LicenseProvider
// Removed: import { LocationInputProvider } from './contexts/LocationInputContext';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <LicenseProvider> {/* Added LicenseProvider at a high level */}
      <WatchlistProvider>
        <LACProvider>
          <CDRProvider>
            <IPDRProvider>
              <SMSProvider>
                <NagadProvider>
                  <BkashProvider>
                    <RoketProvider>
                      <App />
                    </RoketProvider>
                  </BkashProvider>
                </NagadProvider>
              </SMSProvider>
            </IPDRProvider>
          </CDRProvider>
        </LACProvider>
      </WatchlistProvider>
    </LicenseProvider> {/* Closed LicenseProvider */}
  </React.StrictMode>
);
