import { Info } from "lucide-react";

const inputClass =
  "w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-brand-500 focus:ring-1 focus:ring-brand-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white";

const readOnlyClass =
  "rounded-lg border border-transparent bg-gray-50 px-3 py-2 text-sm font-medium text-gray-900 dark:bg-gray-700/50 dark:text-gray-100";

function Field({ label, children }) {
  return (
    <div className="min-w-0">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </span>
      {children}
    </div>
  );
}

export default function RoleHeaderCard({ roles, roleId, onSelectRole, role, status, dirty }) {
  return (
    <section className="grid gap-5 rounded-xl border border-gray-200 bg-white p-5 shadow-sm sm:grid-cols-2 lg:grid-cols-5 dark:border-gray-700 dark:bg-gray-800">
      <Field label="Role">
        <label className="sr-only" htmlFor="permission-matrix-role">Role</label>
        <select
          id="permission-matrix-role"
          className={inputClass}
          value={roleId ?? ""}
          onChange={(event) => onSelectRole(Number(event.target.value))}
        >
          {roles.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.code ? `${entry.code.toUpperCase()} (${entry.name})` : entry.name}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Role Type">
        <p className={readOnlyClass}>{role?.roleType ?? "—"}</p>
      </Field>

      <Field label="Inherits From">
        <p className={`${readOnlyClass} flex items-center gap-1.5`}>
          {role?.parentRoleIds?.length
            ? `${role.parentRoleIds.length} parent role(s)`
            : "No parent roles"}
          <Info size={13} className="text-gray-400" aria-hidden="true" />
        </p>
      </Field>

      <Field label="Assigned Users">
        <p className={readOnlyClass}>{role?.assignedUserCount ?? 0}</p>
      </Field>

      <Field label="Status">
        <div className="px-1">
          <span
            className={`inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ${
              dirty
                ? "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                : "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"
            }`}
          >
            {status}
          </span>
          <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
            {dirty ? "Changes not yet effective" : "Saved and effective"}
          </p>
        </div>
      </Field>
    </section>
  );
}
