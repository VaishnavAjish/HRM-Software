// Mirrors the web app's PrintableTrialForm.jsx (desktop/print branch) — same
// dotted outer frame, same bordered table, same column widths, and the same
// blank-when-missing behaviour. The web prints "" for an empty field, not a
// dash, so this does too; a dash would read as a deliberate "none".
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

function up(v) {
  return v ? String(v).toUpperCase() : '';
}

/** Two label/value pairs on one row. */
function pairRow(l1, v1, l2, v2, opts = {}) {
  const v1Html = escapeHtml(opts.raw1 ? (v1 || '') : up(v1));
  const v2Html = escapeHtml(opts.raw2 ? (v2 || '') : up(v2));
  return `
    <tr>
      <td class="lbl half">${escapeHtml(l1)}</td><td class="val half-val${opts.lower1 ? ' lower' : ''}">${v1Html}</td>
      <td class="lbl half">${escapeHtml(l2)}</td><td class="val half-val${opts.lower2 ? ' lower' : ''}">${v2Html}</td>
    </tr>`;
}

/** One label with a value spanning the remaining three columns. */
function fullRow(label, value, opts = {}) {
  const v = escapeHtml(opts.raw ? (value || '') : up(value));
  return `
    <tr>
      <td class="lbl full">${escapeHtml(label)}</td>
      <td class="val${opts.lower ? ' lower' : ''}" colspan="3">${v}</td>
    </tr>`;
}

function signature(value, caption) {
  return `
    <div class="sign-cell">
      <div class="sign-line">${escapeHtml(up(value))}</div>
      <p>${escapeHtml(caption)}</p>
    </div>`;
}

function attachmentsSection(raw) {
  // The candidate photo now prints inline in the header, matching the web's
  // admin TrialForm.jsx layout — listing it here too would duplicate it.
  const docs = [
    { label: 'Aadhaar Card', url: raw?.adhar_image },
  ].filter((d) => typeof d.url === 'string' && d.url.length > 0);

  if (!docs.length) return '';

  // One document per page, printed as large as the page allows. These sit
  // outside the bordered form so the form itself closes cleanly on page 1.
  return docs.map((d) => `
    <section class="attachment-page">
      <h2>${escapeHtml(d.label)}</h2>
      <div class="attachment-frame"><img src="${d.url}" /></div>
    </section>`).join('');
}

export function buildTrialPrintHtml(raw) {
  const hastakNameCode = [raw?.hastak_name, raw?.hastak_code ? `- ${raw.hastak_code}` : ''].filter(Boolean).join(' ');
  const aadhaar = raw?.aadhaar_full || raw?.adhar_card_no || raw?.aadhar_card_no || '';

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { margin: 14mm; }
        body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 0; padding: 0; }
        /* Keeps the whole bordered form — and its closing border — on page 1. */
        .doc {
          max-width: 850px; margin: 0 auto; background: #fff; color: #000;
          border: 1px dotted #4B5563; border-radius: 8px; padding: 24px;
          page-break-inside: avoid; break-inside: avoid;
          page-break-after: avoid; break-after: avoid;
        }
        .header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 4px; }
        .header .side { flex: 1; }
        .photo-box {
          width: 30mm; height: 40mm; border: 1px solid #000; background: #F9FAFB;
          display: flex; align-items: center; justify-content: center; overflow: hidden;
        }
        .photo-box img { width: 100%; height: 100%; object-fit: cover; }
        .photo-box span { font-size: 10px; color: #9CA3AF; }
        .header .center { flex: 1; text-align: center; }
        .header h1 { font-size: 24px; font-weight: 900; letter-spacing: 3px; text-transform: uppercase; margin: 0; }
        .badge {
          display: inline-block; margin-top: 4px; background: #111827; color: #fff;
          font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px;
          padding: 4px 16px; border-radius: 999px;
        }
        .header .right { flex: 1; text-align: right; font-size: 13px; font-weight: 600; }
        .header .right p { margin: 0 0 4px; }
        .header .right span { font-weight: 700; }
        .rule { border-top: 2px solid #000; margin: 8px 0 12px; }

        .section-banner {
          border-radius: 6px; background: #4F46E5; color: #fff;
          font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px;
          padding: 7px 12px; margin-bottom: 12px;
        }

        .table-wrap { border: 1px solid #000; border-radius: 8px; overflow: hidden; }
        table { width: 100%; border-collapse: collapse; font-size: 13px; }
        td { border: 1px solid #000; padding: 8px 12px; }
        td.lbl { background: #F9FAFB; font-size: 12px; font-weight: 700; text-transform: uppercase; }
        td.lbl.half { width: 16.66%; }
        td.lbl.full { width: 25%; }
        td.val { font-size: 13px; font-weight: 500; text-transform: uppercase; }
        td.val.half-val { width: 33.33%; }
        td.val.lower { text-transform: lowercase; }

        .signs {
          display: grid; grid-template-columns: 1fr 1fr; column-gap: 64px; row-gap: 32px;
          margin-top: 32px; font-size: 13px; font-weight: 700; text-align: center;
        }
        .sign-cell p { margin: 0; }
        .sign-line {
          height: 32px; border-bottom: 1px solid #000; margin-bottom: 4px; padding: 0 4px;
          font-size: 13px; font-weight: 600; text-transform: uppercase;
          display: flex; align-items: flex-end; justify-content: center;
        }

        /* Each document owns a full page; the form box stays whole on page 1. */
        .attachment-page {
          page-break-before: always; break-before: page;
          page-break-inside: avoid; break-inside: avoid;
          text-align: center;
        }
        .attachment-page h2 {
          font-size: 14px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.5px;
          margin: 0 0 12px; padding-bottom: 8px; border-bottom: 2px solid #000;
        }
        .attachment-frame { border: 1px solid #000; padding: 8px; }
        .attachment-page img { display: block; width: 100%; max-height: 235mm; object-fit: contain; }
      </style>
    </head>
    <body>
      <div class="doc">
        <div class="header">
          <div class="side">
            <div class="photo-box">${raw?.photo ? `<img src="${raw.photo}" />` : '<span>Photo</span>'}</div>
          </div>
          <div class="center">
            <h1>Nidhi Impex</h1>
            <div class="badge">Trial Form</div>
          </div>
          <div class="right">
            <p>Date : <span>${escapeHtml(fmtDate(raw?.trial_date))}</span></p>
            <p>Form No : <span>${escapeHtml(raw?.form_no || '')}</span></p>
          </div>
        </div>
        <div class="rule"></div>

        <div class="section-banner">Candidate Details</div>

        <div class="table-wrap">
          <table>
            <tbody>
              ${pairRow('Department', raw?.department, 'Designation', raw?.designation)}
              ${fullRow('Name of Employee', raw?.name)}
              ${fullRow('Aadhaar Number', aadhaar, { raw: true })}
              ${fullRow('Address', raw?.address)}
              ${pairRow('Mobile No 1', raw?.mobile_number, 'Gender', raw?.gender, { raw1: true })}
              ${pairRow('Mobile No 2', raw?.mobile_no_2, 'Email Id', raw?.email, { raw1: true, raw2: true, lower2: true })}
              ${fullRow('Last Company Name', raw?.last_company_name)}
              ${fullRow('Last Company Address', raw?.last_company_address)}
              ${pairRow('Experience', raw?.experience, 'Reason for Leaving', raw?.reason_for_leaving)}
              ${pairRow('Hastak Name &amp; Code', hastakNameCode, 'Hastak Mobile No', raw?.hastak_mobile, { raw2: true })}
              ${fullRow('Hastak Department/Designation', raw?.hastak_department)}
              ${fullRow('Contractor', raw?.contractor)}
              ${pairRow('Manager Name', raw?.manager_name, 'Akar', raw?.akar)}
            </tbody>
          </table>
        </div>

        <div class="signs">
          ${signature(raw?.emp_signature, 'Emp - Signature')}
          ${signature(raw?.manager_signature, 'Manager')}
          ${signature(raw?.hastak_signature, 'Hastak Signature')}
          ${signature(raw?.hr_signature, 'H R')}
        </div>
      </div>

      ${attachmentsSection(raw)}
    </body>
  </html>`;
}
