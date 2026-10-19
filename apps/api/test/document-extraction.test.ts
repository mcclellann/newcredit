import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractDocument, type DocumentType } from '../src/document-extraction.js';

// A real, independent text PDF with a valid cross-reference table; no fixture manifests.
function pdf(pages: Array<Array<[number, number, string]>>): Buffer {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  const kids: number[] = [];
  for (const lines of pages) {
    const pageId = objects.length + 1; kids.push(pageId);
    const stream = lines.map(([x,y,s]) => `BT /F1 10 Tf ${x} ${y} Td (${s.replace(/[\\()]/g, '\\$&')}) Tj ET`).join('\n');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 600 800] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId+1} 0 R >>`, `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Count ${kids.length} /Kids [${kids.map(n => `${n} 0 R`).join(' ')}] >>`;
  let output = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((body,i) => { offsets.push(Buffer.byteLength(output)); output += `${i+1} 0 obj\n${body}\nendobj\n`; });
  const xref = Buffer.byteLength(output);
  output += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n => `${String(n).padStart(10,'0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output);
}
function payslip(name = 'Morgan Changed', gross = '1234.56', net = '1000.01', tax = '234.55', day = '04 Sep 2026') {
  const lines: Array<[number,number,string]> = [[40,760,'Independent Employer'],[450,760,'PAYSLIP']];
  for (const [i,[label,value]] of [['Employee',name],['Pay period','22 Aug 2026 - 04 Sep 2026'],['Pay date',day],['Pay frequency','Fortnightly'],['Gross pay',`$${gross}`],['Net pay',`$${net}`],['Tax',`$${tax}`]].entries()) {
    lines.push([40,700-i*60,label!],[40,685-i*60,value!]);
  }
  return pdf([lines]);
}

describe('extractDocument public contract', () => {
  it('reads every current source PDF, without canonical data or manifests', async () => {
    let count = 0;
    for (const scenario of ['a','b','c','h']) {
      const base = new URL(`../../../data/synthetic/scenarios/scenario-${scenario}/documents/`, import.meta.url);
      for (const filename of readdirSync(base).filter(f => f.endsWith('.pdf'))) {
        const type: DocumentType = filename.startsWith('drivers') ? 'drivers_licence' : filename.startsWith('payslip') ? 'payslip' : 'bank_statement';
        const result = await extractDocument(readFileSync(new URL(filename,base)), 'application/pdf', type);
        expect(result.fields.name, filename).toBeTruthy();
        if (type === 'drivers_licence' && scenario === 'c') {
          expect(result.fields.licence_number).toBeUndefined();
          expect(result.issues.join(' ')).toContain('licence_number');
        } else expect(result.issues, `${scenario}/${filename}`).toEqual([]);
        if (type === 'bank_statement') {
          expect(result.transactions.some(t => t.amountMinor > 0)).toBe(true);
          expect(result.transactions.some(t => t.amountMinor < 0)).toBe(true);
          expect(result.fields.account).toBeTruthy();
        }
        count++;
      }
    }
    expect(count).toBeGreaterThan(20);
  });
  it('uses arbitrary names and amounts from previously unseen PDF bytes', async () => {
    const first = await extractDocument(payslip(), 'application/pdf', 'payslip');
    expect(first.issues).toEqual([]);
    expect(first.fields).toMatchObject({ name:'Morgan Changed', employer:'Independent Employer', gross_pay:'1234.56', net_pay:'1000.01', pay_date:'2026-09-04' });
    const second = await extractDocument(payslip('Sam Different','2000.00','1750.00','250.00'), 'application/pdf', 'payslip');
    expect(second.issues).toEqual([]);
    expect(second.fields).toMatchObject({name:'Sam Different',gross_pay:'2000.00',net_pay:'1750.00'});
  });
  it('flags inconsistent arithmetic, impossible dates, and wrong types', async () => {
    const bad = await extractDocument(payslip('Alex','1000.00','900.00','200.00','31 Feb 2026'), 'application/pdf', 'payslip');
    expect(bad.issues.join(' ')).toContain('arithmetic mismatch');
    expect(bad.issues.join(' ')).toContain('impossible date');
    expect(bad.fields.pay_date).toBeUndefined();
    const wrong = await extractDocument(payslip(), 'application/pdf', 'bank_statement');
    expect(wrong.issues.join(' ')).toContain('Wrong document type');
    expect(wrong.fields).toEqual({});
  });
  it('reconciles independent multi-page statements and flags row and summary tampering', async () => {
    const statement = (balance = '125.00', closing = '125.00') => {
      const header: Array<[number,number,string]> = [[40,500,'DATE'],[110,500,'DESCRIPTION'],[370.55,500,'DEBIT'],[423.89,500,'CREDIT'],[503.87,500,'BALANCE']];
      const amount = (right: number, y: number, s: string): [number,number,string] => [right - ((s.length - 1)*5.56+2.78),y,s];
      return pdf([
        [[40,760,'Transaction account statement'],[40,720,'Bank'],[40,705,'Example Credit Union'],[40,670,'Account holder'],[40,655,'Taylor Reader'],[40,620,'BSB / account'],[40,605,'123-456 998877'],[300,720,'Statement period'],[300,705,'01 Sep 2026 - 30 Sep 2026'],[300,670,'Opening balance'],[300,655,'$100.00'],[300,620,'Closing balance'],[300,605,`$${closing}`],...header,[40,470,'02 Sep'],[110,470,'Purchase'],amount(400,470,'$25.00'),amount(550,470,'$75.00')],
        [...header,[40,470,'03 Sep'],[110,470,'Deposit'],amount(460,470,'$50.00'),amount(550,470,`$${balance}`)],
      ]);
    };
    const good = await extractDocument(statement(),'application/pdf','bank_statement');
    expect(good.issues).toEqual([]);
    expect(good.transactions.map(t => t.amountMinor)).toEqual([-2500,5000]);
    expect(good.fields).toMatchObject({name:'Taylor Reader',account:'998877',opening_balance:'100.00',closing_balance:'125.00'});
    const bad = await extractDocument(statement('126.00','130.00'),'application/pdf','bank_statement');
    expect(bad.issues.join(' ')).toContain('row does not reconcile');
    expect(bad.issues.join(' ')).toContain('opening/closing balance');
  });
  it('returns explicit review issues without fabricated fields for scans, invalid bytes and unsupported media/layouts', async () => {
    for (const [bytes,media] of [[pdf([[]]),'application/pdf'],[Buffer.from('invalid'),'application/pdf'],[pdf([[[40,700,'Unrecognised report']]]),'application/pdf'],[Buffer.from('image'),'image/png']] as const) {
      const result = await extractDocument(bytes,media,'drivers_licence');
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.fields).toEqual({}); expect(result.transactions).toEqual([]);
    }
  });
});
