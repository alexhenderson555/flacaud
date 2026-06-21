import { apiGetJson } from './apiClient';

const cache = new Map();

/** Resolve Tidal artist id by display name (cached per session). */
export async function resolveArtistId(name, lang = 'en') {
  const trimmed = String(name || '').trim();
  if (!trimmed) return null;
  const key = `${lang}:${trimmed.toLowerCase()}`;
  if (cache.has(key)) return cache.get(key);

  const params = new URLSearchParams({ name: trimmed });
  const data = await apiGetJson(`/api/artist/resolve?${params}`, { lang });
  const id = data?.artist_id ? String(data.artist_id) : null;
  if (id) cache.set(key, id);
  return id;
}
