/**
 * Production ID Card Theme Configurations for Nidhi Impex and Silver Star.
 * Designed to match Reference Image 2 with 100% visual precision.
 */

export const DEFAULT_FIELD_TOGGLES = {
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
};

export const ID_CARD_THEMES = {
  "nidhi-impex": {
    id: "nidhi-impex",
    name: "NIDHI IMPEX",
    legalName: "NIDHI IMPEX PRIVATE LIMITED",
    shortLabel: "NIDHI IMPEX",
    tagline: "PEOPLE • PROGRESS • POSSIBILITIES",
    sideSlogan: "Building Businesses Together",
    backSlogan: "TOGETHER TOWARDS A BRIGHTER TOMORROW",
    logo: "/nidhi_impex_logo.png",
    initials: "NI",
    primaryColor: "#0B1F33", // Deep Navy
    secondaryColor: "#1E3A8A", // Royal Blue
    accentColor: "#D4AF37", // Gold
    accentText: "text-[#D4AF37]",
    accentBg: "bg-[#D4AF37]",
    footerBg: "bg-[#0B1F33]",
    address: "Ichhapore, Surat, Gujarat - 394510",
    phone: "+91 261 123 4567 (HR)",
    email: "hr@nidhiimpex.in",
    website: "www.nidhiimpex.in",
    helpline: "1800-123-4567",
    insurerName: "Star Health & Allied Insurance Co. Ltd.",
    tpaCode: "TPA-INS-2026/894",
    instructions: [
      "This card is non-transferable.",
      "Must be worn at all times within company premises.",
      "Loss of card must be reported immediately to HR.",
      "This card is the property of Nidhi Impex Pvt. Ltd.",
    ],
    fieldToggles: { ...DEFAULT_FIELD_TOGGLES },
  },
  "silver-star": {
    id: "silver-star",
    name: "SILVER STAR",
    legalName: "SILVER STAR PRIVATE LIMITED",
    shortLabel: "SILVER STAR",
    tagline: "PEOPLE • PERFORMANCE • EXCELLENCE",
    sideSlogan: "PEOPLE IDEAS EXCELLENCE ALWAYS",
    backSlogan: "PEOPLE DRIVE A BRIGHTER TOMORROW",
    logo: "/silver_star_logo.png",
    initials: "SS",
    primaryColor: "#1F2937", // Dark Charcoal
    secondaryColor: "#374151", // Cool Graphite
    accentColor: "#F97316", // Vibrant Orange
    accentText: "text-[#F97316]",
    accentBg: "bg-[#F97316]",
    footerBg: "bg-[#1F2937]",
    address: "Daduk, Surat, Gujarat - 394510",
    phone: "+91 261 987 6543 (HR)",
    email: "hr@silverstar.in",
    website: "www.silverstar.in",
    helpline: "1800-987-6543",
    insurerName: "Star Health & Allied Insurance Co. Ltd.",
    tpaCode: "TPA-INS-2026/895",
    instructions: [
      "This card is non-transferable.",
      "Must be worn at all times within company premises.",
      "Loss of card must be reported immediately to HR.",
      "This card is the property of Silver Star Private Limited.",
    ],
    fieldToggles: { ...DEFAULT_FIELD_TOGGLES },
  },
};

export const STORAGE_KEY = "mediclaim_card_settings_v1";

export function getStoredCardSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveStoredCardSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    window.dispatchEvent(new Event("card_settings_updated"));
  } catch (e) {
    console.error("Failed to save card settings:", e);
  }
}

export function resetCardSettings(companyId) {
  try {
    const current = getStoredCardSettings();
    if (companyId) {
      delete current[companyId];
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event("card_settings_updated"));
  } catch (e) {
    console.error("Failed to reset card settings:", e);
  }
}

export function getIDCardTheme(companyId) {
  const normalized = String(companyId || "").toLowerCase();
  const baseTheme = normalized.includes("silver") ? ID_CARD_THEMES["silver-star"] : ID_CARD_THEMES["nidhi-impex"];
  
  const allSettings = getStoredCardSettings();
  const companyCustom = allSettings[baseTheme.id] || allSettings[normalized];

  if (!companyCustom) {
    return baseTheme;
  }

  const rawToggles = companyCustom.fieldToggles || companyCustom.field_toggles || baseTheme.fieldToggles || DEFAULT_FIELD_TOGGLES;
  const cleanToggles = {};
  Object.keys(DEFAULT_FIELD_TOGGLES).forEach((key) => {
    if (rawToggles[key] === false || rawToggles[key] === 0 || rawToggles[key] === "false") {
      cleanToggles[key] = false;
    } else {
      cleanToggles[key] = true;
    }
  });

  return {
    ...baseTheme,
    name: companyCustom.name || baseTheme.name,
    legalName: companyCustom.legalName || companyCustom.legal_name || baseTheme.legalName,
    logo: companyCustom.logo || baseTheme.logo,
    signatureUrl: companyCustom.signatureUrl !== undefined ? companyCustom.signatureUrl : (companyCustom.signature_url !== undefined ? companyCustom.signature_url : baseTheme.signatureUrl),
    signatureTitle: companyCustom.signatureTitle || companyCustom.signature_title || baseTheme.signatureTitle || "Authorized Signatory",
    tagline: companyCustom.tagline || baseTheme.tagline,
    sideSlogan: companyCustom.sideSlogan || companyCustom.side_slogan || baseTheme.sideSlogan,
    backSlogan: companyCustom.backSlogan || companyCustom.back_slogan || baseTheme.backSlogan,
    address: companyCustom.address || baseTheme.address,
    phone: companyCustom.phone || baseTheme.phone,
    email: companyCustom.email || baseTheme.email,
    website: companyCustom.website || baseTheme.website,
    helpline: companyCustom.helpline || baseTheme.helpline,
    insurerName: companyCustom.insurerName || companyCustom.insurer_name || baseTheme.insurerName,
    tpaCode: companyCustom.tpaCode || companyCustom.tpa_code || baseTheme.tpaCode,
    instructions: Array.isArray(companyCustom.instructions) && companyCustom.instructions.length === 4
      ? companyCustom.instructions
      : baseTheme.instructions,
    fieldToggles: cleanToggles,
  };
}
