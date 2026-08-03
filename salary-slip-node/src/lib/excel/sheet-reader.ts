import * as XLSX from 'xlsx';

/**
 * Read the active sheet the way PhpSpreadsheet's toArray() does.
 *
 * `raw: true` is load-bearing: it keeps date cells as Excel serial numbers
 * rather than converting them to JS Dates, which is what parseImportDate
 * expects — its 10000..60000 range check operates on those serials. A reader
 * that helpfully converts dates would bypass that path entirely and change
 * which values parse.
 */

export interface Sheet {
  header: string[];
  rows: unknown[][];
}

export interface SheetReader {
  read(contents: Buffer): Sheet;
}

export class XlsxSheetReader implements SheetReader {
  read(contents: Buffer): Sheet {
    const workbook = XLSX.read(contents, { type: 'buffer', raw: true, cellDates: false });

    const first = workbook.SheetNames[0];
    if (!first) return { header: [], rows: [] };

    const sheet = workbook.Sheets[first];
    if (!sheet) return { header: [], rows: [] };

    // header: 1 gives an array-of-arrays; defval keeps empty cells positional
    // so a blank column does not shift everything to its left.
    const table = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    const [header, ...rows] = table;

    return {
      header: (header ?? []).map((h) => (h === null || h === undefined ? '' : String(h))),
      rows,
    };
  }
}

/**
 * Turn a sheet into keyed rows, applying an optional column mapping.
 *
 * Mirrors the loop in UserController::import — fully empty rows are dropped,
 * short rows are padded so array_combine cannot fail, and long rows are
 * truncated to the header width.
 */
export function toKeyedRows(
  sheet: Sheet,
  mapping?: Record<string, string> | null,
): Record<string, unknown>[] {
  const width = sheet.header.length;
  const out: Record<string, unknown>[] = [];

  for (const row of sheet.rows) {
    if (!row.some((v) => v !== null && v !== undefined && v !== '')) continue;

    const padded = Array.from({ length: width }, (_, i) => row[i] ?? null);

    const keyed: Record<string, unknown> = {};
    sheet.header.forEach((name, i) => {
      keyed[name] = padded[i];
    });

    if (mapping && Object.keys(mapping).length > 0) {
      // mapping is dbField -> spreadsheet column heading.
      const mapped: Record<string, unknown> = {};
      for (const [field, column] of Object.entries(mapping)) {
        mapped[field] = keyed[column] ?? null;
      }
      out.push(mapped);
      continue;
    }

    out.push(keyed);
  }

  return out;
}
