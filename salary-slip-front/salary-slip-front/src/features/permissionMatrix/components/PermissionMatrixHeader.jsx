import { ChevronRight } from "lucide-react";

export default function PermissionMatrixHeader({ title, description, breadcrumb = [], actions }) {
  return (
    <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        {breadcrumb.length > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
              {breadcrumb.map((crumb, index) => (
                <li key={crumb} className="flex items-center gap-1">
                  {index > 0 && <ChevronRight size={12} className="text-gray-300 dark:text-gray-600" />}
                  <span className={index === breadcrumb.length - 1 ? "text-gray-700 dark:text-gray-300" : ""}>
                    {crumb}
                  </span>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-white">{title}</h1>

        {description && (
          <p className="mt-1 max-w-2xl text-sm text-gray-600 dark:text-gray-400">{description}</p>
        )}
      </div>

      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
