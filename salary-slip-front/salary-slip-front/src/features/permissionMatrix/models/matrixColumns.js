/**
 * Which columns the Permission Matrix shows.
 *
 * Display preference only. Nothing here participates in authorization: hiding a
 * column changes what an administrator looks at, never what a user may reach.
 * The View column shows the governing page's permission, and that permission is
 * unaffected by whether it is currently on screen.
 */

export const COLUMN = {
  NAME: "name",
  CODE: "code",
  VIEW: "view",
  CONFIGURED: "configured",
  EFFECTIVE: "effective",
  TYPE: "type",
};

/**
 * `width` is the grid track. `locked` columns cannot be turned off — a row with
 * no name is not a row anyone can read.
 */
export const COLUMN_DEFS = [
  { key: COLUMN.NAME, label: "Name", width: "minmax(240px,1fr)", locked: true },
  { key: COLUMN.CODE, label: "Permission Code", width: "minmax(190px,1.1fr)" },
  { key: COLUMN.VIEW, label: "View", width: "130px" },
  { key: COLUMN.CONFIGURED, label: "Configured State", width: "150px" },
  { key: COLUMN.EFFECTIVE, label: "Effective Result", width: "140px" },
  { key: COLUMN.TYPE, label: "Type", width: "110px" },
];

/** View starts hidden: it is additional context, not part of the default read. */
export const DEFAULT_VISIBLE = {
  [COLUMN.NAME]: true,
  [COLUMN.CODE]: true,
  [COLUMN.VIEW]: false,
  [COLUMN.CONFIGURED]: true,
  [COLUMN.EFFECTIVE]: true,
  [COLUMN.TYPE]: true,
};

const STORAGE_KEY = "niss_permission_matrix_columns";

export function loadColumnPreference() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (!stored || typeof stored !== "object") return { ...DEFAULT_VISIBLE };

    // Merged over the defaults so a column added later appears rather than
    // being silently absent for everyone who has already saved a preference.
    return { ...DEFAULT_VISIBLE, ...stored, [COLUMN.NAME]: true };
  } catch {
    return { ...DEFAULT_VISIBLE };
  }
}

export function saveColumnPreference(visible) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
  } catch {
    // A browser refusing storage is not a reason to break the screen.
  }
}

/** The CSS grid template for the columns currently shown. */
export function gridTemplate(visible) {
  const tracks = COLUMN_DEFS
    .filter((column) => visible[column.key])
    .map((column) => column.width);

  // 32px checkbox at the start, 44px row menu at the end.
  return `32px ${tracks.join(" ")} 44px`;
}
