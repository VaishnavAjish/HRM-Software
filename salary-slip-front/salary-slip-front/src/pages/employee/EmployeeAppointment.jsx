import { useEffect, useState, useRef } from "react";
import { useAuth } from "../../context/AuthContext";
import { authApi } from "../../utils/api";
import { Loader2, Printer, Download } from "lucide-react";
import toast from "react-hot-toast";
import { getCompanyConfig } from "../../config/companyConfig";
import PrintableForm from "../../components/forms/PrintableForm";
import { useReactToPrint } from "react-to-print";
import useIsMobile from "../../hooks/useIsMobile";
import { exportNodeToPdf } from "../../utils/pdfUtils";

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "") ?? "";
}

function formatDate(value) {
  if (!value || value === "-") return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

const DetailItem = ({ label, value }) => (
  <div className="flex flex-col gap-1 px-4 py-3 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100/50 dark:border-gray-700/30">
    <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{label}</span>
    <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{value || "—"}</span>
  </div>
);

const FamilyCard = ({ member, index }) => (
  <div className="flex flex-col gap-2.5 p-4 bg-gray-50 dark:bg-gray-700/40 rounded-xl border border-gray-100 dark:border-gray-700/50">
    <div className="flex justify-between items-center border-b border-gray-100 dark:border-gray-700 pb-1.5">
      <span className="text-[10px] font-bold text-gray-400 uppercase">Member #{index + 1}</span>
      {member.relation && <Badge variant="gray" className="capitalize">{member.relation}</Badge>}
    </div>
    <div className="grid grid-cols-2 gap-3">
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Name</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 capitalize">{member.name?.toLowerCase() || "—"}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Occupation</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200 capitalize">{member.occupation || "—"}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">D.O.B.</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{formatDate(member.dob)}</p>
      </div>
      <div>
        <p className="text-[9px] text-gray-400 font-bold uppercase">Mobile</p>
        <p className="text-xs font-bold text-gray-800 dark:text-gray-200">{member.mobile || "—"}</p>
      </div>
    </div>
  </div>
);

export default function EmployeeAppointment() {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [data, setData] = useState(null);
  const componentRef = useRef();

  const handlePrint = useReactToPrint({
    contentRef: componentRef,
    pageStyle: `
      @page { size: A4 portrait; margin: 4mm; }
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      [data-appointment-print-form] {
        zoom: 0.72;
        width: 850px !important;
        max-width: none !important;
        box-shadow: none !important;
        border: 1px dotted #555 !important;
      }
    `,
  });

  // The on-screen preview is fixed-width and unreadable on a phone screen
  // (min-w-[720px]), so mobile gets a straight PDF download instead of the
  // print dialog — window.print() is also unreliable inside the Android
  // WebView the mobile app runs in.
  const handleDownload = async () => {
    if (!componentRef.current) return;
    setDownloading(true);
    try {
      const fileName = `Appointment_${(data?.fullName || "Form").replace(/\s+/g, "_")}.pdf`;
      await exportNodeToPdf(componentRef.current, fileName, { fitToOnePage: true });
    } catch {
      toast.error("Failed to generate PDF");
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await authApi.getProfile(user?.accessToken, user?.tokenType);
        const item = res?.user || res?.data || res;
        
        const fullName = firstPresent(
          item.full_name,
          item.fullName,
          item.emp_name,
          item.employee_name,
          typeof item.name === "string" ? item.name : ""
        );

        let parsedMembers = [];
        try {
          let m = item.members;
          if (typeof m === "string" && m.trim() !== "") {
            let firstParse = JSON.parse(m);
            m = typeof firstParse === "string" ? JSON.parse(firstParse) : firstParse;
          }
          if (Array.isArray(m)) {
            parsedMembers = m.filter(mem => mem?.name);
          }
        } catch (e) {}

        const normalizedData = {
          empCode: firstPresent(item.empCode, item.emp_code),
          fullName: fullName || "-",
          department: firstPresent(item.department, item.dept),
          managerName: firstPresent(item.managerName, item.manager_name),
          joiningDate: firstPresent(item.joiningDate, item.joining_date),
          empMobile: firstPresent(item.empMobile, item.mobile_number, item.emp_mobile, item.mobile_no),
          empWhatsapp: firstPresent(item.empWhatsapp, item.emp_whatsapp_no, item.emp_whatsapp),
          refName: firstPresent(item.refName, item.reference_name, item.ref_name),
          refMobile: firstPresent(item.refMobile, item.reference_mobile_no, item.ref_mobile),
          aadharNo: firstPresent(item.aadharNo, item.aadhar_card_no, item.aadhar_no),
          panNo: firstPresent(item.panNo, item.pan_card_no, item.pan_no),
          bankName: firstPresent(item.bankName, item.bank_name),
          accountNo: firstPresent(item.accountNo, item.bank_account_no, item.account_no),
          ifscCode: firstPresent(item.ifscCode, item.bank_ifsc_code, item.ifsc_code, item.bank_ifsc),
          unitName: firstPresent(item.unitName, item.unit_name, item.unit),
          companyCode: item.company_code || "-",
          salary: item.salary || "-",
          designation: item.designation || "-",
          email: item.email || "-",
          education: item.education || "-",
          punchingNo: item.punching_no || "-",
          address: item.address || "-",
          village: item.village || "-",
          taluka: item.taluka || "-",
          district: item.district || "-",
          dob: item.dob || "-",
          birthPlace: item.birth_place || "-",
          gender: item.gender || "-",
          cast: item.cast || "-",
          maritalStatus: item.marital_status || "-",
          bloodGroup: item.blood_group || "-",
          photo: item.photo || null,
          signature: item.emp_signature || "-",
          members: parsedMembers,
        };
        
        setData(normalizedData);
      } catch (err) {
        toast.error("Failed to load appointment data");
      } finally {
        setLoading(false);
      }
    }
    
    fetchProfile();
  }, [user]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
      </div>
    );
  }

  if (!data) return null;

  const companyTheme = getCompanyConfig(data.companyCode)?.theme || "indigo";

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-10" data-theme={companyTheme}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">My Appointment Form</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Read-only view of your original appointment details.</p>
        </div>
        {isMobile ? (
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="flex flex-shrink-0 items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
            {downloading ? "Preparing..." : "Download Form"}
          </button>
        ) : (
          <button onClick={handlePrint} className="flex flex-shrink-0 items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-semibold transition-colors">
            <Printer size={16} />
            Print Form
          </button>
        )}
      </div>

      {isMobile ? (
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-8 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your appointment form is laid out for a full page and isn't shown
            here on a phone screen — tap "Download Form" above to save it as
            a PDF instead.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-6 flex justify-center">
          <PrintableForm data={data} formRef={componentRef} />
        </div>
      )}

      {isMobile && (
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px" }}>
          <PrintableForm data={data} formRef={componentRef} />
        </div>
      )}
    </div>
  );
}
