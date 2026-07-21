/** Set Browser API — search sets, fetch a quick description-based tracklist, and
 * "similar sets" (radio-by-set). */

import { apiGetJson } from './apiClient';

export async function searchSets(query, { lang, limit = 12 } = {}) {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const data = await apiGetJson(`/api/sets/search?${params.toString()}`, { auth: true, lang });
  return data?.results || [];
}

export async function fetchQuickTracklist(url, { lang } = {}) {
  const params = new URLSearchParams({ url });
  return apiGetJson(`/api/sets/quick-tracklist?${params.toString()}`, { auth: true, lang });
}

export async function fetchSimilarSets(url, { lang, limit = 10 } = {}) {
  const params = new URLSearchParams({ url, limit: String(limit) });
  const data = await apiGetJson(`/api/sets/radio?${params.toString()}`, { auth: true, lang });
  return data?.results || [];
}
