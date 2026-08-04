export default function DataTable({ columns = [], rows = [], rowKey = (_, i) => i, empty }) {
  if (!rows.length && empty) return empty;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                className={`border-b border-gray-200 bg-gray-50 px-3.5 py-2.5 text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400 dark:border-gray-800 dark:bg-gray-800/50 ${c.hideBelow === "sm" ? "hidden sm:table-cell" : ""} ${c.hideBelow === "md" ? "hidden md:table-cell" : ""} ${c.className || ""}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              className="border-b border-gray-200 transition-colors last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/40"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={`px-3.5 py-2.5 align-middle ${c.hideBelow === "sm" ? "hidden sm:table-cell" : ""} ${c.hideBelow === "md" ? "hidden md:table-cell" : ""} ${c.className || ""}`}
                >
                  {c.render ? c.render(row) : row[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
