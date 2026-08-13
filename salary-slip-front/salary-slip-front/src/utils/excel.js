import ExcelJS from "exceljs";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function cellToPrimitive(value) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    // ISO (YYYY-MM-DD) rather than a locale string: Carbon::parse() on the
    // backend reads it unambiguously, and a raw Date object here isn't a
    // valid React child — rendering it directly crashed the preview table.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "object") {
    if (Array.isArray(value.richText)) {
      return value.richText.map((t) => t?.text ?? "").join("");
    }
    if (value.text !== undefined) return value.text;
    // Formula cells: {formula, result} — the cached result is what Excel last
    // computed. If the workbook was written/edited without recalculating
    // (common when formulas are dragged down programmatically), `result` is
    // absent. There's no formula engine here to compute it, so fall through
    // to blank rather than stringify the object into the literal text
    // "[object Object]" — which used to get baked into the rebuilt upload
    // file and land in the database as-is.
    if (value.result !== undefined) return value.result;
    if (value.error !== undefined) return value.error;
    if (value.formula !== undefined || value.sharedFormula !== undefined) return "";
    if (value.hyperlink !== undefined) return value.hyperlink;
    return "";
  }
  return value;
}

function downloadBlob(data, filename, mime) {
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function matrixToWorksheet(wb, sheetName, matrix) {
  const ws = wb.addWorksheet(sheetName || "Sheet1");
  if (matrix.length > 0) ws.addRows(matrix);
  return ws;
}

export async function parseSheetToRows(arrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(arrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { sheetName: "", headers: [], rows: [], totalRows: 0 };

  const sheetName = ws.name;
  const maxCol = ws.columnCount || 0;
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (row) => {
    const out = [];
    for (let c = 1; c <= maxCol; c++) {
      out.push(cellToPrimitive(row.getCell(c).value));
    }
    rows.push(out);
  });

  const [headerRow = [], ...dataRows] = rows;
  return {
    sheetName,
    headers: headerRow.map(String),
    rows: dataRows,
    totalRows: dataRows.length,
  };
}

export async function saveAoaToXlsx(filename, sheetName, matrix) {
  const wb = new ExcelJS.Workbook();
  matrixToWorksheet(wb, sheetName, matrix);
  const buffer = await wb.xlsx.writeBuffer();
  downloadBlob(buffer, filename, XLSX_MIME);
}

export async function saveJsonToXlsx(filename, sheetName, objects) {
  if (!Array.isArray(objects) || objects.length === 0) {
    return saveAoaToXlsx(filename, sheetName, []);
  }
  const headers = Object.keys(objects[0]);
  const matrix = [
    headers,
    ...objects.map((o) => headers.map((k) => o[k] ?? "")),
  ];
  return saveAoaToXlsx(filename, sheetName, matrix);
}

export async function buildXlsxBuffer(sheetName, matrix) {
  const wb = new ExcelJS.Workbook();
  matrixToWorksheet(wb, sheetName, matrix);
  return wb.xlsx.writeBuffer();
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function downloadCsvFile(filename, rows) {
  const lines = [];
  if (Array.isArray(rows) && rows.length > 0 && !Array.isArray(rows[0])) {
    const headers = Object.keys(rows[0]);
    lines.push(headers.map(csvCell).join(","));
    rows.forEach((r) =>
      lines.push(headers.map((k) => csvCell(r[k])).join(",")),
    );
  } else {
    (rows || []).forEach((r) => lines.push(r.map(csvCell).join(",")));
  }
  const csv = lines.join("\n");
  downloadBlob(csv, filename, "text/csv;charset=utf-8;");
}
