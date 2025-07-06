
// Ensure SheetJS (xlsx) is loaded, e.g., via CDN in index.html:
// <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>

declare var XLSX: any; // Declare XLSX globally if using CDN

export const parseExcelFile = (file: File): Promise<{ records: any[][]; headers: string[] }> => {
  return new Promise((resolve, reject) => {
    if (typeof XLSX === 'undefined') {
      reject(new Error('SheetJS (XLSX) library is not loaded. Please ensure it is included.'));
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = event.target?.result;
        const workbook = XLSX.read(data, { type: 'binary', cellDates: true }); // cellDates helps with date interpretation
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Get headers from the first row
        const headerRange = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');
        const firstRow = [];
        if (headerRange.s.r <= headerRange.e.r) { // Check if there is at least one row
          for (let C = headerRange.s.c; C <= headerRange.e.c; ++C) {
            const cellAddress = XLSX.utils.encode_cell({ r: headerRange.s.r, c: C });
            const cell = worksheet[cellAddress];
            firstRow.push(cell ? XLSX.utils.format_cell(cell) : undefined);
          }
        }
        const headers: string[] = firstRow.map(h => h ? String(h).trim() : `COLUMN_${Math.random().toString(36).substring(7)}`).filter(h => h);


        // Get data rows (skip header row)
        const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, {
          header: 1, // Output as array of arrays
          range: 1, // Start from the second row (index 1)
          defval: '', // Default value for empty cells
          raw: false, // format values (e.g. dates as strings)
          dateNF: 'yyyy-mm-dd hh:mm:ss' // A common date format, adjust if needed
        }); 

        resolve({ records: jsonData, headers });
      } catch (e) {
        reject(e);
      }
    };
    reader.onerror = (error) => reject(error);
    reader.readAsBinaryString(file);
  });
};
