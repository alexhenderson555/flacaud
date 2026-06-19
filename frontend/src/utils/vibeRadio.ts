import { normalizeTrack } from './trackNormalize';

export const VIBE_RADIO_ORIGIN = 'vibe-radio';

export type VibeTrack = ReturnType<typeof normalizeTrack> & {
  __queue_origin?: string;
};

export function tagVibeRadioTracks(tracks: VibeTrack[]): VibeTrack[] {
  return (tracks || []).map((tr) => ({
    ...tr,
    __queue_origin: VIBE_RADIO_ORIGIN,
  }));
}

export function mergeVibeRadioTracks(existing: VibeTrack[], incoming: unknown[]): VibeTrack[] {
  const seen = new Set((existing || []).map((tr) => String(tr.provider_id)));
  const fresh = (incoming || [])
    .map((tr) => normalizeTrack(tr))
    .filter(Boolean)
    .filter((tr) => !seen.has(String(tr.provider_id))) as VibeTrack[];
  if (!fresh.length) return existing || [];
  return [...(existing || []), ...tagVibeRadioTracks(fresh)];
}

export async function fetchVibeRadioBatch({
  apiGetJson,
  lang,
  excludeIds = [],
  limit = 15,
  genre,
}: {
  apiGetJson: (path: string, opts: { auth: boolean; lang: string }) => Promise<{ tracks?: unknown[] }>;
  lang: string;
  excludeIds?: string[];
  limit?: number;
  genre?: string | null;
}) {
  const qs = new URLSearchParams({
    limit: String(limit),
    refresh: '1',
  });
  if (excludeIds.length) {
    qs.set('exclude', excludeIds.join(','));
  }
  if (genre) {
    qs.set('genre', genre);
  }
  const data = await apiGetJson(`/api/recommendations?${qs}`, { auth: true, lang });
  return (data.tracks || [])
    .map((tr) => normalizeTrack(tr))
    .filter(Boolean) as VibeTrack[];
}
