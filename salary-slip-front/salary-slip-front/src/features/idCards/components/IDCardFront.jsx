import React, { useState } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { getIDCardTheme } from "../config/idCardThemes";
import { getEmployeePhotoUrl } from "../../../pages/admin/AdminModals/employee-helpers";

function getInitials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

/**
 * Front side of the corporate Employee ID Card matching Image 2 EXACTLY.
 * Includes precise SVG geometric wings, lanyard punch hole, employee table,
 * QR verification, and cursive authorized signature.
 */
export default function IDCardFront({
  employee = {},
  companyConfig = {},
  fieldToggles = {},
  customTheme = null,
}) {
  const [photoFailed, setPhotoFailed] = useState(false);

  const theme = customTheme || getIDCardTheme(employee.companyId || employee.company_code || companyConfig.id);
  const isNidhi = theme.id === "nidhi-impex";

  const rawName = employee.name || employee.displayName || employee.fullName || "Vansh Chauhan";
  const resolvedName = rawName.split(" ").map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
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

  return (
    <div
      className="relative w-[320px] h-[520px] bg-white text-gray-900 rounded-[22px] shadow-2xl overflow-hidden flex flex-col justify-between border border-gray-200 select-none font-sans"
      style={{ aspectRatio: "53.98 / 85.60" }}
    >
      {/* SVG Background Geometry Matching Reference Image 2 Exactly */}
      {isNidhi ? (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 320 520" fill="none">
          {/* Top Left Navy Block */}
          <path d="M0 0 H180 L140 140 L0 180 Z" fill="#0B1F33" />
          {/* Royal Blue Accent Diagonal Band */}
          <path d="M0 35 L160 0 L145 35 L0 100 Z" fill="#1E3A8A" opacity="0.85" />
          {/* Gold Accent Line */}
          <path d="M0 112 L120 148 L115 153 L0 117 Z" fill="#D4AF37" />

          {/* Bottom Right Navy Block */}
          <path d="M320 280 L220 480 L320 480 Z" fill="#0B1F33" />
          {/* Gold Accent Line on Bottom Right */}
          <path d="M320 370 L250 440 L255 444 L320 376 Z" fill="#D4AF37" />

          {/* Background Geometric Light Facet Overlay */}
          <path d="M120 140 L320 200 L240 380 L100 280 Z" fill="#F1F5F9" opacity="0.4" />
        </svg>
      ) : (
        <svg className="absolute inset-0 w-full h-full pointer-events-none z-0" viewBox="0 0 320 520" fill="none">
          {/* Top Left Orange & Graphite Block */}
          <path d="M0 0 H190 L135 150 L0 190 Z" fill="#F97316" />
          <path d="M0 45 L165 0 L150 40 L0 110 Z" fill="#374151" opacity="0.85" />

          {/* Bottom Right Charcoal Block */}
          <path d="M320 270 L210 480 L320 480 Z" fill="#1F2937" />
          {/* Orange Accent Line on Bottom Right */}
          <path d="M320 365 L245 440 L250 445 L320 372 Z" fill="#F97316" />

          {/* Background Geometric Light Facet Overlay */}
          <path d="M120 140 L320 200 L240 380 L100 280 Z" fill="#F1F5F9" opacity="0.4" />
        </svg>
      )}

      {/* Lanyard Slot Punch Hole Cutout (Top Center) */}
      <div className="relative z-20 w-full pt-2 flex justify-center flex-shrink-0">
        <div className="w-14 h-4 rounded-full bg-gradient-to-b from-gray-400 via-gray-100 to-gray-500 p-[1.5px] shadow-sm flex items-center justify-center border border-gray-400">
          <div className="w-10 h-2 bg-[#121518] rounded-full shadow-inner" />
        </div>
      </div>

      {/* Header Row */}
      <div className="relative z-10 px-5 pt-1 flex items-start justify-between min-w-0 flex-shrink-0">
        <div className="min-w-0 flex-1 pr-2">
          <h1 className="text-sm font-black uppercase tracking-wider text-[#0B1F33] leading-none">
            {theme.name}
          </h1>
          <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-slate-400 mt-1 font-mono">
            {theme.tagline}
          </p>
        </div>

        {/* Logo Tile */}
        <div className="h-10 w-12 rounded-xl bg-white border border-gray-200/80 p-1 shadow-xs flex flex-col items-center justify-center flex-shrink-0">
          {theme.logo ? (
            <img src={theme.logo} alt="Logo" crossOrigin="anonymous" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-[7px] font-bold text-gray-400 text-center uppercase leading-tight">YOUR LOGO HERE</span>
          )}
        </div>
      </div>

      {/* Card Body */}
      <div className="relative z-10 px-5 pt-1 flex-1 flex flex-col items-center justify-between min-h-0">
        
        {/* Photo Container & Side Slogan */}
        <div className="w-full flex items-center justify-center gap-3 mt-1">
          <div className="relative">
            <img
              src={showPhoto ? photoUrl : ""}
              alt={resolvedName}
              crossOrigin="anonymous"
              onError={() => setPhotoFailed(true)}
              className={`w-24 h-28 rounded-2xl object-cover border-2 border-white shadow-xl bg-gray-100 ${!showPhoto ? 'hidden' : ''}`}
            />
            {!showPhoto && (
              <div className="w-24 h-28 rounded-2xl bg-gradient-to-br from-slate-100 to-slate-200 border-2 border-white shadow-xl flex items-center justify-center text-3xl font-black text-slate-700">
                {getInitials(resolvedName)}
              </div>
            )}
          </div>

          {theme.sideSlogan && (
            <p className="text-[9.5px] font-semibold italic text-slate-500 max-w-[85px] leading-snug">
              {theme.sideSlogan}
            </p>
          )}
        </div>

        {/* Employee Name & Title */}
        <div className="text-center w-full mt-1.5">
          <h2 className="text-base font-extrabold text-[#0B1F33] leading-tight tracking-tight uppercase line-clamp-1">
            {resolvedName}
          </h2>
          {fieldToggles.designation !== false && resolvedDesignation && (
            <p
              className="text-[10px] font-black uppercase tracking-[0.15em] mt-0.5"
              style={{ color: isNidhi ? "#0B1F33" : "#F97316" }}
            >
              {resolvedDesignation}
            </p>
          )}
        </div>

        {/* Employee Details Table (Clean layout sitting directly on card background) */}
        <table className="w-full max-w-[260px] mx-auto text-[9.5px] font-medium text-slate-800 border-separate border-spacing-y-1 my-1">
          <tbody>
            {fieldToggles.empCode !== false && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] w-28 text-left">Employee ID</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-mono font-bold text-slate-900 text-left">{resolvedEmpCode}</td>
              </tr>
            )}
            {fieldToggles.department !== false && resolvedDepartment && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] text-left">Department</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-bold text-slate-900 text-left">{resolvedDepartment}</td>
              </tr>
            )}
            {fieldToggles.designation !== false && resolvedDesignation && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] text-left">Designation</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-bold text-slate-900 text-left">{resolvedDesignation}</td>
              </tr>
            )}
            {fieldToggles.branch !== false && resolvedBranch && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] text-left">Branch</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-bold text-slate-900 text-left">{resolvedBranch}</td>
              </tr>
            )}
            {fieldToggles.doj !== false && resolvedDoj && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] text-left">Date of Joining</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-semibold text-slate-800 text-left">{resolvedDoj}</td>
              </tr>
            )}
            {fieldToggles.bloodGroup !== false && resolvedBloodGroup && (
              <tr>
                <td className="text-slate-500 font-semibold uppercase text-[9px] text-left">Blood Group</td>
                <td className="text-slate-400 font-bold text-center px-1.5">:</td>
                <td className="font-extrabold text-red-600 text-left">{resolvedBloodGroup}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Bottom QR & Signature Row */}
        <div className="w-full flex items-end justify-between gap-2 px-1 mb-1">
          {fieldToggles.qrCode !== false && (
            <div className="flex flex-col items-center">
              <div className="p-1 bg-white rounded-lg border border-gray-200 shadow-xs">
                <QRCodeCanvas value={verifyUrl} size={48} />
              </div>
              <span className="text-[7px] font-mono font-bold tracking-wider text-slate-500 mt-0.5">
                SCAN TO VERIFY
              </span>
            </div>
          )}

          {/* Signature */}
          <div className="flex flex-col items-end text-right">
            <svg className="h-7 w-24 text-slate-800" viewBox="0 0 120 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M10 25 Q 25 5, 35 25 T 55 20 T 75 30 T 110 15" />
              <path d="M20 30 C 40 35, 70 35, 100 28" />
            </svg>
            <div className="w-24 border-t border-slate-300 mt-0.5" />
            <span className="text-[8.5px] font-serif italic text-slate-500 mt-0.5">
              Authorized Signatory
            </span>
          </div>
        </div>
      </div>

      {/* Curved Footer */}
      <div
        className={`relative z-10 py-2.5 px-4 text-center text-white text-[9.5px] font-black tracking-[0.2em] uppercase flex-shrink-0 ${
          isNidhi ? 'bg-[#0B1F33]' : 'bg-[#1F2937]'
        }`}
      >
        <span>{theme.legalName}</span>
      </div>
    </div>
  );
}
