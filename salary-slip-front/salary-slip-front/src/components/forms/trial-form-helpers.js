/**
 * Pure helpers for trial-form data.
 *
 * Kept apart from PrintableTrialForm.jsx so that file exports nothing but the
 * component: fast refresh can only preserve state for a module whose exports
 * are all components, and mixing these in meant editing a date formatter
 * remounted the print preview.
 */
export function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null) ?? "";
}

export function normalizeTrialForm(item, index) {
  let displayStatus;
  if (Number(item.checkbox) === 1) {
    displayStatus = "Approved";
  } else {
    const rawStatus = String(firstPresent(item.status, item.form_status, "0"));
    if (rawStatus === "2") displayStatus = "Rejected";
    else displayStatus = "Pending";
  }

  return {
    id: firstPresent(item.id, item.trial_form_id, item._id, index),
    status: displayStatus,
    isPrinted: Number(item.print ?? 0) === 1,
    fromNo: firstPresent(item.form_no, item.fromNo),
    date: firstPresent(item.trial_date, item.date, item.created_at),
    department: firstPresent(item.department, item.dept),
    designation: firstPresent(item.designation, item.desig),
    name: firstPresent(item.name, item.employee_name),
    address: item.address || "-",
    mobileNo1: firstPresent(item.mobile_number, item.mobileNo1),
    mobileNo2: firstPresent(item.mobile_no_2, item.mobileNo2),
    gender: item.gender || "-",
    email: item.email || "-",
    unit: firstPresent(item.unit, item.unit_name),
    lastCompanyName: firstPresent(item.last_company_name, item.lastCompanyName),
    lastCompanyAddress: firstPresent(
      item.last_company_address,
      item.lastCompanyAddress,
    ),
    experience: item.experience || "-",
    reasonForLeaving: firstPresent(
      item.reason_for_leaving,
      item.reasonForLeaving,
    ),
    hastakName: firstPresent(item.hastak_name, item.hastakName),
    hastakCode: firstPresent(item.hastak_code, item.hastakCode),
    hastakMobileNo: firstPresent(item.hastak_mobile, item.hastakMobileNo),
    hastakDepartment: firstPresent(item.hastak_department, item.hastakDepartment),
    contractor: item.contractor || "-",
    managerName: firstPresent(item.manager_name, item.managerName),
    akar: item.akar || "-",
    aadharCardNo: firstPresent(
      item.aadhar_card_no,
      item.aadhaar_full,
      item.aadhar_full,
      item.aadhar_no,
      item.aadharNo
    ),
    empSignature: item.emp_signature || "",
    managerSignature: item.manager_signature || "",
    hastakSignature: item.hastak_signature || "",
    hrSignature: item.hr_signature || "",
    submittedAt: firstPresent(
      item.created_at,
      item.createdAt,
      item.submitted_at,
    ),
    raw: item,
  };
}

export function formatDate(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
