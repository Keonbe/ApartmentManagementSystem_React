import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import process from 'node:process';
import { crc32, colName, excelDate, sheetNames, xmlText, buildXlsx } from './xlsx.js';
import { reportWorkbook, pdfText, buildPdf } from './reportExport.js';
import { formatValue, changeText, formatShort } from './reportFormat.js';

// Reads back the stored zip: name → text, checking each CRC.
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const name = new TextDecoder().decode(bytes.slice(at + 30, at + 30 + nameLen));
    const data = bytes.slice(at + 30 + nameLen, at + 30 + nameLen + size);
    expect(crc32(data)).toBe(crc);
    files[name] = new TextDecoder().decode(data);
    at += 30 + nameLen + size;
  }
  expect(view.getUint32(at, true)).toBe(0x02014b50); // central directory follows
  return files;
}

const REPORT = {
  report: 'financial', title: 'Income statement', from: '2026-11-01', to: '2026-11-30', group: 'week',
  previous: { from: '2026-10-01', to: '2026-10-31' }, generatedAt: '2026-11-15 14:05:00',
  summary: [
    { key: 'revenue', label: 'Revenue', value: 12500.5, format: 'money', previous: 10000 },
    { key: 'margin', label: 'Net margin', value: 40, format: 'percent', previous: 35.5 },
    { key: 'count', label: 'Payments', value: 7, format: 'int', hint: 'Paid bills & <installments>' },
  ],
  chart: { kind: 'bar', format: 'money', series: [{ key: 'revenue', label: 'Revenue' }] },
  periods: {
    columns: [{ key: 'period', label: 'Period', format: 'text' }, { key: 'revenue', label: 'Revenue', format: 'money' }],
    rows: [{ period: 'Nov 1 – 1, 2026', _short: 'Oct 26', revenue: 100 }, { period: 'Nov 2 – 8, 2026', _short: 'Nov 2', revenue: 12400.5 }],
    totals: { period: 'Total', revenue: 12500.5 },
  },
  tables: [{
    key: 'statement', title: 'Income statement', note: 'Share is of total revenue.',
    columns: [{ key: 'line', label: 'Line', format: 'text' }, { key: 'amount', label: 'Amount', format: 'money' }, { key: 'when', label: 'Date', format: 'date' }],
    rows: [{ line: 'Revenue', _style: 'section' }, { line: 'Base rent', amount: 12500.5, when: '2026-11-03' }, { line: 'Net income', amount: 5000, _style: 'total' }],
  }],
};

describe('xlsx writer', () => {
  it('has the pieces it is built from right', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect([colName(0), colName(25), colName(26), colName(701), colName(702)]).toEqual(['A', 'Z', 'AA', 'ZZ', 'AAA']);
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-11-15')).toBe(46341);
    expect(sheetNames(['By week', 'By week', 'A/B: [x]?', 'x'.repeat(40)])).toEqual(['By week', 'By week 2', 'A B x', 'x'.repeat(31)]);
    expect(xmlText('a & <b> "c"\u0001')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
  });

  it('builds a workbook Excel can open: parts, sheets, typed cells', () => {
    const bytes = reportWorkbook(REPORT, 'Ada Admin');
    if (process.env.XLSX_OUT) fs.writeFileSync(process.env.XLSX_OUT, bytes);
    const files = unzip(bytes);
    expect(Object.keys(files)).toEqual(expect.arrayContaining([
      '[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml',
      'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml',
    ]));
    expect(files['xl/workbook.xml']).toContain('<sheet name="Summary"');
    expect(files['xl/workbook.xml']).toContain('<sheet name="By week"');
    expect(files['xl/workbook.xml']).toContain('<sheet name="Income statement"');
    const summary = files['xl/worksheets/sheet1.xml'];
    expect(summary).toContain('<t xml:space="preserve">Income statement</t>');
    expect(summary).toContain('Paid bills &amp; &lt;installments&gt;'); // escaped
    expect(summary).toMatch(/<c r="B\d+" s="\d+"><v>12500.5<\/v><\/c>/); // money stays a number
    const statement = files['xl/worksheets/sheet3.xml'];
    expect(statement).toContain('<v>46329</v>'); // 2026-11-03 as a date number
    expect(files['xl/styles.xml']).toContain('&quot;₱&quot;#,##0.00');
  });

  it('writes the rows of every table, totals last', () => {
    const files = unzip(buildXlsx([{ name: 'T', rows: [['a', 1], [{ v: 'Total', s: 'total' }, { v: 2, t: 'int', s: 'total' }]] }]));
    const xml = files['xl/worksheets/sheet1.xml'];
    expect(xml.indexOf('<row r="1">')).toBeLessThan(xml.indexOf('<row r="2">'));
    expect(xml).toMatch(/<c r="B1" s="\d+"><v>1<\/v><\/c>/);
    expect(xml).toMatch(/<c r="A2" t="inlineStr" s="6"><is><t xml:space="preserve">Total<\/t><\/is><\/c>/);
  });
});

describe('formats', () => {
  it('reads values the same everywhere', () => {
    expect(formatValue(1234.5, 'money')).toBe('₱1,234.50');
    expect(formatValue(-50, 'money')).toBe('-₱50.00');
    expect(formatValue(1234.5, 'money', { currency: false })).toBe('1,234.50');
    expect(formatValue(null, 'money')).toBe('—');
    expect(formatValue(12.345, 'percent')).toBe('12.3%');
    expect(formatValue(30, 'hours')).toBe('30 h');
    expect(formatValue(96, 'hours')).toBe('4 days');
    expect(formatValue('2026-11-05', 'date')).toBe('Nov 5, 2026');
    expect(formatShort(1250000, 'money')).toBe('₱1.3M');
    expect(formatShort(45000, 'money')).toBe('₱45k');
  });

  it('says the change from the previous range', () => {
    expect(changeText({ value: 120, previous: 100, format: 'money' })).toBe('+20%');
    expect(changeText({ value: 80, previous: 100, format: 'int' })).toBe('-20%');
    expect(changeText({ value: 50, previous: 0, format: 'money' })).toBe(null);
    expect(changeText({ value: 40, previous: 35.5, format: 'percent' })).toBe('+4.5 pts');
    expect(changeText({ value: 40, format: 'percent' })).toBe(null);
  });

  it('keeps PDF text to what its fonts can draw', () => {
    expect(pdfText('₱1,000 – Niño’s room 漢')).toBe('PHP 1,000 – Niño’s room ?');
  });
});

describe('pdf', () => {
  it('builds a PDF of the report: summary, chart, every table, page numbers', async () => {
    const big = { ...REPORT, tables: [...REPORT.tables, {
      key: 'long', title: 'Payments', columns: [{ key: 'date', label: 'Date', format: 'date' }, { key: 'amount', label: 'Amount', format: 'money' }],
      rows: Array.from({ length: 120 }, (_, i) => ({ date: '2026-11-03', amount: i * 10 })),
    }] };
    const doc = await buildPdf(big, 'Ada Admin');
    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (process.env.PDF_OUT) fs.writeFileSync(process.env.PDF_OUT, bytes);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text).toContain('Income statement');
    expect(text).toMatch(/Page 1 of \d/);
  });
});
