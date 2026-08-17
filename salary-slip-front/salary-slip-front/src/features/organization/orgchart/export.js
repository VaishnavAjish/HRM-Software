import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import ExcelJS from "exceljs";

const CSV_HEADERS = ["id", "name", "type", "status", "employeeCount", "approvedHeadcount", "vacancy"];

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

function toRows(chart) {
  return (chart?.nodes || []).map((n) => ({
    id: n.id,
    name: n.name ?? n.title ?? n.code ?? n.id,
    type: n.type ?? "",
    status: n.isActive === false ? "Inactive" : n.isActive === undefined ? "—" : "Active",
    employeeCount: n.employeeCount ?? "",
    approvedHeadcount: n.approvedHeadcount ?? "",
    vacancy: n.vacancy ?? "",
  }));
}

function fileBase(chart) {
  return `org-chart-${chart?.meta?.chartType || "export"}-${new Date().toISOString().slice(0, 10)}`;
}

export function exportCsv(chart) {
  const rows = toRows(chart);
  const lines = [CSV_HEADERS.join(",")].concat(
    rows.map((row) => CSV_HEADERS.map((h) => csvEscape(row[h])).join(",")),
  );
  downloadBlob(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" }), `${fileBase(chart)}.csv`);
}

export function exportJson(chart) {
  downloadBlob(
    new Blob([JSON.stringify(chart, null, 2)], { type: "application/json;charset=utf-8;" }),
    `${fileBase(chart)}.json`,
  );
}

export async function exportExcel(chart) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Org Chart");
  sheet.columns = CSV_HEADERS.map((key) => ({ header: key, key, width: 20 }));
  toRows(chart).forEach((row) => sheet.addRow(row));
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
    `${fileBase(chart)}.xlsx`,
  );
}

async function captureViewport(viewportEl) {
  return html2canvas(viewportEl, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
}

export async function exportPng(viewportEl, chart) {
  const canvas = await captureViewport(viewportEl);
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `${fileBase(chart)}.png`);
  }, "image/png");
}

export async function exportPdf(viewportEl, chart) {
  const canvas = await captureViewport(viewportEl);
  const imgData = canvas.toDataURL("image/png");
  const orientation = canvas.width >= canvas.height ? "l" : "p";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
  pdf.save(`${fileBase(chart)}.pdf`);
}

/**
 * True vector SVG export would mean re-implementing node/edge drawing
 * outside the DOM — out of scope here. This produces a valid, self-contained
 * .svg that embeds the rendered chart as a raster image, which still
 * satisfies "export as SVG" for sharing/printing without pretending it's
 * editable vector art.
 */
export async function exportSvg(viewportEl, chart) {
  const canvas = await captureViewport(viewportEl);
  const dataUrl = canvas.toDataURL("image/png");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">`
    + `<image href="${dataUrl}" width="${canvas.width}" height="${canvas.height}"/></svg>`;
  downloadBlob(new Blob([svg], { type: "image/svg+xml;charset=utf-8;" }), `${fileBase(chart)}.svg`);
}
