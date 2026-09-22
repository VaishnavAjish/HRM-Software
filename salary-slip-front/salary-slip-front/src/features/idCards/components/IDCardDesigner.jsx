import React, { useState, useRef } from "react";
import { Download, Printer, Eye, Settings, RefreshCw, Check, Sparkles, SlidersHorizontal, ShieldCheck } from "lucide-react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import EmployeeIDCard from "./EmployeeIDCard";
import { ID_CARD_THEMES } from "../config/idCardThemes";

export default function IDCardDesigner({
  employee = {},
  onSelectCompany = () => {},
  selectedCompanyId = "nidhi-impex",
}) {
  const [sideMode, setSideMode] = useState("both"); // 'front' | 'back' | 'both'
  const [downloading, setDownloading] = useState(false);
  const cardContainerRef = useRef(null);

  const [fieldToggles, setFieldToggles] = useState({
    empCode: true,
    department: true,
    designation: true,
    branch: true,
    doj: true,
    bloodGroup: true,
    qrCode: true,
    values: true,
    instructions: true,
    contact: true,
  });

  const toggleField = (key) => {
    setFieldToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleDownload = async () => {
    if (!cardContainerRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardContainerRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: null,
      });
      const link = document.createElement("a");
      const nameStr = (employee.name || "employee").replace(/[^a-z0-9]/gi, "-").toLowerCase();
      link.download = `id-card-${nameStr}-${sideMode}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Card image downloaded successfully!");
    } catch {
      toast.error("Failed to generate card image.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const currentTheme = ID_CARD_THEMES[selectedCompanyId] || ID_CARD_THEMES["nidhi-impex"];

  return (
    <div className="flex flex-col lg:flex-row gap-6 items-start">
      {/* Configuration Sidebar Panel */}
      <div className="w-full lg:w-80 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800 flex-shrink-0">
        <div className="flex items-center gap-2 border-b border-gray-100 pb-3 dark:border-gray-700">
          <SlidersHorizontal size={18} className="text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-wider">
            ID Card Customizer
          </h2>
        </div>

        {/* Company Theme Switcher */}
        <div className="mt-4">
          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Company Identity
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onSelectCompany("nidhi-impex")}
              className={`px-3 py-2 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                selectedCompanyId === "nidhi-impex"
                  ? "border-indigo-600 bg-indigo-50 text-indigo-900 shadow-sm dark:bg-indigo-950/40 dark:text-indigo-200"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              <span>Nidhi Impex</span>
              <span className="h-1.5 w-8 rounded-full bg-amber-400" />
            </button>

            <button
              type="button"
              onClick={() => onSelectCompany("silver-star")}
              className={`px-3 py-2 rounded-xl border text-xs font-black transition-all flex flex-col items-center gap-1 ${
                selectedCompanyId === "silver-star"
                  ? "border-orange-500 bg-orange-50 text-orange-900 shadow-sm dark:bg-orange-950/40 dark:text-orange-200"
                  : "border-gray-200 bg-gray-50 text-gray-700 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300"
              }`}
            >
              <span>Silver Star</span>
              <span className="h-1.5 w-8 rounded-full bg-orange-500" />
            </button>
          </div>
        </div>

        {/* Display Field Toggles */}
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-700">
          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Front Card Fields
          </label>
          <div className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            {[
              { key: "empCode", label: "Employee ID" },
              { key: "department", label: "Department" },
              { key: "designation", label: "Designation" },
              { key: "branch", label: "Branch / Location" },
              { key: "doj", label: "Date of Joining" },
              { key: "bloodGroup", label: "Blood Group" },
              { key: "qrCode", label: "Verification QR Code" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer select-none">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={fieldToggles[key]}
                  onChange={() => toggleField(key)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Back Card Content Toggles */}
        <div className="mt-5 border-t border-gray-100 pt-4 dark:border-gray-700">
          <label className="block text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-2">
            Back Card Sections
          </label>
          <div className="space-y-2 text-xs font-medium text-gray-700 dark:text-gray-300">
            {[
              { key: "values", label: "Corporate Core Values" },
              { key: "instructions", label: "Compliance Instructions" },
              { key: "contact", label: "HR Contact & Location" },
            ].map(({ key, label }) => (
              <label key={key} className="flex items-center justify-between cursor-pointer select-none">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={fieldToggles[key]}
                  onChange={() => toggleField(key)}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                />
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* Live Card Preview Area */}
      <div className="flex-1 w-full rounded-2xl border border-gray-200 bg-slate-100/80 p-6 dark:border-gray-700 dark:bg-gray-900 flex flex-col items-center">
        {/* Preview Control Toolbar */}
        <div className="w-full flex flex-wrap items-center justify-between gap-3 mb-6 bg-white p-3 rounded-xl border border-gray-200 shadow-sm dark:bg-gray-800 dark:border-gray-700">
          {/* Side Mode Buttons */}
          <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg dark:bg-gray-700">
            {[
              { mode: "front", label: "Front Only" },
              { mode: "back", label: "Back Only" },
              { mode: "both", label: "Show Both" },
            ].map(({ mode, label }) => (
              <button
                key={mode}
                type="button"
                onClick={() => setSideMode(mode)}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                  sideMode === mode
                    ? "bg-white text-indigo-600 shadow-sm dark:bg-gray-800 dark:text-indigo-400"
                    : "text-gray-600 hover:text-gray-900 dark:text-gray-300"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-300 bg-white text-xs font-bold text-gray-700 hover:bg-gray-50 shadow-sm dark:border-gray-600 dark:bg-gray-700 dark:text-gray-200"
            >
              <Printer size={14} /> Print Card
            </button>

            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-xs font-bold text-white hover:bg-indigo-700 shadow-sm disabled:opacity-50"
            >
              <Download size={14} /> Download PNG
            </button>
          </div>
        </div>

        {/* Live Rendering Stage */}
        <div className="py-4 px-2 overflow-x-auto w-full flex justify-center">
          <EmployeeIDCard
            cardRef={cardContainerRef}
            employee={employee}
            companyConfig={currentTheme}
            side={sideMode}
            fieldToggles={fieldToggles}
            customTheme={currentTheme}
          />
        </div>
      </div>
    </div>
  );
}
