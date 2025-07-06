
import React, { useCallback, useState, ChangeEvent, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud, FileText, XCircle, Edit3, Check, X, Loader2, AlertTriangle, Info as InfoIcon } from 'lucide-react'; // Added Loader2, AlertTriangle, InfoIcon
import { useCDRContext } from '../contexts/CDRContext';
import { CDRRecord, UploadedFile, EXPECTED_HEADERS } from '../types';
import { parseExcelFile } from '../utils/excelParser'; 
import { isValidCDRRecord, parseDateTime } from '../utils/cdrUtils';

interface FileWithSourceName extends File {
  sourceName?: string;
}

interface ProcessingFileStatus {
  tempId: string;
  fileName: string;
  status: 'processing' | 'success' | 'warning' | 'error';
  message?: string;
}

const FileUpload: React.FC = () => {
  const { addFile, removeFile, uploadedFiles, setIsLoading, setError, error, updateFileSourceName } = useCDRContext();
  const [editingSourceNameId, setEditingSourceNameId] = useState<string | null>(null);
  const [currentEditValue, setCurrentEditValue] = useState<string>("");
  const [processingFileStatuses, setProcessingFileStatuses] = useState<ProcessingFileStatus[]>([]);

  const onDrop = useCallback(async (acceptedFiles: FileWithSourceName[]) => {
    setIsLoading(true); // Global loading for batch
    setError(null);
    
    const currentBatchStatuses: ProcessingFileStatus[] = acceptedFiles.map(file => ({
      tempId: uuidv4(),
      fileName: file.name,
      status: 'processing',
      message: 'Parsing file...'
    }));
    setProcessingFileStatuses(currentBatchStatuses);

    let fileIndexOffset = uploadedFiles.length;
    let batchErrorMessages: string[] = [];


    for (let i = 0; i < acceptedFiles.length; i++) {
      const file = acceptedFiles[i];
      const tempFileId = currentBatchStatuses[i].tempId;

      try {
        const { records: excelDataRows, headers: excelHeaderRow } = await parseExcelFile(file);
        
        let finalHeadersToUse: string[];
        let finalRowsToProcess: any[][];
        let headerRowAppearsToBeData = false;

        if (excelHeaderRow.length === EXPECTED_HEADERS.length) {
            let dataLikeCellCount = 0;
            const criticalFieldsForHeuristic: (keyof CDRRecord)[] = ['START_DTTIME', 'CALL_DURATION', 'LACSTARTA', 'CISTARTA', 'APARTY', 'BPARTY'];
            excelHeaderRow.forEach((cellContent, index) => {
                const assumedFieldKey = EXPECTED_HEADERS[index];
                if (criticalFieldsForHeuristic.includes(assumedFieldKey)) {
                    if (!isNaN(parseFloat(String(cellContent))) || parseDateTime(String(cellContent))) {
                        dataLikeCellCount++;
                    }
                }
            });
            if (dataLikeCellCount >= Math.min(3, criticalFieldsForHeuristic.length / 2) ) {
                headerRowAppearsToBeData = true;
            }
        }
        
        if (excelDataRows.length > 0 && excelDataRows[0].length === EXPECTED_HEADERS.length) {
            finalHeadersToUse = EXPECTED_HEADERS as string[];
            finalRowsToProcess = excelDataRows;
            if (headerRowAppearsToBeData) {
                finalRowsToProcess = [excelHeaderRow.map(String), ...excelDataRows];
            }
        } else if (headerRowAppearsToBeData && excelHeaderRow.length === EXPECTED_HEADERS.length) {
            finalHeadersToUse = EXPECTED_HEADERS as string[];
            finalRowsToProcess = [excelHeaderRow.map(String), ...excelDataRows]; 
        } else {
            finalHeadersToUse = excelHeaderRow;
            finalRowsToProcess = excelDataRows;
        }

        if (finalHeadersToUse === (EXPECTED_HEADERS as string[]) && excelHeaderRow.join(',') !== EXPECTED_HEADERS.join(',')) {
            // Warnings logged by parser or main context
        }
        
        if (finalHeadersToUse.length === 0 && finalRowsToProcess.length > 0) {
             finalHeadersToUse = EXPECTED_HEADERS as string[];
        }

        const fileId = uuidv4();
        const userDefinedSourceName = file.sourceName || `Case File ${fileIndexOffset + 1}`; 
        fileIndexOffset++;
        
        const cdrRecords: CDRRecord[] = finalRowsToProcess.map((row, index) => {
          const record: Partial<CDRRecord> = {
            id: uuidv4(), sourceFileId: fileId, fileName: file.name,
            rowIndex: headerRowAppearsToBeData && finalHeadersToUse === (EXPECTED_HEADERS as string[]) ? index : index + 1,
          };
          EXPECTED_HEADERS.forEach(expectedHeader => { (record as any)[expectedHeader] = ''; });
          finalHeadersToUse.forEach((headerKeyOrCanonical, colIndex) => {
            let targetKey: keyof CDRRecord;
            if (finalHeadersToUse === (EXPECTED_HEADERS as string[])) {
              targetKey = EXPECTED_HEADERS[colIndex] as keyof CDRRecord;
            } else {
              targetKey = (EXPECTED_HEADERS.find(eh => String(eh).toLowerCase() === String(headerKeyOrCanonical).toLowerCase()) || String(headerKeyOrCanonical)) as keyof CDRRecord;
            }
            if (targetKey in record || EXPECTED_HEADERS.includes(targetKey as any) || Object.prototype.hasOwnProperty.call(record, targetKey)) {
                 (record as any)[targetKey] = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : '';
            } else {
                (record as any)[String(headerKeyOrCanonical)] = row[colIndex] !== undefined && row[colIndex] !== null ? String(row[colIndex]) : '';
            }
          });
          return record as CDRRecord;
        }).filter(isValidCDRRecord);

        const newFile: UploadedFile = {
          id: fileId, name: file.name, sourceName: userDefinedSourceName,
          records: cdrRecords, headers: finalHeadersToUse.length > 0 ? finalHeadersToUse : excelHeaderRow, 
        };
        addFile(newFile);

        if (cdrRecords.length === 0 && finalRowsToProcess.length > 0) {
            setProcessingFileStatuses(prev => prev.map(fs => fs.tempId === tempFileId ? {...fs, status: 'warning', message: 'Valid file, 0 CDR records extracted.'} : fs));
        } else if (cdrRecords.length === 0 && finalRowsToProcess.length === 0 && excelHeaderRow.length === 0) {
             setProcessingFileStatuses(prev => prev.map(fs => fs.tempId === tempFileId ? {...fs, status: 'warning', message: 'File appears to be empty.'} : fs));
        } else {
            setProcessingFileStatuses(prev => prev.map(fs => fs.tempId === tempFileId ? {...fs, status: 'success', message: `${cdrRecords.length} records added.`} : fs));
        }

      } catch (err) {
        console.error('Error processing file:', file.name, err);
        const errorMessage = err instanceof Error ? err.message : 'Unknown parsing error.';
        batchErrorMessages.push(`${file.name}: ${errorMessage}`);
        setProcessingFileStatuses(prev => prev.map(fs => fs.tempId === tempFileId ? {...fs, status: 'error', message: errorMessage} : fs));
      }
    }
    if (batchErrorMessages.length > 0) {
        setError(batchErrorMessages.join('\n'));
    }
    setIsLoading(false); // Global loading off after batch
  }, [addFile, setIsLoading, setError, uploadedFiles.length]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    multiple: true,
    getFilesFromEvent: async (event: any) => { 
      const files = Array.from(event.target.files || event.dataTransfer.files || []);
      return files.map((file: any, index: number) => Object.assign(file, {
        sourceName: `Case File ${uploadedFiles.length + index + 1}`
      }));
    }
  });

  const handleSourceNameChange = (newName: string) => { setCurrentEditValue(newName); };
  const saveSourceName = (fileId: string) => {
    if (currentEditValue.trim() !== "") updateFileSourceName(fileId, currentEditValue.trim());
    setEditingSourceNameId(null); setCurrentEditValue("");
  };
  const cancelEditSourceName = () => { setEditingSourceNameId(null); setCurrentEditValue(""); };
  const startEditing = (file: UploadedFile) => { setEditingSourceNameId(file.id); setCurrentEditValue(file.sourceName); };

  const getStatusIcon = (status: ProcessingFileStatus['status']) => {
    switch (status) {
      case 'processing': return <Loader2 className="h-4 w-4 animate-spin text-primary-dark" />;
      case 'success': return <Check className="h-4 w-4 text-success-dark" />;
      case 'warning': return <AlertTriangle className="h-4 w-4 text-warning-dark" />;
      case 'error': return <XCircle className="h-4 w-4 text-danger-dark" />;
      default: return <InfoIcon className="h-4 w-4 text-neutral-DEFAULT" />;
    }
  };

  return (
    <div className="bg-surface shadow-xl rounded-xl p-4 sm:p-6 border border-neutral-light">
      <h2 className="text-xl font-semibold text-textPrimary mb-4">Upload & Tag CDR Files</h2>
      {error && <div className="mb-4 p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light whitespace-pre-wrap">{error}</div>}
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-all duration-150 ease-in-out
                    ${isDragActive ? 'border-primary-dark bg-primary-lighter/60 scale-105 ring-4 ring-primary-light/40' : 'border-neutral-light hover:border-primary-DEFAULT hover:bg-primary-lighter/30'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-2 sm:mb-3 ${isDragActive ? 'text-primary-dark' : 'text-primary/90'}`} />
        {isDragActive ? (
          <p className="text-primary-dark font-semibold">Drop the files here ...</p>
        ) : (
          <p className="text-textSecondary text-sm sm:text-base">Drag 'n' drop Excel files here, or click to select (.xlsx, .xls)</p>
        )}
      </div>

      {processingFileStatuses.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-medium text-textPrimary mb-2">Current Batch Processing Status:</h3>
          <ul className="space-y-1.5 text-xs">
            {processingFileStatuses.map((fileStat) => (
              <li key={fileStat.tempId} className={`flex items-center p-2 rounded-md border ${
                fileStat.status === 'success' ? 'bg-success-lighter/50 border-success-light' :
                fileStat.status === 'warning' ? 'bg-warning-lighter/50 border-warning-light' :
                fileStat.status === 'error'   ? 'bg-danger-lighter/50 border-danger-light' :
                'bg-neutral-lightest/50 border-neutral-light'
              }`}>
                {getStatusIcon(fileStat.status)}
                <span className="ml-2 font-medium text-textPrimary truncate flex-1" title={fileStat.fileName}>{fileStat.fileName}</span>
                {fileStat.message && <span className="ml-2 text-textSecondary text-[11px]">{fileStat.message}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploadedFiles.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium text-textPrimary mb-3">Uploaded & Tagged Files:</h3>
          <ul className="space-y-3">
            {uploadedFiles.map((file) => (
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
                          type="text" value={currentEditValue} onChange={(e) => handleSourceNameChange(e.target.value)}
                          className="flex-grow text-sm p-1.5 border border-primary-light rounded-md w-full bg-white text-textPrimary placeholder-neutral-DEFAULT focus:ring-2 focus:ring-primary-light focus:border-primary-light"
                          placeholder="Enter source name" autoFocus
                          onKeyDown={(e) => { if (e.key === 'Enter') saveSourceName(file.id); if (e.key === 'Escape') cancelEditSourceName(); }}
                        />
                        <button onClick={() => saveSourceName(file.id)} className="p-1.5 text-success-dark hover:bg-success-lighter rounded-md" title="Save"><Check size={18}/></button>
                        <button onClick={cancelEditSourceName} className="p-1.5 text-danger hover:bg-danger-lighter rounded-md" title="Cancel"><X size={18}/></button>
                      </div>
                    ) : (
                      <span onClick={() => startEditing(file)} title="Click to edit source name"
                        className="text-sm font-semibold text-textPrimary cursor-pointer hover:text-primary-dark block truncate"
                      >
                        {file.sourceName || 'Unnamed Source'}
                      </span>
                    )}
                    <p className="text-xs text-textSecondary truncate" title={file.name}>File: {file.name} ({file.records.length} records)</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2 flex-shrink-0 self-end sm:self-center mt-1 sm:mt-0">
                  {editingSourceNameId !== file.id && (
                     <button onClick={() => startEditing(file)} title="Edit source name"
                        className="text-primary-dark/80 hover:text-primary-dark transition-colors p-1.5 rounded-md hover:bg-primary-lighter/40"
                      > <Edit3 size={18} /> </button>
                  )}
                  <button onClick={() => removeFile(file.id)} title="Remove file"
                    className="text-danger/80 hover:text-danger-dark transition-colors p-1.5 rounded-md hover:bg-danger-lighter/40"
                  > <XCircle size={20} /> </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default FileUpload;
