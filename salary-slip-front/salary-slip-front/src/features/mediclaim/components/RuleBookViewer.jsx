import { useMemo, useState } from "react";
import { BookOpen, Eye } from "lucide-react";
import DocumentViewerModal from "../../../components/documents/DocumentViewerModal";
import { DECLARATION_LANGUAGE_ORDER } from "../models/declarationText";
import { formatClaimDate } from "../utils/formatters";

const LANGUAGE_LABEL = { en: "English", hi: "हिन्दी", gu: "ગુજરાતી" };

/**
 * Trilingual rule-book viewer — EN/HI/GU tabs, reusing
 * `DECLARATION_LANGUAGE_ORDER` for the language set/order rather than
 * inventing a second one, so the declaration step (F4) and this viewer
 * agree on language ordering everywhere in the feature.
 *
 * `ruleBooks` comes from `useMediclaimLookups` (preloaded once per
 * workspace mount). Per the backend plan's B2 seed data, no rule-book row
 * is created at launch on purpose ("the PDF gets uploaded through the
 * admin UI post-launch") — the empty state below is the expected initial
 * state, not an error condition.
 */
export default function RuleBookViewer({ ruleBooks = [], loading = false, error = null }) {
  const [language, setLanguage] = useState(DECLARATION_LANGUAGE_ORDER[0]);
  const [viewerDoc, setViewerDoc] = useState(null);

  const published = useMemo(
    () => ruleBooks.filter((rb) => String(rb.status || "").toLowerCase() === "published"),
    [ruleBooks],
  );

  const selected = useMemo(
    () => published.find((rb) => (rb.language || rb.languageCode || rb.language_code) === language) || null,
    [published, language],
  );

  if (loading) {
    return <p className="py-10 text-center text-sm text-gray-400">Loading rule book…</p>;
  }

  if (error) {
    return <p className="py-10 text-center text-sm text-red-500">{error}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1 dark:bg-gray-700/50">
        {DECLARATION_LANGUAGE_ORDER.map((code) => (
          <button
            key={code}
            onClick={() => setLanguage(code)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
              language === code
                ? "bg-white text-brand-600 shadow-sm dark:bg-gray-800 dark:text-brand-400"
                : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {LANGUAGE_LABEL[code] || code}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {published.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen size={32} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No Mediclaim rule book has been published yet. Check back once HR uploads it.
            </p>
          </div>
        ) : !selected ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen size={32} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              The rule book is not yet published in {LANGUAGE_LABEL[language] || language}.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">{selected.title || "Mediclaim Rule Book"}</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                Effective from {formatClaimDate(selected.effectiveFrom || selected.effective_from)}
              </p>
            </div>
            <button
              onClick={() => setViewerDoc(selected.document || selected)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-xs font-semibold text-white hover:bg-brand-700"
            >
              <Eye size={14} /> View
            </button>
          </div>
        )}
      </div>

      <DocumentViewerModal document={viewerDoc} open={Boolean(viewerDoc)} onClose={() => setViewerDoc(null)} />
    </div>
  );
}
