import { hasAuthSession } from './hasAuthSession';
import { apiGetJson, apiPostJson } from './apiClient';

const PENDING_SHARE_KEY = 'tidal-pending-share-token';

export function storePendingShareToken(token) {
  if (token) sessionStorage.setItem(PENDING_SHARE_KEY, token);
}

export function peekPendingShareToken() {
  return sessionStorage.getItem(PENDING_SHARE_KEY) || '';
}

export function clearPendingShareToken() {
  sessionStorage.removeItem(PENDING_SHARE_KEY);
}

export async function fetchSharePreview(token, lang = 'en') {
  return apiGetJson(`/api/share/${encodeURIComponent(token)}`, { lang });
}

export async function claimShareToken(token, lang = 'en') {
  return apiPostJson(
    `/api/share/${encodeURIComponent(token)}/claim`,
    {},
    { auth: true, lang },
  );
}

export async function createPlaylistShareLink(playlistId, lang = 'en') {
  return apiPostJson(`/api/playlists/${playlistId}/share`, {}, { auth: true, lang });
}

export async function createSetShareLink(setId, lang = 'en') {
  return apiPostJson(`/api/sets/${setId}/share`, {}, { auth: true, lang });
}

export function shareUrlFromToken(token) {
  const path = `/s/${token}`;
  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** After login, import shared playlist/set if user opened a share link. */
export async function claimPendingShareAfterLogin(lang = 'en') {
  const token = peekPendingShareToken();
  if (!token || !hasAuthSession()) return null;
  try {
    const result = await claimShareToken(token, lang);
    clearPendingShareToken();
    return result;
  } catch {
    return null;
  }
}
