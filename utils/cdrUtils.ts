import { CDRRecord, EXPECTED_HEADERS } from '../types';

export const parseDateTime = (dateTimeStr: string): Date | null => {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') {
    // Try to parse ISO format if YYYYMMDDHHMMSS fails or is not provided
    const isoDate = new Date(dateTimeStr);
    if (!isNaN(isoDate.getTime())) {
      return isoDate;
    }
    return null;
  }

  // Common non-standard date/time patterns seen in CDRs
  // Pattern: "YYYY-MM-DD HH:MM:SS" or "DD/MM/YYYY HH:MM:SS" or "MM/DD/YYYY HH:MM:SS"
  if (dateTimeStr.includes('-') || dateTimeStr.includes('/')) {
    try {
      // Attempt to replace slashes with dashes for uniformity and handle potential timezone issues by forcing UTC interpretation if no tz info
      const normalizedStr = dateTimeStr.replace(/\//g, '-');
      // Check if it's a common format that Date.parse can handle
      let date = new Date(normalizedStr);
      if (!isNaN(date.getTime())) {
        // Check if the string might be DD-MM-YYYY by splitting and checking parts
        if (normalizedStr.includes('-')) {
            const parts = normalizedStr.split(' ')[0].split('-');
            if (parts.length === 3) {
                const part1 = parseInt(parts[0],10);
                const part2 = parseInt(parts[1],10);
                // If first part > 12, it's likely day (DD-MM-YYYY)
                if (part1 > 12 && part2 <=12) { // DD-MM-YYYY
                    date = new Date(`${parts[2]}-${parts[1]}-${parts[0]} ${normalizedStr.split(' ')[1] || '00:00:00'}`);
                }
                 // MM-DD-YYYY is typically handled correctly by new Date() if no ambiguity
            }
        }
        if (!isNaN(date.getTime())) return date;
      }
    } catch (e) { /* fall through to YYYYMMDDHHMMSS or other parsers */ }
  }


  // Assuming YYYYMMDDHHMMSS format (14 chars)
  if (dateTimeStr.length === 14) {
      const year = parseInt(dateTimeStr.substring(0, 4), 10);
      const month = parseInt(dateTimeStr.substring(4, 6), 10) - 1; // Month is 0-indexed
      const day = parseInt(dateTimeStr.substring(6, 8), 10);
      const hour = parseInt(dateTimeStr.substring(8, 10), 10);
      const minute = parseInt(dateTimeStr.substring(10, 12), 10);
      const second = parseInt(dateTimeStr.substring(12, 14), 10);

      if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute) || isNaN(second)) {
        // Fallback to ISO if YYYYMMDDHHMMSS parsing fails components
        const isoDate = new Date(dateTimeStr);
        if (!isNaN(isoDate.getTime())) return isoDate;
        return null;
      }

      const date = new Date(year, month, day, hour, minute, second);
      if (date.getFullYear() !== year || date.getMonth() !== month || date.getDate() !== day) {
          const isoDate = new Date(dateTimeStr); // Fallback for invalid components
          if (!isNaN(isoDate.getTime())) return isoDate;
          return null;
      }
      return date;
  }

  // Default fallback for other string formats that Date constructor might handle
  const isoDate = new Date(dateTimeStr);
  if (!isNaN(isoDate.getTime())) {
    return isoDate;
  }

  return null;
};

export const formatDate = (dateTimeStr: string): string => {
  const date = parseDateTime(dateTimeStr);
  if (date) {
    return date.toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).replace(',', '');
  }
  return dateTimeStr;
};

export const formatDateFromTimestamp = (timestamp: number): string => {
  if (isNaN(timestamp)) return 'N/A';
  const date = new Date(timestamp);
  return date.toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).replace(',', '');
};


export const isValidCDRRecord = (record: Partial<CDRRecord>): record is CDRRecord => {
  if (!record) return false;

  // Essential for any analysis: A-Party or B-Party must exist and be non-empty.
  const hasPartyInfo = (typeof record.APARTY === 'string' && record.APARTY.trim() !== '') ||
                       (typeof record.BPARTY === 'string' && record.BPARTY.trim() !== '');

  // Timestamp is crucial.
  const hasPlausibleTimestamp = typeof record.START_DTTIME === 'string' &&
                                record.START_DTTIME.trim() !== '' &&
                                parseDateTime(record.START_DTTIME) !== null;

  // USAGE_TYPE is important for categorization.
  const hasUsageType = typeof record.USAGE_TYPE === 'string' && record.USAGE_TYPE.trim() !== '';

  return hasPartyInfo && hasPlausibleTimestamp && hasUsageType;
};

export const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// More specific USAGE_TYPE checkers
export const isOutgoingCallType = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  // Common MOC types. Also consider "VOICE" if not explicitly incoming.
  // Some CDRs use "VOICEOUT", "CALL_FWD_O" etc.
  return upperUsage.includes("MOC") ||
         upperUsage === "VOICE" || // Assume VOICE is outgoing if not specified otherwise. Context might be needed.
         upperUsage.includes("VOICEOUT") ||
         upperUsage.includes("CALL OUT") ||
         upperUsage.includes("OGCALL") || // Outgoing Call
         (upperUsage.includes("CALL") && !upperUsage.includes("MTC") && !upperUsage.includes("INC")) ||
         (upperUsage.includes("VOICE") && !upperUsage.includes("MTC") && !upperUsage.includes("INCOMING"));
};

export const isIncomingCallType = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  // Common MTC types.
  // Some CDRs use "VOICEIN", "CALL_FWD_I" etc.
  return upperUsage.includes("MTC") ||
         upperUsage.includes("VOICEIN") ||
         upperUsage.includes("CALL IN") ||
         upperUsage.includes("ICCALL") || // Incoming Call
         (upperUsage.includes("CALL") && upperUsage.includes("INC"));
};

export const isOutgoingSMSType = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  return upperUsage.includes("SMSMO") || upperUsage === "SMO" ||
         (upperUsage.includes("SMS") && upperUsage.includes("OUT"));
};

export const isIncomingSMSType = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  return upperUsage.includes("SMSMT") || upperUsage === "SMT" ||
         (upperUsage.includes("SMS") && upperUsage.includes("IN"));
};

// Broader categories for general counting (e.g., total calls, total SMS)
export const isAnyCall = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  // Includes specific outgoing/incoming, generic "CALL", "VOICE"
  return isOutgoingCallType(usageType) ||
         isIncomingCallType(usageType) ||
         upperUsage.includes("CALL") ||
         upperUsage.includes("VOICE");
};

export const isAnySMS = (usageType?: string): boolean => {
  if (!usageType) return false;
  const upperUsage = usageType.toUpperCase();
  // Includes specific outgoing/incoming, generic "SMS"
  return isOutgoingSMSType(usageType) ||
         isIncomingSMSType(usageType) ||
         upperUsage.includes("SMS");
};

// Fix: Add formatDurationFromSeconds utility function
export const formatDurationFromSeconds = (totalSeconds: number): string => {
  if (isNaN(totalSeconds) || totalSeconds < 0) return '0s'; // Consistent with error line usage
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60); // Use Math.round as in ActivityDetailModal

  // Replicates the logic from ActivityDetailModal's local formatDuration
  return `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm ' : ''}${s}s`.trim() || '0s';
};