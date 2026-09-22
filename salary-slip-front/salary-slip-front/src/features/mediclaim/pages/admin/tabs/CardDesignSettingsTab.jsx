import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../../../../context/AuthContext";
import { mediclaimApi } from "../../../services/mediclaimApi";
import {
  Mail, Phone, MapPin, Globe, Shield, Save, RotateCcw, Eye, Sparkles, Building, FileText,
  SlidersHorizontal, Printer, Download, CheckSquare, Square, Layers, Upload, Image as ImageIcon, PenTool, X
} from "lucide-react";
import html2canvas from "html2canvas";
import toast from "react-hot-toast";
import IDCardFront from "../../../../idCards/components/IDCardFront";
import IDCardBack from "../../../../idCards/components/IDCardBack";
import {
  ID_CARD_THEMES,
  DEFAULT_FIELD_TOGGLES,
  getStoredCardSettings,
  saveStoredCardSettings,
  resetCardSettings,
} from "../../../../idCards/config/idCardThemes";

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
  company_code: "nidhi-impex",
};

export default function CardDesignSettingsTab() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";
  const [saving, setSaving] = useState(false);
  const handleLogoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo file size must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      handleChange("logo", reader.result);
      toast.success("Logo uploaded!");
    };
    reader.readAsDataURL(file);
  };

  const handleSignatureUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Signature file size must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      handleChange("signatureUrl", reader.result);
      toast.success("Signature uploaded!");
    };
    reader.readAsDataURL(file);
  };
  const [selectedCompany, setSelectedCompany] = useState("nidhi-impex");
  const [sideMode, setSideMode] = useState("both"); // 'front' | 'back' | 'both'
  const [activeConfigTab, setActiveConfigTab] = useState("toggles"); // 'toggles' | 'contact' | 'branding' | 'rules'
  const [downloading, setDownloading] = useState(false);
  const cardStageRef = useRef(null);

  const baseTheme = ID_CARD_THEMES[selectedCompany] || ID_CARD_THEMES["nidhi-impex"];

  // Form State
  const [formData, setFormData] = useState({
    name: baseTheme.name,
    legalName: baseTheme.legalName,
    logo: baseTheme.logo || "",
    signatureUrl: baseTheme.signatureUrl || "",
    signatureTitle: baseTheme.signatureTitle || "Authorized Signatory",
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
    instruction4: baseTheme.instructions[3] || "",
  });

  // Field Toggles State (Company-Specific)
  const [fieldToggles, setFieldToggles] = useState({ ...DEFAULT_FIELD_TOGGLES });

  // Load Company Settings
  useEffect(() => {
    const allStored = getStoredCardSettings();
    const stored = allStored[selectedCompany] || {};
    const base = ID_CARD_THEMES[selectedCompany] || ID_CARD_THEMES["nidhi-impex"];

    setFormData({
      name: stored.name || base.name,
      legalName: stored.legalName || base.legalName,
      logo: stored.logo || base.logo || "",
      signatureUrl: stored.signatureUrl || base.signatureUrl || "",
      signatureTitle: stored.signatureTitle || base.signatureTitle || "Authorized Signatory",
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
      instruction4: stored.instructions?.[3] || base.instructions[3] || "",
    });

    setFieldToggles(stored.fieldToggles || base.fieldToggles || { ...DEFAULT_FIELD_TOGGLES });
  }, [selectedCompany]);

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleField = (key) => {
    setFieldToggles((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSave = () => {
    const allStored = getStoredCardSettings();
    allStored[selectedCompany] = {
      name: formData.name,
      legalName: formData.legalName,
      logo: formData.logo,
      signatureUrl: formData.signatureUrl,
      signatureTitle: formData.signatureTitle,
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
        formData.instruction4,
      ],
      fieldToggles: { ...fieldToggles },
    };

    saveStoredCardSettings(allStored);
    toast.success(`ID Card settings & toggles for ${baseTheme.name} saved successfully!`);
  };

  const handleReset = () => {
    resetCardSettings(selectedCompany);
    const base = ID_CARD_THEMES[selectedCompany];
    setFormData({
      name: base.name,
      legalName: base.legalName,
      logo: base.logo || "",
      signatureUrl: base.signatureUrl || "",
      signatureTitle: base.signatureTitle || "Authorized Signatory",
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
      instruction4: base.instructions[3] || "",
    });
    setFieldToggles(base.fieldToggles || { ...DEFAULT_FIELD_TOGGLES });
    toast.success(`Reset card settings for ${base.name} to defaults.`);
  };

  const handleDownload = async () => {
    if (!cardStageRef.current) return;
    setDownloading(true);
    try {
      const canvas = await html2canvas(cardStageRef.current, { scale: 3, useCORS: true, backgroundColor: null });
      const link = document.createElement("a");
      link.download = `mediclaim-id-card-${selectedCompany}-${sideMode}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success("Card pass downloaded successfully!");
    } catch {
      toast.error("Failed to generate card image.");
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Construct active preview theme
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
      formData.instruction4,
    ],
    fieldToggles: { ...fieldToggles },
  };

  const activeEmployee = {
    ...sampleEmployee,
    company_code: selectedCompany,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner: Controls & Company Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-100 bg-gradient-to-r from-brand-50/80 via-white to-amber-50/50 p-5 shadow-sm dark:border-gray-700 dark:from-gray-800 dark:to-gray-800">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-extrabold text-gray-900 dark:text-white">Mediclaim ID Card Customizer</h2>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
              <Sparkles size={12} /> Company-Wise Editor
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Customize field visibility toggles, company emails, phone numbers, registered address, slogans & back-side instructions.
          </p>
        </div>

        {/* Company Switcher */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">Company:</span>
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white p-1 shadow-inner dark:border-gray-700 dark:bg-gray-900">
            <button
              type="button"
              onClick={() => setSelectedCompany("nidhi-impex")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                selectedCompany === "nidhi-impex"
                  ? "bg-[#0B1F33] text-[#D4AF37] shadow"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#D4AF37]" />
              Nidhi Impex
            </button>
            <button
              type="button"
              onClick={() => setSelectedCompany("silver-star")}
              className={`rounded-lg px-3 py-1.5 text-xs font-black transition-all flex items-center gap-1.5 ${
                selectedCompany === "silver-star"
                  ? "bg-[#1F2937] text-[#F97316] shadow"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span className="h-2 w-2 rounded-full bg-[#F97316]" />
              Silver Star
            </button>
          </div>
        </div>
      </div>

      {/* Main Grid: Left Controls (7 cols) + Right Stage Preview (5 cols) */}
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
        
        {/* Left Controls (7 cols) */}
        <div className="space-y-4 xl:col-span-7">
          
          {/* Section Navigation Tabs */}
          <div className="flex flex-wrap gap-1.5 rounded-xl bg-gray-100 p-1 dark:bg-gray-800">
            {[
              { id: "toggles", label: "Field Visibility", icon: SlidersHorizontal },
              { id: "contact", label: "Contact & Location", icon: Mail },
              { id: "branding", label: "Names & Slogans", icon: Building },
              { id: "rules", label: "Card Rules", icon: FileText },
            ].map(({ id, label, icon: IconComponent }) => {
              const isActive = activeConfigTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveConfigTab(id)}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold transition-all ${
                    isActive
                      ? "bg-white text-brand-600 shadow dark:bg-gray-700 dark:text-brand-300"
                      : "text-gray-600 hover:bg-white/50 dark:text-gray-400 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <IconComponent size={14} />
                  {label}
                </button>
              );
            })}
          </div>

          {/* TAB 1: FIELD VISIBILITY TOGGLES */}
          {activeConfigTab === "toggles" && (
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <div>
                <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  <SlidersHorizontal size={14} className="text-brand-500" />
                  Front Card Display Fields
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { key: "empCode", label: "Employee ID Number" },
                    { key: "department", label: "Department" },
                    { key: "designation", label: "Designation" },
                    { key: "branch", label: "Branch / Location" },
                    { key: "doj", label: "Date of Joining" },
                    { key: "bloodGroup", label: "Blood Group" },
                    { key: "qrCode", label: "Verification QR Code" },
                  ].map(({ key, label }) => (
                    <label
                      key={key}
                      className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                        fieldToggles[key] !== false
                          ? "border-brand-200 bg-brand-50/50 text-brand-900 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200"
                          : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400"
                      }`}
                    >
                      <span className="text-xs font-semibold">{label}</span>
                      <input
                        type="checkbox"
                        checked={fieldToggles[key] !== false}
                        onChange={() => toggleField(key)}
                        className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                      />
                    </label>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4 dark:border-gray-700">
                <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-3">
                  <Layers size={14} className="text-amber-500" />
                  Back Card Display Sections
                </h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {[
                    { key: "instructions", label: "Compliance Instructions" },
                    { key: "contact", label: "HR Emergency Contact & Email" },
                    { key: "values", label: "Corporate Core Slogans" },
                  ].map(({ key, label }) => (
                    <label
                      key={key}
                      className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-all ${
                        fieldToggles[key] !== false
                          ? "border-amber-200 bg-amber-50/50 text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
                          : "border-gray-200 bg-gray-50 text-gray-500 dark:border-gray-700 dark:bg-gray-900/50 dark:text-gray-400"
                      }`}
                    >
                      <span className="text-xs font-semibold">{label}</span>
                      <input
                        type="checkbox"
                        checked={fieldToggles[key] !== false}
                        onChange={() => toggleField(key)}
                        className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTACT & LOCATION */}
          {activeConfigTab === "contact" && (
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <Mail size={16} className="text-brand-500" />
                Company Contact & Support Information
              </h3>
              
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Support / HR Email Address
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => handleChange("email", e.target.value)}
                      placeholder="hr@company.com"
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Emergency / HR Phone Number
                  </label>
                  <div className="relative">
                    <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) => handleChange("phone", e.target.value)}
                      placeholder="+91 261 123 4567"
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    24/7 Toll-Free Helpline / TPA Number
                  </label>
                  <div className="relative">
                    <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={formData.helpline}
                      onChange={(e) => handleChange("helpline", e.target.value)}
                      placeholder="1800-123-4567"
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Company Website URL
                  </label>
                  <div className="relative">
                    <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={formData.website}
                      onChange={(e) => handleChange("website", e.target.value)}
                      placeholder="www.company.com"
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Registered Office Address
                  </label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-3 text-gray-400" />
                    <textarea
                      rows={2}
                      value={formData.address}
                      onChange={(e) => handleChange("address", e.target.value)}
                      placeholder="Registered Office address line..."
                      className="w-full rounded-xl border border-gray-300 pl-9 pr-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: BRANDING & SLOGANS */}
          {activeConfigTab === "branding" && (
            <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              
              {/* Logo & Signature Upload Section */}
              <div className="rounded-xl border border-brand-100 bg-gradient-to-r from-brand-50/50 to-amber-50/50 p-4 dark:border-gray-700 dark:bg-gray-900">
                <h4 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-brand-700 dark:text-brand-300 mb-3">
                  <ImageIcon size={15} /> Company Logo & Authorized Signature Assets
                </h4>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Logo Upload */}
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xs dark:border-gray-700 dark:bg-gray-800">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">
                      Company Header Logo
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-20 rounded-lg border border-gray-200 bg-gray-50 p-1 flex items-center justify-center flex-shrink-0 dark:border-gray-700 dark:bg-gray-900">
                        {formData.logo ? (
                          <img src={formData.logo} alt="Logo" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[9px] text-gray-400 font-semibold">No Logo</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 dark:bg-brand-500/20 dark:text-brand-300">
                          <Upload size={13} /> Upload Logo
                          <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                        </label>
                        {formData.logo && formData.logo !== baseTheme.logo && (
                          <button
                            type="button"
                            onClick={() => handleChange("logo", baseTheme.logo)}
                            className="block text-[10px] font-semibold text-gray-500 hover:text-red-600"
                          >
                            Reset Default Logo
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Signature Upload */}
                  <div className="rounded-xl border border-gray-200 bg-white p-3 shadow-xs dark:border-gray-700 dark:bg-gray-800">
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-200 mb-2">
                      Authorized Signatory Signature
                    </label>
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-24 rounded-lg border border-gray-200 bg-gray-50 p-1 flex items-center justify-center flex-shrink-0 dark:border-gray-700 dark:bg-gray-900">
                        {formData.signatureUrl ? (
                          <img src={formData.signatureUrl} alt="Signature" className="h-full w-full object-contain" />
                        ) : (
                          <span className="text-[9px] text-gray-400 font-semibold italic">Vector Default</span>
                        )}
                      </div>
                      <div className="space-y-1">
                        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-500/20 dark:text-emerald-300">
                          <PenTool size={13} /> Upload Signature
                          <input type="file" accept="image/*" onChange={handleSignatureUpload} className="hidden" />
                        </label>
                        {formData.signatureUrl && (
                          <button
                            type="button"
                            onClick={() => handleChange("signatureUrl", "")}
                            className="block text-[10px] font-semibold text-gray-500 hover:text-red-600"
                          >
                            Use Default Vector
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                      Signature Title Label
                    </label>
                    <input
                      type="text"
                      value={formData.signatureTitle}
                      onChange={(e) => handleChange("signatureTitle", e.target.value)}
                      placeholder="Authorized Signatory"
                      className="w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white pt-2">
                <Building size={16} className="text-amber-500" />
                Corporate Names & Branding Slogans
              </h3>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Display Company Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => handleChange("name", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Legal Registered Entity Name
                  </label>
                  <input
                    type="text"
                    value={formData.legalName}
                    onChange={(e) => handleChange("legalName", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Front Header Tagline
                  </label>
                  <input
                    type="text"
                    value={formData.tagline}
                    onChange={(e) => handleChange("tagline", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Front Side Vertical Slogan
                  </label>
                  <input
                    type="text"
                    value={formData.sideSlogan}
                    onChange={(e) => handleChange("sideSlogan", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="mb-1 block text-xs font-semibold text-gray-700 dark:text-gray-300">
                    Back Bottom Accent Slogan
                  </label>
                  <input
                    type="text"
                    value={formData.backSlogan}
                    onChange={(e) => handleChange("backSlogan", e.target.value)}
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CARD BACK RULES */}
          {activeConfigTab === "rules" && (
            <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800">
              <h3 className="flex items-center gap-2 text-sm font-bold text-gray-900 dark:text-white">
                <FileText size={16} className="text-emerald-500" />
                Card Back Important Instructions (4 Rules)
              </h3>

              <div className="space-y-3">
                {[1, 2, 3, 4].map((num) => (
                  <div key={num} className="flex items-center gap-2">
                    <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {num}
                    </span>
                    <input
                      type="text"
                      value={formData[`instruction${num}`]}
                      onChange={(e) => handleChange(`instruction${num}`, e.target.value)}
                      placeholder={`Rule instruction ${num}...`}
                      className="w-full rounded-xl border border-gray-300 px-3 py-1.5 text-xs text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons Toolbar */}
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              type="button"
              onClick={handleSave}
              className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-xs font-bold text-white shadow-md hover:bg-brand-700 transition-colors"
            >
              <Save size={15} /> Save Card Settings
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors"
            >
              <RotateCcw size={14} /> Reset Defaults
            </button>
          </div>

        </div>

        {/* Right Stage: Realtime Card Preview & Actions (5 cols) */}
        <div className="xl:col-span-5">
          <div className="sticky top-6 space-y-4 rounded-2xl border border-gray-200 bg-slate-900 p-5 shadow-xl text-white">
            
            {/* Stage Header Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-800 pb-3">
              <div className="flex items-center gap-2">
                <Eye size={16} className="text-amber-400" />
                <span className="text-xs font-extrabold uppercase tracking-wider text-gray-200">Live Card Preview</span>
              </div>

              {/* View Side Toggles (Front Only, Back Only, Show Both) */}
              <div className="flex items-center gap-1 rounded-lg bg-gray-800 p-1">
                {[
                  { mode: "front", label: "Front Only" },
                  { mode: "back", label: "Back Only" },
                  { mode: "both", label: "Show Both" },
                ].map(({ mode, label }) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setSideMode(mode)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-all ${
                      sideMode === mode
                        ? "bg-brand-600 text-white shadow"
                        : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Export Tools */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex items-center gap-1.5 rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-gray-700 transition-colors"
              >
                <Printer size={13} /> Print Card
              </button>
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
              >
                <Download size={13} /> Download PNG
              </button>
            </div>

            {/* Rendered Live Card Stage */}
            <div ref={cardStageRef} className="flex justify-center py-4 overflow-x-auto w-full">
              <div className="transform transition-transform scale-90 origin-top">
                {sideMode === "both" ? (
                  <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                    <IDCardFront
                      employee={activeEmployee}
                      customTheme={livePreviewTheme}
                      fieldToggles={fieldToggles}
                    />
                    <IDCardBack
                      employee={activeEmployee}
                      customTheme={livePreviewTheme}
                      fieldToggles={fieldToggles}
                    />
                  </div>
                ) : sideMode === "front" ? (
                  <IDCardFront
                    employee={activeEmployee}
                    customTheme={livePreviewTheme}
                    fieldToggles={fieldToggles}
                  />
                ) : (
                  <IDCardBack
                    employee={activeEmployee}
                    customTheme={livePreviewTheme}
                    fieldToggles={fieldToggles}
                  />
                )}
              </div>
            </div>

            <p className="text-center text-[10px] text-gray-400 italic">
              Changes in field toggles or text inputs update this card stage in real time.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
