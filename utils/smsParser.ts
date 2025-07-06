
import { SMSRecord } from '../types';
import { parseDateTime } from './cdrUtils'; 

declare var XLSX: any; 

const EXPECTED_SMS_HEADERS_MAP: Record<string, keyof Omit<SMSRecord, 'id'|'sourceFileId'|'fileName'|'rowIndex'|'Initiator'|'Recipient'>> = {
  'StartTime': 'Timestamp', // Timestamp will store ISO string
  'A Party': 'PrimaryUserInRecord',
  'B Party': 'OtherPartyOrServiceInRecord',
  'Direction': 'OriginalDirection',
  'Message Content': 'Content',
  // For direct mapping if headers are already like SMSRecord fields
  'Timestamp': 'Timestamp',
  'Initiator': 'Initiator',
  'Recipient': 'Recipient',
  'OriginalDirection': 'OriginalDirection',
  'Content': 'Content',
  'PrimaryUserInRecord': 'PrimaryUserInRecord',
  'OtherPartyOrServiceInRecord': 'OtherPartyOrServiceInRecord',
};


export const parseSMSExcelFile = (file: File): Promise<{ records: SMSRecord[], headers: string[] }> => {
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
        
        const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false, dateNF: 'yyyy-mm-dd hh:mm:ss' });
        
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
              if (Object.keys(EXPECTED_SMS_HEADERS_MAP).some(knownHeader => cellStr.toLowerCase().includes(knownHeader.toLowerCase().substring(0, Math.min(5, knownHeader.length))))) {
                 currentMatchScore += 2;
              }
              if (EXPECTED_SMS_HEADERS_MAP[cellStr]) currentMatchScore += 3;
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
             rawHeaders = Object.keys(EXPECTED_SMS_HEADERS_MAP);
             console.warn("SMS Parser: Could not reliably determine headers, falling back to expected map keys.");
        }
        
        const jsonData: any[][] = sheetDataAsArrays.slice(headerRowIndex + 1);

        const parsedRecords: SMSRecord[] = jsonData.map((row, dataRowIndex) => {
          const tempRecord: Partial<SMSRecord> & { StartTime?: string; 'A Party'?: string; 'B Party'?: string; Direction?: string; 'Message Content'?: string } = {
            id: `${file.name}-${headerRowIndex + 1 + dataRowIndex}`, 
            sourceFileId: file.name, 
            fileName: file.name,
            rowIndex: headerRowIndex + 1 + dataRowIndex + 1, 
          };

          rawHeaders.forEach((header, colIndex) => {
            // Use the raw header name as the key for tempRecord to capture OCR structure first
            (tempRecord as any)[header] = String(row[colIndex] ?? '');
          });
          
          // Now map to SMSRecord structure
          const finalRecord: Partial<SMSRecord> = {
            ...tempRecord,
            Timestamp: tempRecord.StartTime ? (parseDateTime(tempRecord.StartTime)?.toISOString() || tempRecord.StartTime) : '',
            PrimaryUserInRecord: tempRecord['A Party'] || '',
            OtherPartyOrServiceInRecord: tempRecord['B Party'] || '',
            OriginalDirection: tempRecord.Direction || '',
            Content: tempRecord['Message Content'] || '',
          };

          if (finalRecord.OriginalDirection === 'SMSMO') {
            finalRecord.Initiator = finalRecord.PrimaryUserInRecord;
            finalRecord.Recipient = finalRecord.OtherPartyOrServiceInRecord;
          } else if (finalRecord.OriginalDirection === 'SMSMT') {
            finalRecord.Initiator = finalRecord.OtherPartyOrServiceInRecord;
            finalRecord.Recipient = finalRecord.PrimaryUserInRecord;
          } else {
            // Default or attempt to infer if direction is missing/unclear
            finalRecord.Initiator = finalRecord.PrimaryUserInRecord; // Default assumption
            finalRecord.Recipient = finalRecord.OtherPartyOrServiceInRecord;
          }
          
          // Clean up temporary OCR-based fields if they are not part of SMSRecord definition
          delete (finalRecord as any).StartTime;
          delete (finalRecord as any)['A Party'];
          delete (finalRecord as any)['B Party'];
          delete (finalRecord as any).Direction;
          delete (finalRecord as any)['Message Content'];

          return finalRecord as SMSRecord;
        });
        
        const validParsedRecords = parsedRecords.filter(pr => 
            pr.Timestamp && (pr.Initiator || pr.Recipient) && pr.Content
        );

        resolve({ records: validParsedRecords, headers: rawHeaders });
      } catch (e) {
        console.error("Error in parseSMSExcelFile:", e);
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
