import { Clock3, FileText, ShieldCheck } from "lucide-react";
import { useCompany } from "../../context/CompanyContext";

export default function Form16() {
  const { company } = useCompany();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-600 shadow-sm shadow-brand-600/30">
          <FileText size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-gray-900 dark:text-white">
            Form 16
          </h1>
          <p className="text-xs text-gray-400">
            This section will be enabled after final tax document setup
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800 sm:p-8">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-900/20 dark:text-brand-400">
            <Clock3 size={28} />
          </div>

          <h2 className="mt-5 text-2xl font-bold text-gray-900 dark:text-white">
            Form 16 Coming Soon
          </h2>

          <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Your Form 16 download is not ready yet for{" "}
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              {company?.label || "your company"}
            </span>
            . We will enable this page after the final tax document flow is
            completed.
          </p>

          <div className="mt-6 rounded-2xl border border-dashed border-brand-200 bg-brand-50/70 px-5 py-4 text-left dark:border-brand-800 dark:bg-brand-900/10">
            <div className="flex items-start gap-3">
              <ShieldCheck
                size={18}
                className="mt-0.5 flex-shrink-0 text-brand-600 dark:text-brand-400"
              />
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">
                  What will be available here later
                </p>
                <ul className="mt-2 space-y-1 text-sm text-gray-600 dark:text-gray-300">
                  <li>Financial year wise Form 16 preview</li>
                  <li>PDF download in the final format</li>
                  <li>Company-specific document details</li>
                </ul>
              </div>
            </div>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            If you need this urgently, please contact your admin team.
          </p>
        </div>
      </div>
    </div>
  );
}
