// components/MFSLandingView.tsx
import React from 'react';
import { Landmark, Mailbox, Pocket, Rocket } from 'lucide-react';

const MFSLandingView: React.FC = () => {
  return (
    <div className="flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-neutral-lightest rounded-xl border border-neutral-light shadow-lg min-h-[300px] sm:min-h-[400px]">
      <Landmark size={48} className="text-primary mb-6" />
      <h1 className="text-2xl sm:text-3xl font-bold text-textPrimary mb-3">
        Mobile Finance Services Analysis
      </h1>
      <p className="text-md sm:text-lg text-textSecondary mb-8 max-w-lg">
        Select a specific Mobile Finance Service from the ribbon toolbar above to begin your detailed analysis.
      </p>
      <div className="flex space-x-6 sm:space-x-10">
        <div className="flex flex-col items-center text-xs sm:text-sm text-emerald-600">
          <Mailbox size={32} className="mb-1" />
          Nagad
        </div>
        <div className="flex flex-col items-center text-xs sm:text-sm text-pink-600">
          <Pocket size={32} className="mb-1" />
          bKash
        </div>
        <div className="flex flex-col items-center text-xs sm:text-sm text-purple-600">
          <Rocket size={32} className="mb-1" />
          Roket
        </div>
      </div>
    </div>
  );
};

export default MFSLandingView;
