
import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud, FileText, XCircle, Edit3, Check, X } from 'lucide-react';
import { useBkashContext } from '../contexts/BkashContext';
import { UploadedBkashFile } from '../types';
import { parseBkashExcelFile } from '../utils/bkashParser';

interface FileWithSourceName extends File {
  sourceName?: string;
}

const BkashFileUpload: React.FC = () => {
  const { addBkashFile, setIsLoading, setError, error, uploadedBkashFiles, removeBkashFile, updateBkashFileSourceName } = useBkashContext();
  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");

  const onDrop = useCallback(async (acceptedFiles: FileWithSourceName[]) => {
    setIsLoading(true);
    setError(null);
    let fileIndexOffset = uploadedBkashFiles.length;

    for (const file of acceptedFiles) {
      try {
        const { records, headers } = await parseBkashExcelFile(file);
        
        const fileId = uuidv4();
        const userDefinedSourceName = file.sourceName || `bKash Statement ${fileIndexOffset + 1}`;
        fileIndexOffset++;

        if (records.length === 0 && headers.length === 0) {
             console.warn(`File ${file.name} appears empty or not a valid bKash statement format.`);
        }
        
        const newFile: UploadedBkashFile = {
          id: fileId,
          name: file.name,
          sourceName: userDefinedSourceName,
          records: records,
          headers: headers,
        };
        addBkashFile(newFile);

      } catch (err) {
        console.error('Error processing bKash file:', file.name, err);
        setError(`Error processing bKash file ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    setIsLoading(false);
  }, [addBkashFile, setIsLoading, setError, uploadedBkashFiles.length]);

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
        sourceName: `bKash Statement ${uploadedBkashFiles.length + index + 1}` 
      }));
    }
  });

  const handleSourceNameChange = (newName: string) => {
    setCurrentEditValue(newName);
  };

  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") {
      updateBkashFileSourceName(fileId, currentEditValue.trim());
    }
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };
  
  const cancelEditSourceName = () => {
    setEditingSourceNameId(null);
    setCurrentEditValue("");
  };

  const startEditing = (file: UploadedBkashFile) => {
    setEditingSourceNameId(file.id);
    setCurrentEditValue(file.sourceName);
  };


  return (
    <div className="bg-surface shadow-xl rounded-xl p-4 sm:p-6 border border-neutral-light">
      <h2 className="text-xl font-semibold text-textPrimary mb-4">Upload bKash Statement Files</h2>
      {error && <div className="mb-4 p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light">{error}</div>}
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-all duration-150 ease-in-out
                    ${isDragActive ? 'border-pink-600 bg-pink-100/60 scale-105 ring-4 ring-pink-300/40' : 'border-neutral-light hover:border-pink-500 hover:bg-pink-100/30'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-2 sm:mb-3 ${isDragActive ? 'text-pink-700' : 'text-pink-500/90'}`} />
        {isDragActive ? (
          <p className="text-pink-700 font-semibold">Drop bKash files here ...</p>
        ) : (
          <p className="text-textSecondary text-sm sm:text-base">Drag 'n' drop bKash Excel/CSV files here, or click to select</p>
        )}
      </div>

      {uploadedBkashFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-textPrimary mb-3">Uploaded & Tagged Files:</h3>
          <ul className="space-y-3">
            {uploadedBkashFiles.map((file) => (
              <li
                key={file.id}
                className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-neutral-lightest p-3 sm:p-3.5 rounded-lg shadow-md border border-neutral-light hover:shadow-lg transition-shadow duration-150"
              >
                <div className="flex items-center mb-2 sm:mb-0 flex-grow min-w-0">
                  <FileText className="h-6 w-6 text-pink-500 mr-2.5 sm:mr-3 flex-shrink-0" />
                  <div className="flex-grow min-w-0">
                    {editingSourceNameId === file.id ? (
                      <div className="flex items-center space-x-1.5 w-full sm:max-w-md">
                        <input 
                          type="text"
                          value={currentEditValue}
                          onChange={(e) => handleSourceNameChange(e.target.value)}
                          className="flex-grow text-sm p-1.5 border border-pink-400 rounded-md w-full bg-white text-textPrimary placeholder-neutral-DEFAULT focus:ring-2 focus:ring-pink-400 focus:border-pink-400"
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
                        className="text-sm font-semibold text-textPrimary cursor-pointer hover:text-pink-600 block truncate"
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
                        className="text-pink-600/80 hover:text-pink-700 transition-colors p-1.5 rounded-md hover:bg-pink-200/40"
                        title="Edit source name"
                      >
                        <Edit3 size={18} />
                      </button>
                  )}
                  <button
                    onClick={() => removeBkashFile(file.id)} // Ensure this context function exists and is used
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

export default BkashFileUpload;
