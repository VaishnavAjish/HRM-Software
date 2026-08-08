// Rebuilds the web app's PrintableTrialForm.jsx as static HTML, matching its
// desktop/print table layout (the mobile-stacked view is print:hidden on web).
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function up(v) {
  return v ? String(v).toUpperCase() : '-';
}

function pairRow(l1, v1, l2, v2, opts = {}) {
  const v1Html = opts.lowercase1 ? escapeHtml(v1 || '-') : escapeHtml(up(v1));
  const v2Html = opts.lowercase2 ? escapeHtml(v2 || '-') : escapeHtml(up(v2));
  return `
    <tr>
      <td class="label">${escapeHtml(l1)}</td><td class="value">${v1Html}</td>
      <td class="label">${escapeHtml(l2)}</td><td class="value">${v2Html}</td>
    </tr>`;
}

function fullRow(label, value, opts = {}) {
  const v = opts.lowercase ? escapeHtml(value || '-') : escapeHtml(up(value));
  return `
    <tr>
      <td class="label">${escapeHtml(label)}</td>
      <td class="value" colspan="3">${v}</td>
    </tr>`;
}

function attachmentsSection(raw) {
  const docs = [
    { label: 'Candidate Photo', url: raw?.photo },
    { label: 'Aadhaar Card', url: raw?.adhar_image },
  ].filter((d) => typeof d.url === 'string' && d.url.length > 0);

  if (!docs.length) return '';

  return `
    <div class="attachments">
      <h2>Attached Documents</h2>
      <div class="attach-grid">
        ${docs.map((d) => `
          <div class="attach-item">
            <div class="cap">${escapeHtml(d.label)}</div>
            <img src="${d.url}" />
          </div>`).join('')}
      </div>
    </div>`;
}

export function buildTrialPrintHtml(raw) {
  const hastakNameCode = [raw?.hastak_name, raw?.hastak_code ? `- ${raw.hastak_code}` : ''].filter(Boolean).join(' ');
  const aadhaar = raw?.aadhaar_full || raw?.adhar_card_no || raw?.aadhar_card_no || '';

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 18px; }
        .doc { max-width: 820px; margin: 0 auto; border: 1px solid #555; border-radius: 8px; padding: 20px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; }
        .header .spacer { flex: 1; }
        .header .center { flex: 1; text-align: center; }
        .header h1 { font-size: 22px; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; margin: 0; }
        .badge { display: inline-block; margin-top: 6px; background: #111; color: #fff; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; padding: 3px 14px; border-radius: 999px; }
        .header .right { flex: 1; text-align: right; font-size: 13px; font-weight: 600; }
        .hr { border-top: 2px solid #000; margin: 8px 0 14px; }
        table.info { width: 100%; border-collapse: collapse; border: 1px solid #000; border-radius: 8px; overflow: hidden; font-size: 13px; }
        table.info td { border: 1px solid #000; padding: 6px 10px; }
        table.info td.label { background: #f5f5f5; font-size: 11px; font-weight: 700; text-transform: uppercase; width: 22%; }
        table.info td.value { font-weight: 600; text-transform: uppercase; }
        .sign-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 60px; row-gap: 28px; margin-top: 32px; font-size: 13px; font-weight: 700; text-align: center; }
        .sign-grid .line { border-bottom: 1px solid #000; height: 26px; margin-bottom: 4px; }
        .attachments { margin-top: 24px; page-break-before: always; }
        .attachments h2 { font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 14px; }
        .attach-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .attach-item { width: 220px; }
        .attach-item .cap { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .attach-item img { width: 100%; height: 160px; object-fit: contain; border: 1px solid #999; background: #f8f8f8; }
      </style>
    </head>
    <body>
      <div class="doc">
        <div class="header">
          <div class="spacer"></div>
          <div class="center">
            <h1>Nidhi Impex</h1>
            <div class="badge">Trial Form</div>
          </div>
          <div class="right">
            Date : ${escapeHtml(fmtDate(raw?.trial_date))}<br/>
            Form No : ${escapeHtml(raw?.form_no || '-')}
          </div>
        </div>
        <div class="hr"></div>

        <table class="info">
          ${pairRow('Department', raw?.department, 'Designation', raw?.designation)}
          ${fullRow('Name of Employee', raw?.name)}
          ${fullRow('Aadhaar Number', aadhaar, { lowercase: true })}
          ${fullRow('Address', raw?.address)}
          ${pairRow('Mobile No 1', raw?.mobile_number, 'Gender', raw?.gender)}
          ${pairRow('Mobile No 2', raw?.mobile_no_2, 'Email Id', raw?.email, { lowercase2: true })}
          ${fullRow('Last Company Name', raw?.last_company_name)}
          ${fullRow('Last Company Address', raw?.last_company_address)}
          ${pairRow('Experience', raw?.experience, 'Reason for Leaving', raw?.reason_for_leaving)}
          ${pairRow('Hastak Name & Code', hastakNameCode, 'Hastak Mobile No', raw?.hastak_mobile)}
          ${fullRow('Hastak Department/Designation', raw?.hastak_department)}
          ${fullRow('Contractor', raw?.contractor)}
          ${pairRow('Manager Name', raw?.manager_name, 'Akar', raw?.akar)}
        </table>

        <div class="sign-grid">
          <div><div class="line"></div>Emp - Signature</div>
          <div><div class="line"></div>Manager</div>
          <div><div class="line"></div>Hastak Signature</div>
          <div><div class="line"></div>H R</div>
        </div>

        ${attachmentsSection(raw)}
      </div>
    </body>
  </html>`;
}
