import { getCompanyInfo } from './companyConfig';
import { numberToWords } from './numberToWords';

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function money(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Rebuilds the web app's PayslipDocument template (src/components/.../PayslipDocument.jsx)
// as static HTML so the mobile PDF matches the web download exactly.
export function buildPayslipHtml(detail) {
  const company = getCompanyInfo(detail.company_code);
  const isSilver = company.payslipVariant === 'silver-star';

  const month = Number(detail.month) || new Date().getMonth() + 1;
  const year = Number(detail.year) || new Date().getFullYear();
  const monthLabel = `${MONTH_ABBR[month - 1]}-${year}`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const dateFrom = `01/${pad2(month)}/${year}`;
  const dateTo = `${pad2(daysInMonth)}/${pad2(month)}/${year}`;

  const user = detail.user || {};
  const empName = detail.emp_name || user.name || '';
  const empCode = detail.emp_code || '';
  const department = detail.department || user.department || '';
  const designation = detail.designation || user.designation || '';
  const unit = detail.unit || user.unit || '';
  const bankAccount = detail.account_no || user.bank_account_no || '';
  const bankName = user.bank_name || '';
  const bankIfsc = detail.bank_ifsc || user.bank_ifsc_code || '';
  const mobile = user.mobile_number || '';
  const pfNo = user.pf_no || '';
  const esiNo = user.esi_no || '';

  const earningRows = [
    ['Basic', detail.basic],
    ['DA', detail.da],
    ['HRA', detail.hra],
  ].filter(([, v]) => v != null);

  const deductionRows = [
    ['PF', detail.pf],
    ['ESI', detail.esi],
    ['TDS', detail.tds],
    ['Advance', detail.advance],
  ].filter(([, v]) => v != null);

  const totalEarnings = earningRows.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  const totalDeductions = deductionRows.reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
  const netPay = detail.net_payable ?? totalEarnings - totalDeductions;

  const rowCount = Math.max(earningRows.length, deductionRows.length, 4);
  const earningDeductionRows = Array.from({ length: rowCount }).map((_, i) => {
    const e = earningRows[i];
    const d = deductionRows[i];
    return `
      <tr>
        <td class="ed-label">${e ? escapeHtml(e[0]) : ''}</td>
        <td class="ed-amt">${e ? money(e[1]) : ''}</td>
        <td class="ed-amt">${e ? money(e[1]) : ''}</td>
        <td class="ed-label">${d ? escapeHtml(d[0]) : ''}</td>
        <td class="ed-amt">${d ? money(d[1]) : ''}</td>
        <td class="ed-amt">${d ? money(d[1]) : ''}</td>
      </tr>`;
  }).join('');

  const infoRows = isSilver
    ? [
        ['Employee Name', empName, 'Employee Code', empCode],
        ['Bank A/c No.', bankAccount, 'ESI A/c No', esiNo],
        ['Department', department, 'Designation', designation],
        ['Bank Name', bankName, 'UAN', ''],
        ['Mobile', mobile, '', ''],
      ]
    : [
        ['Employee Name', empName, 'Employee Code', empCode],
        ['Bank A/c No.', bankAccount, 'Bank Name', bankName],
        ['UAN', '', 'Mobile', mobile],
        ['Designation', designation, 'Unit', unit],
        ['PF Account No', pfNo, 'ESI ID No.', esiNo],
      ];

  const infoRowsHtml = infoRows
    .map(
      ([l1, v1, l2, v2]) => `
      <tr>
        <td class="info-label">${escapeHtml(l1)}</td>
        <td class="info-value">${l1 ? `: ${escapeHtml(v1 || '—')}` : ''}</td>
        <td class="info-label">${escapeHtml(l2)}</td>
        <td class="info-value">${l2 ? `: ${escapeHtml(v2 || '—')}` : ''}</td>
      </tr>`
    )
    .join('');

  const footerHtml = isSilver
    ? `
      <div class="netpay-box">
        <div class="netpay-row"><span class="netpay-label">Net Pay</span><span class="netpay-value">: Rs. ${money(netPay)}</span></div>
        <div class="netpay-row"><span class="netpay-label">In Words</span><span class="netpay-value">: Rs. ${numberToWords(netPay)} Only</span></div>
      </div>
      <p class="disclaimer">This is Computer Generated Sheet, does not require Signature.</p>
      <div class="sign-box">Authorised Signatory</div>
    `
    : `
      <div class="netpay-box">
        <div class="netpay-row highlight"><span class="netpay-label">Net Pay</span><span class="netpay-value">Rs. ${money(netPay)}</span></div>
        <div class="netpay-row"><span class="netpay-label">In Words</span><span class="netpay-value">: Rs. ${numberToWords(netPay)} Only</span></div>
      </div>
      <div class="misc-box">
        <div class="misc-header">Miscellaneous Information</div>
        <div class="misc-row"><span>SALARY</span><span>Rs. ${money(netPay)}</span></div>
        <p class="misc-italic">TDS Deducted Upto ${monthLabel}: Rs. Nil</p>
        <p class="disclaimer">This is Computer Generated Sheet, does not require Signature.</p>
        <div class="paid-row">
          <span>Paid On: —</span>
          <span class="company-repeat">${escapeHtml(company.name)}</span>
        </div>
      </div>
    `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, sans-serif; color: #000; margin: 0; padding: 20px; }
        article { max-width: 720px; margin: 0 auto; border: 2px solid #000; padding: 18px; }
        .header { display: grid; grid-template-columns: 90px 1fr 90px; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 10px; }
        .header h1 { font-size: 16px; margin: 0; text-transform: uppercase; text-align: center; }
        .header .addr { font-size: 9px; text-align: center; line-height: 1.4; margin-top: 3px; }
        .header .period { font-size: 12px; font-weight: bold; text-align: center; margin-top: 6px; }
        .header .range { font-size: 10px; text-align: center; }
        table.info { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 8px; }
        table.info td { border: 1px solid #000; padding: 4px 8px; font-size: 11px; }
        table.info .info-label { font-weight: normal; width: 20%; }
        table.info .info-value { font-weight: bold; width: 30%; }
        .attendance { display: grid; grid-template-columns: 1fr 1fr; border: 1px solid #000; border-top: none; margin-bottom: 8px; font-size: 11px; }
        .attendance div { padding: 4px 8px; border-top: 1px solid #000; border-right: 1px solid #000; }
        table.ed { width: 100%; border-collapse: collapse; border: 1px solid #000; margin-bottom: 8px; }
        table.ed th, table.ed td { border: 1px solid #000; padding: 4px 8px; font-size: 11px; text-align: left; }
        table.ed th { background: #f1f1f1; font-size: 10px; text-transform: uppercase; }
        .ed-amt { text-align: right !important; }
        table.ed tfoot td { font-weight: bold; border-top: 2px solid #000; }
        .netpay-box { border: 1px solid #000; margin-bottom: 8px; }
        .netpay-row { display: flex; padding: 5px 10px; font-size: 12px; border-bottom: 1px solid #000; }
        .netpay-row:last-child { border-bottom: none; }
        .netpay-row.highlight { background: #f7f7f7; font-weight: bold; }
        .netpay-label { width: 90px; }
        .netpay-value { font-weight: bold; }
        .misc-box { border: 1px solid #000; font-size: 10px; }
        .misc-header { background: #eee; font-weight: bold; padding: 4px 8px; border-bottom: 1px solid #000; }
        .misc-row { display: flex; justify-content: space-between; padding: 4px 8px; }
        .misc-italic { font-style: italic; padding: 0 8px; margin: 4px 0; }
        .disclaimer { font-weight: bold; padding: 0 8px; margin: 6px 0; font-size: 10px; }
        .paid-row { display: flex; justify-content: space-between; padding: 4px 8px 8px; font-weight: bold; }
        .sign-box { text-align: right; font-weight: bold; padding: 30px 8px 8px; font-size: 11px; }
      </style>
    </head>
    <body>
      <article>
        <div class="header">
          <div></div>
          <div>
            <h1>${escapeHtml(company.name)}</h1>
            <div class="addr">${company.addressLines.map(escapeHtml).join('<br/>')}</div>
            <div class="period">Pay Slip For the Month of ${monthLabel}</div>
            <div class="range">(From ${dateFrom} To ${dateTo})</div>
          </div>
          <div></div>
        </div>

        <table class="info">${infoRowsHtml}</table>

        <div class="attendance">
          <div>Total Paid Days : <b>${detail.paid_day ?? '—'}</b></div>
          <div>LWP : <b>${detail.leave ?? '—'}</b></div>
          <div>Net Paid Days : <b>${detail.present_days ?? '—'}</b></div>
          <div></div>
        </div>

        <table class="ed">
          <thead>
            <tr><th>Earnings</th><th>Scale Rs.</th><th>Amount Rs.</th><th>Deductions</th><th>Scale Rs.</th><th>Amount Rs.</th></tr>
          </thead>
          <tbody>${earningDeductionRows}</tbody>
          <tfoot>
            <tr>
              <td>Total Earnings</td><td class="ed-amt">${money(totalEarnings)}</td><td class="ed-amt">${money(totalEarnings)}</td>
              <td>Total Deductions</td><td class="ed-amt">${money(totalDeductions)}</td><td class="ed-amt">${money(totalDeductions)}</td>
            </tr>
          </tfoot>
        </table>

        ${footerHtml}
      </article>
    </body>
  </html>`;
}
