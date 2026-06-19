import { useEffect, useRef } from 'react';
import { apiGetJson, apiPatchJson } from '../utils/apiClient';
import { isTidalCoverUrl } from '../utils/coverUrl';

const ENRICH_CONCURRENCY = 5;

/**
 * Fills missing artist_ids / album_id / release_date / cover on library rows via /api/track.
 */
export function useEnrichLibraryArtists(library, setLibrary) {
  const enrichedRef = useRef(new Set());

  useEffect(() => {
    if (!library?.length || !setLibrary) return undefined;

    const missing = library.filter(
      (t) =>
        t.provider_id
        && (
          !t.artist_ids?.length
          || !t.album_id
          || !t.release_date
          || !t.cover_url
          || !isTidalCoverUrl(t.cover_url)
        ),
    );
    if (!missing.length) return undefined;

    let cancelled = false;

    const enrichOne = async (track) => {
      const pid = String(track.provider_id);
      if (enrichedRef.current.has(pid)) return;
      enrichedRef.current.add(pid);

      try {
        const data = await apiGetJson(`/api/track/${track.provider || 'tidal'}/${pid}`, { auth: true });
        if (cancelled) return;

        const artistIds = data.artist_ids || [];
        const albumId = data.album_id || null;
        const releaseDate = data.release_date || null;
        const coverUrl = data.cover_url || null;
        if (!artistIds.length && !albumId && !releaseDate && !coverUrl) return;

        setLibrary((prev) =>
          prev.map((row) =>
            String(row.provider_id) === pid
              ? {
                  ...row,
                  artist_ids: artistIds.length ? artistIds : row.artist_ids,
                  album_id: albumId || row.album_id,
                  release_date: releaseDate || row.release_date,
                  cover_url: coverUrl || row.cover_url,
                  year: data.year ?? row.year,
                }
              : row,
          ),
        );

        if (track.id && (artistIds.length || albumId || releaseDate || coverUrl)) {
          await apiPatchJson(
            `/api/library/${track.id}/meta`,
            {
              artist_ids_json: artistIds.length ? JSON.stringify(artistIds) : undefined,
              album_id: albumId ? String(albumId) : undefined,
              release_date: releaseDate || undefined,
              cover_url: coverUrl || undefined,
            },
            { auth: true },
          ).catch(() => {});
        }
      } catch {
        enrichedRef.current.delete(pid);
      }
    };

    (async () => {
      let cursor = 0;
      const workers = Array.from({ length: ENRICH_CONCURRENCY }, async () => {
        while (!cancelled) {
          const i = cursor;
          cursor += 1;
          if (i >= missing.length) break;
          await enrichOne(missing[i]);
        }
      });
      await Promise.all(workers);
    })();

    return () => {
      cancelled = true;
    };
  }, [library, setLibrary]);
}
