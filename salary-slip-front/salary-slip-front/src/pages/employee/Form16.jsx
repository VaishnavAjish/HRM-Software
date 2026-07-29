import { useEffect, useState } from "react";
import { Download, FileText, Loader2, ChevronDown } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
import { salaryApi } from "../../utils/api";
import { downloadForm16PDF } from "../../utils/exportUtils";
import { buildForm16DocumentData } from "../../utils/form16Utils";
import Form16Document from "../../components/form16/Form16Document";
import toast from "react-hot-toast";

const FY_OPTIONS = [
  { value: "2024-25", label: "FY 2024-25 (AY 2025-26)" },
  { value: "2023-24", label: "FY 2023-24 (AY 2024-25)" },
  { value: "2022-23", label: "FY 2022-23 (AY 2023-24)" },
];

const selectCls =
  "appearance-none rounded-lg border border-gray-200 bg-white py-2 pl-3 pr-8 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300";

function mapEmployee(item) {
  const allowances =
    Number(item.da ?? 0) +
    Number(item.hra ?? 0) +
    Number(item.wa ?? 0) +
    Number(item.conv_a ?? 0) +
    Number(item.edu_a ?? 0) +
    Number(item.med_a ?? 0) +
    Number(item.mob_a ?? 0) +
    Number(item.owa ?? 0) +
    Number(item.ppa ?? 0) +
    Number(item.pda ?? 0);

  return {
    id: item.id,
    name: item.emp_name ?? item.name ?? "",
    empCode: String(item.emp_code ?? ""),
    companyLabel: getCompanyConfig(item.company_code)?.label || "",
    unit: item.unit ?? "",
    role: item.designation ?? "",
    designation: item.designation ?? "",
    department: item.department ?? "",
    basicSalary: Number(item.basic ?? 0),
    allowances,
    bonus: Number(item.product_incentive ?? 0),
  };
}

export default function Form16() {
  const { user } = useAuth();
  const { companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [fy, setFy] = useState("2024-25");

  useEffect(() => {
    let cancelled = false;
    async function fetchForm16Data() {
      setLoading(true);
      try {
        const res = await salaryApi.getEmployeeDashboard(
          user?.accessToken,
          user?.tokenType,
          companyId
        );
        if (!cancelled) {
          const dashData = res?.data ?? res ?? {};
          const slipList = dashData?.recent_slips || dashData?.salary_list || [];
          const latestSlip = slipList[0];
          
          if (latestSlip) {
            setEmployee(mapEmployee(latestSlip));
          } else {
            // fallback if no slips
            setEmployee(mapEmployee({ ...dashData?.user, company_code: companyId }));
          }
        }
      } catch (err) {
        if (!cancelled) toast.error("Failed to load Form 16 data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    
    if (user?.accessToken) fetchForm16Data();
    return () => {
      cancelled = true;
    };
  }, [user, companyId]);

  const data = employee ? buildForm16DocumentData(employee, fy) : null;
  const fyLabel = FY_OPTIONS.find((item) => item.value === fy)?.label || fy;

  const handleDownload = () => {
    if (!employee || !data) return;
    downloadForm16PDF({ emp: employee, fy, data });
    toast.success(`Form 16 downloaded for ${fyLabel}`);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-brand-600" size={32} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-600/30">
            <FileText size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Form 16
            </h1>
            <p className="text-xs text-gray-400">
              Preview and download your tax documents
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className={selectCls}
            >
              {FY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2">
              <ChevronDown size={14} className="text-gray-400" />
            </div>
          </div>
          <button
            onClick={handleDownload}
            disabled={!data}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            <Download size={16} /> Download PDF
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {data ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800/50">
            <div className="min-w-fit rounded-xl bg-white shadow-sm ring-1 ring-black/5">
              <Form16Document data={data} />
            </div>
          </div>
        ) : (
          <div className="flex h-48 items-center justify-center text-sm text-gray-400">
            No salary data available to generate Form 16.
          </div>
        )}
      </div>
    </div>
  );
}
