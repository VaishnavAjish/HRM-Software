import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, BookOpen, Languages } from "lucide-react";
import { formatClaimDate } from "../utils/formatters";

function ruleText(item) {
  return item.ruleText || item.rule_text || "";
}

function ruleBookLanguageId(ruleBook) {
  return ruleBook.languageId ?? ruleBook.language_id ?? ruleBook.language?.id ?? null;
}

function languageName(ruleBook) {
  return ruleBook.language?.name || "";
}

function languageNativeName(ruleBook) {
  return ruleBook.language?.nativeName || ruleBook.language?.native_name || ruleBook.language?.name || "";
}

/**
 * Read-only renderer for the Mediclaim rule book — a two-step flow, not a
 * tab strip: pick a language first (only languages with a *published* rule
 * book are offered), then the rule text for that language shows. Nothing
 * shows by default, since the employee must make an active choice rather
 * than being handed whatever language happened to be created first.
 *
 * `onLanguageSelected` (optional) fires once a language's content is being
 * shown — the onboarding gate uses it to know the employee has actually
 * opened the rule book before letting them acknowledge it.
 */
export default function RuleBookViewer({ ruleBooks = [], loading = false, error = null, onLanguageSelected }) {
  const published = useMemo(
    () => ruleBooks.filter((rb) => String(rb.status || "").toLowerCase() === "published"),
    [ruleBooks],
  );

  const languages = useMemo(() => {
    const seen = new Set();
    const list = [];
    published.forEach((rb) => {
      const id = ruleBookLanguageId(rb);
      if (id !== null && !seen.has(id)) {
        seen.add(id);
        list.push({ id, name: languageName(rb), nativeName: languageNativeName(rb) });
      }
    });
    return list;
  }, [published]);

  const [languageId, setLanguageId] = useState(null);

  const selectedLanguage = languages.find((l) => l.id === languageId) || null;
  const selectedRuleBook = selectedLanguage ? published.find((rb) => ruleBookLanguageId(rb) === selectedLanguage.id) : null;

  // Every hook above runs on every render regardless of loading/error/empty
  // state — the early returns below must come after all hook calls, per the
  // Rules of Hooks, so this can't be skipped only for the states where
  // there's nothing to select yet.
  useEffect(() => {
    if (selectedRuleBook) onLanguageSelected?.();
    // Intentionally keyed on the id below, not the object reference, so
    // this doesn't re-fire on every unrelated reload() that returns a new
    // (but equal) rule book row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRuleBook?.id, onLanguageSelected]);

  if (loading) return <p className="py-10 text-center text-sm text-gray-400">Loading rule book…</p>;
  if (error) return <p className="py-10 text-center text-sm text-red-500">{error}</p>;

  if (languages.length === 0) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="flex flex-col items-center gap-2 py-10 text-center">
          <BookOpen size={32} className="text-gray-300 dark:text-gray-600" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No Mediclaim rule book has been published yet. Check back once HR publishes it.</p>
        </div>
      </div>
    );
  }

  if (!selectedRuleBook) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        <div className="mb-4 flex items-center gap-2">
          <Languages size={18} className="text-brand-600 dark:text-brand-400" />
          <p className="font-semibold text-gray-900 dark:text-white">Choose a language to read the Mediclaim rule book</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {languages.map((lang) => (
            <button
              key={lang.id}
              type="button"
              onClick={() => setLanguageId(lang.id)}
              className="flex flex-col items-center gap-1 rounded-lg border border-gray-200 p-3 text-center transition-colors hover:border-brand-400 hover:bg-brand-50 dark:border-gray-600 dark:hover:border-brand-500 dark:hover:bg-gray-700"
            >
              <span className="text-base font-semibold text-gray-900 dark:text-white">{lang.nativeName || lang.name}</span>
              {lang.name && lang.nativeName && lang.nativeName !== lang.name && (
                <span className="text-xs text-gray-500 dark:text-gray-400">{lang.name}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const items = selectedRuleBook.items || [];
  const label = selectedLanguage.nativeName || selectedLanguage.name;

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setLanguageId(null)}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400"
      >
        <ArrowLeft size={14} /> Change language
      </button>

      <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <BookOpen size={32} className="text-gray-300 dark:text-gray-600" />
            <p className="text-sm text-gray-500 dark:text-gray-400">The rule book has no rules published yet in {label}.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-gray-900 dark:text-white">
                Mediclaim Rule Book — {label}
                {selectedRuleBook.versionLabel || selectedRuleBook.version_label
                  ? ` (${selectedRuleBook.versionLabel || selectedRuleBook.version_label})`
                  : ""}
              </p>
              {(selectedRuleBook.effectiveFrom || selectedRuleBook.effective_from) && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Effective from {formatClaimDate(selectedRuleBook.effectiveFrom || selectedRuleBook.effective_from)}
                </p>
              )}
            </div>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-200">
              {items.map((item) => (
                <li key={item.id} className="leading-relaxed">{ruleText(item)}</li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
