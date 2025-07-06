
// components/MFSFrequentContactDetailModal.tsx
import React, { useEffect } from 'react'; // Added useEffect
import { X, Printer, User, ArrowRightLeft, Inbox, Send, CalendarDays, DollarSign } from 'lucide-react';
import { MFSFrequentContactInteractionDetail } from '../types';
import { formatDate } from '../utils/cdrUtils';

interface MFSFrequentContactDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  contactData: MFSFrequentContactInteractionDetail | null;
  serviceName: 'bKash' | 'Nagad' | 'Roket'; // To customize title
}

const formatCurrencyForModal = (amount: number) => {
  return `BDT ${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const MFSFrequentContactDetailModal: React.FC<MFSFrequentContactDetailModalProps> = ({ isOpen, onClose, contactData, serviceName }) => {
  if (!isOpen || !contactData) return null;

  const handlePrint = () => {
    // The wrapper div with class 'mfs-contact-detail-modal-print-wrapper' should be targeted by print CSS
    // Add a class to the body to trigger specific print styles
    document.body.classList.add('printing-mfs-modal');
    window.print();
    // Note: Removing the class immediately might be too soon for some browsers.
    // The useEffect below handles reliable class removal.
  };

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-mfs-modal');
    };

    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      // Ensure class is removed if component unmounts before afterprint fires
      document.body.classList.remove('printing-mfs-modal');
    };
  }, []);


  return (
    <div 
      className="fixed inset-0 bg-neutral-darkest/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300 mfs-contact-detail-modal-print-wrapper"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="mfs-contact-detail-title"
    >
      <div
        className="bg-surface rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 border border-neutral-light mfs-contact-detail-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4 pb-3 border-b border-neutral-light no-print">
          <h2 id="mfs-contact-detail-title" className="text-lg font-semibold text-primary flex items-center">
            <User size={22} className="mr-2" /> {serviceName} Frequent Contact Details
          </h2>
          <button onClick={onClose} className="text-neutral-DEFAULT hover:text-danger-dark p-1 rounded-full hover:bg-danger-lighter/50 transition-colors no-print" aria-label="Close modal">
            <X size={22} />
          </button>
        </div>

        <div className="space-y-4 text-sm">
          <div className="p-3 bg-neutral-lightest rounded-md border border-neutral-light">
            <p className="font-medium text-textPrimary">Contact Account Number:</p>
            <p className="text-lg text-primary-dark font-semibold">{contactData.contactAccountNumber}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-neutral-lightest rounded-md border border-neutral-light">
              <p className="font-medium text-textPrimary flex items-center mb-1"><Send size={16} className="mr-2 text-red-500" />Sent from Statement Account:</p>
              <p><strong className="text-neutral-dark">Count:</strong> {contactData.sentFromStatementCount}</p>
              <p><strong className="text-neutral-dark">Total Amount:</strong> {formatCurrencyForModal(contactData.sentFromStatementAmount)}</p>
            </div>
            <div className="p-3 bg-neutral-lightest rounded-md border border-neutral-light">
              <p className="font-medium text-textPrimary flex items-center mb-1"><Inbox size={16} className="mr-2 text-green-500" />Received by Statement Account:</p>
              <p><strong className="text-neutral-dark">Count:</strong> {contactData.receivedByStatementCount}</p>
              <p><strong className="text-neutral-dark">Total Amount:</strong> {formatCurrencyForModal(contactData.receivedByStatementAmount)}</p>
            </div>
          </div>
          
          <div className="p-3 bg-neutral-lightest rounded-md border border-neutral-light">
             <p className="font-medium text-textPrimary flex items-center mb-1"><ArrowRightLeft size={16} className="mr-2 text-blue-500" />Overall Interaction:</p>
            <p><strong className="text-neutral-dark">Total Interactions:</strong> {contactData.totalInteractions}</p>
            <p><strong className="text-neutral-dark">First Interaction:</strong> {contactData.firstInteractionDate ? formatDate(contactData.firstInteractionDate.toISOString()) : 'N/A'}</p>
            <p><strong className="text-neutral-dark">Last Interaction:</strong> {contactData.lastInteractionDate ? formatDate(contactData.lastInteractionDate.toISOString()) : 'N/A'}</p>
          </div>
        </div>

        <div className="mt-6 flex justify-end space-x-3 no-print">
          <button
            onClick={handlePrint}
            className="px-4 py-2 text-sm bg-secondary text-white rounded-lg hover:bg-secondary-dark flex items-center shadow-md no-print"
          >
            <Printer size={16} className="mr-2" /> Print Details
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-neutral-light hover:bg-neutral-DEFAULT/30 text-textPrimary rounded-lg shadow-sm no-print"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default MFSFrequentContactDetailModal;
