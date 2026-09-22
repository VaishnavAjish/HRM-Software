import React from "react";
import IDCardFront from "./IDCardFront";
import IDCardBack from "./IDCardBack";

/**
 * Unified Employee ID Card component wrapper.
 * Renders Front, Back, or Both sides side-by-side or stacked cleanly.
 */
export default function EmployeeIDCard({
  employee = {},
  companyConfig = {},
  side = "front", // 'front' | 'back' | 'both'
  fieldToggles = {},
  customTheme = null,
  cardRef = null,
}) {
  if (side === "both") {
    return (
      <div ref={cardRef} className="flex flex-col md:flex-row items-center justify-center gap-6 p-2 bg-transparent">
        <IDCardFront
          employee={employee}
          companyConfig={companyConfig}
          fieldToggles={fieldToggles}
          customTheme={customTheme}
        />
        <IDCardBack
          employee={employee}
          companyConfig={companyConfig}
          fieldToggles={fieldToggles}
          customTheme={customTheme}
        />
      </div>
    );
  }

  if (side === "back") {
    return (
      <div ref={cardRef} className="inline-block p-1 bg-transparent">
        <IDCardBack
          employee={employee}
          companyConfig={companyConfig}
          fieldToggles={fieldToggles}
          customTheme={customTheme}
        />
      </div>
    );
  }

  return (
    <div ref={cardRef} className="inline-block p-1 bg-transparent">
      <IDCardFront
        employee={employee}
        companyConfig={companyConfig}
        fieldToggles={fieldToggles}
        customTheme={customTheme}
      />
    </div>
  );
}
