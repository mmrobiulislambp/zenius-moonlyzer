
// utils/downloadUtils.ts

const escapeCSVCell = (cellData: any): string => {
  const cellString = (cellData === null || cellData === undefined) ? "" : String(cellData);
  // If the cell string contains a comma, a double quote, or a newline character,
  // it needs to be enclosed in double quotes.
  // Any existing double quotes within the string must be escaped by prefixing them with another double quote.
  if (/[",\r\n]/.test(cellString)) {
    return `"${cellString.replace(/"/g, '""')}"`;
  }
  return cellString;
};

export const downloadCSV = (filename: string, dataRows: string[][], headers?: string[]) => {
  let csvContent = "";

  if (headers && headers.length > 0) {
    csvContent += headers.map(escapeCSVCell).join(",") + "\r\n";
  }

  dataRows.forEach((rowArray: string[]) => {
    csvContent += rowArray.map(escapeCSVCell).join(",") + "\r\n";
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export const downloadJSON = (filename: string, jsonData: object) => {
  const jsonString = JSON.stringify(jsonData, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
  const link = document.createElement("a");
  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};

export const downloadPNGFromBase64 = (base64String: string, filename: string) => {
  const link = document.createElement("a");
  link.href = base64String;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
