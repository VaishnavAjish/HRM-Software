import { avatarColor, initials, toneForPercent } from "./format";

export function Avatar({ name = "", size = 30 }) {
  return (
    <div
      className="grid place-items-center rounded-full font-bold text-white shrink-0 tracking-tight"
      style={{
        background: avatarColor(name),
        width: size,
        height: size,
        fontSize: Math.max(9, size * 0.37),
      }}
      aria-hidden="true"
    >
      {initials(name)}
    </div>
  );
}

export function Person({ name, meta, size = 30 }) {
  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <Avatar name={name} size={size} />
      <div className="min-w-0">
        <b className="block truncate text-[13px] font-semibold text-gray-900 dark:text-gray-100">
          {name}
        </b>
        {meta ? (
          <small className="block truncate font-mono text-[11.5px] text-gray-400 dark:text-gray-500">
            {meta}
          </small>
        ) : null}
      </div>
    </div>
  );
}

const TONES = {
  ok: "text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900",
  warn: "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900",
  bad: "text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-400 dark:bg-rose-950/40 dark:border-rose-900",
  info: "text-sky-700 bg-sky-50 border-sky-200 dark:text-sky-400 dark:bg-sky-950/40 dark:border-sky-900",
  mut: "text-gray-600 bg-gray-100 border-gray-200 dark:text-gray-300 dark:bg-gray-800 dark:border-gray-700",
};

export function StatusPill({ tone = "mut", children }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 h-[21px] px-2 rounded-full border text-[11px] font-semibold whitespace-nowrap ${TONES[tone] || TONES.mut}`}
    >
      <i className="w-[5px] h-[5px] rounded-full bg-current shrink-0" />
      {children}
    </span>
  );
}

const BAR_TONES = {
  brand: "bg-brand-500",
  ok: "bg-emerald-600 dark:bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-600 dark:bg-rose-500",
};

export function ProgressBar({ value = 0, tone, showLabel = true }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)));
  const cls = BAR_TONES[tone || toneForPercent(pct)] || BAR_TONES.brand;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-[5px] flex-1 min-w-[56px] rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div className={`h-full rounded-full ${cls}`} style={{ width: `${pct}%` }} />
      </div>
      {showLabel ? (
        <span className="w-8 text-right text-[11.5px] font-semibold tabular-nums text-gray-500 dark:text-gray-400">
          {pct}%
        </span>
      ) : null}
    </div>
  );
}

export function Sparkline({ values = [], width = 104, height = 30, color = "rgb(99 102 241)" }) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * width,
    height - ((v - min) / range) * (height - 6) - 3,
  ]);
  const line = points.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L ${width} ${height} L 0 ${height} Z`;
  const [lx, ly] = points[points.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="block">
      <path d={area} fill={color} opacity="0.11" />
      <path d={line} fill="none" stroke={color} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lx.toFixed(1)} cy={ly.toFixed(1)} r="2.6" fill={color} />
    </svg>
  );
}

export function BarList({ items = [] }) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2.5">
          <span className="w-[106px] shrink-0 truncate text-xs text-gray-500 dark:text-gray-400">
            {item.label}
          </span>
          <div className="h-[5px] flex-1 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            <div
              className={`h-full rounded-full ${BAR_TONES[item.tone] || BAR_TONES.brand}`}
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
          <span className="w-6 text-right text-xs font-semibold tabular-nums">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

const KPI_STRIPE = {
  brand: "bg-brand-500",
  ok: "bg-emerald-600",
  warn: "bg-amber-500",
  bad: "bg-rose-600",
};

export function KpiTile({ label, value, unit, tone = "brand", trend, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={`relative w-full overflow-hidden rounded-[10px] border border-gray-200 bg-white px-3 py-2.5 text-left shadow-sm dark:border-gray-800 dark:bg-gray-900 ${
        onClick ? "transition hover:border-gray-300 dark:hover:border-gray-700" : ""
      }`}
    >
      <span className={`absolute inset-y-0 left-0 w-[3px] ${KPI_STRIPE[tone] || KPI_STRIPE.brand}`} />
      <span className="mb-1.5 block truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">
        {label}
      </span>
      <div className="flex items-baseline gap-1.5 text-[22px] font-bold leading-none tracking-tight tabular-nums">
        {value}
        {unit ? <small className="text-[11.5px] font-semibold text-gray-400">{unit}</small> : null}
      </div>
      {trend ? (
        <span
          className={`mt-1 inline-flex items-center gap-0.5 text-[11px] font-semibold ${
            trend.dir === "up"
              ? "text-emerald-600 dark:text-emerald-400"
              : trend.dir === "down"
                ? "text-rose-600 dark:text-rose-400"
                : "text-gray-400"
          }`}
        >
          {trend.dir === "up" ? "▲" : trend.dir === "down" ? "▼" : "—"} {trend.label}
        </span>
      ) : null}
    </Tag>
  );
}

export function SectionCard({ title, action, children, className = "" }) {
  return (
    <section
      className={`rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 ${className}`}
    >
      {title ? (
        <header className="flex items-center gap-2.5 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
          <h3 className="text-[13.5px] font-semibold">{title}</h3>
          {action ? <div className="ml-auto">{action}</div> : null}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Eyebrow({ children }) {
  return (
    <span className="text-[10.5px] font-bold uppercase tracking-[0.09em] text-gray-400 dark:text-gray-500">
      {children}
    </span>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="px-5 py-9 text-center">
      {Icon ? (
        <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-gray-100 text-gray-400 dark:bg-gray-800">
          <Icon size={20} strokeWidth={1.6} />
        </div>
      ) : null}
      <b className="mb-1 block text-sm">{title}</b>
      {description ? (
        <p className="mx-auto mb-3.5 max-w-[330px] text-[12.5px] text-gray-500 dark:text-gray-400">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}

export function FilterChips({ options = [], value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((opt) => {
        const key = opt.value ?? opt.label;
        const active = key === value;
        return (
          <button
            key={key}
            type="button"
            aria-pressed={active}
            onClick={() => onChange?.(key)}
            className={`h-[26px] rounded-full border px-2.5 text-xs font-medium transition ${
              active
                ? "border-brand-400 bg-brand-500/10 font-semibold text-brand-700 dark:text-brand-300"
                : "border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:text-gray-800 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
          >
            {opt.label}
            {opt.count != null ? (
              <span className="ml-1 tabular-nums opacity-70">{opt.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
