import { jsx, jsxs } from "react/jsx-runtime";
import React from "react";
import { UserCheck, Users, Search, Lock, Phone, Mail, MapPin } from "lucide-react";
import { getIDCardTheme } from "../config/idCardThemes";
export default function IDCardBack({
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
  const theme = customTheme || getIDCardTheme(employee.companyId || employee.company_code || companyConfig.id);
  const isNidhi = theme.id === "nidhi-impex";
  const instructions = theme.instructions || [];
  return /* @__PURE__ */ jsxs(
    "div",
    {
      className: `relative w-[320px] h-[520px] rounded-[22px] shadow-2xl overflow-hidden flex flex-col justify-between select-none font-sans text-white border border-gray-800 ${isNidhi ? "bg-[#0B1F33]" : "bg-[#181C20]"}`,
      style: { aspectRatio: "53.98 / 85.60" },
      children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.25),transparent_70%)]" }),
        /* @__PURE__ */ jsx("div", { className: "relative z-20 w-full pt-2 flex justify-center flex-shrink-0", children: /* @__PURE__ */ jsx("div", { className: "w-14 h-4 rounded-full bg-gradient-to-b from-gray-400 via-slate-300 to-gray-500 p-[1.5px] shadow-sm flex items-center justify-center border border-gray-500/50", children: /* @__PURE__ */ jsx("div", { className: "w-10 h-2 bg-[#0A0D10] rounded-full shadow-inner" }) }) }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10 px-6 pt-2 flex-shrink-0", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-sm font-black uppercase tracking-wider text-white", children: theme.name }),
          /* @__PURE__ */ jsx("p", { className: "text-[7px] font-bold uppercase tracking-[0.18em] text-slate-300 mt-0.5 font-mono", children: theme.tagline })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "relative z-10 px-6 py-3 flex-1 flex flex-col justify-between min-h-0", children: [
          fieldToggles.instructions !== false && instructions.length > 0 && /* @__PURE__ */ jsxs("div", { children: [
            /* @__PURE__ */ jsx(
              "h3",
              {
                className: "text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-1.5",
                style: { color: isNidhi ? "#D4AF37" : "#F97316" },
                children: "Important Instructions"
              }
            ),
            /* @__PURE__ */ jsx("div", { className: "space-y-2.5", children: [
              { icon: UserCheck, text: instructions[0] },
              { icon: Users, text: instructions[1] },
              { icon: Search, text: instructions[2] },
              { icon: Lock, text: instructions[3] }
            ].map((item, idx) => {
              const IconComponent = item.icon;
              return /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2.5", children: [
                /* @__PURE__ */ jsx("div", { className: "h-6 w-6 rounded-full border border-white/20 bg-white/5 flex items-center justify-center flex-shrink-0", children: /* @__PURE__ */ jsx(IconComponent, { size: 12, className: "text-white" }) }),
                /* @__PURE__ */ jsx("span", { className: "text-[9px] font-medium text-slate-200 leading-tight", children: item.text })
              ] }, idx);
            }) })
          ] }),
          fieldToggles.contact !== false && /* @__PURE__ */ jsxs("div", { className: "mt-3 pt-3 border-t border-white/10", children: [
            /* @__PURE__ */ jsx("p", { className: "text-[8.5px] font-medium text-slate-300 uppercase tracking-wider mb-1.5", children: "In case of emergency, please contact:" }),
            /* @__PURE__ */ jsxs("div", { className: "space-y-1 text-[10px] font-bold text-white", children: [
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(Phone, { size: 11, className: "text-slate-300" }),
                /* @__PURE__ */ jsx("span", { children: theme.phone })
              ] }),
              /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
                /* @__PURE__ */ jsx(Mail, { size: 11, className: "text-slate-300" }),
                /* @__PURE__ */ jsx("span", { children: theme.email })
              ] })
            ] })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "mt-3 pt-3 border-t border-white/10 flex items-end justify-between gap-2", children: [
            /* @__PURE__ */ jsx("div", { className: "min-w-0 flex-1", children: /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-1", children: [
              /* @__PURE__ */ jsx(MapPin, { size: 11, className: "text-slate-300 mt-0.5 flex-shrink-0" }),
              /* @__PURE__ */ jsxs("div", { children: [
                /* @__PURE__ */ jsx("p", { className: "text-[8px] font-bold uppercase text-slate-400 tracking-wider", children: "Registered Office" }),
                /* @__PURE__ */ jsx("p", { className: "text-[8.5px] font-bold text-white line-clamp-1", children: theme.legalName }),
                /* @__PURE__ */ jsx("p", { className: "text-[8px] text-slate-300 line-clamp-2 leading-tight", children: theme.address })
              ] })
            ] }) }),
            theme.backSlogan && /* @__PURE__ */ jsx("div", { className: "text-right max-w-[100px] flex-shrink-0", children: /* @__PURE__ */ jsx(
              "p",
              {
                className: "text-[7.5px] font-black uppercase tracking-wider leading-tight",
                style: { color: isNidhi ? "#D4AF37" : "#F97316" },
                children: theme.backSlogan
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "h-1.5 w-full flex-shrink-0", style: { background: isNidhi ? "#D4AF37" : "#F97316" } })
      ]
    }
  );
}
