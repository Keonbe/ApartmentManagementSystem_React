// Admin → Reports: one get_reports.php answer saved as Excel or PDF. Both files
// hold what the page shows: the summary (with the previous range), the figures
// per period, and every table in full (the page folds long ones).
import { buildXlsx } from './xlsx';
import { formatValue, isNumericFormat, changeText, fileSafe } from './reportFormat';
import { rangeLabel, GROUPS } from '../config/reportPeriods';

export const SITE_NAME = 'Apartment Management System';

const groupLabel = (g) => (GROUPS.find((x) => x.id === g)?.label || g).toLowerCase();

// Lines under the title, shared by every format.
export function reportMeta(report, preparedBy) {
  const generated = new Date(String(report.generatedAt || '').replace(' ', 'T'));
  const when = Number.isNaN(generated.getTime()) ? '' : generated.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  return {
    range: `${rangeLabel(report)} (${formatValue(report.from, 'date')} – ${formatValue(report.to, 'date')})`,
    grouping: `By ${groupLabel(report.group)}`,
    previous: report.previous ? `Compared with ${formatValue(report.previous.from, 'date')} – ${formatValue(report.previous.to, 'date')}` : '',
    generated: `Generated ${when}${preparedBy ? ` by ${preparedBy}` : ''}`,
  };
}

export const reportFileName = (report, ext) => `${fileSafe(`${report.title} ${rangeLabel(report)}`)}.${ext}`;

function download(bytes, name, type) {
  const blob = bytes instanceof Blob ? bytes : new Blob([bytes], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Every table of the report in order: the per-period one first.
export function reportTables(report) {
  const out = [];
  if (report.periods?.rows?.length) {
    out.push({ key: 'periods', title: `By ${groupLabel(report.group)}`, columns: report.periods.columns, rows: report.periods.rows, totals: report.periods.totals });
  }
  return out.concat(report.tables || []);
}

// ── Excel ──

const cellOf = (value, format, style) => {
  if (value === null || value === undefined || value === '') return style ? { v: '', s: style } : null;
  if (isNumericFormat(format) && format !== 'hours') return { v: Number(value), t: format, s: style };
  if (format === 'date') return { v: value, t: 'date', s: style };
  if (format === 'hours') return { v: Number(value), t: 'number', s: style };
  return { v: String(value), s: style };
};
const rowStyle = (row) => (row._style === 'total' ? 'total' : row._style ? 'bold' : undefined);

function tableSheet(table) {
  const header = table.columns.map((c) => ({ v: c.label, s: 'header', num: isNumericFormat(c.format) }));
  const rows = [header];
  for (const r of table.rows) rows.push(table.columns.map((c) => cellOf(r[c.key], c.format, rowStyle(r))));
  if (table.totals) rows.push(table.columns.map((c) => cellOf(table.totals[c.key], c.format, 'total')));
  if (table.note) rows.push([], [{ v: table.note, s: 'note' }]);
  const widths = table.columns.map((c) => Math.max(
    c.label.length + 2,
    ...table.rows.slice(0, 300).map((r) => formatValue(r[c.key], c.format).length + 2),
  ));
  return { name: table.title, rows, widths, freezeRow: 1 };
}

export function reportWorkbook(report, preparedBy) {
  const meta = reportMeta(report, preparedBy);
  const summary = [
    [{ v: report.title, s: 'title' }],
    [{ v: SITE_NAME }],
    [{ v: meta.range }],
    [{ v: meta.grouping }],
    [{ v: meta.generated, s: 'note' }],
    ...(report.note ? [[{ v: report.note, s: 'note' }]] : []),
    [],
    [{ v: 'Figure', s: 'header' }, { v: 'Value', s: 'header', num: true }, { v: 'Previous range', s: 'header', num: true }, { v: 'Change', s: 'header', num: true }, { v: 'Note', s: 'header' }],
    ...report.summary.map((m) => [
      { v: m.label, s: 'bold' },
      cellOf(m.value, m.format),
      cellOf(m.previous, m.format),
      changeText(m) ? { v: changeText(m) } : null,
      m.hint ? { v: m.hint } : null,
    ]),
    [],
    ...(meta.previous ? [[{ v: meta.previous, s: 'note' }]] : []),
  ];
  const sheets = [{ name: 'Summary', rows: summary, widths: [28, 18, 18, 12, 48] }, ...reportTables(report).map(tableSheet)];
  return buildXlsx(sheets, { title: `${report.title} — ${meta.range}`, author: preparedBy || SITE_NAME });
}

export function downloadExcel(report, preparedBy) {
  download(reportWorkbook(report, preparedBy), reportFileName(report, 'xlsx'), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

// ── PDF ──

// The PDF's standard fonts cover Latin-1 and a few typographic marks; ₱ is
// written as "PHP" and anything else unknown becomes "?".
const PDF_EXTRA = new Set(['–', '—', '‘', '’', '“', '”', '•', '…', '€']);
export const pdfText = (s) => Array.from(String(s ?? '').replace(/₱/g, 'PHP ')).map((ch) => (ch.charCodeAt(0) <= 0xff || PDF_EXTRA.has(ch) ? ch : '?')).join('');
const pdfValue = (v, format) => pdfText(formatValue(v, format, { currency: false }));

const INDIGO = [79, 70, 229];
const TONE_RGB = { indigo: [99, 102, 241], emerald: [16, 185, 129], amber: [245, 158, 11], rose: [244, 63, 94], sky: [14, 165, 233], violet: [139, 92, 246] };
const FALLBACK = ['indigo', 'emerald', 'amber', 'rose'];
const rgbOf = (s, i) => TONE_RGB[s.tone] || TONE_RGB[FALLBACK[i % FALLBACK.length]];
const INK = [15, 23, 42];
const MUTED = [100, 116, 139];

function drawChart(doc, report, x, y, w, h) {
  const chart = report.chart;
  const rows = report.periods?.rows || [];
  if (!chart || !rows.length || rows.length > 62) return y;
  const series = chart.series;
  const values = rows.flatMap((r) => series.map((s) => Number(r[s.key]))).filter((v) => Number.isFinite(v));
  if (!values.length || values.every((v) => v === 0)) return y;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const plotX = x + 52;
  const plotW = w - 52;
  const top = y + 18;
  const zeroY = top + (max / span) * h;
  const yOf = (v) => top + ((max - v) / span) * h;

  // Legend.
  doc.setFontSize(8);
  let lx = plotX;
  series.forEach((s, i) => {
    doc.setFillColor(...rgbOf(s, i));
    doc.rect(lx, y + 3, 8, 8, 'F');
    doc.setTextColor(...MUTED);
    doc.text(pdfText(s.label), lx + 11, y + 10);
    lx += doc.getTextWidth(pdfText(s.label)) + 26;
  });

  // Grid and axis labels.
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.5);
  for (let i = 0; i <= 4; i++) {
    const v = max - (span * i) / 4;
    const gy = yOf(v);
    doc.line(plotX, gy, plotX + plotW, gy);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(formatValue(Math.round(v * 100) / 100, chart.format === 'money' ? 'int' : chart.format === 'percent' ? 'percent' : 'number', { currency: false })), plotX - 6, gy + 3, { align: 'right' });
  }
  doc.setDrawColor(148, 163, 184);
  doc.line(plotX, zeroY, plotX + plotW, zeroY);

  const slot = plotW / rows.length;
  if (chart.kind === 'line') {
    series.forEach((s, si) => {
      doc.setDrawColor(...rgbOf(s, si));
      doc.setLineWidth(1.5);
      let prev = null;
      rows.forEach((r, i) => {
        const v = r[s.key];
        if (v === null || v === undefined) { prev = null; return; }
        const pt = [plotX + slot * (i + 0.5), yOf(Number(v))];
        if (prev) doc.line(prev[0], prev[1], pt[0], pt[1]);
        doc.setFillColor(...rgbOf(s, si));
        doc.circle(pt[0], pt[1], 1.8, 'F');
        prev = pt;
      });
    });
  } else {
    const barW = Math.max(1, (slot * 0.72) / series.length);
    rows.forEach((r, i) => {
      series.forEach((s, si) => {
        const v = Number(r[s.key]) || 0;
        if (!v) return;
        doc.setFillColor(...rgbOf(s, si));
        const bx = plotX + slot * i + slot * 0.14 + barW * si;
        const by = v >= 0 ? yOf(v) : zeroY;
        doc.rect(bx, by, barW, Math.max(0.5, Math.abs(yOf(v) - zeroY)), 'F');
      });
    });
  }
  // X labels, thinned so they do not overlap.
  doc.setFontSize(7);
  doc.setTextColor(...MUTED);
  const step = Math.max(1, Math.ceil(rows.length / Math.floor(plotW / 42)));
  rows.forEach((r, i) => {
    if (i % step === 0) doc.text(pdfText(r._short || r.period), plotX + slot * (i + 0.5), top + h + 11, { align: 'center' });
  });
  return top + h + 24;
}

export async function downloadPdf(report, preparedBy) {
  const doc = await buildPdf(report, preparedBy);
  download(doc.output('blob'), reportFileName(report, 'pdf'), 'application/pdf');
}

// The report as a jsPDF document (A4; landscape when a table is wide).
export async function buildPdf(report, preparedBy) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const tables = reportTables(report);
  const wide = tables.some((t) => t.columns.length > 6);
  const doc = new jsPDF({ orientation: wide ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const M = 40;
  const meta = reportMeta(report, preparedBy);

  // Title block.
  doc.setFillColor(...INDIGO);
  doc.rect(0, 0, pageW, 6, 'F');
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text(pdfText(SITE_NAME.toUpperCase()), M, 30);
  doc.setTextColor(...INK);
  doc.setFontSize(20);
  doc.text(pdfText(report.title), M, 54);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(pdfText(`${meta.range}  ·  ${meta.grouping}`), M, 72);
  doc.setTextColor(...MUTED);
  doc.setFontSize(8.5);
  doc.text(pdfText(`${meta.generated}. Amounts in Philippine pesos (PHP).`), M, 86);
  let y = 100;
  if (report.note) {
    doc.text(pdfText(report.note), M, y);
    y += 12;
  }

  // Summary cards, three or four to a row.
  const perRow = wide ? 4 : 3;
  const gap = 10;
  const cardW = (pageW - 2 * M - gap * (perRow - 1)) / perRow;
  const cardH = 54;
  report.summary.forEach((m, i) => {
    const cx = M + (i % perRow) * (cardW + gap);
    const cy = y + Math.floor(i / perRow) * (cardH + gap);
    doc.setDrawColor(226, 232, 240);
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(cx, cy, cardW, cardH, 4, 4, 'FD');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(m.label), cx + 10, cy + 15);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...INK);
    doc.text(pdfText(formatValue(m.value, m.format)), cx + 10, cy + 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const change = changeText(m);
    const sub = change ? `${change} vs previous (${pdfText(formatValue(m.previous, m.format))})` : (m.hint || '');
    doc.text(pdfText(sub), cx + 10, cy + 46, { maxWidth: cardW - 16 });
  });
  y += Math.ceil(report.summary.length / perRow) * (cardH + gap) + 6;
  if (meta.previous) {
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(meta.previous), M, y);
    y += 14;
  }

  // Chart of the periods.
  if (report.chart && report.periods?.rows?.length > 1) {
    if (y + 190 > pageH - 50) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(pdfText(`By ${groupLabel(report.group)}`), M, y + 8);
    doc.setFont('helvetica', 'normal');
    y = drawChart(doc, report, M, y + 14, pageW - 2 * M, 140);
  }

  // Tables.
  for (const t of tables) {
    if (y > pageH - 110) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...INK);
    doc.text(pdfText(t.title), M, y + 8);
    doc.setFont('helvetica', 'normal');
    y += 14;
    if (t.note) {
      doc.setFontSize(7.5);
      doc.setTextColor(...MUTED);
      doc.text(pdfText(t.note), M, y + 4);
      y += 10;
    }
    const money = (c) => (c.format === 'money' ? `${c.label} (PHP)` : c.label);
    const columnStyles = {};
    t.columns.forEach((c, i) => { if (isNumericFormat(c.format)) columnStyles[i] = { halign: 'right' }; });
    autoTable(doc, {
      startY: y + 4,
      margin: { left: M, right: M, bottom: 40 },
      head: [t.columns.map((c) => pdfText(money(c)))],
      body: t.rows.length ? t.rows.map((r) => t.columns.map((c, ci) => (r._style === 'section' && ci > 0 ? '' : pdfValue(r[c.key], c.format)))) : [[{ content: 'Nothing in this range.', colSpan: t.columns.length, styles: { textColor: MUTED, fontStyle: 'italic' } }]],
      foot: t.totals && t.rows.length ? [t.columns.map((c) => (t.totals[c.key] === undefined ? '' : pdfValue(t.totals[c.key], c.format)))] : undefined,
      showFoot: 'lastPage',
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 4, textColor: INK, lineColor: [226, 232, 240], lineWidth: 0.5, overflow: 'linebreak' },
      headStyles: { fillColor: INDIGO, textColor: 255, fontStyle: 'bold' },
      footStyles: { fillColor: [241, 245, 249], textColor: INK, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles,
      didParseCell: (data) => {
        if (data.section === 'head' && isNumericFormat(t.columns[data.column.index]?.format)) data.cell.styles.halign = 'right';
        if (data.section !== 'body') return;
        const style = t.rows[data.row.index]?._style;
        if (style === 'section') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [238, 242, 255]; }
        if (style === 'subtotal') data.cell.styles.fontStyle = 'bold';
        if (style === 'total') { data.cell.styles.fontStyle = 'bold'; data.cell.styles.fillColor = [224, 231, 255]; }
      },
    });
    y = doc.lastAutoTable.finalY + 26;
  }

  // Footer on every page.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.text(pdfText(`${report.title} · ${rangeLabel(report)}`), M, pageH - 20);
    doc.text(`Page ${p} of ${pages}`, pageW - M, pageH - 20, { align: 'right' });
  }
  return doc;
}
