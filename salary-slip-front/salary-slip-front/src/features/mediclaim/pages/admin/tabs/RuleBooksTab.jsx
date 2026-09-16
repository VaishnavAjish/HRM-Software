import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, BookPlus, Check, Pencil, Plus, Trash2, X } from "lucide-react";
import toast from "react-hot-toast";
import { useAuth } from "../../../../../context/AuthContext";
import { useCompany } from "../../../../../context/CompanyContext";
import Drawer from "../../../../../components/ui/Drawer";
import Button from "../../../../../components/ui/Button";
import Badge from "../../../../../components/ui/Badge";
import { useMediclaimAuthorization } from "../../../hooks/useMediclaimAuthorization";
import { mediclaimApi } from "../../../services/mediclaimApi";
import RuleBookViewer from "../../../components/RuleBookViewer";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

// English plus all 22 languages scheduled in the Indian constitution — HR
// picks from this list instead of typing a name, and the native script is
// baked in per language so it's never left blank or mistyped.
const PREDEFINED_LANGUAGES = [
  { name: "English", nativeName: "English" },
  { name: "Hindi", nativeName: "हिन्दी" },
  { name: "Bengali", nativeName: "বাংলা" },
  { name: "Telugu", nativeName: "తెలుగు" },
  { name: "Marathi", nativeName: "मराठी" },
  { name: "Tamil", nativeName: "தமிழ்" },
  { name: "Urdu", nativeName: "اردو" },
  { name: "Gujarati", nativeName: "ગુજરાતી" },
  { name: "Kannada", nativeName: "ಕನ್ನಡ" },
  { name: "Odia", nativeName: "ଓଡ଼ିଆ" },
  { name: "Malayalam", nativeName: "മലയാളം" },
  { name: "Punjabi", nativeName: "ਪੰਜਾਬੀ" },
  { name: "Assamese", nativeName: "অসমীয়া" },
  { name: "Maithili", nativeName: "मैथिली" },
  { name: "Sanskrit", nativeName: "संस्कृतम्" },
  { name: "Kashmiri", nativeName: "کٲشُر" },
  { name: "Nepali", nativeName: "नेपाली" },
  { name: "Sindhi", nativeName: "سنڌي" },
  { name: "Konkani", nativeName: "कोंकणी" },
  { name: "Dogri", nativeName: "डोगरी" },
  { name: "Manipuri", nativeName: "মৈতৈলোন্" },
  { name: "Bodo", nativeName: "बड़ो" },
  { name: "Santali", nativeName: "ᱥᱟᱱᱛᱟᱲᱤ" },
];

function languageName(lang) {
  return lang?.name || "";
}

function languageNativeName(lang) {
  return lang?.nativeName || lang?.native_name || "";
}

function ruleBookLanguageId(ruleBook) {
  return ruleBook?.languageId ?? ruleBook?.language_id ?? null;
}

function ruleText(item) {
  return item?.ruleText || item?.rule_text || "";
}

/**
 * Two-part admin screen: languages are a standalone CRUD resource (left),
 * selected with radio buttons; the right panel manages the one rule book
 * that belongs to whichever language is selected, built up one rule at a
 * time. There is no PDF upload anywhere in this flow.
 */
export default function RuleBooksTab() {
  const { user } = useAuth();
  const { companyScope } = useCompany();
  const { can } = useMediclaimAuthorization();

  const accessToken = user?.accessToken;
  const tokenType = user?.tokenType;
  const [languagesReloadToken, setLanguagesReloadToken] = useState(0);
  const [ruleBooksReloadToken, setRuleBooksReloadToken] = useState(0);
  const languagesKey = `${accessToken ?? ""}|${tokenType ?? ""}|${languagesReloadToken}`;
  const ruleBooksKey = `${accessToken ?? ""}|${tokenType ?? ""}|${ruleBooksReloadToken}`;
  const [languageResult, setLanguageResult] = useState({ key: null, languages: [], error: null });
  const [ruleBookResult, setRuleBookResult] = useState({ key: null, ruleBooks: [], error: null });
  const [selectedLanguageId, setSelectedLanguageId] = useState(null);

  const [langDrawerOpen, setLangDrawerOpen] = useState(false);
  const [addingLanguageName, setAddingLanguageName] = useState(null);
  const [deletingLanguageId, setDeletingLanguageId] = useState(null);

  const [creatingRuleBook, setCreatingRuleBook] = useState(false);
  const [newRuleText, setNewRuleText] = useState("");
  const [addingRule, setAddingRule] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editingItemText, setEditingItemText] = useState("");
  const [savingItemId, setSavingItemId] = useState(null);
  const [deletingItemId, setDeletingItemId] = useState(null);
  const [reordering, setReordering] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const canCreate = can("mediclaim.rule_book.create");
  const canUpdate = can("mediclaim.rule_book.update");
  const canDelete = can("mediclaim.rule_book.delete");
  const canPublish = can("mediclaim.rule_book.publish");

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.ruleBookLanguages({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const languages = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setLanguageResult({ key: languagesKey, languages, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setLanguageResult({ key: languagesKey, languages: [], error: err?.message || "Failed to load languages." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, languagesKey]);

  useEffect(() => {
    if (!accessToken) return undefined;
    let cancelled = false;
    mediclaimApi.ruleBooks({}, accessToken, tokenType)
      .then((res) => {
        if (cancelled) return;
        const payload = res?.data;
        const ruleBooks = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
        setRuleBookResult({ key: ruleBooksKey, ruleBooks, error: null });
      })
      .catch((err) => {
        if (cancelled) return;
        setRuleBookResult({ key: ruleBooksKey, ruleBooks: [], error: err?.message || "Failed to load rule books." });
      });
    return () => { cancelled = true; };
  }, [accessToken, tokenType, ruleBooksKey]);

  const languagesLoading = languageResult.key !== languagesKey;
  const ruleBooksLoading = ruleBookResult.key !== ruleBooksKey;
  const ruleBooks = ruleBookResult.ruleBooks;

  const loadLanguages = () => setLanguagesReloadToken((n) => n + 1);
  const loadRuleBooks = () => setRuleBooksReloadToken((n) => n + 1);

  const languages = languageResult.languages;
  const activeLanguageId = selectedLanguageId && languages.some((l) => l.id === selectedLanguageId)
    ? selectedLanguageId
    : languages[0]?.id ?? null;
  const activeLanguage = languages.find((l) => l.id === activeLanguageId) || null;

  const ruleBookByLanguageId = useMemo(() => {
    const map = new Map();
    ruleBooks.forEach((rb) => map.set(ruleBookLanguageId(rb), rb));
    return map;
  }, [ruleBooks]);

  const currentRuleBook = activeLanguageId ? ruleBookByLanguageId.get(activeLanguageId) || null : null;
  const items = currentRuleBook?.items || [];
  const status = String(currentRuleBook?.status || "").toLowerCase();

  const alreadyAddedNames = useMemo(
    () => new Set(languages.map((l) => languageName(l).toLowerCase())),
    [languages],
  );

  const addPredefinedLanguage = async (predefined) => {
    setAddingLanguageName(predefined.name);
    try {
      const res = await mediclaimApi.createRuleBookLanguage(
        { companyCode: companyScope?.companyId || undefined, name: predefined.name, nativeName: predefined.nativeName },
        user?.accessToken,
        user?.tokenType,
      );
      toast.success(`${predefined.nativeName} added`);
      const createdId = res?.data?.id;
      if (createdId) setSelectedLanguageId(createdId);
      loadLanguages();
    } catch (err) {
      toast.error(err?.message || `Failed to add ${predefined.name}.`);
    } finally {
      setAddingLanguageName(null);
    }
  };

  const removeLanguage = async (lang) => {
    const label = languageNativeName(lang) || languageName(lang);
    if (!window.confirm(`Delete "${label}"? This also deletes its rule book and every rule in it.`)) return;

    setDeletingLanguageId(lang.id);
    try {
      await mediclaimApi.deleteRuleBookLanguage(lang.id, user?.accessToken, user?.tokenType);
      toast.success("Language deleted");
      if (selectedLanguageId === lang.id) setSelectedLanguageId(null);
      loadLanguages();
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to delete this language.");
    } finally {
      setDeletingLanguageId(null);
    }
  };

  const addRuleBook = async () => {
    if (!activeLanguageId) return;
    setCreatingRuleBook(true);
    try {
      await mediclaimApi.createRuleBook(
        { companyCode: companyScope?.companyId || undefined, languageId: activeLanguageId },
        user?.accessToken,
        user?.tokenType,
      );
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to create the rule book.");
    } finally {
      setCreatingRuleBook(false);
    }
  };

  const submitAddRule = async () => {
    const text = newRuleText.trim();
    const bookId = currentRuleBook?.id;
    if (!text || !bookId) return;

    setAddingRule(true);
    try {
      await mediclaimApi.addRuleBookItem(bookId, { ruleText: text }, user?.accessToken, user?.tokenType);
      setNewRuleText("");
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to add this rule.");
    } finally {
      setAddingRule(false);
    }
  };

  const startEditItem = (item) => {
    setEditingItemId(item.id);
    setEditingItemText(ruleText(item));
  };

  const cancelEditItem = () => {
    setEditingItemId(null);
    setEditingItemText("");
  };

  const submitEditItem = async () => {
    const text = editingItemText.trim();
    const bookId = currentRuleBook?.id;
    if (!text || !bookId || !editingItemId) return;

    setSavingItemId(editingItemId);
    try {
      await mediclaimApi.updateRuleBookItem(bookId, editingItemId, { ruleText: text }, user?.accessToken, user?.tokenType);
      setEditingItemId(null);
      setEditingItemText("");
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to update this rule.");
    } finally {
      setSavingItemId(null);
    }
  };

  const removeItem = async (item) => {
    const bookId = currentRuleBook?.id;
    if (!bookId) return;
    if (!window.confirm("Remove this rule?")) return;

    setDeletingItemId(item.id);
    try {
      await mediclaimApi.deleteRuleBookItem(bookId, item.id, user?.accessToken, user?.tokenType);
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to remove this rule.");
    } finally {
      setDeletingItemId(null);
    }
  };

  const move = async (item, direction) => {
    const bookId = currentRuleBook?.id;
    if (!bookId) return;

    const index = items.findIndex((i) => i.id === item.id);
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || targetIndex < 0 || targetIndex >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

    setReordering(true);
    try {
      await mediclaimApi.reorderRuleBookItems(bookId, reordered.map((i) => i.id), user?.accessToken, user?.tokenType);
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to reorder rules.");
    } finally {
      setReordering(false);
    }
  };

  const publish = async () => {
    const bookId = currentRuleBook?.id;
    if (!bookId) return;

    setPublishing(true);
    try {
      await mediclaimApi.publishRuleBook(bookId, user?.accessToken, user?.tokenType);
      toast.success("Rule book published");
      loadRuleBooks();
    } catch (err) {
      toast.error(err?.message || "Failed to publish this rule book.");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Manage the languages the Mediclaim rule book is available in, then build each language's rule book by adding rules one by one.
      </p>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* Languages — a standalone CRUD resource, radio-selected. */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between border-b border-gray-100 p-4 dark:border-gray-700">
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Languages</p>
            {canCreate && (
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setLangDrawerOpen(true)}>
                Add
              </Button>
            )}
          </div>

          {languagesLoading ? (
            <p className="py-8 text-center text-sm text-gray-400">Loading…</p>
          ) : languages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
              No languages yet.{canCreate ? " Click “Add” to add the first one." : ""}
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {languages.map((lang) => {
                const hasRuleBook = ruleBookByLanguageId.has(lang.id);
                const ruleBookStatus = String(ruleBookByLanguageId.get(lang.id)?.status || "").toLowerCase();
                return (
                  <li key={lang.id} className="flex items-center gap-3 px-4 py-3">
                    <input
                      type="radio"
                      name="rule-book-language"
                      className="h-4 w-4 border-gray-300 text-brand-600 focus:ring-brand-500 dark:border-gray-600"
                      checked={activeLanguageId === lang.id}
                      onChange={() => setSelectedLanguageId(lang.id)}
                    />
                    <button type="button" onClick={() => setSelectedLanguageId(lang.id)} className="min-w-0 flex-1 text-left">
                      <p className="truncate font-medium text-gray-900 dark:text-white">{languageNativeName(lang) || languageName(lang)}</p>
                      {languageNativeName(lang) && languageName(lang) && (
                        <p className="truncate text-xs text-gray-500 dark:text-gray-400">{languageName(lang)}</p>
                      )}
                    </button>
                    {hasRuleBook ? (
                      <Badge variant={ruleBookStatus === "published" ? "green" : ruleBookStatus === "archived" ? "gray" : "yellow"}>
                        {ruleBookStatus || "draft"}
                      </Badge>
                    ) : (
                      <Badge variant="gray">no rule book</Badge>
                    )}
                    <div className="flex items-center gap-2">
                      {canDelete && (
                        <button type="button" disabled={deletingLanguageId === lang.id} onClick={() => removeLanguage(lang)} className="text-gray-400 hover:text-red-600 disabled:opacity-50">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Rule book for whichever language is selected on the left. */}
        <div className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
          {!activeLanguage ? (
            <p className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">
              Add a language on the left to start building its rule book.
            </p>
          ) : (
            <div className="space-y-4 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-4 dark:border-gray-700">
                <div>
                  <p className="text-lg font-semibold text-gray-900 dark:text-white">{languageNativeName(activeLanguage) || languageName(activeLanguage)}</p>
                  {languageNativeName(activeLanguage) && languageName(activeLanguage) && (
                    <p className="text-xs text-gray-500 dark:text-gray-400">{languageName(activeLanguage)}</p>
                  )}
                </div>
                {currentRuleBook && (
                  <div className="flex items-center gap-3">
                    <Badge variant={status === "published" ? "green" : status === "archived" ? "gray" : "yellow"}>
                      {currentRuleBook.status || "draft"}
                    </Badge>
                    {canPublish && status === "draft" && (
                      <Button size="sm" variant="secondary" onClick={publish} disabled={publishing || items.length === 0}>
                        {publishing ? "Publishing…" : "Publish"}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              {!currentRuleBook ? (
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    No rule book yet for {languageNativeName(activeLanguage) || languageName(activeLanguage)}.
                  </p>
                  {canCreate && (
                    <Button size="sm" icon={<BookPlus size={14} />} onClick={addRuleBook} disabled={creatingRuleBook}>
                      {creatingRuleBook ? "Adding…" : "Add Rule Book"}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {items.length === 0 ? (
                    <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">No rules added yet.</p>
                  ) : (
                    <ol className="space-y-2">
                      {items.map((item, index) => (
                        <li key={item.id} className="flex items-start gap-2 rounded-lg border border-gray-100 p-2.5 dark:border-gray-700">
                          <span className="mt-1 w-5 shrink-0 text-right text-xs font-semibold text-gray-400">{index + 1}.</span>

                          {editingItemId === item.id ? (
                            <div className="flex flex-1 items-start gap-2">
                              <textarea
                                autoFocus
                                rows={2}
                                className={`${inputClass} flex-1`}
                                value={editingItemText}
                                onChange={(e) => setEditingItemText(e.target.value)}
                              />
                              <div className="flex flex-col gap-1">
                                <button type="button" onClick={submitEditItem} disabled={savingItemId === item.id || !editingItemText.trim()} className="text-emerald-600 hover:text-emerald-700 disabled:opacity-50 dark:text-emerald-400">
                                  <Check size={16} />
                                </button>
                                <button type="button" onClick={cancelEditItem} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                                  <X size={16} />
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="flex-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">{ruleText(item)}</p>
                              {canUpdate && (
                                <div className="flex shrink-0 items-center gap-1">
                                  <button type="button" disabled={reordering || index === 0} onClick={() => move(item, "up")} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 dark:hover:text-gray-200">
                                    <ArrowUp size={14} />
                                  </button>
                                  <button type="button" disabled={reordering || index === items.length - 1} onClick={() => move(item, "down")} className="text-gray-400 hover:text-gray-600 disabled:opacity-30 dark:hover:text-gray-200">
                                    <ArrowDown size={14} />
                                  </button>
                                  <button type="button" onClick={() => startEditItem(item)} className="text-brand-600 hover:text-brand-700 dark:text-brand-400">
                                    <Pencil size={14} />
                                  </button>
                                  <button type="button" disabled={deletingItemId === item.id} onClick={() => removeItem(item)} className="text-red-500 hover:text-red-600 disabled:opacity-50">
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              )}
                            </>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}

                  {canUpdate && (
                    <div className="flex items-start gap-2 border-t border-gray-100 pt-4 dark:border-gray-700">
                      <textarea
                        rows={2}
                        className={`${inputClass} flex-1`}
                        placeholder={`Add a rule in ${languageNativeName(activeLanguage) || languageName(activeLanguage)}…`}
                        value={newRuleText}
                        onChange={(e) => setNewRuleText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitAddRule(); }
                        }}
                      />
                      <Button size="sm" icon={<Plus size={14} />} onClick={submitAddRule} disabled={addingRule || !newRuleText.trim()}>
                        Add
                      </Button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Published View</p>
        <RuleBookViewer ruleBooks={ruleBooks} loading={ruleBooksLoading} error={ruleBooksLoading ? null : ruleBookResult.error} />
      </div>

      <Drawer
        isOpen={langDrawerOpen}
        onClose={() => setLangDrawerOpen(false)}
        title="Add a Language"
        subtitle="Tap a language to add it — its own name is filled in for you."
        size="md"
        footer={
          <div className="flex justify-end">
            <Button onClick={() => setLangDrawerOpen(false)}>Done</Button>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PREDEFINED_LANGUAGES.map((predefined) => {
            const already = alreadyAddedNames.has(predefined.name.toLowerCase());
            const isAdding = addingLanguageName === predefined.name;
            return (
              <button
                key={predefined.name}
                type="button"
                disabled={already || isAdding}
                onClick={() => addPredefinedLanguage(predefined)}
                className={`flex flex-col items-center gap-1 rounded-lg border p-3 text-center transition-colors disabled:cursor-not-allowed ${
                  already
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400"
                    : "border-gray-200 hover:border-brand-400 hover:bg-brand-50 dark:border-gray-600 dark:hover:border-brand-500 dark:hover:bg-gray-700"
                }`}
              >
                <span className="text-base font-semibold">{predefined.nativeName}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400">{predefined.name}</span>
                {already && (
                  <span className="mt-1 inline-flex items-center gap-1 text-xs font-semibold">
                    <Check size={12} /> Added
                  </span>
                )}
                {isAdding && <span className="mt-1 text-xs">Adding…</span>}
              </button>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
}
