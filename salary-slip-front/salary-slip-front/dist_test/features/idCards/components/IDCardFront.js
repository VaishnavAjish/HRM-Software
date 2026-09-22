import { jsx, jsxs } from "react/jsx-runtime";
import React, { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { getIDCardTheme } from "../config/idCardThemes";
import { getEmployeePhotoUrl } from "../../../pages/admin/AdminModals/employee-helpers";
function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}
export default function IDCardFront({
  employee = {},
  companyConfig = {},
  fieldToggles = {},
  customTheme = null
}) {
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    window.addEventListener("card_settings_updated", handleUpdate);
    return () => window.removeEventListener("card_settings_updated", handleUpdate);
  }, []);
  const [photoFailed, setPhotoFailed] = useState(false);
  const theme = customTheme || getIDCardTheme(employee.companyId || employee.company_code || companyConfig.id);
  const isNidhi = theme.id === "nidhi-impex";
  const rawName = employee.name || employee.displayName || employee.fullName || "Vansh Chauhan";
  const resolvedName = rawName.split(" ").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
  const resolvedEmpCode = employee.empCode || employee.employeeCode || employee.emp_code || (isNidhi ? "NI00123" : "SS00123");
  const resolvedDesignation = (employee.designation || employee.positionTitle || "AI/ML ENGINEER").toUpperCase();
  const resolvedDepartment = employee.department || "Technology";
  const resolvedBranch = employee.unit || employee.branch || (isNidhi ? "Ichhapore" : "Daduk");
  const resolvedDoj = employee.joiningDate || employee.joining_date || employee.dateOfJoining || "15 Sep 2026";
  const resolvedBloodGroup = employee.bloodGroup || employee.blood_group || "B+";
  const rawPhoto = employee.photo || employee.image || employee.profile_photo;
  const photoUrl = getEmployeePhotoUrl(rawPhoto);
  const showPhoto = Boolean(photoUrl) && !photoFailed;
  const verifyUrl = `${window.location.origin}/employee/verify/${resolvedEmpCode}`;
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: "relative w-[320px] h-[520px] bg-white text-gray-900 rounded-[22px] shadow-2xl overflow-hidden flex flex-col justify-between border border-gray-200 select-none font-sans",
      style: { aspectRatio: "53.98 / 85.60" },
      children: [
        /* @__PURE__ */ jsx(
          "div",
          {
            className: "absolute top-0 left-0 right-0 h-1.5 z-0",
            style: { background: isNidhi ? "linear-gradient(to right, #0B1F33, #1E3A8A, #D4AF37)" : "linear-gradient(to right, #1F2937, #374151, #F97316)" }
          }
        ),
        /* @__PURE__ */ jsx("div", { className: "relative z-20 w-full pt-2 flex justify-center flex-shrink-0", children: /* @__PURE__ */ jsx("div", { className: "w-14 h-4 rounded-full bg-gradient-to-b from-gray-400 via-gray-100 to-gray-500 p-[1.5px] shadow-sm flex items-center justify-center border border-gray-400", children: /* @__PURE__ */ jsx("div", { className: "w-10 h-2 bg-[#121518] rounded-full shadow-inner" }) }) }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10 px-5 pt-1 flex items-start justify-between min-w-0 flex-shrink-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1 pr-2", children: [
            /* @__PURE__ */ jsx("h1", { className: "text-sm font-black uppercase tracking-wider text-[#0B1F33] leading-none", children: theme.name }),
            /* @__PURE__ */ jsx("p", { className: "text-[7px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1 font-mono", children: theme.tagline })
          ] }),
          /* @__PURE__ */ jsx("div", { className: "h-10 w-12 rounded-xl bg-white border border-gray-200/80 p-1 shadow-xs flex flex-col items-center justify-center flex-shrink-0", children: theme.logo ? /* @__PURE__ */ jsx("img", { src: theme.logo, alt: "Logo", crossOrigin: "anonymous", className: "max-h-full max-w-full object-contain" }) : /* @__PURE__ */ jsx("span", { className: "text-[7px] font-bold text-gray-400 text-center uppercase leading-tight", children: "YOUR LOGO HERE" }) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10 px-5 pt-1 flex-1 flex flex-col items-center justify-between min-h-0", children: [
          /* @__PURE__ */ jsxs("div", { className: "w-full flex items-center justify-center gap-3 mt-1", children: [
            /* @__PURE__ */ jsxs("div", { className: "relative", children: [
              /* @__PURE__ */ jsx(
                "img",
                {
                  src: showPhoto ? photoUrl : "",
                  alt: resolvedName,
                  crossOrigin: "anonymous",
                  onError: () => setPhotoFailed(true),
                  className: `w-24 h-28 rounded-2xl object-cover border-2 border-white shadow-xl bg-gray-100 ${!showPhoto ? "hidden" : ""}`
                }
              ),
              !showPhoto && /* @__PURE__ */ jsx("div", { className: "w-24 h-28 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white shadow-xl flex items-center justify-center text-3xl font-black text-slate-700", children: getInitials(resolvedName) })
            ] }),
            theme.sideSlogan && /* @__PURE__ */ jsx("p", { className: "text-[9.5px] font-semibold italic text-slate-500 max-w-[85px] leading-snug", children: theme.sideSlogan })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "text-center w-full mt-1.5", children: [
            /* @__PURE__ */ jsx("h2", { className: "text-base font-extrabold text-[#0B1F33] leading-tight tracking-tight uppercase line-clamp-1", children: resolvedName }),
            fieldToggles.designation !== false && resolvedDesignation && /* @__PURE__ */ jsx(
              "p",
              {
                className: "text-[10px] font-black uppercase tracking-[0.15em] mt-0.5",
                style: { color: isNidhi ? "#0B1F33" : "#F97316" },
                children: resolvedDesignation
              }
            )
          ] }),
          /* @__PURE__ */ jsx("table", { className: "w-full max-w-[260px] mx-auto text-[9.5px] font-medium text-slate-800 border-separate border-spacing-y-1 my-1", children: /* @__PURE__ */ jsxs("tbody", { children: [
            fieldToggles.empCode !== false && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] w-28 text-left", children: "Employee ID" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-mono font-bold text-slate-900 text-left", children: resolvedEmpCode })
            ] }),
            fieldToggles.department !== false && resolvedDepartment && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] text-left", children: "Department" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-bold text-slate-900 text-left", children: resolvedDepartment })
            ] }),
            fieldToggles.designation !== false && resolvedDesignation && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] text-left", children: "Designation" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-bold text-slate-900 text-left", children: resolvedDesignation })
            ] }),
            fieldToggles.branch !== false && resolvedBranch && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] text-left", children: "Branch" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-bold text-slate-900 text-left", children: resolvedBranch })
            ] }),
            fieldToggles.doj !== false && resolvedDoj && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] text-left", children: "Date of Joining" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-semibold text-slate-800 text-left", children: resolvedDoj })
            ] }),
            fieldToggles.bloodGroup !== false && resolvedBloodGroup && /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsx("td", { className: "text-slate-500 font-semibold uppercase text-[9px] text-left", children: "Blood Group" }),
              /* @__PURE__ */ jsx("td", { className: "text-slate-400 font-bold text-center px-1.5", children: ":" }),
              /* @__PURE__ */ jsx("td", { className: "font-extrabold text-red-600 text-left", children: resolvedBloodGroup })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs("div", { className: "w-full flex items-end justify-between gap-2 px-1 mb-1", children: [
            fieldToggles.qrCode !== false && /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-center", children: [
              /* @__PURE__ */ jsx("div", { className: "p-1 bg-white rounded-lg border border-gray-200 shadow-xs", children: /* @__PURE__ */ jsx(QRCodeCanvas, { value: verifyUrl, size: 48 }) }),
              /* @__PURE__ */ jsx("span", { className: "text-[7px] font-mono font-bold tracking-wider text-slate-500 mt-0.5", children: "SCAN TO VERIFY" })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "flex flex-col items-end text-right", children: [
              /* @__PURE__ */ jsxs("svg", { className: "h-7 w-24 text-slate-800", viewBox: "0 0 120 40", fill: "none", stroke: "currentColor", strokeWidth: "2.5", strokeLinecap: "round", children: [
                /* @__PURE__ */ jsx("path", { d: "M10 25 Q 25 5, 35 25 T 55 20 T 75 30 T 110 15" }),
                /* @__PURE__ */ jsx("path", { d: "M20 30 C 40 35, 70 35, 100 28" })
              ] }),
              /* @__PURE__ */ jsx("div", { className: "w-24 border-t border-slate-300 mt-0.5" }),
              /* @__PURE__ */ jsx("span", { className: "text-[8.5px] font-serif italic text-slate-500 mt-0.5", children: "Authorized Signatory" })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsx(
          "div",
          {
            className: `relative z-10 py-2.5 px-4 text-center text-white text-[9.5px] font-black tracking-[0.2em] uppercase flex-shrink-0 ${isNidhi ? "bg-[#0B1F33]" : "bg-[#1F2937]"}`,
            children: /* @__PURE__ */ jsx("span", { children: theme.legalName })
          }
        )
      ]
    }
  );
}
