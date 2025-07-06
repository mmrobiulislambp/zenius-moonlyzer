
import { LACRecord } from '../types';
import { parseDateTime } from './cdrUtils'; 

declare var XLSX: any; 

// Define expected LAC/Cell headers based on the provided image and typical data
// This map helps normalize column names.
const EXPECTED_LAC_HEADERS_MAP: Record<string, keyof LACRecord> = {
  'DATE_TIME': 'DATE_TIME',
  'MSISDN': 'MSISDN',
  'OTHER_PARTY_NUMBER': 'OTHER_PARTY_NUMBER',
  'USAGE_TYPE': 'USAGE_TYPE',
  'CALL_DURATION': 'CALL_DURATION',
  'LAC': 'LAC',
  'CELL_ID': 'CELL_ID',
  'IMEI': 'IMEI',
  'ADDRESS': 'ADDRESS', // Added ADDRESS
  // Case variations or common alternatives can be added here:
  'Date Time': 'DATE_TIME',
  'Call Duration': 'CALL_DURATION',
  'Lac': 'LAC',
  'Cell ID': 'CELL_ID',
  'Other Party Number': 'OTHER_PARTY_NUMBER',
  'Usage Type': 'USAGE_TYPE',
  'Address': 'ADDRESS', // Added Address
};

const NUMERIC_LAC_FIELDS: (keyof LACRecord)[] = ['CALL_DURATION']; // Assuming CALL_DURATION is numeric
const DATE_LAC_FIELDS: (keyof LACRecord)[] = ['DATE_TIME'];

export const parseLACExcelFile = (file: File): Promise<{ records: LACRecord[], headers: string[] }> => {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('SheetJS (XLSX) library is not loaded.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true }); 
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, dateNF: 'dd/mm/yyyy hh:mm:ss' });
        
        let rawHeaders: string[] = [];
        let headerRowIndex = 0;
        let bestHeaderMatchScore = -1;
        const MAX_ROWS_TO_SCAN_FOR_HEADER = 5;

        for (let i = 0; i < Math.min(MAX_ROWS_TO_SCAN_FOR_HEADER, sheetDataAsArrays.length); i++) {
          const currentRow = sheetDataAsArrays[i];
          let currentMatchScore = 0;
          let potentialHeadersInRowCount = 0;
          
          for (const cellValue of currentRow) {
            const cellStr = String(cellValue).trim();
            if (cellStr) {
              potentialHeadersInRowCount++;
              if (isNaN(Number(cellStr))) currentMatchScore++;
              if (Object.keys(EXPECTED_LAC_HEADERS_MAP).some(knownHeader => cellStr.toLowerCase().includes(knownHeader.toLowerCase().substring(0, Math.min(5, knownHeader.length))))) {
                 currentMatchScore += 2;
              }
              if (EXPECTED_LAC_HEADERS_MAP[cellStr]) currentMatchScore += 3;
            }
          }
          if (potentialHeadersInRowCount > 3 && currentMatchScore > bestHeaderMatchScore) {
            bestHeaderMatchScore = currentMatchScore;
            headerRowIndex = i;
          }
        }
        
        if (sheetDataAsArrays.length > headerRowIndex) {
            rawHeaders = sheetDataAsArrays[headerRowIndex].map((cell: any, colIndex: number) => 
                cell && String(cell).trim() ? String(cell).trim() : `UNKNOWN_HEADER_${colIndex + 1}`
            ).filter(h => h);
        } else { 
             rawHeaders = Object.keys(EXPECTED_LAC_HEADERS_MAP); // Fallback
             console.warn("LAC Parser: Could not reliably determine headers, falling back to expected map keys.");
        }
        
        const jsonData: any[][] = sheetDataAsArrays.slice(headerRowIndex + 1);

        const parsedRecords: LACRecord[] = jsonData.map((row, dataRowIndex) => {
          const record: Partial<LACRecord> = {
            id: `${file.name}-${headerRowIndex + 1 + dataRowIndex}`, 
            sourceFileId: file.name, 
            fileName: file.name,
            rowIndex: headerRowIndex + 1 + dataRowIndex + 1, 
          };

          rawHeaders.forEach((header, colIndex) => {
            let mappedKeyCandidate = EXPECTED_LAC_HEADERS_MAP[header] || header.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
            if (mappedKeyCandidate === "") {
                mappedKeyCandidate = `UNKNOWN_EMPTY_LAC_HEADER_COL_${colIndex}`;
            }
            const finalMappedKey = mappedKeyCandidate;
            
            let value = row[colIndex];

            if (value === undefined || value === null || String(value).trim() === "" || String(value).toLowerCase() === "n/a") {
                (record as any)[finalMappedKey] = undefined; 
            } else {
                if (NUMERIC_LAC_FIELDS.includes(finalMappedKey as keyof LACRecord)) {
                  const numVal = parseFloat(String(value));
                  (record as any)[finalMappedKey] = isNaN(numVal) ? undefined : numVal;
                } else if (DATE_LAC_FIELDS.includes(finalMappedKey as keyof LACRecord) && value) {
                  const dateStr = String(value);
                  const parsedDate = parseDateTime(dateStr); // Use existing robust date parser
                  (record as any)[finalMappedKey] = parsedDate ? parsedDate.toISOString() : dateStr; 
                } else {
                  (record as any)[finalMappedKey] = String(value);
                }
            }
          });
          return record as LACRecord;
        });
        
        const validParsedRecords = parsedRecords.filter(pr => 
            Object.values(pr).some(val => val !== undefined && val !== null && String(val).trim() !== "") &&
            pr.LAC && pr.CELL_ID && pr.DATE_TIME && pr.MSISDN // Core fields for this analysis
        );

        resolve({ records: validParsedRecords, headers: rawHeaders });
      } catch (e) {
        console.error("Error in parseLACExcelFile:", e);
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
