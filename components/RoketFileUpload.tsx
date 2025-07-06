
import React from 'react';
import { UploadCloud } from 'lucide-react';

const RoketFileUpload: React.FC = () => {
  return (
    <div className="bg-surface shadow-md rounded-xl p-4 border border-neutral-light text-center">
      <UploadCloud className="mx-auto h-8 w-8 text-purple-500 mb-2" />
      <p className="text-sm text-textSecondary">Roket File Upload Area</p>
      <p className="text-xs text-neutral-DEFAULT">(Feature placeholder: Drag 'n' drop or click to select Roket files)</p>
    </div>
  );
};

export default RoketFileUpload;
