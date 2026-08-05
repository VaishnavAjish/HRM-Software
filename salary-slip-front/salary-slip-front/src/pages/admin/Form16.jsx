import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import Form16Document from "../../components/form16/Form16Document";
import SearchBar from "../../components/ui/SearchBar";
import { useAuth } from "../../context/AuthContext";
import { useCompany } from "../../context/CompanyContext";
import { getCompanyConfig } from "../../config/companyConfig";
import { downloadForm16PDF } from "../../utils/exportUtils";
import { buildForm16DocumentData } from "../../utils/form16Utils";
import { salaryApi } from "../../utils/api";
import Modal from "../../components/ui/Modal";
import useIsMobile from "../../hooks/useIsMobile";

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

/*
 * Height reserved for the Form 16 preview column.
 *
 * The loading skeleton, the "nothing selected" placeholder and the rendered
 * document all use this, so the column keeps one height across every state and
 * the page stops reflowing as data arrives.
 */
const PREVIEW_MIN_HEIGHT = "min-h-[980px]";

export default function AdminForm16() {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [fy, setFy] = useState("2024-25");
  const [search, setSearch] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const sentinelRef = useRef(null);
  const { user } = useAuth();
  const { companyScope, scopeKey } = useCompany();
  const isMobile = useIsMobile();

  // Fetch triggered whenever page changes
  useEffect(() => {
    const isFirst = page === 1;
    let cancelled = false;

    async function load() {
      if (isFirst) setLoading(true);
      else setLoadingMore(true);
      try {
        const res = await salaryApi.getForm16Employees(
          user?.accessToken,
          user?.tokenType,
          page,
          15,
          {},
          companyScope,
        );
        if (cancelled) return;
        const pagination = res?.pagination;
        const mapped = (res?.data ?? []).map(mapEmployee);
        setEmployees((prev) => (isFirst ? mapped : [...prev, ...mapped]));
        setHasMore(!!pagination && pagination.current_page < pagination.last_page);
        if (isFirst && mapped.length > 0) setSelected(mapped[0]);
      } catch (err) {
        if (!cancelled) toast.error(err.message || "Failed to load employees");
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
  }, [companyScope, page, scopeKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Changing scope invalidates the loaded page, so the list resets. Assigned
  // during render — the supported way to reset state when an input changes —
  // because as an effect it painted the previous company's employees once
  // before clearing them.
  const [scopeSeen, setScopeSeen] = useState(scopeKey);
  if (scopeSeen !== scopeKey) {
    setScopeSeen(scopeKey);
    setEmployees([]);
    setSelected(null);
    setHasMore(false);
    setPage(1);
  }

  // IntersectionObserver on sentinel at bottom of list
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

  const filtered = employees.filter((emp) => {
    const q = search.toLowerCase();
    return (
      !q ||
      emp.name.toLowerCase().includes(q) ||
      emp.empCode.includes(q) ||
      emp.designation.toLowerCase().includes(q)
    );
  });

  const data = selected ? buildForm16DocumentData(selected, fy) : null;
  const fyLabel = FY_OPTIONS.find((item) => item.value === fy)?.label || fy;

  const handleDownload = () => {
    if (!selected || !data) return;
    downloadForm16PDF({ emp: selected, fy, data });
    toast.success(`Form 16 downloaded for ${selected.name} - ${fyLabel}`);
  };

  const handleBulkDownload = () => {
    if (employees.length === 0) return;
    employees.forEach((emp, index) => {
      setTimeout(() => {
        downloadForm16PDF({ emp, fy, data: buildForm16DocumentData(emp, fy) });
      }, index * 300);
    });
    toast.success(
      `Generating Form 16 for ${employees.length} loaded employees…`,
    );
  };

  if (loading) {
    return (
      <div className="space-y-5">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="skeleton h-10 w-10 rounded-xl" />
            <div className="space-y-1.5">
              <div className="skeleton h-5 w-24 rounded" />
              <div className="skeleton h-3 w-48 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="skeleton h-9 w-44 rounded-lg" />
            <div className="skeleton h-9 w-36 rounded-lg" />
            <div className="skeleton h-9 w-40 rounded-lg" />
          </div>
        </div>
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[280px_1fr]">
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
            <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
              <div className="skeleton h-9 w-full rounded-lg" />
            </div>
            <div className="divide-y divide-gray-50 dark:divide-gray-700">
              {[...Array(7)].map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-3">
                  <div className="skeleton h-8 w-8 rounded-full" />
                  <div className="flex-1 space-y-1.5">
                    <div className="skeleton h-3.5 w-32 rounded" />
                    <div className="skeleton h-3 w-20 rounded" />
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* One page-sized block, matching PREVIEW_MIN_HEIGHT below. Two were
              reserved here, so the column measured ~1,984px while loading and
              then collapsed the moment real content took over. */}
          <div className="rounded-3xl bg-neutral-300 px-3 py-5 sm:px-5">
            <div className={`skeleton w-full rounded-2xl ${PREVIEW_MIN_HEIGHT}`} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-600/30">
            <FileText size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-gray-900 dark:text-white">
              Form 16
            </h1>
            <p className="text-xs text-gray-400">
              Generate employee Form 16 documents in the filing-ready layout
            </p>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
          <div className="relative w-full sm:w-auto">
            <select
              value={fy}
              onChange={(event) => setFy(event.target.value)}
              className={`${selectCls} w-full`}
            >
              {FY_OPTIONS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <ChevronDown
              size={13}
              className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
          </div>
          <button
            onClick={handleBulkDownload}
            disabled={employees.length === 0}
            className="flex justify-center items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-gray-800 disabled:opacity-50 dark:bg-gray-700 dark:hover:bg-gray-600 w-full sm:w-auto"
          >
            <Download size={14} />
            Bulk Download All
          </button>
          <button
            onClick={handleDownload}
            disabled={!selected}
            className="flex justify-center items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-colors hover:bg-brand-700 disabled:opacity-50 w-full sm:w-auto"
          >
            <Download size={14} />
            Download for {selected?.name?.split(" ")[0] ?? "…"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[280px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
          <div className="border-b border-gray-100 px-4 py-3 dark:border-gray-700">
            <SearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search employee..."
            />
          </div>
          <div className="h-[calc(100vh-280px)] xl:h-auto xl:max-h-[620px] overflow-y-auto divide-y divide-gray-50 dark:divide-gray-700">
            {filtered.map((emp) => (
              <button
                key={emp.id}
                onClick={() => {
                  setSelected(emp);
                  if (isMobile) {
                    setPreviewOpen(true);
                  }
                }}
                className={`flex w-full items-center gap-3 border-l-2 px-4 py-3 text-left transition-all ${
                  selected?.id === emp.id
                    ? "border-brand-600 bg-brand-50 dark:bg-brand-900/20"
                    : "border-transparent hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <div
                  className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
                    selected?.id === emp.id
                      ? "bg-brand-600"
                      : "bg-gray-400 dark:bg-gray-600"
                  }`}
                >
                  {emp.name?.charAt(0) ?? "?"}
                </div>
                <div className="min-w-0">
                  <p
                    className={`truncate text-sm font-medium ${
                      selected?.id === emp.id
                        ? "text-brand-700 dark:text-brand-400"
                        : "text-gray-800 dark:text-gray-200"
                    }`}
                  >
                    {emp.name}
                  </p>
                  <p className="truncate text-xs text-gray-400">
                    #{emp.empCode} · {emp.designation}
                    {emp.companyLabel ? ` · ${emp.companyLabel}` : ""}
                    {emp.unit ? ` · ${emp.unit}` : ""}
                  </p>
                </div>
              </button>
            ))}

            <div ref={sentinelRef} className="h-px" />

            {loadingMore && (
              <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                Loading more…
              </div>
            )}

            {!hasMore && employees.length > 0 && (
              <p className="py-3 text-center text-xs text-gray-500 dark:text-gray-400">
                All records loaded
              </p>
            )}

            {!loading && employees.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                No employees found
              </p>
            )}
          </div>
        </div>

        {/* The column is always present on desktop, at a fixed minimum height.
            It used to be omitted entirely until `data` existed, so the layout
            went tall skeleton -> nothing -> tall document: two shifts, and the
            reason CLS was accruing around 630ms. A placeholder also reads better
            than an empty gap when no employee is selected yet. */}
        {!isMobile && (
          <div
            className={`rounded-3xl border border-gray-200 bg-neutral-300 px-3 py-5 shadow-sm dark:border-gray-700 sm:px-5 sm:py-6 overflow-x-auto ${PREVIEW_MIN_HEIGHT}`}
          >
            {data ? (
              <Form16Document data={data} />
            ) : (
              <p className="flex h-full items-center justify-center text-center text-sm text-gray-600">
                Select an employee to preview their Form 16.
              </p>
            )}
          </div>
        )}
      </div>

      {isMobile && (
        <Modal
          isOpen={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title="Form 16 Preview"
          size="xl"
          noPadding
          footer={
            <div className="flex items-center justify-between gap-4 w-full">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                  {selected?.name}
                </p>
                <p className="mt-0.5 text-xs text-gray-400 truncate">
                  #{selected?.empCode} | {selected?.designation} | {fyLabel}
                </p>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-brand-600/25 transition-colors hover:bg-brand-700 shrink-0"
              >
                <Download size={15} />
                Download PDF
              </button>
            </div>
          }
        >
          <div className="overflow-x-auto bg-neutral-300 px-3 py-4 sm:px-6 sm:py-6">
            {data && <Form16Document data={data} />}
          </div>
        </Modal>
      )}
    </div>
  );
}
