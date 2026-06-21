/** Cross-tree optimistic library updates (player ↔ library page). */
export const LIBRARY_PATCH_EVENT = 'tidal-library-patch';
export const LIBRARY_TRANSFER_DONE = 'tidal-library-transfer-done';
export const LIBRARY_RELOAD_REQUEST = 'tidal-library-reload-request';

export function dispatchLibraryPatch(detail) {
  window.dispatchEvent(new CustomEvent(LIBRARY_PATCH_EVENT, { detail }));
}

export function dispatchLibraryTransferDone() {
  window.dispatchEvent(new CustomEvent(LIBRARY_TRANSFER_DONE));
}

export function dispatchLibraryReloadRequest() {
  window.dispatchEvent(new CustomEvent(LIBRARY_RELOAD_REQUEST));
}
