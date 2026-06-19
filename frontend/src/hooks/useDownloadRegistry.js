import { useEffect, useRef, useState } from 'react';
import { isBackgroundPaused } from '../utils/authBusy';
import { setsEqual } from '../utils/debounce';
import { apiGetJson } from '../utils/apiClient';
import { hasAuthSession } from '../utils/hasAuthSession';
import { DOWNLOAD_REGISTRY_REFRESH } from '../utils/downloadJobs';

function registrySnapshot(data) {
  if (!data || typeof data !== 'object') return '';
  return JSON.stringify(
    Object.keys(data)
      .sort()
      .map((k) => [k, data[k]]),
  );
}

/** Poll /api/downloads for completed job registry (badges in UI). */
export function useDownloadRegistry({ sessionReady, mediaEnabled }) {
  const [downloadedTracks, setDownloadedTracks] = useState(new Set());
  const [downloadRegistryTick, setDownloadRegistryTick] = useState(0);
  const downloadedTracksRef = useRef(new Set());
  const downloadedRegistryRef = useRef({});

  useEffect(() => {
    if (!sessionReady || !mediaEnabled) return undefined;
    const REGISTRY_MS = 60_000;
    let registryBusy = false;
    const fetchDownloads = async () => {
      if (registryBusy) return;
      if (!hasAuthSession()) return;
      if (document.visibilityState === 'hidden' || isBackgroundPaused()) return;
      registryBusy = true;
      try {
        const data = await apiGetJson('/api/downloads', { auth: true });
        if (data && typeof data === 'object') {
          const newSet = new Set(Object.keys(data));
          const snap = registrySnapshot(data);
          const prevSnap = registrySnapshot(downloadedRegistryRef.current);
          if (!setsEqual(newSet, downloadedTracksRef.current) || snap !== prevSnap) {
            downloadedRegistryRef.current = data;
            downloadedTracksRef.current = newSet;
            setDownloadedTracks(newSet);
            setDownloadRegistryTick((n) => n + 1);
          }
        }
      } catch {
        /* ignore */
      } finally {
        registryBusy = false;
      }
    };
    fetchDownloads();
    const iv = setInterval(fetchDownloads, REGISTRY_MS);
    const onRegistryRefresh = () => { fetchDownloads(); };
    window.addEventListener(DOWNLOAD_REGISTRY_REFRESH, onRegistryRefresh);
    const onVis = () => {
      if (document.visibilityState === 'visible') fetchDownloads();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(iv);
      window.removeEventListener(DOWNLOAD_REGISTRY_REFRESH, onRegistryRefresh);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [sessionReady, mediaEnabled]);

  return {
    downloadedTracks,
    downloadRegistryTick,
    downloadedTracksRef,
    downloadedRegistryRef,
  };
}
