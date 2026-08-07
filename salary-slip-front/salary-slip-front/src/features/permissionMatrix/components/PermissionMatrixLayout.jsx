/**
 * Workspace shell.
 *
 * The main column and the intelligence column scroll independently on wide
 * screens so the details, summary and inheritance cards stay in view while an
 * administrator moves down a tree of several hundred rows.
 */
export default function PermissionMatrixLayout({ header, banner, roleCard, main, side, footer }) {
  return (
    <div className="space-y-5">
      {header}
      {banner}
      {roleCard}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">{main}</div>
        <aside className="space-y-4 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
          {side}
        </aside>
      </div>

      {footer}
    </div>
  );
}
