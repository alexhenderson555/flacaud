import { useEffect, useMemo, useRef } from 'react';
import { apiGetJson, apiPatchJson } from '../utils/apiClient';
import { isTidalCoverUrl } from '../utils/coverUrl';

const ENRICH_CONCURRENCY = 5;

/**
 * Fills missing artist_ids / album_id / release_date / cover on library rows via /api/track.
 */
export function useEnrichLibraryArtists(library, setLibrary) {
  const enrichedRef = useRef(new Set());
  const libraryRef = useRef(library);
  useEffect(() => {
    libraryRef.current = library;
  }, [library]);

  // This effect's own setLibrary() calls (one per successfully enriched
  // track) change `library`'s reference on every success -- depending on
  // `library` directly retriggered the whole effect each time, which set a
  // fresh `cancelled` flag and tore down the previous run, discarding
  // whatever the other ENRICH_CONCURRENCY-1 in-flight requests from that run
  // were about to apply. Since enrichedRef already marked those tracks
  // "done" before their request settled, they never got enriched and never
  // retried -- with concurrency 5, only about 1-in-5 enrichments actually
  // landed per pass. Keying on the set of track ids instead (stable across
  // our own field-patching writes, only changes when tracks are genuinely
  // added/removed) lets the whole batch actually finish.
  const libraryIdsKey = useMemo(
    () => (library || []).map((t) => t.provider_id).join(','),
    [library],
  );

  useEffect(() => {
    const currentLibrary = libraryRef.current;
    if (!currentLibrary?.length || !setLibrary) return undefined;

    const missing = currentLibrary.filter(
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
  }, [libraryIdsKey, setLibrary]);
}
