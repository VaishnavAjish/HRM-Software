import { baseUrl } from "../../../utils/url";

export function getEmployeePhotoUrl(photo) {
  if (!photo) return "";

  const photoValue = String(photo).trim();

  if (!photoValue) return "";

  if (/^(https?:)?\/\//i.test(photoValue) || photoValue.startsWith("data:")) {
    return photoValue;
  }

  return `${baseUrl}/storage/${photoValue.replace(/^\/+/, "")}`;
}

export function EmployeeAvatar({ employee, size = "md" }) {
  const photoUrl = getEmployeePhotoUrl(employee?.photo);
  const isSuperAdmin = employee?.loginRole === "superadmin";
  const sizeCls =
    size === "lg"
      ? "h-20 w-20 rounded-2xl text-2xl shadow-lg shadow-brand-500/20"
      : "h-9 w-9 rounded-full text-xs";
  const imageRadius = size === "lg" ? "rounded-2xl" : "rounded-full";

  return (
    <div
      className={`${sizeCls} relative flex flex-shrink-0 items-center justify-center overflow-hidden text-white font-bold ${
        isSuperAdmin ? "bg-purple-600" : "bg-brand-600"
      }`}
    >
      <span>{employee?.avatar || "E"}</span>

      {photoUrl && (
        <img
          src={photoUrl}
          alt={employee?.name ? `${employee.name} photo` : "Employee photo"}
          className={`absolute inset-0 h-full w-full object-cover ${imageRadius}`}
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

function validatePassword(pwd) {
  return {
    length: pwd.length >= 6,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd),
  };
}

export function isPasswordValid(pwd) {
  const v = validatePassword(pwd);
  return v.length && v.upper && v.lower && v.digit && v.special;
}

export function PasswordStrength({ password, isEdit }) {
  if (isEdit && !password) return null;

  const v = validatePassword(password);

  const rules = [
    { key: "length", label: "At least 6 characters" },
    { key: "upper", label: "One uppercase letter" },
    { key: "lower", label: "One lowercase letter" },
    { key: "digit", label: "One number" },
    { key: "special", label: "One special character" },
  ];

  const passed = rules.filter((r) => v[r.key]).length;

  const barColors = [
    "bg-red-400",
    "bg-red-400",
    "bg-orange-400",
    "bg-yellow-400",
    "bg-green-500",
  ];

  return (
    <div className="mt-2 space-y-2">
      <div className="flex gap-1">
        {rules.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-all duration-300 ${
              i < passed
                ? barColors[passed - 1]
                : "bg-gray-200 dark:bg-gray-600"
            }`}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1">
        {rules.map(({ key, label }) => (
          <span
            key={key}
            className={`flex items-center gap-1 text-[11px] transition-colors ${
              v[key]
                ? "text-green-600 dark:text-green-400"
                : "text-gray-400 dark:text-gray-500"
            }`}
          >
            <span
              className={`w-3 h-3 rounded-full flex-shrink-0 flex items-center justify-center text-[9px] font-bold ${
                v[key]
                  ? "bg-green-500 text-white"
                  : "bg-gray-200 dark:bg-gray-600 text-transparent"
              }`}
            >
              ✓
            </span>
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function DetailRow({ icon, label, value, color, mono }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-white p-3 shadow-sm transition-colors hover:border-brand-100 hover:bg-brand-50/40 dark:border-gray-700 dark:bg-gray-800/80 dark:hover:border-gray-600 dark:hover:bg-gray-700/60">
      <div
        className={`h-9 w-9 flex-shrink-0 rounded-xl border border-gray-100 bg-gray-50 flex items-center justify-center shadow-sm dark:border-gray-700 dark:bg-gray-900 ${color}`}
      >
        {icon}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
          {label}
        </p>

        <p
          className={`mt-0.5 text-sm font-semibold leading-snug text-gray-800 dark:text-gray-200 ${
            mono ? "font-mono" : ""
          }`}
          title={value || ""}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

export function formatDateInputValue(value) {
  if (!value) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    return value;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

export function formatDisplayDate(value) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
