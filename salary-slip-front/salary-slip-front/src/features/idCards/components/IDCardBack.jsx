import React from "react";
import { UserCheck, Users, Search, Lock, Phone, Mail, MapPin } from "lucide-react";
import { getIDCardTheme } from "../config/idCardThemes";

/**
 * Back side of the corporate Employee ID Card matching Image 2 EXACTLY.
 */
export default function IDCardBack({
  employee = {},
  companyConfig = {},
  fieldToggles = {},
  customTheme = null,
}) {
  const theme = customTheme || getIDCardTheme(employee.companyId || employee.company_code || companyConfig.id);
  const isNidhi = theme.id === "nidhi-impex";

  const instructions = theme.instructions || [];

  return (
    <div
      className={`relative w-[320px] h-[520px] rounded-[22px] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans text-white border border-gray-800 ${
        isNidhi ? "bg-[#0B1F33]" : "bg-[#181C20]"
      }`}
      style={{ aspectRatio: "53.98 / 85.60" }}
    >
      {/* Background Architectural Overlay */}
      <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_70%)]" />

      {/* Lanyard Slot Punch Hole Cutout */}
      <div className="relative z-20 w-full pt-2 flex justify-center flex-shrink-0">
        <div className="w-14 h-4 rounded-full bg-gradient-to-b from-gray-400 via-slate-300 to-gray-500 p-[1.5px] shadow-sm flex items-center justify-center border border-gray-500/50">
          <div className="w-10 h-2 bg-[#0A0D10] rounded-full shadow-inner" />
        </div>
      </div>

      {/* Header */}
      <div className="relative z-10 px-6 pt-2 flex-shrink-0">
        <h2 className="text-sm font-black uppercase tracking-wider text-white">
          {theme.name}
        </h2>
        <p className="text-[7px] font-bold uppercase tracking-[0.18em] text-slate-300 mt-0.5 font-mono">
          {theme.tagline}
        </p>
      </div>

      {/* Content */}
      <div className="relative z-10 px-6 py-3 flex-1 flex flex-col justify-between min-h-0">
        
        {/* Important Instructions */}
        {fieldToggles.instructions !== false && instructions.length > 0 && (
          <div>
            <h3
              className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5"
              style={{ color: isNidhi ? "#D4AF37" : "#F97316" }}
            >
              Important Instructions
            </h3>

            <div className="space-y-2.5">
              {[
                { icon: UserCheck, text: instructions[0] },
                { icon: Users, text: instructions[1] },
                { icon: Search, text: instructions[2] },
                { icon: Lock, text: instructions[3] },
              ].map((item, idx) => {
                const IconComponent = item.icon;
                return (
                  <div key={idx} className="flex items-center gap-2.5">
                    <div className="h-6 w-6 rounded-full border border-white/20 bg-white/5 flex items-center justify-center flex-shrink-0">
                      <IconComponent size={12} className="text-white" />
                    </div>
                    <span className="text-[9px] font-medium text-slate-200 leading-tight">
                      {item.text}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Emergency Contact */}
        {fieldToggles.contact !== false && (
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-[8.5px] font-medium text-slate-300 uppercase tracking-wider mb-1.5">
              In case of emergency, please contact:
            </p>
            <div className="space-y-1 text-[10px] font-bold text-white">
              <div className="flex items-center gap-2">
                <Phone size={11} className="text-slate-300" />
                <span>{theme.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail size={11} className="text-slate-300" />
                <span>{theme.email}</span>
              </div>
            </div>
          </div>
        )}

        {/* Registered Office & Tagline */}
        <div className="mt-3 pt-3 border-t border-white/10 flex items-end justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-1">
              <MapPin size={11} className="text-slate-300 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-[8px] font-bold uppercase text-slate-400 tracking-wider">Registered Office</p>
                <p className="text-[8.5px] font-bold text-white line-clamp-1">{theme.legalName}</p>
                <p className="text-[8px] text-slate-300 line-clamp-2 leading-tight">{theme.address}</p>
              </div>
            </div>
          </div>

          {theme.backSlogan && (
            <div className="text-right max-w-[100px] flex-shrink-0">
              <p
                className="text-[7.5px] font-black uppercase tracking-wider leading-tight"
                style={{ color: isNidhi ? "#D4AF37" : "#F97316" }}
              >
                {theme.backSlogan}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Accent Line */}
      <div className="h-1.5 w-full flex-shrink-0" style={{ background: isNidhi ? "#D4AF37" : "#F97316" }} />
    </div>
  );
}
