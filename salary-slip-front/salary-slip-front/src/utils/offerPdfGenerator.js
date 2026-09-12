import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const DEFAULT_COMPANY_POLICIES = {
  probation_period: "3 Months (90 Days) from the joining date, subject to performance review.",
  notice_period: "30 Days written notice or equivalent basic salary upon confirmation (15 days during probation).",
  work_hours: "Monday to Friday, 9:00 AM – 6:00 PM (45 Hours/Week) with 1-hour lunch break.",
  work_mode: "On-Site at Company Headquarters",
  leave_policy: "18 Days Earned Leave + 12 Days Casual/Medical Leave per annum, along with official public holidays.",
  benefits_perks: "Comprehensive Health Insurance (up to Rs. 5,00,000), Annual Performance Bonus, and L&D Allowance.",
  confidentiality: "Strict adherence to the Non-Disclosure Agreement (NDA), Data Security, and Intellectual Property policies.",
};

function sanitizePdfText(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/[₹\u20B9]/g, "Rs. ")
    .replace(/[•\u2022]/g, "|")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/[^\t\n\r -~]/g, " ");
}

/**
 * Generate official corporate offer letter PDF
 * Unified format for both Admin Offer Management and Candidate Career Portal
 */
export function generateOfferLetterPdf(application, offer, candidate = {}) {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  const candidateName = sanitizePdfText(candidate?.name || application?.candidate_name || offer?.candidate?.name || "Candidate");
  const candidateEmail = sanitizePdfText(candidate?.email || application?.candidate_email || offer?.candidate?.email || "");
  const candidatePhone = sanitizePdfText(candidate?.phone || application?.candidate_phone || offer?.candidate?.phone || "");
  const designation = sanitizePdfText(offer?.designation || application?.job_title || "Team Member");
  const refNo = `HR/OFFER/${new Date().getFullYear()}/${String(offer?.id || application?.id || "001").padStart(3, "0")}`;
  const dateStr = offer?.released_at
    ? new Date(offer.released_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // Top Navy Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, 210, 24, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text("NIDHI IMPEX HRMS", 14, 11);

  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text("Varachha Road, Surat, Gujarat 395006 | hr@nidhiimpex.com", 14, 18);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text("EMPLOYMENT OFFER LETTER", 196, 11, { align: "right" });
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(203, 213, 225);
  doc.text(`Ref: ${refNo}  |  Date: ${dateStr}`, 196, 18, { align: "right" });

  // Candidate Addressing Block
  let currentY = 34;
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("To,", 14, currentY);
  currentY += 5;
  doc.setFontSize(11);
  doc.text(candidateName, 14, currentY);
  currentY += 4.5;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  if (candidateEmail) {
    doc.text(`Email: ${candidateEmail}`, 14, currentY);
    currentY += 4;
  }
  if (candidatePhone) {
    doc.text(`Contact: ${candidatePhone}`, 14, currentY);
    currentY += 4;
  }

  currentY += 2;
  // Subject Banner
  doc.setFillColor(241, 245, 249);
  doc.roundedRect(14, currentY, 182, 8, 1.5, 1.5, "F");
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text(`Subject: Formal Offer of Employment — Position: "${designation}"`, 18, currentY + 5.5);
  currentY += 12;

  // Letter Body
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(51, 65, 85);
  doc.text(`Dear ${candidateName},`, 14, currentY);
  currentY += 5;

  const bodyText = "We are delighted to extend this formal offer of employment with our organization. Following our evaluation and interview rounds, we were thoroughly impressed by your background, domain expertise, and potential. We believe you will make a tremendous impact in this role.\n\nThe detailed breakup of your compensation package and key employment policies are summarized below:";
  doc.text(bodyText, 14, currentY, { maxWidth: 182, lineHeightFactor: 1.35 });
  currentY += 17;

  // Section 1: Compensation Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(37, 99, 235);
  doc.text("ANNEXURE A: ANNUAL & MONTHLY COMPENSATION STRUCTURE", 14, currentY);
  currentY += 3;

  const totalAnnual = Number(offer?.ctc_annual || 0);
  const totalMonthly = Math.round(totalAnnual / 12);

  let tableRows = [];
  if (Array.isArray(offer?.salary_breakup) && offer.salary_breakup.length > 0) {
    tableRows = offer.salary_breakup.map((item) => {
      const annualVal = Number(item.annual || (Number(item.monthly || 0) * 12) || (Number(item.amount || 0) * 12));
      const monthlyVal = Number(item.monthly || Math.round(annualVal / 12));
      return [
        sanitizePdfText(item.component || item.name || item.label || "Component"),
        `Rs. ${monthlyVal.toLocaleString("en-IN")}`,
        `Rs. ${annualVal.toLocaleString("en-IN")}`,
      ];
    });
  } else if (offer?.salary_breakup && typeof offer.salary_breakup === "object" && Object.keys(offer.salary_breakup).length > 0) {
    tableRows = Object.entries(offer.salary_breakup).map(([k, v]) => {
      const annualVal = Number(v) || 0;
      const monthlyVal = Math.round(annualVal / 12);
      return [
        sanitizePdfText(k),
        `Rs. ${monthlyVal.toLocaleString("en-IN")}`,
        `Rs. ${annualVal.toLocaleString("en-IN")}`,
      ];
    });
  } else {
    // Standard Indian Compliant Breakup if none specified
    const basicAnnual = Math.round(totalAnnual * 0.40);
    const hraAnnual = Math.round(totalAnnual * 0.20);
    const pfAnnual = Math.min(Math.round(basicAnnual * 0.12), 21600);
    const specialAllowanceAnnual = Math.max(0, totalAnnual - basicAnnual - hraAnnual - pfAnnual);

    tableRows = [
      ["Basic Salary (40%)", `Rs. ${Math.round(basicAnnual / 12).toLocaleString("en-IN")}`, `Rs. ${basicAnnual.toLocaleString("en-IN")}`],
      ["House Rent Allowance (HRA 20%)", `Rs. ${Math.round(hraAnnual / 12).toLocaleString("en-IN")}`, `Rs. ${hraAnnual.toLocaleString("en-IN")}`],
      ["Special & Supplementary Allowance", `Rs. ${Math.round(specialAllowanceAnnual / 12).toLocaleString("en-IN")}`, `Rs. ${specialAllowanceAnnual.toLocaleString("en-IN")}`],
      ["Employer Provident Fund (PF)", `Rs. ${Math.round(pfAnnual / 12).toLocaleString("en-IN")}`, `Rs. ${pfAnnual.toLocaleString("en-IN")}`],
    ];
  }

  tableRows.push([
    "Total Cost to Company (CTC)",
    `Rs. ${totalMonthly.toLocaleString("en-IN")}`,
    `Rs. ${totalAnnual.toLocaleString("en-IN")}`,
  ]);

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    head: [["Compensation Component", "Monthly Amount (INR)", "Annual Amount (INR)"]],
    body: tableRows,
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 2.5,
      lineColor: [226, 232, 240],
      lineWidth: 0.15,
      textColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    columnStyles: {
      0: { cellWidth: 102 },
      1: { cellWidth: 40, halign: "right" },
      2: { cellWidth: 40, halign: "right" },
    },
    didParseCell(data) {
      if (data.row.index === tableRows.length - 1) {
        data.cell.styles.fontStyle = "bold";
        data.cell.styles.fillColor = [239, 246, 255];
        data.cell.styles.textColor = [30, 64, 175];
      }
    },
  });

  currentY = doc.lastAutoTable.finalY + 6;

  // Section 2: Policies & Terms Table
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9.5);
  doc.setTextColor(37, 99, 235);
  doc.text("ANNEXURE B: SUMMARY OF EMPLOYMENT POLICIES & TERMS", 14, currentY);
  currentY += 3;

  const joiningStr = offer?.joining_date
    ? new Date(offer.joining_date).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })
    : "Mutually agreed date upon release";

  const policies = [
    ["1. Expected Joining Date", sanitizePdfText(joiningStr)],
    ["2. Probation Period", sanitizePdfText(offer?.probation_period || DEFAULT_COMPANY_POLICIES.probation_period)],
    ["3. Notice Period", sanitizePdfText(offer?.notice_period || DEFAULT_COMPANY_POLICIES.notice_period)],
    ["4. Working Hours & Shift", sanitizePdfText(offer?.work_hours || DEFAULT_COMPANY_POLICIES.work_hours)],
    ["5. Work Mode & Location", sanitizePdfText(offer?.work_mode || DEFAULT_COMPANY_POLICIES.work_mode)],
    ["6. Leave Policy", sanitizePdfText(offer?.leave_policy || DEFAULT_COMPANY_POLICIES.leave_policy)],
    ["7. Benefits & Insurance", sanitizePdfText(offer?.benefits_perks || DEFAULT_COMPANY_POLICIES.benefits_perks)],
    ["8. Confidentiality & NDA", sanitizePdfText(offer?.confidentiality || DEFAULT_COMPANY_POLICIES.confidentiality)],
  ];

  autoTable(doc, {
    startY: currentY,
    margin: { left: 14, right: 14 },
    body: policies,
    theme: "striped",
    styles: {
      fontSize: 7.5,
      cellPadding: 2.2,
      textColor: [51, 65, 85],
      lineColor: [241, 245, 249],
      lineWidth: 0.1,
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 46, textColor: [30, 41, 59] },
      1: { cellWidth: 136 },
    },
  });

  currentY = doc.lastAutoTable.finalY + 7;

  // Check page break for signature block
  if (currentY > 245) {
    doc.addPage();
    currentY = 20;
  }

  // Acceptance Statement
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(71, 85, 105);
  doc.text(
    "Please confirm your acceptance of this offer by signing and returning a copy within the validity period.",
    14,
    currentY,
    { maxWidth: 182 }
  );
  currentY += 9;

  // Signature Block
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);
  doc.text("For NIDHI IMPEX (Authorized HR):", 14, currentY);
  doc.text("Candidate Acceptance Sign-off:", 114, currentY);
  currentY += 13;

  doc.setDrawColor(148, 163, 184); // slate-400
  doc.line(14, currentY, 80, currentY);
  doc.line(114, currentY, 185, currentY);
  currentY += 4;

  const isAccepted = offer?.status === "accepted" || application?.is_offer_accepted || application?.stage === "offer_accepted";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text("Authorized Signatory & Seal", 14, currentY);

  if (isAccepted) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(22, 163, 74); // Emerald 600
    const acceptedAt = offer?.responded_at
      ? new Date(offer.responded_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
      : "Verified";
    doc.text(`[DIGITALLY ACCEPTED - ${acceptedAt}]`, 114, currentY);
  } else {
    doc.text(`${candidateName} (Signature & Date)`, 114, currentY);
  }

  // Footer
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  doc.text("Strictly Confidential & Proprietary — Nidhi Impex HRMS", 105, 290, { align: "center" });

  return doc;
}

/**
 * Trigger browser download of offer letter PDF
 */
export function downloadOfferLetterPdf(application, offer, candidate = {}) {
  const doc = generateOfferLetterPdf(application, offer, candidate);
  const candidateSlug = (candidate?.name || application?.candidate_name || offer?.candidate?.name || "candidate")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "-");
  const fileName = `Offer-Letter-${candidateSlug}-${offer?.id || application?.id || "HRMS"}.pdf`;
  doc.save(fileName);
}
