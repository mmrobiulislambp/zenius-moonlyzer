import React from 'react';
import { Map } from 'lucide-react';

const LACUserDensityHeatmapView: React.FC = () => {
  return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
      <Map size={28} className="mb-2 text-neutral-DEFAULT" />
      <p className="font-medium">LAC User Density Heatmap</p>
      <p className="text-xs mt-1">This feature is under development. It will display a heatmap of user density based on LAC data.</p>
    </div>
  );
};

export default LACUserDensityHeatmapView;