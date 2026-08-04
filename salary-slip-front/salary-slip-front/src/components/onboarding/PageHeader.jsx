export function PreviewBanner() {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
      <span className="mt-px font-bold">Preview</span>
      <p className="m-0">
        The onboarding API is not available on this deployment yet, so this page is showing
        representative sample data. Layout, states and interactions are final; the figures are not.
      </p>
    </div>
  );
}

export default function PageHeader({ title, subtitle, actions }) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <h1 className="text-[21px] font-semibold tracking-tight">{title}</h1>
        {subtitle ? (
          <p className="mt-0.5 text-[13px] text-gray-500 dark:text-gray-400">{subtitle}</p>
        ) : null}
      </div>
      {actions ? <div className="ml-auto flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
