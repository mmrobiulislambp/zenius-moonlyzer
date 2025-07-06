
import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { v4 as uuidv4 } from 'uuid';
import { UploadCloud } from 'lucide-react';
import { useLACContext } from '../contexts/LACContext'; // Use LACContext
import { UploadedLACFile } from '../types'; // Use LAC types
import { parseLACExcelFile } from '../utils/lacParser'; // Use new LAC parser

interface FileWithSourceName extends File {
  sourceName?: string;
}

const LACFileUpload: React.FC = () => {
  const { addLACFile, setIsLoading, setError, error, uploadedLACFiles } = useLACContext();

  const onDrop = useCallback(async (acceptedFiles: FileWithSourceName[]) => {
    setIsLoading(true);
    setError(null);
    let fileIndexOffset = uploadedLACFiles.length;

    for (const file of acceptedFiles) {
      try {
        const { records, headers } = await parseLACExcelFile(file); // Use LAC parser
        
        const fileId = uuidv4();
        const userDefinedSourceName = file.sourceName || `LAC Data Source ${fileIndexOffset + 1}`;
        fileIndexOffset++;

        if (records.length === 0 && headers.length === 0) {
             console.warn(`File ${file.name} appears empty or not a valid LAC/Cell data format.`);
        }
        
        const newFile: UploadedLACFile = { // Use UploadedLACFile type
          id: fileId,
          name: file.name,
          sourceName: userDefinedSourceName,
          records: records,
          headers: headers,
        };
        addLACFile(newFile);

      } catch (err) {
        console.error('Error processing LAC/Cell file:', file.name, err);
        setError(`Error processing LAC/Cell file ${file.name}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    setIsLoading(false);
  }, [addLACFile, setIsLoading, setError, uploadedLACFiles.length]);

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
        sourceName: `LAC Source ${uploadedLACFiles.length + index + 1}` 
      }));
    }
  });

  return (
    <div className="bg-surface shadow-xl rounded-xl p-4 sm:p-6 border border-neutral-light">
      <h2 className="text-xl font-semibold text-textPrimary mb-4">Upload LAC & Cell Data Files</h2>
      {error && <div className="mb-4 p-3 bg-danger-lighter text-danger-darker rounded-md border border-danger-light">{error}</div>}
      
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 sm:p-8 text-center cursor-pointer transition-all duration-150 ease-in-out
                    ${isDragActive ? 'border-primary-dark bg-primary-lighter/60 scale-105 ring-4 ring-primary-light/40' : 'border-neutral-light hover:border-primary-DEFAULT hover:bg-primary-lighter/30'}`}
      >
        <input {...getInputProps()} />
        <UploadCloud className={`mx-auto h-10 w-10 sm:h-12 sm:w-12 mb-2 sm:mb-3 ${isDragActive ? 'text-primary-dark' : 'text-primary/90'}`} />
        {isDragActive ? (
          <p className="text-primary-dark font-semibold">Drop LAC/Cell data files here ...</p>
        ) : (
          <p className="text-textSecondary text-sm sm:text-base">Drag 'n' drop LAC/Cell Excel files here, or click to select (.xlsx, .xls)</p>
        )}
      </div>
    </div>
  );
};

export default LACFileUpload;
