/**
 * Canonical document-type slugs, matching the backend.
 *
 * The profile photo is stored as an ordinary document of type PHOTOGRAPH — the
 * value the backend defines in DocumentType::CATEGORIES, maps `photo` onto in
 * LEGACY_FIELD_MAP, and allowlists MIME types for in config/documents.php.
 * There is no PROFILE_PHOTO type on the server; keep this the single source of
 * truth so the modal, the documents step and the tests cannot drift apart.
 */
export const PHOTO_DOCUMENT_TYPE = "PHOTOGRAPH";
