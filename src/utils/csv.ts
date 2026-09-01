// CSV export for form responses and the student roster. Excel opens CSV
// natively, so the admin needs no extra tooling and we ship no extra dependency.

export interface CsvColumn<T> {
  key: string;
  header: string;
  /** Overrides the plain `row[key]` lookup for derived or nested values. */
  value?: (row: T) => unknown;
}

/** RFC 4180 records are separated by CRLF, and Excel on Windows expects it. */
const ROW_SEPARATOR = '\r\n';

/**
 * Without a byte-order mark Excel decodes the file as the machine's legacy
 * codepage, which mangles every non-ASCII name in the roster.
 */
const UTF8_BOM = '\uFEFF';

const NEEDS_QUOTING = /[",\r\n]/;

/** Elements of a collection each land in their own cell after a text-to-columns
 * split, so they are joined with a separator the admin can split on. */
const SEQUENCE_SEPARATOR = '; ';

/**
 * A leading minus here is a sign, not a formula, and Excel keeps it when it
 * evaluates the cell. A leading plus is excluded deliberately: Excel would
 * evaluate `+923001234567` down to `923001234567`, silently dropping the `+`
 * from every country-code phone number in the roster, so those cells are
 * pushed through the text guard below instead.
 */
const PLAIN_NUMBER = /^-?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** Excel trims a cell before parsing it, so leading blanks hide nothing. */
const LEADING_BLANKS = /^\s+/;

/**
 * Excel and LibreOffice evaluate a cell starting with any of these as a
 * formula, so `=HYPERLINK(...)` or `@SUM(...)` typed into a public form field
 * becomes code running on the admin's machine when they open the export.
 * Prefixing with an apostrophe forces the spreadsheet to treat the cell as
 * literal text; the apostrophe itself is not displayed.
 */
function neutraliseFormula(field: string): string {
  // Tested past any leading whitespace: a space or NBSP in front of `=SUM(...)`
  // is stripped by Excel and by most importers, so anchoring at position 0
  // would wave the payload straight through.
  const bare = field.replace(LEADING_BLANKS, '');
  if (bare === '' || PLAIN_NUMBER.test(bare)) return field;

  // A leading tab or CR is itself a trigger: the spreadsheet drops it and acts
  // on whatever follows, even when that is an otherwise harmless character.
  return /^[=+\-@]/.test(bare) || /^[\t\r]/.test(field) ? `'${field}` : field;
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') {
    // A literal NaN or Infinity in a cell reads as broken data to the admin.
    return Number.isFinite(value) ? String(value) : '';
  }
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  if (Array.isArray(value)) return value.map(formatElement).join(SEQUENCE_SEPARATOR);
  // Sets and Maps are spelled out because the JSON.stringify fallback below
  // renders both as `{}`, dropping every entry without a trace.
  if (value instanceof Set) return [...value].map(formatElement).join(SEQUENCE_SEPARATOR);
  if (value instanceof Map) {
    return [...value]
      .map(([key, entry]) => formatElement(`${formatValue(key)}: ${formatValue(entry)}`))
      .join(SEQUENCE_SEPARATOR);
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value) ?? '';
    } catch {
      return '';
    }
  }
  return String(value);
}

/**
 * A collection is flattened into a single cell, but the admin splitting that
 * cell back apart hands every element to the formula parser in turn. The guard
 * therefore runs per element, not once over the joined string — which would
 * only ever protect the first one.
 */
function formatElement(value: unknown): string {
  return neutraliseFormula(formatValue(value));
}

function escapeField(value: unknown): string {
  const field = neutraliseFormula(formatValue(value));
  if (!NEEDS_QUOTING.test(field)) return field;
  return `"${field.replace(/"/g, '""')}"`;
}

/**
 * Serialise rows to CSV text. Deliberately BOM-free so the output can be
 * asserted on directly; `downloadCsv` adds the BOM at the file boundary.
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines: string[] = [columns.map((column) => escapeField(column.header)).join(',')];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          let raw: unknown;
          try {
            raw = column.value
              ? column.value(row)
              : (row as unknown as Record<string, unknown>)?.[column.key];
          } catch {
            // A derived accessor such as `(r) => r.profile.name` throws on the
            // one row with a null profile. Every other bad value here degrades
            // to an empty cell, so this does too: the admin gets the export
            // with one blank rather than no download at all.
            raw = undefined;
          }
          return escapeField(raw);
        })
        .join(','),
    );
  }

  return lines.join(ROW_SEPARATOR);
}

/** Trigger a browser download of `csv` as `filename`. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([UTF8_BOM + csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Revoking synchronously cancels the download in Safari, and never revoking
  // pins the blob in memory for the life of the page. Next tick satisfies both.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** e.g. csvFilename('Event Registrations') -> "event-registrations-2026-09-01.csv" */
export function csvFilename(base: string, when: Date = new Date()): string {
  const slug =
    base
      .replace(/\.csv$/i, '')
      // The file content keeps non-ASCII names intact (that is what the BOM is
      // for), so the filename should degrade them rather than delete them:
      // decomposing first turns "Aḥsan" into "Ahsan" instead of "A-san".
      .normalize('NFKD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'export';

  // Local calendar date, not toISOString(): an export at 9pm PKT must not be
  // stamped with tomorrow's UTC date.
  const stamp = Number.isNaN(when.getTime())
    ? ''
    : [
        when.getFullYear(),
        String(when.getMonth() + 1).padStart(2, '0'),
        String(when.getDate()).padStart(2, '0'),
      ].join('-');

  return stamp ? `${slug}-${stamp}.csv` : `${slug}.csv`;
}
