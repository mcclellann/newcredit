import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type DocumentType = 'drivers_licence' | 'payslip' | 'bank_statement';
export type ParsedDocument = {
  type: DocumentType; issuer: string; periodStart: string | null; periodEnd: string | null;
  fields: Record<string, string>;
  transactions: Array<{ date: string; description: string; amountMinor: number; balanceMinor: number }>;
  issues: string[];
};
type Word = { text: string; x: number; y: number; width: number; page: number };
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const datePattern = /\b(?:\d{4}-\d{2}-\d{2}|\d{1,2} [A-Za-z]{3} \d{4})\b/g;
function date(value: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const human = /^(\d{1,2}) ([A-Za-z]{3}) (\d{4})$/.exec(value);
  if (!iso && !human) return null;
  const y = Number(iso?.[1] ?? human?.[3]);
  const m = iso ? Number(iso[2]) : months.indexOf(human![2]!.toLowerCase()) + 1;
  const d = Number(iso?.[3] ?? human?.[1]);
  const parsed = new Date(Date.UTC(y, m - 1, d));
  return y >= 1900 && m > 0 && parsed.getUTCFullYear() === y && parsed.getUTCMonth() === m - 1 && parsed.getUTCDate() === d
    ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
function money(text: string): number | null {
  const clean = text.trim().replace(/[$,\s]/g, '');
  if (!/^-?\d+\.\d{2}$/.test(clean)) return null;
  const n = Math.round(Number(clean) * 100);
  return Number.isSafeInteger(n) ? n : null;
}

/** Text-only extraction. Unknown layouts and incomplete data require human review; no OCR or inferred identity. */
export async function extractDocument(bytes: Buffer, mediaType: string, requestedType: DocumentType): Promise<ParsedDocument> {
  const result: ParsedDocument = { type: requestedType, issuer: '', periodStart: null, periodEnd: null, fields: {}, transactions: [], issues: [] };
  const issue = (message: string) => { if (!result.issues.includes(message)) result.issues.push(message); };
  if (mediaType.split(';')[0]?.trim().toLowerCase() !== 'application/pdf') {
    issue('Unsupported media type: upload a text PDF or request manual review.'); return result;
  }
  if (bytes.length > 20 * 1024 * 1024) { issue('PDF exceeds the 20 MB extraction limit.'); return result; }
  const words: Word[] = [];
  let task: ReturnType<typeof getDocument> | undefined;
  try {
    task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
    const pdf = await task.promise;
    if (pdf.numPages > 20) { issue('PDF exceeds the 20 page extraction limit.'); return result; }
    let length = 0;
    for (let page = 1; page <= pdf.numPages; page++) {
      const content = await (await pdf.getPage(page)).getTextContent();
      if (!content.items.some(item => 'str' in item && item.str.trim())) issue(`Page ${page} has no readable text; inspect for scanned or missing content.`);
      for (const item of content.items) {
        if (!('str' in item) || !item.str.trim()) continue;
        length += item.str.length;
        if (length > 200_000 || words.length >= 30_000) { issue('PDF exceeds text extraction limits.'); return result; }
        words.push({ text: item.str.trim(), x: item.transform[4], y: item.transform[5], width: item.width, page });
      }
    }
  } catch {
    issue('PDF cannot be read: malformed, encrypted, or unsupported PDF. Supply an unlocked text PDF.'); return result;
  } finally { await task?.destroy(); }
  if (!words.length) { issue('No readable text: scanned/image PDFs require OCR or manual review.'); return result; }
  const all = words.map(w => w.text).join('\n');
  const detected: DocumentType | undefined = /driver[’'s]* licen[cs]e/i.test(all) ? 'drivers_licence'
    : /\bpayslip\b/i.test(all) ? 'payslip' : /\b(?:account |bank )?statement\b/i.test(all) ? 'bank_statement' : undefined;
  if (detected !== requestedType) { issue(detected ? `Wrong document type: found ${detected}, expected ${requestedType}.` : 'Unsupported document layout: document type could not be identified.'); return result; }
  if (requestedType !== 'bank_statement' && new Set(words.map(w => w.page)).size > 1) {
    issue('Multiple identity/pay documents are unsupported; supply one document at a time.'); return result;
  }
  const label = (name: string) => words.find(w => w.text.toLowerCase().replace(/:$/, '') === name.toLowerCase());
  const value = (name: string): string => {
    const anchor = label(name);
    if (!anchor) return '';
    const inline = words.filter(w => w.page === anchor.page && Math.abs(w.y - anchor.y) < 2 && w.x >= anchor.x + anchor.width + 2).sort((a,b) => a.x-b.x)[0];
    const below = words.filter(w => w.page === anchor.page && w.y < anchor.y - 2 && w.y >= anchor.y - 32 && Math.abs(w.x - anchor.x) < 5).sort((a,b) => b.y-a.y)[0];
    return below?.text ?? inline?.text ?? '';
  };
  const put = (key: string, text: string) => { if (text && !/unreadable|redacted/i.test(text)) result.fields[key] = text; };
  const putDate = (key: string, text: string) => { const parsed = date(text); if (parsed) put(key, parsed); else issue(`Missing or impossible date: ${key}.`); };
  const putMoney = (key: string, text: string) => { const parsed = money(text); if (parsed !== null) put(key, (parsed / 100).toFixed(2)); else issue(`Missing or invalid amount: ${key}.`); return parsed; };
  if (requestedType === 'drivers_licence') {
    result.issuer = words.find(w => /driver.*licen[cs]e/i.test(w.text))?.text.replace(/driver.*$/i, '').trim() ?? '';
    put('name', value('Name') || [value('GIVEN NAME'), value('FAMILY NAME')].filter(Boolean).join(' '));
    put('address', value('Address')); put('licence_number', value('Licence no.') || value('Licence number'));
    putDate('date_of_birth', value('Date of birth')); putDate('licence_expiry', value('Expiry') || value('Licence expiry'));
  } else {
    const period = value(requestedType === 'payslip' ? 'Pay period' : 'Statement period').match(datePattern) ?? [];
    result.periodStart = date(period[0] ?? ''); result.periodEnd = date(period[1] ?? '');
    if (!result.periodStart || !result.periodEnd || result.periodStart > result.periodEnd) issue('Missing, impossible, or reversed statement/pay period.');
    if (requestedType === 'payslip') {
      const title = words.find(w => /^payslip$/i.test(w.text));
      result.issuer = value('Employer') || words.find(w => w.page === title?.page && Math.abs(w.y - title.y) < 3 && w.x < title.x)?.text || '';
      put('employer', result.issuer); put('name', value('Employee') || value('Name'));
      put('pay_frequency', value('Pay frequency').toLowerCase()); putDate('pay_date', value('Pay date'));
      const gross = putMoney('gross_pay', value('Gross pay')); const net = putMoney('net_pay', value('Net pay'));
      const tax = money(value('PAYG withholding (synthetic)') || value('PAYG withholding') || value('Tax'));
      if (gross !== null && net !== null && (net < 0 || gross < net)) issue('Pay arithmetic invalid: net pay must be between zero and gross pay.');
      if (tax === null) issue('Unable to reconcile pay: no supported tax/deductions total.');
      else if (gross !== null && net !== null && gross - tax !== net) issue('Pay arithmetic mismatch: gross minus tax/deductions does not equal net.');
    } else {
      result.issuer = value('Bank') || words.find(w => /bank/i.test(w.text) && !/synthetic|statement|value|real|fictional/i.test(w.text))?.text || '';
      const bankLogo = words.find(w => w.text === 'BANK');
      if (result.issuer === 'BANK' && bankLogo) {
        const above = words.find(w => w.page === bankLogo.page && w.y > bankLogo.y && w.y < bankLogo.y + 25 && Math.abs(w.x + w.width / 2 - bankLogo.x - bankLogo.width / 2) < 5);
        result.issuer = [above?.text, 'BANK'].filter(Boolean).join(' ');
      }
      const periodLabel = label('Statement period');
      put('name', value('Account holder') || value('Name') || words.find(w => w.page === 1 && periodLabel && Math.abs(w.y - periodLabel.y) < 7 && w.x < periodLabel.x)?.text || '');
      const account = value('BSB / account').split(/\s+/);
      put('bsb', value('BSB') || account[0] || ''); put('account', value('Account') || account[1] || '');
      const opening = putMoney('opening_balance', value('Opening balance')); const closing = putMoney('closing_balance', value('Closing balance'));
      let previous = opening; let credits = 0; let debits = 0;
      for (const page of [...new Set(words.map(w => w.page))]) {
        const headers = ['DATE', 'DESCRIPTION', 'DEBIT', 'CREDIT', 'BALANCE'].map(h => words.find(w => w.page === page && w.text === h));
        if (headers.some(h => !h)) { issue(`Unsupported transaction table on page ${page}; expected date, description, debit, credit, balance columns.`); continue; }
        const [dh, description, debit, credit, balance] = headers as Word[];
        const unrecognised = words.filter(w => w.page === page && w.y < dh!.y - 2 && w.y > 60 && Math.abs(w.x - dh!.x) < 5 && !/^\d{1,2} [A-Za-z]{3}(?: \d{4})?$/.test(w.text));
        if (unrecognised.length) issue(`Unrecognised transaction date/content on page ${page}; review unsupported or wrapped rows.`);
        const rows = words.filter(w => w.page === page && w.y < dh!.y && Math.abs(w.x - dh!.x) < 5 && /^\d{1,2} (?:[A-Za-z]{3})(?: \d{4})?$/.test(w.text)).sort((a,b) => b.y-a.y);
        for (const row of rows) {
          const cells = words.filter(w => w.page === page && Math.abs(w.y - row.y) < 2 && w !== row);
          const at = (header: Word) => cells.find(w => Math.abs(w.x + w.width - header.x - header.width) < 5)?.text ?? '';
          const debitValue = money(at(debit!)); const creditValue = money(at(credit!)); const balanceValue = money(at(balance!));
          const desc = cells.filter(w => w.x >= description!.x - 3 && w.x + w.width < debit!.x - 5).map(w => w.text).join(' ');
          const candidates = row.text.match(/\d{4}$/) ? [date(row.text)] : [...new Set([result.periodStart?.slice(0,4), result.periodEnd?.slice(0,4)])].filter(Boolean).map(y => date(`${row.text} ${y}`));
          const dates = candidates.filter(d => d && result.periodStart && result.periodEnd && d >= result.periodStart && d <= result.periodEnd);
          if (dates.length !== 1 || !desc || balanceValue === null || (debitValue === null) === (creditValue === null) || (debitValue ?? creditValue ?? -1) < 0) { issue(`Unparseable transaction on page ${page}: ${row.text}; review table and period.`); continue; }
          const amount = creditValue ?? -debitValue!;
          if (previous !== null && previous + amount !== balanceValue) issue(`Statement row does not reconcile on ${dates[0]}: ${desc}.`);
          previous = balanceValue; credits += creditValue ?? 0; debits += debitValue ?? 0;
          result.transactions.push({ date: dates[0]!, description: desc, amountMinor: amount, balanceMinor: balanceValue });
        }
      }
      if (!result.transactions.length) issue('No supported transactions found; review statement manually.');
      if (closing !== null && (previous !== closing || (opening !== null && opening + credits - debits !== closing))) issue('Statement opening/closing balance does not reconcile with transactions.');
      for (const [name, total] of [['Money in', credits], ['Money out', debits]] as const) {
        const stated = money(value(name)); if (stated !== null && stated !== total) issue(`Statement ${name.toLowerCase()} summary does not reconcile.`);
      }
    }
  }
  const required = requestedType === 'drivers_licence' ? ['name','address','licence_number','date_of_birth','licence_expiry'] : requestedType === 'payslip' ? ['name','employer','gross_pay','net_pay','pay_date','pay_frequency'] : ['name','bsb','account','opening_balance','closing_balance'];
  for (const key of required) if (!result.fields[key]) issue(`Missing or unreadable required field: ${key}.`);
  if (!result.issuer) issue('Issuer could not be identified; review manually.');
  return result;
}
