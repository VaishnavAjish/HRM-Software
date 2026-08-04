import { useEffect, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { authorizationAdminApi } from "../../utils/api";

const inputClass =
  "w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:border-brand-500 focus:ring-1 focus:ring-brand-500";

const MIN_TERM = 2;

export default function UserPicker({ value, onChange, token, tokenType, label = "User", required = false }) {
  const [term, setTerm] = useState("");
  const [results, setResults] = useState([]);
  const [chosen, setChosen] = useState(null);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const boxRef = useRef(null);

  const ready = term.trim().length >= MIN_TERM;
  const selected = value && chosen && chosen.id === value ? chosen : null;

  useEffect(() => {
    if (!token || !ready) return undefined;

    let active = true;
    const timer = setTimeout(() => {
      setSearching(true);
      authorizationAdminApi
        .lookupUsers(term.trim(), token, tokenType)
        .then((res) => { if (active) { setResults(res?.data ?? []); setOpen(true); } })
        .catch(() => { if (active) setResults([]); })
        .finally(() => { if (active) setSearching(false); });
    }, 250);

    return () => { active = false; clearTimeout(timer); };
  }, [term, ready, token, tokenType]);

  useEffect(() => {
    const close = (event) => {
      if (boxRef.current && !boxRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (user) => {
    setChosen(user);
    setTerm("");
    setResults([]);
    setOpen(false);
    onChange(user.id);
  };

  const clear = () => {
    setChosen(null);
    setResults([]);
    onChange("");
  };

  return (
    <div ref={boxRef} className="relative block">
      <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">{label}</span>

      {selected ? (
        <div className="flex items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700">
          <span className="truncate text-gray-900 dark:text-white">{selected.label}</span>
          <button
            type="button"
            onClick={clear}
            aria-label={`Clear ${label}`}
            className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-red-600 dark:hover:bg-gray-600"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            required={required && !value}
            className={`${inputClass} pl-8`}
            placeholder="Search by name, employee code or email"
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            onFocus={() => results.length && setOpen(true)}
          />
        </div>
      )}

      {open && !selected && (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
          {searching && <li className="px-3 py-2 text-xs text-gray-500">Searching…</li>}
          {!searching && results.length === 0 && (
            <li className="px-3 py-2 text-xs text-gray-500">No matching users.</li>
          )}
          {results.map((user) => (
            <li key={user.id}>
              <button
                type="button"
                onClick={() => pick(user)}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                {user.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
