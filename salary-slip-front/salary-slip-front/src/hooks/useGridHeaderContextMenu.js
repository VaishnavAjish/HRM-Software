import { useCallback, useEffect, useState } from "react";

function clampMenuPosition(x, y) {
  const menuWidth = 288;
  const menuHeight = 384;
  const padding = 8;

  return {
    x: Math.min(x, window.innerWidth - menuWidth - padding),
    y: Math.min(y, window.innerHeight - menuHeight - padding),
  };
}

function getColumnName(api, colId) {
  const colDef =
    api?.getColumnDef?.(colId) || api?.getColumn?.(colId)?.getColDef?.();

  return colDef?.headerName || colDef?.field || colId;
}

function findHeaderCell(target) {
  if (!(target instanceof Element)) return null;

  return target.closest(".ag-header-cell[col-id]");
}

export default function useGridHeaderContextMenu(gridRef, containerRef) {
  const [headerMenu, setHeaderMenu] = useState(null);
  const [headerFrozen, setHeaderFrozen] = useState(false);

  const closeHeaderMenu = useCallback(() => {
    setHeaderMenu(null);
  }, []);

  const toggleHeaderFrozen = useCallback(() => {
    setHeaderFrozen((current) => !current);
  }, []);

  useEffect(() => {
    const openHeaderMenu = (event) => {
      const container = containerRef.current;
      if (!container) return;

      const headerCell = findHeaderCell(event.target);
      if (!headerCell || !container.contains(headerCell)) return;

      event.preventDefault();
      event.stopPropagation();

      const api = gridRef.current?.api;
      const colId = headerCell.getAttribute("col-id");
      const position = clampMenuPosition(event.clientX, event.clientY);

      setHeaderMenu({
        ...position,
        api,
        colId,
        headerName: getColumnName(api, colId),
      });
    };

    document.addEventListener("contextmenu", openHeaderMenu, true);

    return () => {
      document.removeEventListener("contextmenu", openHeaderMenu, true);
    };
  }, [containerRef, gridRef]);

  return {
    headerMenu,
    headerFrozen,
    closeHeaderMenu,
    toggleHeaderFrozen,
  };
}
