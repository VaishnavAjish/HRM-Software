/**
 * Section G — "DECLARATION BY EMPLOYEE" — verbatim from
 * `EMPLOYEE MEDICAL CLAIM.pdf` (Nidhi Impex & Silver Star Medical Claim
 * Form), in all three languages the form prints it in. The DeclarationPanel
 * (F4) renders all three; the employee ticks a single acknowledgement
 * checkbox that records `DECLARATION_VERSION` against the claim, so a later
 * wording change never silently reinterprets an already-recorded consent.
 *
 * Bump `DECLARATION_VERSION` (and keep the old text retrievable) any time
 * this wording changes.
 */

export const DECLARATION_VERSION = "v1";

export const DECLARATION_TEXT = {
  en: {
    language: "English",
    statements: [
      "I hereby declare that the information furnished above is true and correct to the best of my knowledge.",
      "I understand that false or misleading information may result in rejection of the claim.",
    ],
  },
  hi: {
    language: "हिन्दी",
    statements: [
      "मैं यह घोषणा करता/करती हूँ कि उपरोक्त जानकारी सत्य है।",
      "गलत जानकारी देने पर क्लेम अस्वीकृत किया जा सकता है।",
    ],
  },
  gu: {
    language: "ગુજરાતી",
    statements: [
      "હું ખાતરી આપું છું કે ઉપર આપેલી તમામ માહિતી સાચી છે.",
      "ખોટી માહિતી આપવાથી ક્લેમ રદ થઈ શકે છે.",
    ],
  },
};

export const DECLARATION_LANGUAGE_ORDER = ["en", "hi", "gu"];
