/**
 * Storage constants — kept node-free so client components (e.g. the
 * RFP dropzone) can import without pulling `node:crypto`/`node:fs`
 * into the browser bundle.
 */

/**
 * Sentinel `ownerId` for `rfp` attachments uploaded before the RFP
 * row exists. The dropzone uploads on file-select; the RFP id is only
 * minted at form submit. `createRfpAction` patches matching rows to
 * the real `P-YYMM-NNNN` id, scoped by `uploadedBy` + `ownerKind`.
 *
 * Drift between the dropzone, upload route, and action would silently
 * break the link-up query — every site uses this constant.
 */
export const DRAFT_OWNER_ID = '__draft__';

/** Maximum number of files per chat/compose upload. */
export const MAX_FILES = 5;
/** Maximum size per uploaded file (20 MB in bytes). */
export const MAX_BYTES = 20 * 1024 * 1024;
/** Accept string for <input type="file"> elements. */
export const ACCEPT_EXT = '.pdf,.png,.jpg,.jpeg';
/** Set of accepted MIME types — mirrors ACCEPT_EXT. */
export const ACCEPTED_MIMES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
