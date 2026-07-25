import { useEffect, useRef, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import Badge from "../../components/ui/Badge";
import PayslipDocument from "../../components/payslip/PayslipDocument";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import useIsMobile from "../../hooks/useIsMobile";
import {
  formatCurrency,
  formatDate,
} from "../../utils/payslipUtils";
import { salaryApi } from "../../utils/api";
import { exportNodeToPdf } from "../../utils/pdfUtils";


const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function mapSlip(item) {
  const monthName = MONTH_NAMES[parseInt(item.month, 10) - 1] ?? "";
  return {
    id: item.id,
    company_code: item.company_code,
    unit: item.unit,
    month: `${monthName} ${item.year}`,
    amount: Number(item.net_payable ?? 0),
    status: item.status ?? "Paid",
    date: item.pay_date ?? item.date ?? "",
    // earnings
    basicSalary: Number(item.basic ?? 0),
    da: Number(item.da ?? 0),
    hra: Number(item.hra ?? 0),
    wa: Number(item.wa ?? 0),
    conveyance: Number(item.conv_a ?? 0),
    education: Number(item.edu_a ?? 0),
    medical: Number(item.med_a ?? 0),
    mobileAllowance: Number(item.mob_a ?? 0),
    bonus: Number(item.product_incentive ?? 0),
    aGross: Number(item.a_gross ?? 0),
    grossSalary: Number(item.gross_salary ?? 0),
    // deductions
    deductions: Number(item.total_deduct ?? 0),
    pt: Number(item.pt ?? 0),
    pf: Number(item.pf ?? 0),
    esi: Number(item.esi ?? 0),
    tds: Number(item.tds ?? 0),
    lwf: Number(item.lwf ?? 0),
    advance: Number(item.advance ?? 0),
    // attendance
    totalPaidDays: Number(item.paid_day ?? 26),
    leave: Number(item.leave ?? 0),
    lwp: Number(item.leave ?? 0),
    // employee info — mapped to field names buildPayslipData reads
    name: item.emp_name ?? item.name,
    empCode: String(item.emp_code ?? item.empCode ?? ""),
    mainDepartment: item.main_department,
    department: item.department,
    role: item.designation,
    designation: item.designation,
    bankAccount: item.bank_account ?? item.account_no ?? item.bankAccount,
    bankName: item.bank_name ?? item.account_name ?? item.bankName,
    accountName: item.account_name,
    bankIfsc: item.bank_ifsc,
    uan: item.uan ?? item.pf_uan,
    pfUan: item.pf_uan,
    esiNo: item.esi_no,
    phone: item.mobile_no ?? item.mobile ?? item.phone,
    mobileNo: item.mobile_no,
  };
}

export default function Payslips() {
  const { company, companyId } = useCompany();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [payslips, setPayslips] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const sentinelRef = useRef(null);
  const payslipRef = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const { user } = useAuth();
  const isMobile = useIsMobile(768);

  const employee = {
    name: user?.name,
    empCode: user?.empCode ?? user?.emp_code,
    bankAccount: user?.bankAccount ?? user?.bank_account,
    bankName: user?.bankName ?? user?.bank_name,
    uan: user?.uan,
    phone: user?.phone ?? user?.mobile,
    role: user?.role ?? user?.designation,
  };

  // Fetch triggered whenever page changes
  useEffect(() => {
    const isFirst = page === 1;
    let cancelled = false;

    async function load() {
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await salaryApi.getSlips(
          user?.accessToken,
          user?.tokenType,
          page,
          15,
          { emp_code: user?.empCode ?? user?.emp_code },
          companyId,
        );
        if (cancelled) return;
        const pagination = res?.pagination;
        const mapped = (res?.data ?? []).map(mapSlip);
        setPayslips((prev) => (isFirst ? mapped : [...prev, ...mapped]));
        setHasMore(!!pagination && pagination.current_page < pagination.last_page);
        if (isFirst && mapped.length > 0) setSelected(mapped[0]);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load payslips");
      } finally {
        if (!cancelled) {
          if (isFirst) setLoading(false);
          else setLoadingMore(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, page]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPayslips([]);
    setSelected(null);
    setDetail(null);
    setHasMore(false);
    setPage(1);
  }, [companyId]);

  // IntersectionObserver on sentinel div at bottom of list
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel || !hasMore) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingMore) {
          observer.disconnect();
          setPage((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore]);

  // Fetch full detail whenever selected item changes
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;

    async function loadDetail() {
      setDetailLoading(true);
      try {
        const res = await salaryApi.getSlipDetail(
          selected.id,
          user?.accessToken,
          user?.tokenType,
          companyId,
        );
        if (cancelled) return;
        const item = res?.data ?? res;
        setDetail(mapSlip(item));
      } catch (err) {
        if (!cancelled) {
          toast.error(err.message || "Failed to load payslip details");
          setDetail(selected);
        }
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      cancelled = true;
    };
  }, [companyId, selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (!detail || !payslipRef.current) return;
    setPdfLoading(true);
    try {
      const el =
        payslipRef.current.querySelector("article") ?? payslipRef.current;

      const safeCode = String(detail?.empCode || "EMP").replace(/\s+/g, "-");
      const safeMon = String(detail?.month || "payslip").replace(/\s+/g, "-");

      await exportNodeToPdf(el, `payslip-${safeCode}-${safeMon}.pdf`);
      toast.success(`Downloaded payslip for ${detail.month}`);
    } catch (err) {
      toast.error("Failed to generate PDF");
      console.error(err);
    } finally {
      setPdfLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="skeleton h-6 w-32 rounded" />
            <div className="skeleton h-3 w-64 rounded" />
          </div>
          <div className="skeleton h-9 w-32 rounded-xl" />
        </div>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[270px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
              <div className="skeleton h-4 w-24 rounded" />
              <div className="ml-auto skeleton h-4 w-10 rounded" />
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {[...Array(6)].map((_, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 px-4 py-3.5"
                >
                  <div className="skeleton h-9 w-9 flex-shrink-0 rounded-xl" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-24 rounded" />
                    <div className="skeleton h-3 w-16 rounded" />
                  </div>
                  <div className="skeleton h-5 w-10 rounded-full" />
                </div>
              ))}
            </div>
          </div>
          <div className="skeleton h-[600px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            My Payslips
          </h1>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
            Select a month to preview and download your {company?.label} salary
            slip
          </p>
        </div>
        <button
          onClick={handleDownload}
          disabled={!detail || detailLoading || pdfLoading}
          className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-blue-600/30 transition-colors hover:bg-blue-700 disabled:opacity-50"
        >
          {pdfLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {pdfLoading ? "Generating…" : "Download PDF"}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[270px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <FileText size={15} className="text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              All Payslips
            </h3>
            <span className="ml-auto text-xs text-gray-400">
              {payslips.length} {payslips.length === 1 ? "record" : "records"}
            </span>
          </div>

          <div className="max-h-[70vh] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
            {payslips.map((payslip) => (
              <div key={payslip.id}>
                <button
                  onClick={() => setSelected(payslip)}
                  className={`flex w-full items-center gap-3 border-l-2 px-4 py-3.5 text-left transition-all ${
                    selected?.id === payslip.id
                      ? "border-blue-600 bg-blue-50 dark:bg-blue-900/20"
                      : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${
                      selected?.id === payslip.id
                        ? "bg-blue-100 dark:bg-blue-900/40"
                        : "bg-gray-100 dark:bg-gray-700"
                    }`}
                  >
                    <FileText
                      size={15}
                      className={
                        selected?.id === payslip.id
                          ? "text-blue-600"
                          : "text-gray-500 dark:text-gray-400"
                      }
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={`truncate text-sm font-semibold ${
                        selected?.id === payslip.id
                          ? "text-blue-700 dark:text-blue-400"
                          : "text-gray-800 dark:text-gray-200"
                      }`}
                    >
                      {payslip.month}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {formatCurrency(payslip.amount)}
                    </p>
                  </div>
                  <Badge variant={payslip.status === "Paid" ? "green" : "yellow"}>
                    {payslip.status}
                  </Badge>
                </button>

                {/* Mobile inline download — shown only when this row is selected */}
                {isMobile && selected?.id === payslip.id && (
                  <div className="px-4 pb-3">
                    <button
                      onClick={handleDownload}
                      disabled={detailLoading || !detail || pdfLoading}
                      className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition-colors hover:bg-blue-700 disabled:opacity-50"
                    >
                      {pdfLoading ? (
                        <Loader2 size={15} className="animate-spin" />
                      ) : (
                        <Download size={15} />
                      )}
                      {pdfLoading ? "Generating PDF…" : `Download ${payslip.month} Payslip`}
                    </button>
                  </div>
                )}
              </div>
            ))}


            {/* Sentinel triggers next page load when scrolled into view */}
            <div ref={sentinelRef} className="h-px" />

            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Loading more…
              </div>
            )}

            {!hasMore && payslips.length > 0 && (
              <p className="py-3 text-center text-xs text-gray-400">
                All records loaded
              </p>
            )}

            {!loading && payslips.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">
                No payslips found
              </p>
            )}
          </div>
        </div>

        {selected && !isMobile && (
          <div className="overflow-hidden rounded-2xl border border-gray-200 shadow-sm dark:border-gray-700">
            {detailLoading ? (
              <div className="skeleton h-[600px] w-full" />
            ) : detail ? (
              <div
                className="overflow-x-auto bg-neutral-300 px-3 py-4 sm:px-5 sm:py-6"
                style={{ WebkitOverflowScrolling: "touch" }}
              >
                <div
                  ref={payslipRef}
                  style={{ display: "inline-block", width: "100%" }}
                >
                  <PayslipDocument
                    emp={{}}
                    payslip={detail}
                    companyId={detail?.company_code || companyId}
                    className="!shadow-none"
                  />
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-gray-200 bg-gray-50 px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex min-w-0 items-center gap-3">
                <div
                  className={`flex h-10 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-white p-1 text-xs font-bold text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 ${
                    company?.id === "silver-star" ? "w-20" : "w-10"
                  }`}
                >
                  {company?.logo ? (
                    <img
                      src={company.logo}
                      alt={`${company.label} logo`}
                      className={`h-full w-full object-contain ${
                        company?.id === "silver-star" ? "object-left" : ""
                      }`}
                    />
                  ) : (
                    company?.initials
                  )}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {(detail ?? selected).name}
                  </p>
                  <p className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-gray-400">
                    {company?.label}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {(detail ?? selected).month} · Net:{" "}
                    {formatCurrency((detail ?? selected).amount)}
                  </p>
                </div>
              </div>
              <button
                onClick={handleDownload}
                disabled={detailLoading || !detail || pdfLoading}
                className="flex flex-shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-blue-600/25 transition-colors hover:bg-blue-700 disabled:opacity-50"
              >
                {pdfLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Download size={15} />
                )}
                {pdfLoading ? "Generating…" : "Download PDF"}
              </button>
            </div>
          </div>
        )}

        {/* Hidden off-screen payslip renderer on mobile — needed so PDF export still works */}
        {isMobile && detail && (
          <div
            ref={payslipRef}
            aria-hidden="true"
            style={{ position: "absolute", left: "-9999px", top: 0, width: "794px", pointerEvents: "none", zIndex: -1 }}
          >
            <PayslipDocument
              emp={{}}
              payslip={detail}
              companyId={detail?.company_code || companyId}
              className="!shadow-none"
            />
          </div>
        )}
      </div>
    </div>
  );
}
