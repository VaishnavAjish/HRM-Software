import React from "react";
import EmployeeIDCard from "./EmployeeIDCard";
import { getIDCardTheme } from "../config/idCardThemes";

/**
 * Print-friendly wrapper layout for physical card printing.
 * Uses `@media print` rules to isolate the cards, hide UI navigation,
 * and preserve exact CR80 physical measurements (85.60mm x 53.98mm).
 */
export default function IDCardPrintLayout({ employee = {}, companyId = "nidhi-impex" }) {
  const theme = getIDCardTheme(companyId || employee.companyId);

  return (
    <div className="hidden print:block print:w-full print:h-auto print:m-0 print:p-0">
      <style>{`
        @media print {
          body {
            background: white !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <div className="flex flex-wrap items-start justify-center gap-8 p-4">
        <EmployeeIDCard employee={employee} companyConfig={theme} side="front" />
        <EmployeeIDCard employee={employee} companyConfig={theme} side="back" />
      </div>
    </div>
  );
}
