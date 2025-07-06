
import { NagadRecord } from '../types';
import { parseDateTime } from './cdrUtils'; // Using existing robust date parser

declare var XLSX: any; // Declare XLSX globally if using CDN

// More comprehensive map, keys are lowercase and normalized (e.g. spaces and common separators removed or standardized)
// Values are the canonical keys used in the NagadRecord interface.
const EXPECTED_NAGAD_HEADERS_MAP: Record<string, keyof NagadRecord> = {
  // SI / Serial
  'si': 'si', 'sl': 'si', 'slno': 'si', 'serialno': 'si', 'serialnumber': 'si', 'sl.': 'si', 'si.': 'si', 's.l': 'si', 's l': 'si', 'ক্রমিকনং': 'si',

  // Transaction Date Time
  'txndatetime': 'TXN_DATE_TIME', 'transactiondatetime': 'TXN_DATE_TIME', 'datetime': 'TXN_DATE_TIME',
  'dateandtime': 'TXN_DATE_TIME', 'date time': 'TXN_DATE_TIME', 'time': 'TXN_DATE_TIME', 'date': 'TXN_DATE_TIME',
  'txn date time': 'TXN_DATE_TIME', // Keep space version for direct match if normalization keeps it
  'লেনদেনেরসময়': 'TXN_DATE_TIME',

  // Transaction ID
  'txnid': 'TXN_ID', 'transactionid': 'TXN_ID', 'trxid': 'TXN_ID', 'txno': 'TXN_ID', 'transactionno': 'TXN_ID',
  'txn id': 'TXN_ID', // Keep space version
  'txn_id': 'TXN_ID', // Keep underscore version
  'লেনদেনআইডি': 'TXN_ID',

  // Transaction Type
  'txntype': 'TXN_TYPE', 'transactiontype': 'TXN_TYPE', 'type': 'TXN_TYPE', 'particulars': 'TXN_TYPE',
  'details': 'TXN_TYPE', 'description': 'TXN_TYPE', 'বিবরণ': 'TXN_TYPE',

  // Statement For Account
  'statementforacc': 'STATEMENT_FOR_ACC', 'statementforaccount': 'STATEMENT_FOR_ACC',
  'accountnumber': 'STATEMENT_FOR_ACC', 'accno': 'STATEMENT_FOR_ACC', 'account no': 'STATEMENT_FOR_ACC',
  'statement for acc': 'STATEMENT_FOR_ACC', // Keep space version

  // Transaction With Account
  'txnwithacc': 'TXN_WITH_ACC', 'transactionwithaccount': 'TXN_WITH_ACC',
  'otherpartyaccount': 'TXN_WITH_ACC', 'tofromaccount': 'TXN_WITH_ACC', 'toaccount': 'TXN_WITH_ACC', 'fromaccount': 'TXN_WITH_ACC',
  'txn with acc': 'TXN_WITH_ACC', // Keep space version

  // Channel
  'channel': 'CHANNEL', 'মাধ্যম': 'CHANNEL',

  // Reference
  'reference': 'REFERENCE', 'remarks': 'REFERENCE', 'narration': 'REFERENCE', 'সূত্র': 'REFERENCE',

  // Transaction Type DR/CR
  'txntypedrcr': 'TXN_TYPE_DR_CR', 'drcr': 'TXN_TYPE_DR_CR', 'debitcredit': 'TXN_TYPE_DR_CR', 'creditdebit': 'TXN_TYPE_DR_CR',
  'transactioncategory': 'TXN_TYPE_DR_CR', 'category': 'TXN_TYPE_DR_CR',
  'txn type dr cr': 'TXN_TYPE_DR_CR', // Keep space version
  'ডেবিটক্রেডিট': 'TXN_TYPE_DR_CR',

  // Transaction Amount
  'txnamt': 'TXN_AMT', 'transactionamount': 'TXN_AMT', 'amount': 'TXN_AMT',
  'debitamount': 'TXN_AMT', 'creditamount': 'TXN_AMT',
  'txn amt': 'TXN_AMT', // Keep space version
  'টাকারপরিমাণ': 'TXN_AMT',

  // Available Balance After Transaction
  'availableblcaftertxn': 'AVAILABLE_BLC_AFTER_TXN', 'availablebalanceaftertxn': 'AVAILABLE_BLC_AFTER_TXN',
  'availablebalance': 'AVAILABLE_BLC_AFTER_TXN', 'balance': 'AVAILABLE_BLC_AFTER_TXN', 'closingbalance': 'AVAILABLE_BLC_AFTER_TXN',
  'available blc after txn': 'AVAILABLE_BLC_AFTER_TXN', // Keep space version
  'অবশিষ্টব্যালেন্স': 'AVAILABLE_BLC_AFTER_TXN',

  // Status
  'status': 'STATUS', 'transactionstatus': 'STATUS', 'অবস্থা': 'STATUS',
};

const NUMERIC_NAGAD_FIELDS: (keyof NagadRecord)[] = ['TXN_AMT', 'AVAILABLE_BLC_AFTER_TXN'];
const DATE_NAGAD_FIELDS: (keyof NagadRecord)[] = ['TXN_DATE_TIME'];
// From OCR - use this as a strong hint if other methods are weak
export const HEADERS_FROM_OCR: string[] = [ 
  'SI.', 'TXN_DATE_TIME', 'TXN ID', 'TXN TYPE', 'STATEMENT_FOR_ACC', 
  'TXN_WITH_ACC', 'CHANNEL', 'REFERENCE', 'TXN_TYPE_DR_CR', 
  'TXN_AMT', 'AVAILABLE_BLC_AFTER_TXN', 'STATUS'
];

const CRITICAL_CANONICAL_KEYS: (keyof NagadRecord)[] = ['TXN_ID', 'TXN_DATE_TIME', 'TXN_AMT', 'STATEMENT_FOR_ACC', 'TXN_TYPE_DR_CR', 'TXN_TYPE'];
const MIN_CRITICAL_HEADERS_FOR_CONSIDERATION = 3; 

// Enhanced normalization and lookup for header mapping
export const getCanonicalKeyFromRawHeader = (rawHeader: string): keyof NagadRecord | null => {
  const originalTrimmedLower = String(rawHeader || '').trim().toLowerCase();
  if (!originalTrimmedLower) return null;

  // Try direct match on already normalized keys in map
  if (EXPECTED_NAGAD_HEADERS_MAP[originalTrimmedLower]) {
    return EXPECTED_NAGAD_HEADERS_MAP[originalTrimmedLower];
  }

  // Normalize further: replace common separators with a standard one (e.g., none, or underscore)
  // and remove all other non-alphanumeric characters for broader matching.
  const variationsToTest = [
    originalTrimmedLower, // Original trimmed lowercase
    originalTrimmedLower.replace(/[\s._-]+/g, ''), // Compacted (no spaces, underscores, dots, hyphens)
    originalTrimmedLower.replace(/[\s._-]+/g, ' '), // Spaces only (multi-space to single)
    originalTrimmedLower.replace(/[\s.-]+/g, '_'), // Underscores only
  ];

  for (const variation of variationsToTest) {
    if (EXPECTED_NAGAD_HEADERS_MAP[variation]) {
      return EXPECTED_NAGAD_HEADERS_MAP[variation];
    }
  }
  
  // Fallback: check if any known map key (which are normalized) is INCLUDED in the original trimmed lowercase header
  // This is a bit looser but can catch headers like "Transaction ID (TrxID)" if "transaction id" is a known key.
  const sortedKnownKeys = Object.keys(EXPECTED_NAGAD_HEADERS_MAP).sort((a,b) => b.length - a.length); // Longer keys first
  for (const knownMapKey of sortedKnownKeys) {
    if (originalTrimmedLower.includes(knownMapKey)) {
      return EXPECTED_NAGAD_HEADERS_MAP[knownMapKey];
    }
  }

  return null;
};


export const parseNagadExcelFile = (file: File): Promise<{ records: NagadRecord[], headers: string[], identifiedRawHeaders?: string[] }> => {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('SheetJS (XLSX) library is not loaded.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true, dateNF: 'dd/mm/yyyy hh:mm:ss' }); 
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        const sheetDataAsArrays: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: null, raw: false, dateNF: 'dd/mm/yyyy hh:mm:ss'});
        
        let finalIdentifiedRawHeaders: string[] = [];
        let headerRowIndex = -1;
        let bestScore = -1;

        for (let i = 0; i < Math.min(10, sheetDataAsArrays.length); i++) {
          const currentRowAsStrings = sheetDataAsArrays[i].map(cell => String(cell == null ? "" : cell).trim());
          if (currentRowAsStrings.every(s => s === '')) continue; 

          let currentScore = 0;
          const potentialRawHeadersThisRow: string[] = [];
          const matchedCanonicalKeysThisRow = new Set<keyof NagadRecord>();
          
          currentRowAsStrings.forEach(cellStr => {
            potentialRawHeadersThisRow.push(cellStr); 
            if (cellStr) {
              const canonicalKey = getCanonicalKeyFromRawHeader(cellStr);
              if (canonicalKey) {
                currentScore += 1; 
                matchedCanonicalKeysThisRow.add(canonicalKey);
                if (CRITICAL_CANONICAL_KEYS.includes(canonicalKey)) currentScore += 3; // Higher weight for critical keys
                // Bonus if it's an OCR header (implies it's a good candidate format)
                if (HEADERS_FROM_OCR.some(ocrH => ocrH.toLowerCase() === cellStr.toLowerCase())) currentScore += 2;
              }
              // Penalize if a cell looks like data rather than a header
              const lowerCellStr = cellStr.toLowerCase();
              const isLikelyData = /^\d{8,}$/.test(cellStr) && !lowerCellStr.includes("account") && !lowerCellStr.includes("acc") && !lowerCellStr.includes("id"); // Long numbers
              const isLikelyDateNotHeader = String(cellStr).match(/^\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/) && !lowerCellStr.includes("date") && !lowerCellStr.includes("time");
              if(isLikelyData || isLikelyDateNotHeader) currentScore -=3;
            }
          });
          
          const nonEmptyHeadersInRow = potentialRawHeadersThisRow.filter(h => h && h !== '').length;
          if (nonEmptyHeadersInRow < MIN_CRITICAL_HEADERS_FOR_CONSIDERATION) continue; 

          let criticalFoundCount = 0;
          CRITICAL_CANONICAL_KEYS.forEach(criticalKey => {
              if (matchedCanonicalKeysThisRow.has(criticalKey)) criticalFoundCount++;
          });

          if (criticalFoundCount < MIN_CRITICAL_HEADERS_FOR_CONSIDERATION -1) {
            currentScore -= 5; // Penalize if not enough critical headers are mapped
          } else {
            currentScore += criticalFoundCount * 2; // Bonus for mapping critical headers
          }
          
          // Normalize score by number of non-empty cells to avoid bias towards rows with many empty cells
          const normalizedScore = currentScore / Math.max(1, nonEmptyHeadersInRow); 

          if (normalizedScore > bestScore) {
            bestScore = normalizedScore;
            headerRowIndex = i;
            finalIdentifiedRawHeaders = potentialRawHeadersThisRow; 
          }
        }
        
        // Fallback or warning if header detection is weak
        if (headerRowIndex === -1 || bestScore < 0.9) { // Adjusted threshold for more confidence
            console.warn(`Nagad Parser: Could not confidently identify a header row (bestScore: ${bestScore.toFixed(2)}). File: ${file.name}. Using OCR default headers as a fallback.`);
            finalIdentifiedRawHeaders = [...HEADERS_FROM_OCR]; 
            // Try to find a row that starts with 'SI.' or 'Sl No' as a better guess for headerRowIndex if fallback is used
            const siIndex = sheetDataAsArrays.findIndex(row => row.some(cell => String(cell).trim().toLowerCase().match(/^(si\.?|sl\.? ?no\.?)$/)));
            headerRowIndex = siIndex !== -1 ? siIndex : 0; // Default to 0 if 'SI.' not found
        }
        
        // Trim trailing empty headers from the identified list
        let lastNonEmptyIdx = finalIdentifiedRawHeaders.length -1;
        while(lastNonEmptyIdx >= 0 && (!finalIdentifiedRawHeaders[lastNonEmptyIdx] || finalIdentifiedRawHeaders[lastNonEmptyIdx].trim() === '')) {
            lastNonEmptyIdx--;
        }
        finalIdentifiedRawHeaders = finalIdentifiedRawHeaders.slice(0, lastNonEmptyIdx + 1);
        
        const headerMap = new Map<number, { canonicalKey: keyof NagadRecord, rawHeader: string }>();
        finalIdentifiedRawHeaders.forEach((rawHeader, index) => {
            if(!rawHeader || rawHeader.trim() === '') return; 
            const canonicalKey = getCanonicalKeyFromRawHeader(rawHeader);
            if (canonicalKey) {
                headerMap.set(index, { canonicalKey, rawHeader });
            } else {
                // console.warn(`Nagad Parser: No canonical key found for raw header "${rawHeader}" at index ${index}. It will be part of display headers but not mapped to data fields.`);
            }
        });
        
        let criticalMappedCount = 0;
        headerMap.forEach(val => { if (CRITICAL_CANONICAL_KEYS.includes(val.canonicalKey)) criticalMappedCount++; });

        if (criticalMappedCount < MIN_CRITICAL_HEADERS_FOR_CONSIDERATION -1 ) { // Reduced strictness slightly
             console.error(`Nagad Parser: Critical header mapping failed for ${file.name}. Found ${criticalMappedCount} critical headers, needed at least ${MIN_CRITICAL_HEADERS_FOR_CONSIDERATION -1}. Mapped canonical keys:`, Array.from(headerMap.values()).map(v => v.canonicalKey).join(', '));
             resolve({ records: [], headers: finalIdentifiedRawHeaders.length > 0 ? finalIdentifiedRawHeaders : HEADERS_FROM_OCR, identifiedRawHeaders: finalIdentifiedRawHeaders });
             return;
        }

        const dataRows: any[][] = sheetDataAsArrays.slice(headerRowIndex + 1);
        const parsedRecords: NagadRecord[] = [];

        dataRows.forEach((row, dataRowIndex) => {
          if (row.every(cell => cell == null || String(cell).trim() === '')) return; 

          const record: Partial<NagadRecord> = {
            id: `${file.name}-${headerRowIndex + 1 + dataRowIndex}-${Math.random().toString(36).substring(2, 7)}`, 
            sourceFileId: file.name, 
            fileName: file.name,
            rowIndex: headerRowIndex + 1 + dataRowIndex + 1, 
          };

          let hasTxnId = false;
          let hasTxnDateTime = false;
          
          headerMap.forEach(({ canonicalKey }, colIndex) => {
            if (colIndex >= row.length) return; 
            let value = row[colIndex];

            if (value === undefined || value === null || String(value).trim() === "" || String(value).toLowerCase() === "n/a") {
                (record as any)[canonicalKey] = undefined; 
                return;
            }
            
            if (NUMERIC_NAGAD_FIELDS.includes(canonicalKey)) {
              const numValStr = String(value).replace(/৳|,|tk\.?/gi, '').trim();
              const numVal = parseFloat(numValStr);
              (record as any)[canonicalKey] = isNaN(numVal) ? undefined : numVal;
            } else if (DATE_NAGAD_FIELDS.includes(canonicalKey)) {
              let parsedDate: Date | null = null;
              if (value instanceof Date && !isNaN(value.getTime())) {
                parsedDate = value;
              } else {
                const dateStr = String(value);
                parsedDate = parseDateTime(dateStr); 
              }
              (record as any)[canonicalKey] = parsedDate ? parsedDate.toISOString() : String(value); // Store as ISO string
              if (canonicalKey === 'TXN_DATE_TIME' && record.TXN_DATE_TIME) hasTxnDateTime = true;
            } else if (canonicalKey === 'TXN_TYPE_DR_CR') {
                const drCrVal = String(value).toUpperCase().trim();
                if (['CR', 'CR.', 'CREDIT'].includes(drCrVal)) (record as any)[canonicalKey] = 'CREDIT';
                else if (['DR', 'DR.', 'DEBIT'].includes(drCrVal)) (record as any)[canonicalKey] = 'DEBIT';
                else (record as any)[canonicalKey] = drCrVal; 
            } else {
              (record as any)[canonicalKey] = String(value).trim();
            }
            
            if (canonicalKey === 'TXN_ID' && record.TXN_ID && String(record.TXN_ID).trim() !== '') hasTxnId = true;
          });
          
          // More lenient validation: TXN_ID and (TXN_DATE_TIME OR TXN_AMT)
          if (hasTxnId && (hasTxnDateTime || typeof record.TXN_AMT === 'number')) {
             parsedRecords.push(record as NagadRecord);
          } else {
            // console.warn(`Nagad Parser: Skipping record at row ${record.rowIndex} for file ${file.name} due to missing TXN_ID or (TXN_DATE_TIME and TXN_AMT). Content:`, record);
          }
        });
        
        if(dataRows.length > 0 && parsedRecords.length === 0) {
            console.warn(`Nagad Parser: All ${dataRows.length} data rows from ${file.name} were filtered out after parsing. Best Score: ${bestScore.toFixed(2)}. HeaderRowIndex: ${headerRowIndex}. Identified Headers: ${finalIdentifiedRawHeaders.join(', ')}.`);
        } else if (parsedRecords.length > 0) {
            // console.log(`Nagad Parser: Successfully parsed ${parsedRecords.length} records from ${file.name}. Best Score: ${bestScore.toFixed(2)}. HeaderRowIndex: ${headerRowIndex}. Identified Headers: ${finalIdentifiedRawHeaders.join(', ')}`);
        }

        resolve({ records: parsedRecords, headers: finalIdentifiedRawHeaders.length > 0 ? finalIdentifiedRawHeaders : HEADERS_FROM_OCR, identifiedRawHeaders: finalIdentifiedRawHeaders });
      } catch (e) {
        console.error("Error in parseNagadExcelFile (Revamp):", e);
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
