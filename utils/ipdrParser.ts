
// Ensure SheetJS (xlsx) is loaded, e.g., via CDN in index.html:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
import { IPDRRecord } from '../types';
import { parseDateTime } from './cdrUtils'; 

declare var XLSX: any; // Declare XLSX globally if using CDN

// Define expected IPDR headers based on the provided image (OCR)
const EXPECTED_IPDR_HEADERS_MAP: Record<string, keyof IPDRRecord> = {
  'Public IP': 'publicIP',
  'Public Port': 'publicPort',
  'NAT Begin Time': 'natBeginTime',
  'NAT End Time': 'natEndTime',
  'Start Time': 'startTime',
  'End Time': 'endTime',
  'IMSI': 'imsi',
  'MSISDN': 'msisdn',
  'IMEISV': 'imeisv',
  'MS IP': 'msIP',
  'MS Port': 'msPort',
  'Server IP': 'serverIP',
  'Server Port': 'serverPort',
  'CGI': 'cgi',
  'SAI': 'sai',
  'ECGI': 'ecgi',
  'Uplink Traffic(Byte)': 'uplinkTrafficByte',
  'Downlink Traffic(Byte)': 'downlinkTrafficByte',
  'Category Type': 'categoryType',
  'Application Type': 'applicationType',
  'URL': 'url',
  // Add other direct mappings if common variations exist
  'uplink traffic(byte)': 'uplinkTrafficByte', // case variation
  'downlink traffic(byte)': 'downlinkTrafficByte', // case variation
};

const NUMERIC_IPDR_FIELDS: (keyof IPDRRecord)[] = ['publicPort', 'msPort', 'serverPort', 'uplinkTrafficByte', 'downlinkTrafficByte'];
const DATE_IPDR_FIELDS: (keyof IPDRRecord)[] = ['natBeginTime', 'natEndTime', 'startTime', 'endTime'];


export const parseIPDRExcelFile = (file: File): Promise<{ records: IPDRRecord[], headers: string[] }> => {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('SheetJS (XLSX) library is not loaded. Please ensure it is included.'));
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
              // Check if it's likely a header (not purely numeric, or matches known headers)
              if (isNaN(Number(cellStr))) { // Prefer non-numeric cells for headers
                 currentMatchScore++;
              }
              // Bonus for matching keys in EXPECTED_IPDR_HEADERS_MAP (case-insensitive partial match for robustness)
              if (Object.keys(EXPECTED_IPDR_HEADERS_MAP).some(knownHeader => cellStr.toLowerCase().includes(knownHeader.toLowerCase().substring(0, Math.min(5, knownHeader.length))))) {
                 currentMatchScore += 2;
              }
              if (EXPECTED_IPDR_HEADERS_MAP[cellStr]) { // Exact match bonus
                  currentMatchScore += 3;
              }
            }
          }
          // A good header row should have a decent number of non-empty cells and high match score
          // Ensure at least a few cells look like headers.
          if (potentialHeadersInRowCount > 3 && currentMatchScore > bestHeaderMatchScore) {
            bestHeaderMatchScore = currentMatchScore;
            headerRowIndex = i;
          }
        }
        
        if (sheetDataAsArrays.length > headerRowIndex) {
            rawHeaders = sheetDataAsArrays[headerRowIndex].map((cell: any, colIndex: number) => 
                cell && String(cell).trim() ? String(cell).trim() : `UNKNOWN_HEADER_${colIndex + 1}`
            ).filter(h => h); // Filter out any completely empty header cells
        } else { 
             rawHeaders = Object.keys(EXPECTED_IPDR_HEADERS_MAP);
             console.warn("Could not reliably determine headers, falling back to expected map keys.");
        }
        
        const jsonData: any[][] = sheetDataAsArrays.slice(headerRowIndex + 1);

        const parsedRecords: IPDRRecord[] = jsonData.map((row, dataRowIndex) => {
          const record: Partial<IPDRRecord> = {
            id: `${file.name}-${headerRowIndex + 1 + dataRowIndex}`, 
            sourceFileId: file.name, 
            fileName: file.name,
            rowIndex: headerRowIndex + 1 + dataRowIndex + 1, 
          };

          rawHeaders.forEach((header, colIndex) => {
            const originalHeaderKeyForMapping = header; 
            
            let mappedKeyCandidate = EXPECTED_IPDR_HEADERS_MAP[originalHeaderKeyForMapping] || 
                                     originalHeaderKeyForMapping.toLowerCase().replace(/\s+/g, '_').replace(/[^\w_]/gi, '');
            if (mappedKeyCandidate === "") {
                mappedKeyCandidate = `UNKNOWN_EMPTY_IPDR_HEADER_COL_${colIndex}`;
            }
            const mappedKey = mappedKeyCandidate;
            
            let value = row[colIndex];

            if (value === undefined || value === null || String(value).trim() === "" || String(value).toLowerCase() === "n/a") {
                (record as any)[mappedKey] = undefined; 
            } else {
                if (NUMERIC_IPDR_FIELDS.includes(mappedKey as keyof IPDRRecord)) {
                  const numVal = parseFloat(String(value));
                  (record as any)[mappedKey] = isNaN(numVal) ? undefined : numVal;
                } else if (DATE_IPDR_FIELDS.includes(mappedKey as keyof IPDRRecord) && value) {
                  const dateStr = String(value);
                  const parsedDate = parseDateTime(dateStr);
                  (record as any)[mappedKey] = parsedDate ? parsedDate.toISOString() : dateStr; 
                } else {
                  (record as any)[mappedKey] = String(value);
                }
            }
          });
          return record as IPDRRecord;
        });
        
        const validParsedRecords = parsedRecords.filter(pr => Object.values(pr).some(val => val !== undefined && val !== null && String(val).trim() !== ""));

        resolve({ records: validParsedRecords, headers: rawHeaders });
      } catch (e) {
        console.error("Error in parseIPDRExcelFile:", e);
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
