import { jsx, jsxs } from "react/jsx-runtime";
import { useState, useEffect } from "react";
import { Mail, Phone, MapPin, Globe, Shield, Save, RotateCcw, Eye, Sparkles, Building, FileText } from "lucide-react";
import toast from "react-hot-toast";
import IDCardFront from "../../../../idCards/components/IDCardFront";
import IDCardBack from "../../../../idCards/components/IDCardBack";
import { ID_CARD_THEMES, getStoredCardSettings, saveStoredCardSettings, resetCardSettings } from "../../../../idCards/config/idCardThemes";
const sampleEmployee = {
  name: "RAJESH KUMAR SHARMA",
  employeeCode: "EMP-2026-894",
  designation: "SENIOR SOFTWARE ENGINEER",
  department: "ENGINEERING & IT",
  bloodGroup: "O+",
  dob: "15/08/1992",
  joiningDate: "01/04/2021",
  emergencyContact: "+91 98765 43210",
  policyNumber: "POL-2026-MED-8921",
  validUntil: "31/03/2027",
  company_code: "nidhi-impex"
};
export default function CardDesignSettingsTab() {
  const [selectedCompany, setSelectedCompany] = useState("nidhi-impex");
  const [previewSide, setPreviewSide] = useState("front");
  const baseTheme = ID_CARD_THEMES[selectedCompany] || ID_CARD_THEMES["nidhi-impex"];
  const [formData, setFormData] = useState({
    name: baseTheme.name,
    legalName: baseTheme.legalName,
    email: baseTheme.email,
    phone: baseTheme.phone,
    address: baseTheme.address,
    website: baseTheme.website,
    helpline: baseTheme.helpline || "1800-123-4567",
    insurerName: baseTheme.insurerName || "Star Health & Allied Insurance Co. Ltd.",
    tpaCode: baseTheme.tpaCode || "TPA-INS-2026/894",
    tagline: baseTheme.tagline,
    sideSlogan: baseTheme.sideSlogan,
    backSlogan: baseTheme.backSlogan,
    instruction1: baseTheme.instructions[0] || "",
    instruction2: baseTheme.instructions[1] || "",
    instruction3: baseTheme.instructions[2] || "",
    instruction4: baseTheme.instructions[3] || ""
  });
  useEffect(() => {
    const allStored = getStoredCardSettings();
    const stored = allStored[selectedCompany] || {};
    const base = ID_CARD_THEMES[selectedCompany] || ID_CARD_THEMES["nidhi-impex"];
    setFormData({
      name: stored.name || base.name,
      legalName: stored.legalName || base.legalName,
      email: stored.email || base.email,
      phone: stored.phone || base.phone,
      address: stored.address || base.address,
      website: stored.website || base.website,
      helpline: stored.helpline || base.helpline || "1800-123-4567",
      insurerName: stored.insurerName || base.insurerName || "Star Health & Allied Insurance Co. Ltd.",
      tpaCode: stored.tpaCode || base.tpaCode || "TPA-INS-2026/894",
      tagline: stored.tagline || base.tagline,
      sideSlogan: stored.sideSlogan || base.sideSlogan,
      backSlogan: stored.backSlogan || base.backSlogan,
      instruction1: stored.instructions?.[0] || base.instructions[0] || "",
      instruction2: stored.instructions?.[1] || base.instructions[1] || "",
      instruction3: stored.instructions?.[2] || base.instructions[2] || "",
      instruction4: stored.instructions?.[3] || base.instructions[3] || ""
    });
  }, [selectedCompany]);
  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };
  const handleSave = () => {
    const allStored = getStoredCardSettings();
    allStored[selectedCompany] = {
      name: formData.name,
      legalName: formData.legalName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      website: formData.website,
      helpline: formData.helpline,
      insurerName: formData.insurerName,
      tpaCode: formData.tpaCode,
      tagline: formData.tagline,
      sideSlogan: formData.sideSlogan,
      backSlogan: formData.backSlogan,
      instructions: [
        formData.instruction1,
        formData.instruction2,
        formData.instruction3,
        formData.instruction4
      ]
    };
    saveStoredCardSettings(allStored);
    toast.success(`ID Card settings for ${baseTheme.name} saved successfully!`);
  };
  const handleReset = () => {
    resetCardSettings(selectedCompany);
    const base = ID_CARD_THEMES[selectedCompany];
    setFormData({
      name: base.name,
      legalName: base.legalName,
      email: base.email,
      phone: base.phone,
      address: base.address,
      website: base.website,
      helpline: base.helpline || "1800-123-4567",
      insurerName: base.insurerName || "Star Health & Allied Insurance Co. Ltd.",
      tpaCode: base.tpaCode || "TPA-INS-2026/894",
      tagline: base.tagline,
      sideSlogan: base.sideSlogan,
      backSlogan: base.backSlogan,
      instruction1: base.instructions[0] || "",
      instruction2: base.instructions[1] || "",
      instruction3: base.instructions[2] || "",
      instruction4: base.instructions[3] || ""
    });
    toast.success(`Reset card settings for ${base.name} to defaults.`);
  };
  const livePreviewTheme = {
    ...baseTheme,
    name: formData.name,
    legalName: formData.legalName,
    email: formData.email,
    phone: formData.phone,
    address: formData.address,
    website: formData.website,
    helpline: formData.helpline,
    insurerName: formData.insurerName,
    tpaCode: formData.tpaCode,
    tagline: formData.tagline,
    sideSlogan: formData.sideSlogan,
    backSlogan: formData.backSlogan,
    instructions: [
      formData.instruction1,
      formData.instruction2,
      formData.instruction3,
      formData.instruction4
    ]
  };
  const activeEmployee = {
    ...sampleEmployee,
    company_code: selectedCompany
  };
  return /* @__PURE__ */ jsxs("div", { className: "space-y-6", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-amber-50/50 p-5 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-800", children: [
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx("h2", { className: "text-lg font-bold text-gray-900 dark:text-white", children: "Mediclaim ID Card Customizer" }),
          /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300", children: [
            /* @__PURE__ */ jsx(Sparkles, { size: 12 }),
            " Realtime Preview"
          ] })
        ] }),
        /* @__PURE__ */ jsx("p", { className: "mt-1 text-xs text-gray-500 dark:text-gray-400", children: "Configure company emails, emergency contact numbers, registered office address, helpline numbers & back-side instructions displayed on employee ID cards." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-1 shadow-inner dark:border-gray-700 dark:bg-gray-900", children: [
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setSelectedCompany("nidhi-impex"),
            className: `rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${selectedCompany === "nidhi-impex" ? "bg-[#0B1F33] text-[#D4AF37] shadow" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`,
            children: "Nidhi Impex"
          }
        ),
        /* @__PURE__ */ jsx(
          "button",
          {
            type: "button",
            onClick: () => setSelectedCompany("silver-star"),
            className: `rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${selectedCompany === "silver-star" ? "bg-[#1F2937] text-[#F97316] shadow" : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"}`,
            children: "Silver Star"
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-6 xl:grid-cols-12", children: [
      /* @__PURE__ */ jsxs("div", { className: "space-y-5 xl:col-span-7", children: [
        /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
          /* @__PURE__ */ jsxs("h3", { className: "mb-4 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white", children: [
            /* @__PURE__ */ jsx(Mail, { size: 16, className: "text-brand-500" }),
            "Company Contact & Support Information"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Support / HR Email Address" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(Mail, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "email",
                    value: formData.email,
                    onChange: (e) => handleChange("email", e.target.value),
                    placeholder: "hr@company.com",
                    className: "w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Emergency / HR Phone Number" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(Phone, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: formData.phone,
                    onChange: (e) => handleChange("phone", e.target.value),
                    placeholder: "+91 261 123 4567",
                    className: "w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "24/7 Toll-Free Helpline / TPA Number" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(Shield, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: formData.helpline,
                    onChange: (e) => handleChange("helpline", e.target.value),
                    placeholder: "1800-123-4567",
                    className: "w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Company Website URL" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(Globe, { size: 14, className: "absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" }),
                /* @__PURE__ */ jsx(
                  "input",
                  {
                    type: "text",
                    value: formData.website,
                    onChange: (e) => handleChange("website", e.target.value),
                    placeholder: "www.company.com",
                    className: "w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  }
                )
              ] })
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Registered Office Address" }),
              /* @__PURE__ */ jsxs("div", { className: "relative", children: [
                /* @__PURE__ */ jsx(MapPin, { size: 14, className: "absolute left-3 top-3 text-gray-400" }),
                /* @__PURE__ */ jsx(
                  "textarea",
                  {
                    rows: 2,
                    value: formData.address,
                    onChange: (e) => handleChange("address", e.target.value),
                    placeholder: "Registered Office address line...",
                    className: "w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  }
                )
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
          /* @__PURE__ */ jsxs("h3", { className: "mb-4 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white", children: [
            /* @__PURE__ */ jsx(Building, { size: 16, className: "text-amber-500" }),
            "Corporate Names & Branding Slogans"
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "grid grid-cols-1 gap-4 sm:grid-cols-2", children: [
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Display Company Name" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.name,
                  onChange: (e) => handleChange("name", e.target.value),
                  className: "w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Legal Registered Entity Name" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.legalName,
                  onChange: (e) => handleChange("legalName", e.target.value),
                  className: "w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Front Header Tagline" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.tagline,
                  onChange: (e) => handleChange("tagline", e.target.value),
                  className: "w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Front Side Vertical Slogan" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.sideSlogan,
                  onChange: (e) => handleChange("sideSlogan", e.target.value),
                  className: "w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                }
              )
            ] }),
            /* @__PURE__ */ jsxs("div", { className: "sm:col-span-2", children: [
              /* @__PURE__ */ jsx("label", { className: "mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300", children: "Back Bottom Accent Slogan" }),
              /* @__PURE__ */ jsx(
                "input",
                {
                  type: "text",
                  value: formData.backSlogan,
                  onChange: (e) => handleChange("backSlogan", e.target.value),
                  className: "w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                }
              )
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800", children: [
          /* @__PURE__ */ jsxs("h3", { className: "mb-4 flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white", children: [
            /* @__PURE__ */ jsx(FileText, { size: 16, className: "text-emerald-500" }),
            "Card Back Important Instructions (4 Rules)"
          ] }),
          /* @__PURE__ */ jsx("div", { className: "space-y-3", children: [1, 2, 3, 4].map((num) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx("span", { className: "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300", children: num }),
            /* @__PURE__ */ jsx(
              "input",
              {
                type: "text",
                value: formData[`instruction${num}`],
                onChange: (e) => handleChange(`instruction${num}`, e.target.value),
                placeholder: `Rule instruction ${num}...`,
                className: "w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
              }
            )
          ] }, num)) })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-3 pt-2", children: [
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: handleSave,
              className: "inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-brand-700 transition-colors",
              children: [
                /* @__PURE__ */ jsx(Save, { size: 15 }),
                " Save Card Settings"
              ]
            }
          ),
          /* @__PURE__ */ jsxs(
            "button",
            {
              type: "button",
              onClick: handleReset,
              className: "inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors",
              children: [
                /* @__PURE__ */ jsx(RotateCcw, { size: 14 }),
                " Reset Defaults"
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsx("div", { className: "xl:col-span-5", children: /* @__PURE__ */ jsxs("div", { className: "sticky top-6 space-y-4 rounded-2xl border border-gray-200 bg-gray-900 p-5 shadow-xl text-white", children: [
        /* @__PURE__ */ jsxs("div", { className: "flex items-center justify-between border-b border-gray-800 pb-3", children: [
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-2", children: [
            /* @__PURE__ */ jsx(Eye, { size: 16, className: "text-amber-400" }),
            /* @__PURE__ */ jsx("span", { className: "text-xs font-bold uppercase tracking-wider text-gray-200", children: "Live Card Preview" })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1 rounded-lg bg-gray-800 p-1", children: [
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setPreviewSide("front"),
                className: `rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${previewSide === "front" ? "bg-brand-600 text-white shadow" : "text-gray-400 hover:text-white"}`,
                children: "Front"
              }
            ),
            /* @__PURE__ */ jsx(
              "button",
              {
                type: "button",
                onClick: () => setPreviewSide("back"),
                className: `rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${previewSide === "back" ? "bg-brand-600 text-white shadow" : "text-gray-400 hover:text-white"}`,
                children: "Back"
              }
            )
          ] })
        ] }),
        /* @__PURE__ */ jsx("div", { className: "flex justify-center py-2 overflow-x-auto", children: /* @__PURE__ */ jsx("div", { className: "transform transition-transform scale-95 origin-top", children: previewSide === "front" ? /* @__PURE__ */ jsx(
          IDCardFront,
          {
            employee: activeEmployee,
            customTheme: livePreviewTheme
          }
        ) : /* @__PURE__ */ jsx(
          IDCardBack,
          {
            employee: activeEmployee,
            customTheme: livePreviewTheme
          }
        ) }) }),
        /* @__PURE__ */ jsx("p", { className: "text-center text-[10px] text-gray-400 italic", children: "Changes typed in the form update this card preview in real time." })
      ] }) })
    ] })
  ] });
}
