
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud, FileText, XCircle, Edit3, Check, X } from 'lucide-react';
import { useSMSContext } from '../contexts/SMSContext';
import { UploadedSMSFile } from '../types';
import { parseSMSExcelFile } from '../utils/smsParser';

interface FileWithSourceName extends File {
  sourceName?: string;
}

const SMSFileUpload: React.FC = () => {
  const { addSMSFile, setIsLoading, setError, error, uploadedSMSFiles, removeSMSFile, updateSMSFileSourceName } = useSMSContext();
  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");

  const onDrop = useCallback(async (acceptedFiles: FileWithSourceName[]) => {
    setIsLoading(true);
    setError(null);
    let fileIndexOffset = uploadedSMSFiles.length;

    for (const file of acceptedFiles) {
      try {
        const { records, headers } = await parseSMSExcelFile(file);
        
        const fileId = uuidv4();
        const userDefinedSourceName = file.sourceName || `SMS Data ${fileIndexOffset + 1}`;
        fileIndexOffset++;

        if (records.length === 0 && headers.length === 0) {
             console.warn(`File ${file.name} appears empty or not a valid SMS data format.`);
        }
        
        const newFile: UploadedSMSFile = {
          id: fileId,
          name: file.name,
          sourceName: userDefinedSourceName,
          records: records,
          headers: headers,
        };
        addSMSFile(newFile);

      } catch (err) {
        console.error('Error processing SMS file:', file.name, err);
        setError(`Error processing SMS file ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    setIsLoading(false);
  }, [addSMSFile, setIsLoading, setError, uploadedSMSFiles.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
      'text/csv': ['.csv'],
    },
    multiple: true,
     getFilesFromEvent: async (event: any) => { 
      const files = Array.from(event.target.files || event.dataTransfer.files || []);
      return files.map((file: any, index: number) => Object.assign(file, {
        sourceName: `SMS Data ${uploadedSMSFiles.length + index + 1}` 
      }));
    }
  });

  const handleSourceNameChange = (newName: string) => {
    setCurrentEditValue(newName);
  };

  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") {
      updateSMSFileSourceName(fileId, currentEditValue.trim());
    }
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };
  
  const cancelEditSourceName = () => {
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };

  const startEditing = (file: UploadedSMSFile) => {
    setEditingSourceNameId(file.id);
    setCurrentEditValue(file.sourceName);
  };


  return (
    <div className="bg-surface shadow-xl rounded-xl p-4 sm:p-6 border border-neutral-light">
      <h2 className="text-xl font-semibold text-textPrimary mb-4">Upload SMS Data Files</h2>
      {error && <div className="mb-4 p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light">{error}</div>}
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-all duration-150 ease-in-out
                    ${isDragActive ? 'border-primary-dark bg-primary-lighter/60 scale-105 ring-4 ring-primary-light/40' : 'border-neutral-light hover:border-primary-DEFAULT hover:bg-primary-lighter/30'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-2 sm:mb-3 ${isDragActive ? 'text-primary-dark' : 'text-primary/90'}`} />
        {isDragActive ? (
          <p className="text-primary-dark font-semibold">Drop SMS files here ...</p>
        ) : (
          <p className="text-textSecondary text-sm sm:text-base">Drag 'n' drop SMS Excel/CSV files here, or click to select</p>
        )}
      </div>

      {uploadedSMSFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-textPrimary mb-3">Uploaded & Tagged Files:</h3>
          <ul className="space-y-3">
            {uploadedSMSFiles.map((file) => (
              <li
                key={file.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-lightest p-3 sm:p-3.5 rounded-lg shadow-md border border-neutral-light hover:shadow-lg transition-shadow duration-150"
              >
                <div className="flex items-center mb-2 sm:mb-0 flex-grow min-w-0">
                  <FileText className="h-6 w-6 text-primary mr-2.5 sm:mr-3 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    {editingSourceNameId === file.id ? (
                      <div className="flex items-center space-x-1.5 w-full sm:max-w-md">
                        <input 
                          type="text"
                          value={currentEditValue}
                          onChange={(e) => handleSourceNameChange(e.target.value)}
                          className="flex-grow text-sm p-1.5 border border-primary-light rounded-md w-full bg-white text-textPrimary placeholder-neutral-DEFAULT focus:ring-2 focus:ring-primary-light focus:border-primary-light"
                          placeholder="Enter source name"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveSourceName(file.id);
                            if (e.key === 'Escape') cancelEditSourceName();
                          }}
                        />
                        <button onClick={() => saveSourceName(file.id)} className="p-1.5 text-success-dark hover:bg-success-lighter rounded-md" title="Save"><Check size={18}/></button>
                        <button onClick={cancelEditSourceName} className="p-1.5 text-danger hover:bg-danger-lighter rounded-md" title="Cancel"><X size={18}/></button>
                      </div>
                    ) : (
                      <span 
                        className="text-sm font-semibold text-textPrimary cursor-pointer hover:text-primary-dark block truncate"
                        onClick={() => startEditing(file)}
                        title="Click to edit source name"
                      >
                        {file.sourceName || 'Unnamed Source'}
                      </span>
                    )}
                    <p className="text-xs text-textSecondary truncate" title={file.name}>File: {file.name} ({file.records.length} records)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-center mt-1 sm:mt-0">
                  {editingSourceNameId !== file.id && (
                     <button
                        onClick={() => startEditing(file)}
                        className="text-primary-dark/80 hover:text-primary-dark transition-colors p-1.5 rounded-md hover:bg-primary-lighter/40"
                        title="Edit source name"
                      >
                        <Edit3 size={18} />
                      </button>
                  )}
                  <button
                    onClick={() => removeSMSFile(file.id)}
                    className="text-danger/80 hover:text-danger-dark transition-colors p-1.5 rounded-md hover:bg-danger-lighter/40"
                    title="Remove file"
                  >
                    <XCircle size={20} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default SMSFileUpload;
