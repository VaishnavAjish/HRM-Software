import { useEffect } from "react";
import { createPortal } from "react-dom";

const menuItemClass =
  "block w-full px-4 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700";

function getAllColumnIds(api) {
  return (api?.getColumns?.() || [])
    .map((column) => column.getColId?.())
    .filter(Boolean);
}

export default function GridHeaderContextMenu({
  menu,
  frozen,
  onClose,
  onToggleFrozen,
}) {
  useEffect(() => {
    if (!menu) return undefined;

    const close = () => onClose();
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const api = menu.api;
  const columnName = menu.headerName || "Column";

  const runAction = (action) => {
    action();
    onClose();
  };

  const clearFlex = (colIds) => {
    if (!api || !colIds?.length) return;
    api.applyColumnState?.({
      state: colIds.map((colId) => ({ colId, flex: null })),
    });
  };

  const autoSizeColumn = () => {
    if (!api || !menu.colId) return;
    clearFlex([menu.colId]);
    api.autoSizeColumns?.([menu.colId]);
  };

  const fitColumnsToGrid = () => {
    api?.sizeColumnsToFit?.();
  };

  const autoSizeAllColumns = () => {
    if (!api) return;
    const colIds = getAllColumnIds(api);
    if (!colIds.length) return;
    clearFlex(colIds);
    api.autoSizeColumns?.(colIds);
  };

  const pinColumn = (pinned) => {
    if (!api || !menu.colId) return;
    api.applyColumnState?.({
      state: [{ colId: menu.colId, pinned }],
    });
  };

  const unpinAllColumns = () => {
    if (!api) return;
    const state = getAllColumnIds(api).map((colId) => ({
      colId,
      pinned: null,
    }));
    if (state.length) api.applyColumnState?.({ state });
  };

  return createPortal(
    <div
      className="fixed z-[9999] w-72 overflow-hidden rounded-md border border-gray-200 bg-white py-2 shadow-xl dark:border-gray-700 dark:bg-gray-800"
      style={{ left: menu.x, top: menu.y }}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <div className="border-b border-gray-100 px-4 pb-2 pt-1 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
        {columnName}
      </div>

      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(autoSizeColumn)}
      >
        Autosize "{columnName}"
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(fitColumnsToGrid)}
      >
        Fit all columns to grid
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(autoSizeAllColumns)}
      >
        Autosize All
      </button>

      <div className="my-2 border-t border-gray-100 dark:border-gray-700" />

      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(() => pinColumn("left"))}
      >
        Pin Left
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(() => pinColumn("right"))}
      >
        Pin Right
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(() => pinColumn(null))}
      >
        Unpin
      </button>
      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(unpinAllColumns)}
      >
        Unpin All
      </button>

      <div className="my-2 border-t border-gray-100 dark:border-gray-700" />

      <button
        type="button"
        className={menuItemClass}
        onClick={() => runAction(onToggleFrozen)}
      >
        {frozen ? "Unfreeze Header" : "Freeze Header"}
      </button>
    </div>,
    document.body,
  );
}
