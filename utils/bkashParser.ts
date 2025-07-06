
import { BkashRecord } from '../types';
import { parseDateTime } from './cdrUtils'; 

declare var XLSX: any; 

// Updated flexible header mapping for bKash statements based on user image
const EXPECTED_BKASH_HEADERS_MAP: Record<string, keyof BkashRecord> = {
  // Serial Number
  'sl': 'sl', 'ক্রমিক নং': 'sl', 'ক্রমিক': 'sl', 'si': 'sl',

  // Transaction ID
  'trx id': 'trxId', 'transaction id': 'trxId', 'ট্রানজেকশন আইডি': 'trxId',

  // Transaction Date & Time
  'transaction date': 'transactionDate', 'date time': 'transactionDate', 'লেনদেনের সময়': 'transactionDate', 'তারিখ ও সময়': 'transactionDate',

  // Transaction Type / Particulars
  'trx type': 'trxType', 'transaction type': 'trxType', 'type': 'trxType', 'particulars': 'trxType', 'লেনদেনের বিবরণ': 'trxType',

  // Sender
  'sender': 'sender', 'প্রেরক': 'sender',

  // Receiver
  'receiver': 'receiver', 'প্রাপক': 'receiver',

  // Receiver Name
  'receiver name': 'receiverName',

  // Reference
  'reference': 'reference', 'ref': 'reference', 'রেফারেন্স': 'reference',

  // Transacted Amount
  'transacted amount': 'transactedAmount', 'amount': 'transactedAmount', 'টাকার পরিমাণ': 'transactedAmount', 'পরিমাণ': 'transactedAmount',

  // Fee
  'fee': 'fee', 'ফি': 'fee',

  // Balance
  'balance': 'balance', 'বর্তমান ব্যালেন্স': 'balance', 'ব্যালেন্স': 'balance',
};

const NUMERIC_BKASH_FIELDS: (keyof BkashRecord)[] = ['transactedAmount', 'fee', 'balance'];
const DATE_BKASH_FIELDS: (keyof BkashRecord)[] = ['transactionDate'];
const CRITICAL_BKASH_KEYS: (keyof BkashRecord)[] = ['trxId', 'transactionDate', 'sender', 'receiver', 'transactedAmount'];


export const getBkashCanonicalKey = (rawHeader: string): string | null => {
  const originalTrimmedLower = String(rawHeader || '').trim().toLowerCase();
  if (!originalTrimmedLower) return null;

  if (EXPECTED_BKASH_HEADERS_MAP[originalTrimmedLower]) {
    return EXPECTED_BKASH_HEADERS_MAP[originalTrimmedLower] as string;
  }
  const variationsToTest = [
    originalTrimmedLower.replace(/[\s._-]+/g, ''), // Compacted
    originalTrimmedLower.replace(/[\s._-]+/g, ' '), // Spaces only
  ];
  for (const variation of variationsToTest) {
    if (EXPECTED_BKASH_HEADERS_MAP[variation]) {
      return EXPECTED_BKASH_HEADERS_MAP[variation] as string;
    }
  }
  const sortedKnownKeys = Object.keys(EXPECTED_BKASH_HEADERS_MAP).sort((a,b) => b.length - a.length);
  for (const knownMapKey of sortedKnownKeys) {
    if (originalTrimmedLower.includes(knownMapKey)) {
      return EXPECTED_BKASH_HEADERS_MAP[knownMapKey] as string;
    }
  }
  return null;
};

const inferTransactionDirection = (trxType: string): 'DEBIT' | 'CREDIT' | 'OTHER' => {
    const lowerTrxType = trxType.toLowerCase();
    if (lowerTrxType.includes('send money') || lowerTrxType.includes('payment') || 
        lowerTrxType.includes('cash out') || lowerTrxType.includes('airtime topup') || 
        lowerTrxType.includes('mobile recharge')) {
        return 'DEBIT';
    }
    if (lowerTrxType.includes('cash in') || lowerTrxType.includes('receive money') || 
        lowerTrxType.includes('received') || lowerTrxType.includes('add money')) {
        return 'CREDIT';
    }
    return 'OTHER'; // For types like 'Interest', 'Bonus', 'Reversal' etc. that might not be simple DR/CR
};


export const parseBkashExcelFile = (file: File): Promise<{ records: BkashRecord[], headers: string[] }> => {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('SheetJS (XLSX) library is not loaded.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true, dateNF: 'dd-mmm-yy hh:mm:ss AM/PM'}); 
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false, dateNF: 'dd-mmm-yy hh:mm:ss AM/PM'});
        
        let finalIdentifiedRawHeaders: string[] = [];
        let headerRowIndex = -1;
        let bestScore = -1;

        for (let i = 0; i < Math.min(10, sheetDataAsArrays.length); i++) {
          const currentRowAsStrings = sheetDataAsArrays[i].map(cell => String(cell == null ? "" : cell).trim());
          if (currentRowAsStrings.every(s => s === '')) continue; 

          let currentScore = 0;
          const potentialRawHeadersThisRow: string[] = [];
          const matchedCanonicalKeysThisRow = new Set<keyof BkashRecord>();
          
          currentRowAsStrings.forEach(cellStr => {
            potentialRawHeadersThisRow.push(cellStr); 
            if (cellStr) {
              const canonicalKey = getBkashCanonicalKey(cellStr);
              if (canonicalKey) {
                currentScore += 1; 
                matchedCanonicalKeysThisRow.add(canonicalKey);
                if (CRITICAL_BKASH_KEYS.includes(canonicalKey)) currentScore += 3;
              }
              const lowerCellStr = cellStr.toLowerCase();
              const isLikelyData = /^\d{8,}$/.test(cellStr) && !lowerCellStr.includes("account") && !lowerCellStr.includes("acc") && !lowerCellStr.includes("id");
              const isLikelyDateNotHeader = String(cellStr).match(/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/) || String(cellStr).match(/\d{1,2}-(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)-\d{2}/i);
              if(isLikelyData || (isLikelyDateNotHeader && !lowerCellStr.includes("date") && !lowerCellStr.includes("time"))) currentScore -=3;
            }
          });
          
          const nonEmptyHeadersInRow = potentialRawHeadersThisRow.filter(h => h && h !== '').length;
          if (nonEmptyHeadersInRow < 3) continue; 

          let criticalFoundCount = 0;
          CRITICAL_BKASH_KEYS.forEach(criticalKey => {
              if (matchedCanonicalKeysThisRow.has(criticalKey)) criticalFoundCount++;
          });

          if (criticalFoundCount < 2 ) currentScore -= 5; 
          else currentScore += criticalFoundCount * 2; 
          
          const normalizedScore = currentScore / Math.max(1, nonEmptyHeadersInRow); 

          if (normalizedScore > bestScore) {
            bestScore = normalizedScore;
            headerRowIndex = i;
            finalIdentifiedRawHeaders = potentialRawHeadersThisRow; 
          }
        }
        
        if (headerRowIndex === -1 || bestScore < 0.8) {
            console.warn(`bKash Parser: Weak header detection (score: ${bestScore.toFixed(2)}). File: ${file.name}. Defaulting to a standard set.`);
            finalIdentifiedRawHeaders = ['SL', 'Trx Id', 'Transaction Date', 'Trx Type', 'Sender', 'Receiver', 'Receiver Name', 'Reference', 'Transacted Amount', 'Fee', 'Balance']; 
            headerRowIndex = 0;
        }
        
        let lastNonEmptyIdx = finalIdentifiedRawHeaders.length -1;
        while(lastNonEmptyIdx >= 0 && (!finalIdentifiedRawHeaders[lastNonEmptyIdx] || finalIdentifiedRawHeaders[lastNonEmptyIdx].trim() === '')) {
            lastNonEmptyIdx--;
        }
        finalIdentifiedRawHeaders = finalIdentifiedRawHeaders.slice(0, lastNonEmptyIdx + 1);
        
        const headerMap = new Map<number, { canonicalKey: keyof BkashRecord, rawHeader: string }>();
        finalIdentifiedRawHeaders.forEach((rawHeader, index) => {
            if(!rawHeader || rawHeader.trim() === '') return; 
            const canonicalKey = getBkashCanonicalKey(rawHeader);
            if (canonicalKey) {
                headerMap.set(index, { canonicalKey: canonicalKey as keyof BkashRecord, rawHeader });
            }
        });
        
        const dataRows: any[][] = sheetDataAsArrays.slice(headerRowIndex + 1);
        const parsedRecords: BkashRecord[] = [];

        dataRows.forEach((row, dataRowIndex) => {
          if (row.every(cell => cell == null || String(cell).trim() === '')) return; 

          const record: Partial<BkashRecord> = {
            id: `${file.name}-${headerRowIndex + 1 + dataRowIndex}-${Math.random().toString(36).substring(2, 7)}`, 
            sourceFileId: file.name, 
            fileName: file.name,
            rowIndex: headerRowIndex + 1 + dataRowIndex + 1, 
          };
          
          let hasEssentialData = false;
          
          headerMap.forEach(({ canonicalKey }, colIndex) => {
            if (colIndex >= row.length) return; 
            let value = row[colIndex];

            if (value === undefined || value === null || String(value).trim() === "" || String(value).toLowerCase() === "n/a") {
                (record as any)[canonicalKey] = undefined; 
                return;
            }
            
            if (NUMERIC_BKASH_FIELDS.includes(canonicalKey)) {
              const numValStr = String(value).replace(/,/g, '').trim(); // Remove commas only
              const numVal = parseFloat(numValStr);
              (record as any)[canonicalKey] = isNaN(numVal) ? undefined : numVal;
            } else if (DATE_BKASH_FIELDS.includes(canonicalKey)) {
              let parsedDate: Date | null = null;
              if (value instanceof Date && !isNaN(value.getTime())) parsedDate = value;
              else parsedDate = parseDateTime(String(value)); // Use robust parser
              (record as any)[canonicalKey] = parsedDate ? parsedDate.toISOString() : String(value);
            } else {
              (record as any)[canonicalKey] = String(value).trim();
            }
            
            if (CRITICAL_BKASH_KEYS.includes(canonicalKey) && record[canonicalKey] && String(record[canonicalKey]).trim() !== '') {
                 hasEssentialData = true;
            }
          });
          
          if (record.trxType) {
              record.transactionDirection = inferTransactionDirection(record.trxType);
          }

          if (hasEssentialData && typeof record.transactedAmount === 'number') {
             parsedRecords.push(record as BkashRecord);
          }
        });
        
        resolve({ records: parsedRecords, headers: finalIdentifiedRawHeaders });
      } catch (e) {
        console.error("Error in parseBkashExcelFile:", e);
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
