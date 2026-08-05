export const TYPE_LABEL = {
  module: "Module",
  page: "Page",
  feature: "Feature",
  action: "Action",
  column: "Column",
  card: "Card",
  filter: "Filter",
};

export function stateOf(node, pending) {
  if (!node.permissionKey) return "NOT_APPLICABLE";
  const override = pending.get(node.permissionKey);
  if (override !== undefined) return override;
  return node.state === "enabled" ? "ALLOW" : "NOT_ASSIGNED";
}

export function collectAssignable(node, out = []) {
  (node.children ?? []).forEach((child) => {
    if (child.permissionKey) out.push(child);
    collectAssignable(child, out);
  });
  return out;
}

/** Same rules as PermissionTreeBuilder::aggregateOf, applied to unsaved edits. */
export function aggregateOf(node, pending) {
  const descendants = collectAssignable(node);

  if (descendants.length === 0) {
    if (!node.permissionKey) return "not_applicable";
    return stateOf(node, pending) === "ALLOW" ? "checked" : "unchecked";
  }

  const on = descendants.filter((d) => stateOf(d, pending) === "ALLOW").length;
  if (on === 0) return "unchecked";
  return on === descendants.length ? "checked" : "indeterminate";
}

function matches(node, term) {
  if (!term) return true;
  const haystack = [
    node.label,
    node.permissionKey ?? "",
    node.key,
    node.route ?? "",
    TYPE_LABEL[node.type] ?? node.type,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(term);
}

/** Keeps a matching descendant's full ancestor path visible. */
export function filterTree(nodes, term) {
  if (!term) return nodes;
  const out = [];
  nodes.forEach((node) => {
    const children = filterTree(node.children ?? [], term);
    if (matches(node, term) || children.length > 0) {
      out.push({ ...node, children: matches(node, term) ? (node.children ?? []) : children });
    }
  });
  return out;
}

export function collectKeys(nodes, out = []) {
  nodes.forEach((node) => {
    out.push(node.key);
    collectKeys(node.children ?? [], out);
  });
  return out;
}
