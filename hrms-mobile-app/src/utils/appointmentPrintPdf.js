// Rebuilds the web app's PrintableForm.jsx as static HTML, field-for-field,
// so the mobile "Print" output matches the web download exactly.
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

function up(v) {
  return v ? String(v).toUpperCase() : '';
}

function splitName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', mid: '', surname: '' };
  if (parts.length === 1) return { first: parts[0], mid: '', surname: '' };
  if (parts.length === 2) return { first: parts[0], mid: '', surname: parts[1] };
  return { first: parts[0], mid: parts.slice(1, -1).join(' '), surname: parts[parts.length - 1] };
}

function parseMembers(raw) {
  if (!raw) return [];
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

function attachmentsSection(raw) {
  const docs = [
    { label: 'Aadhaar Card', url: raw?.adhar_image },
    { label: 'PAN Card', url: raw?.pan_image },
    { label: 'Bank Cheque', url: raw?.check_image },
    { label: 'Account Book', url: raw?.account_book },
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

function fieldRow(label, value, opts = {}) {
  const display = opts.uppercase === false ? escapeHtml(value) : escapeHtml(up(value));
  return `
    <div class="field-row">
      <span class="field-label">${escapeHtml(label)}</span>
      <span class="field-colon">:</span>
      <span class="field-value">${display}</span>
    </div>`;
}

export function buildAppointmentPrintHtml(raw, printedByName) {
  const { first, mid, surname } = splitName(raw?.name);
  const members = parseMembers(raw?.members);
  const aadhaar = raw?.aadhaar_full || '';
  const containsFullAadhaar = /^\d{12}$/.test(String(aadhaar).replace(/\D/g, ''));
  const appointmentNumber = raw?.id ? `APT-${String(raw.id).padStart(6, '0')}` : '';
  const company = raw?.company_code || raw?.companyId || raw?.companyName || raw?.company || '';

  const memberRows = Array.from({ length: 4 }).map((_, i) => {
    const m = members[i] || {};
    return `
      <tr>
        <td class="center">${i + 1}</td>
        <td>${escapeHtml(m.name)}</td>
        <td class="center">${escapeHtml(up(m.relation))}</td>
        <td class="center">${escapeHtml(fmtDate(m.dob))}</td>
        <td class="center">${escapeHtml(m.mobile)}</td>
        <td class="center">${escapeHtml(up(m.occupation))}</td>
      </tr>`;
  }).join('');

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 18px; }
        .doc { max-width: 820px; margin: 0 auto; border: 1px solid #555; padding: 20px; }
        .banner { border: 2px solid #000; text-align: center; padding: 4px 8px; margin-bottom: 10px; }
        .banner .line1 { font-size: 11px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px; }
        .banner .line2 { font-size: 9px; font-weight: 600; margin-top: 2px; }
        h1 { text-align: center; font-size: 20px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0; }
        .hr { border-top: 2px solid #000; margin: 8px 0 20px; }
        .top-grid { display: flex; gap: 24px; align-items: flex-start; }
        .photo-box { width: 170px; height: 200px; border: 1px solid #999; background: #f8f8f8; display: flex; align-items: center; justify-content: center; font-size: 11px; color: #888; overflow: hidden; flex-shrink: 0; }
        .photo-box img { width: 100%; height: 100%; object-fit: cover; }
        .top-fields { flex: 1; }
        .field-row { display: flex; align-items: flex-end; gap: 6px; padding: 3px 0; font-size: 13px; }
        .field-label { font-weight: 700; width: 140px; flex-shrink: 0; }
        .field-colon { font-weight: 700; }
        .field-value { flex-grow: 1; border-bottom: 1px solid #000; padding: 0 2px 1px; min-height: 16px; }
        .body { margin-top: 16px; }
        .name-row { padding: 3px 0; }
        .name-row .field-label { width: 140px; }
        .name-cols { display: flex; gap: 16px; margin-left: 146px; }
        .name-col { flex: 1; text-align: center; }
        .name-col .field-value { text-align: center; font-weight: 700; text-transform: uppercase; }
        .name-caption { font-size: 9px; color: #444; font-weight: 700; margin-top: 2px; }
        .grid3 { display: flex; gap: 20px; padding: 6px 0; }
        .grid3 .field-row { flex: 1; padding: 0; }
        .grid2 { display: grid; grid-template-columns: 1fr 1fr; column-gap: 30px; row-gap: 4px; padding: 6px 0; }
        table.members { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
        table.members th, table.members td { border: 1px solid #000; padding: 5px 6px; }
        table.members th { background: #f2f2f2; font-weight: 700; }
        table.members .center { text-align: center; }
        .signoff { display: flex; gap: 24px; margin-top: 34px; font-size: 12px; font-weight: 700; }
        .signoff .cell { flex: 1; }
        .signoff .line { border-bottom: 1px solid #000; height: 26px; margin-bottom: 4px; }
        .signoff .sub { font-weight: 400; }
        .footer-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; margin-top: 20px; font-size: 11px; }
        .footer-row .label { font-weight: 700; text-transform: uppercase; }
        .footer-row .value { border-bottom: 1px solid #000; font-weight: 700; text-transform: uppercase; padding: 0 4px; }
        /* Kept inside the bordered form rather than forced onto its own page —
           a page break drops the documents outside the frame entirely. */
        .attachments { margin-top: 26px; padding-top: 16px; border-top: 2px solid #000; page-break-inside: avoid; }
        .attachments h2 { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px; }
        .attach-grid { display: flex; flex-wrap: wrap; gap: 16px; }
        .attach-item { width: 240px; page-break-inside: avoid; }
        .attach-item .cap { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .attach-item img { width: 100%; height: 170px; object-fit: contain; border: 1px solid #000; background: #fff; }
      </style>
    </head>
    <body>
      <div class="doc">
        ${containsFullAadhaar ? `
          <div class="banner">
            <div class="line1">Confidential — Contains Sensitive Identity Information</div>
            <div class="line2">${printedByName ? `Generated by ${escapeHtml(printedByName)} · ` : ''}${escapeHtml(appointmentNumber)}</div>
          </div>` : ''}

        <h1>Appointment Form</h1>
        <div class="hr"></div>

        <div class="top-grid">
          <div class="photo-box">${raw?.photo ? `<img src="${raw.photo}" />` : 'NO PHOTO'}</div>
          <div class="top-fields">
            ${fieldRow('Emp. Code', raw?.emp_code)}
            ${fieldRow('Joining Date', fmtDate(raw?.joining_date), { uppercase: false })}
            ${fieldRow('Department', raw?.department)}
            ${fieldRow('Designation', raw?.designation)}
            ${fieldRow('Manager Name', raw?.manager_name)}
            ${fieldRow('Salary', raw?.salary, { uppercase: false })}
            ${fieldRow('Emp. Mobile No', raw?.mobile_number, { uppercase: false })}
            ${fieldRow('Emp. Whatsapp No', raw?.emp_whatsapp_no, { uppercase: false })}
          </div>
        </div>

        <div class="body">
          ${fieldRow('Punching No', raw?.punching_no, { uppercase: false })}

          <div class="name-row">
            <div class="field-row" style="border:none;">
              <span class="field-label">Name</span>
            </div>
            <div class="name-cols">
              <div class="name-col"><div class="field-value">${escapeHtml(up(first))}</div><div class="name-caption">(FIRST NAME)</div></div>
              <div class="name-col"><div class="field-value">${escapeHtml(up(mid))}</div><div class="name-caption">(MID NAME)</div></div>
              <div class="name-col"><div class="field-value">${escapeHtml(up(surname))}</div><div class="name-caption">(SURNAME)</div></div>
            </div>
          </div>

          ${fieldRow('Email', raw?.email, { uppercase: false })}
          ${fieldRow('Resident Add', raw?.address, { uppercase: false })}

          <div class="grid3">
            ${fieldRow('Village', raw?.village)}
            ${fieldRow('Taluka', raw?.taluka)}
            ${fieldRow('District', raw?.district)}
          </div>

          <div class="grid2">
            ${fieldRow('Birth Date', fmtDate(raw?.dob), { uppercase: false })}
            ${fieldRow('Birth Place', raw?.birth_place)}
            ${fieldRow('Gender', raw?.gender)}
            ${fieldRow('Cast', raw?.cast)}
            ${fieldRow('Marital Status', raw?.marital_status)}
            ${fieldRow('Blood Group', raw?.blood_group)}
          </div>

          <div class="grid2">
            ${fieldRow('Reference Name', raw?.reference_name)}
            ${fieldRow('Reference Mobile', raw?.reference_mobile_no, { uppercase: false })}
            ${fieldRow('Aadhaar Card No', aadhaar, { uppercase: false })}
            ${fieldRow('Bank Name', raw?.bank_name)}
            ${fieldRow('PAN Card No', raw?.pan_card_no)}
            ${fieldRow('Bank IFSC Code', raw?.bank_ifsc_code)}
            ${fieldRow('Education', raw?.education)}
            ${fieldRow('Bank Account No', raw?.bank_account_no, { uppercase: false })}
          </div>
        </div>

        <table class="members">
          <thead>
            <tr><th class="center" style="width:36px;">Sr No</th><th>Family Members Name</th><th>Relation</th><th>D.O.B.</th><th>Mobile No</th><th>Occupation</th></tr>
          </thead>
          <tbody>${memberRows}</tbody>
        </table>

        <div class="signoff">
          <div class="cell"><div class="line"></div>Check By, Manager</div>
          <div class="cell"><div class="line"></div>Confirm By, <span class="sub">(Ketanbhai)</span></div>
          <div class="cell"><div class="line"></div>Auth. By, <span class="sub">HR Dept</span></div>
        </div>

        <div class="footer-row">
          <div>
            <span class="label">Company :</span> <span class="value">${escapeHtml(up(company))}</span><br/>
            <span class="label">Unit Name :</span> <span class="value">${escapeHtml(raw?.unit)}</span>
          </div>
          <div>
            <span class="label">Emp. Signature :</span> <span class="value">${escapeHtml(raw?.emp_signature)}</span>
          </div>
        </div>

        ${attachmentsSection(raw)}
      </div>
    </body>
  </html>`;
}
