import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { useAuth } from "../../../context/AuthContext";
import permissionMatrixApi from "../services/permissionMatrixApi";
import { collectKeys, findNode } from "../utils/tree";
import { STATE } from "../models/permissionStates";
import { loadColumnPreference, saveColumnPreference } from "../models/matrixColumns";

const AUTO_EXPAND_DEPTH = 2;

function expandableTo(nodes, depth, level = 0, out = []) {
  nodes.forEach((node) => {
    if (level < depth && (node.children ?? []).length > 0) {
      out.push(node.key);
      expandableTo(node.children, depth, level + 1, out);
    }
  });
  return out;
}

export default function usePermissionMatrix() {
  const { user } = useAuth();
  const token = user?.accessToken;
  const tokenType = user?.tokenType || "Bearer";

  const [roles, setRoles] = useState([]);
  const [roleId, setRoleId] = useState(null);
  const [matrix, setMatrix] = useState(null);
  const [audit, setAudit] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(new Map());
  const [expanded, setExpanded] = useState(new Set());
  const [selectedKey, setSelectedKey] = useState(null);

  /*
   * Column visibility is a display preference, deliberately held apart from
   * `draft`. It never enters a save payload, never marks the matrix dirty and
   * never reaches the permission engine — hiding a column changes what this
   * administrator reads, not what any user may do.
   */
  const [visibleColumns, setVisibleColumns] = useState(loadColumnPreference);

  const toggleColumn = useCallback((key) => {
    setVisibleColumns((current) => {
      const next = { ...current, [key]: !current[key] };
      saveColumnPreference(next);
      return next;
    });
  }, []);

  const requestId = useRef(0);

  const dirty = draft.size > 0;

  useEffect(() => {
    if (!token) return;

    permissionMatrixApi
      .listRoles(token, tokenType)
      .then((response) => {
        const list = response?.data ?? [];
        setRoles(list);
        setRoleId((current) => current ?? list[0]?.id ?? null);
        if (list.length === 0) setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setError(err.message || "Could not load roles");
      });
  }, [token, tokenType]);

  const [reloadToken, setReloadToken] = useState(0);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    setReloadToken((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!token || !roleId) return undefined;

    // A slow response for a role the administrator has already navigated away
    // from must not overwrite the newer one.
    const ticket = ++requestId.current;

    permissionMatrixApi
      .getMatrix(roleId, token, tokenType)
      .then((response) => {
        if (ticket !== requestId.current) return;
        const data = response?.data;
        setMatrix(data);
        setError(null);
        setDraft(new Map());
        setSelectedKey(null);
        setExpanded(new Set(expandableTo(data?.tree ?? [], AUTO_EXPAND_DEPTH)));
      })
      .catch((err) => {
        if (ticket !== requestId.current) return;
        setError(err.message || "Could not load the permission matrix");
      })
      .finally(() => {
        if (ticket === requestId.current) setLoading(false);
      });

    return () => { requestId.current += 1; };
  }, [roleId, token, tokenType, reloadToken]);

  const loadAudit = useCallback(() => {
    if (!token) return;
    permissionMatrixApi
      .getAudit(token, tokenType, 8)
      .then((response) => setAudit(response?.data ?? []))
      .catch(() => setAudit([]));
  }, [token, tokenType]);

  useEffect(() => { loadAudit(); }, [loadAudit]);

  // Leaving with unsaved permission edits loses them silently otherwise.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const configuredOf = useCallback(
    (node) => draft.get(node.key) ?? node.configuredState,
    [draft],
  );

  const setStates = useCallback((nodes, state) => {
    setDraft((previous) => {
      const next = new Map(previous);

      nodes.forEach((node) => {
        if (!node.assignable) return;
        // Returning a row to the state it was loaded with is not a change.
        if (state === node.configuredState) next.delete(node.key);
        else next.set(node.key, state);
      });

      return next;
    });
  }, []);

  const discard = useCallback(() => setDraft(new Map()), []);

  const save = useCallback(async (businessReason) => {
    if (!dirty || !matrix) return;

    setSaving(true);

    try {
      const changes = Array.from(draft, ([permissionCode, state]) => ({ permissionCode, state }));

      const response = await permissionMatrixApi.saveMatrix(
        roleId,
        { changes, businessReason: businessReason || null, roleVersion: matrix.role.version },
        token,
        tokenType,
      );

      setMatrix(response?.data?.matrix ?? matrix);
      setDraft(new Map());

      const projected = response?.data?.projected ?? 0;
      const revoked = response?.data?.revoked ?? 0;

      toast.success(
        `Saved ${response?.data?.applied ?? changes.length} change(s)` +
        (projected || revoked ? ` · ${projected} granted, ${revoked} revoked downstream` : ""),
      );

      loadAudit();
    } catch (err) {
      if (String(err.message).includes("changed since you loaded")) {
        toast.error("This role changed since you loaded it. Reload before saving.");
      } else {
        toast.error(err.message || "Could not save the changes");
      }
    } finally {
      setSaving(false);
    }
  }, [dirty, draft, matrix, roleId, token, tokenType, loadAudit]);

  const selectRole = useCallback((nextId) => {
    if (dirty && !window.confirm("Discard unsaved permission changes?")) return;
    setLoading(true);
    setRoleId(nextId);
  }, [dirty]);

  const toggleExpand = useCallback((key) => {
    setExpanded((previous) => {
      const next = new Set(previous);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    setExpanded(new Set(collectKeys(matrix?.tree ?? [])));
  }, [matrix]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

  const selectedNode = useMemo(
    () => (selectedKey && matrix ? findNode(matrix.tree, selectedKey) : null),
    [selectedKey, matrix],
  );

  const status = dirty ? "Draft" : (matrix?.role?.status ?? "—");

  return {
    token, tokenType,
    roles, roleId, selectRole,
    matrix, audit, loading, saving, error, reload,
    draft, dirty, status, configuredOf, setStates, discard, save,
    expanded, toggleExpand, expandAll, collapseAll,
    visibleColumns, toggleColumn,
    selectedKey, setSelectedKey, selectedNode,
    editable: matrix?.editable ?? false,
    STATE,
  };
}
