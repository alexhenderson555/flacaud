/** Cross-tree optimistic library updates (player ↔ library page). */
export const LIBRARY_PATCH_EVENT = 'tidal-library-patch';
export const LIBRARY_TRANSFER_DONE = 'tidal-library-transfer-done';

export function dispatchLibraryPatch(detail) {
  window.dispatchEvent(new CustomEvent(LIBRARY_PATCH_EVENT, { detail }));
}

export function dispatchLibraryTransferDone() {
  window.dispatchEvent(new CustomEvent(LIBRARY_TRANSFER_DONE));
}
