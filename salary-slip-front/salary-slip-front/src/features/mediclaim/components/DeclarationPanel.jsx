import { DECLARATION_TEXT, DECLARATION_LANGUAGE_ORDER, DECLARATION_VERSION } from "../models/declarationText";

/**
 * Section G — renders all three languages stacked (not tabbed): the
 * requirement is that the employee sees and acknowledges all three, not
 * that they pick one and skip the other two. A single acknowledgement
 * checkbox gates Submit; `DECLARATION_VERSION` is recorded against the
 * claim by the caller (`NewClaimRequestModal`) the moment `accepted` flips
 * true, so a later wording change never silently reinterprets an
 * already-recorded consent.
 */
export default function DeclarationPanel({ accepted, onAcceptedChange, readOnly = false }) {
  return (
    <div className="space-y-4">
      {DECLARATION_LANGUAGE_ORDER.map((lang) => {
        const entry = DECLARATION_TEXT[lang];
        if (!entry) return null;
        return (
          <div key={lang} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{entry.language}</p>
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-gray-700 dark:text-gray-200">
              {entry.statements.map((statement, index) => (
                <li key={index}>{statement}</li>
              ))}
            </ul>
          </div>
        );
      })}

      <label className="flex items-start gap-2.5 rounded-lg border border-gray-200 bg-gray-50 p-3 text-sm dark:border-gray-700 dark:bg-gray-900/40">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={Boolean(accepted)}
          onChange={(e) => onAcceptedChange?.(e.target.checked)}
          disabled={readOnly}
        />
        <span className="text-gray-700 dark:text-gray-200">
          I have read and understood the declaration above in all three languages, and I confirm the
          information given in this claim is true and correct to the best of my knowledge.
        </span>
      </label>
      <p className="text-[11px] text-gray-400 dark:text-gray-500">Declaration version {DECLARATION_VERSION}</p>
    </div>
  );
}
