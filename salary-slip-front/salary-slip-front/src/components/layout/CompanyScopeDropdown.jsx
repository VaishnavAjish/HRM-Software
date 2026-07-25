import { useState, useRef, useEffect } from "react";
import { Building2, ChevronDown } from "lucide-react";
import { useCompany } from "../../context/CompanyContext";
import { ALL_COMPANY_ID } from "../../config/companyConfig";

export default function CompanyScopeDropdown() {
  const {
    activeUnit,
    companyId,
    companyOptions,
    canSwitchCompany,
    isAllCompanies,
    scopeLabel,
    setCompanyScope,
  } = useCompany();

  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!canSwitchCompany) return null;

  const allCompaniesOption = companyOptions.find(
    (option) => option.id === ALL_COMPANY_ID,
  );
  const scopedCompanyOptions = companyOptions.filter(
    (option) => option.id !== ALL_COMPANY_ID,
  );
  const activeCompanyOption = scopedCompanyOptions.find(
    (option) => option.id === companyId,
  );

  const handleScopeChange = (nextScope, closeDropdown = true) => {
    setCompanyScope(nextScope);
    if (closeDropdown) {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
      >
        <Building2 size={16} className="text-brand-600 dark:text-brand-400" />
        <span className="text-sm font-medium hidden sm:block">
          {scopeLabel}
        </span>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="fixed left-3 right-3 top-[4.5rem] sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[320px] bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Company Scope
            </h3>
          </div>

          <div className="p-3 space-y-2">
            {allCompaniesOption && (
              <button
                onClick={() => handleScopeChange(allCompaniesOption.id, true)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-all ${
                  isAllCompanies
                    ? "bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300 ring-1 ring-brand-500/30"
                    : "hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                }`}
              >
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold flex-shrink-0 ${
                    isAllCompanies
                      ? "bg-brand-600 text-white"
                      : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                  }`}
                >
                  {allCompaniesOption.initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {allCompaniesOption.sidebarLabel}
                  </p>
                  <p
                    className={`truncate text-xs ${
                      isAllCompanies ? "text-brand-600/80 dark:text-brand-400/80" : "text-gray-500"
                    }`}
                  >
                    {isAllCompanies ? "Combined view" : "Show both companies"}
                  </p>
                </div>
              </button>
            )}

            <div className="grid grid-cols-2 gap-2 mt-1">
              {scopedCompanyOptions.map((option) => {
                const companyActive =
                  !isAllCompanies && companyId === option.id;

                return (
                  <button
                    key={option.id}
                    onClick={() =>
                      handleScopeChange({ companyId: option.id }, false)
                    }
                    className={`rounded-lg px-2 py-2 text-left transition-all ${
                      companyActive
                        ? "bg-brand-50 dark:bg-brand-900/20 ring-1 ring-brand-500/30"
                        : "hover:bg-gray-50 dark:hover:bg-gray-700"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <div
                        className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md text-[10px] font-bold ${
                          companyActive
                            ? "bg-brand-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                        }`}
                      >
                        {option.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-xs font-semibold ${
                            companyActive ? "text-brand-700 dark:text-brand-300" : "text-gray-700 dark:text-gray-300"
                        }`}>
                          {option.sidebarLabel}
                        </p>
                        <p
                          className={`truncate text-[10px] ${
                            companyActive ? "text-brand-600/80 dark:text-brand-400/80" : "text-gray-500"
                          }`}
                        >
                          {option.units?.length || 0} branches
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {!isAllCompanies && activeCompanyOption?.units?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                    Branches
                  </p>
                  <button
                    onClick={() =>
                      handleScopeChange({ companyId: activeCompanyOption.id })
                    }
                    className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-all ${
                      !activeUnit
                        ? "bg-brand-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    All Branches
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-1.5">
                  {activeCompanyOption.units.map((unit) => {
                    const unitSelected = activeUnit === unit;

                    return (
                      <button
                        key={unit}
                        onClick={() =>
                          handleScopeChange({
                            companyId: activeCompanyOption.id,
                            unit,
                          })
                        }
                        className={`rounded-md px-2 py-1.5 text-center transition-all ${
                          unitSelected
                            ? "bg-brand-600 text-white shadow-sm"
                            : "bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        }`}
                      >
                        <span className="text-[10px] font-medium uppercase tracking-wider">
                          {unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
