
import React from 'react';
import { Sparkles } from 'lucide-react';

const SMSAISummaryView: React.FC = () => {
  return (
    <div className="p-6 bg-neutral-lightest border border-neutral-light rounded-lg text-center text-textSecondary flex flex-col items-center justify-center min-h-[200px] shadow-md">
      <Sparkles size={28} className="mb-2 text-neutral-DEFAULT" />
      <p className="font-medium">AI-Powered SMS Insights</p>
      <p className="text-xs mt-1">AI-driven analysis and summarization of SMS content will be implemented here.</p>
    </div>
  );
};

export default SMSAISummaryView;
