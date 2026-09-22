/**
 * Production ID Card Theme Configurations for Nidhi Impex and Silver Star.
 * Designed to match Reference Image 2 with 100% visual precision.
 */

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
    instructions: [
      "This card is non-transferable.",
      "Must be worn at all times within company premises.",
      "Loss of card must be reported immediately to HR.",
      "This card is the property of Nidhi Impex Pvt. Ltd.",
    ],
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
    instructions: [
      "This card is non-transferable.",
      "Must be worn at all times within company premises.",
      "Loss of card must be reported immediately to HR.",
      "This card is the property of Silver Star Private Limited.",
    ],
  },
};

export function getIDCardTheme(companyId) {
  const normalized = String(companyId || "").toLowerCase();
  if (normalized.includes("silver")) return ID_CARD_THEMES["silver-star"];
  return ID_CARD_THEMES["nidhi-impex"];
}
