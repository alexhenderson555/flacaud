import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { showToast } from '../utils/toast';
import {
  Search, ListMusic, Link as LinkIcon, Loader2, List,
  DownloadCloud, Library, Heart,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayer } from '../store/usePlayerStore';
import { canPlaySetUrl } from '../components/LazySetPlayer';
import SetEmbedAnchor from '../components/player/SetEmbedAnchor';
import { SOUND_CLOUD_EMBED_HEIGHT } from '../utils/setEmbedUrl';
import AnalyzerProgressPanel from '../components/setanalyzer/AnalyzerProgressPanel';
import SetTracklistRow from '../components/setanalyzer/SetTracklistRow';
import PlaylistModal from '../components/PlaylistModal';
import { normalizeTrack, isTrackLiked } from '../utils/trackNormalize';
import { SET_ANALYZER_ORIGIN } from '../utils/vibeRadio';
import { startDownloadJob, cancelJob, downloadSetAudio } from '../utils/downloadJobs';
import { apiPostJson } from '../utils/apiClient';
import { fetchJobStatus } from '../utils/downloadJobs';
import { hasAuthSession } from '../utils/hasAuthSession';
import { setAnalyzerDict } from '../locales/setAnalyzerDict';
import { normalizeSetUrl, readSetLibrary, deriveSetTitle } from '../utils/setLibrary';
import { upsertSetLibraryEntryAsync } from '../utils/setLibraryApi';
import { fetchQuickTracklist } from '../utils/setSearchApi';
import {
  ANALYZER_MAX_ATTEMPTS,
  ANALYZER_POLL_MS,
  resolveAnalyzerProgress,
} from '../utils/setAnalyzerProgress';
import {
  clearActiveAnalyzerJob,
  loadActiveAnalyzerJob,
  saveActiveAnalyzerJob,
} from '../utils/analyzerJobStorage';
import {
  normalizeSetMatchedTrack,
  parseSetTimestamp,
  resolveAnalyzerJobOutcome,
  dedupeSetTracks,
  setTrackRowDurationSeconds,
} from '../utils/setAnalyzerUtils';

export default function SetAnalyzer() {
  const {
    togglePlay,
    playQueue,
    appendToQueue,
    playlist,
    currentTrackId,
    isPlaying,
    downloadedTracks,
    lang,
    toggleLike,
    likedTracks,
    startTrackRadio,
    radioLoadingTrackId,
    t: tApp,
  } = useOutletContext();
  // Stable reference across renders (memoized on lang only) -- this function is
  // a dependency of the job-status polling effect below; a fresh reference on
  // every render was re-running that effect and firing an immediate poll()
  // every time, on top of the interval, in a tight feedback loop with each
  // poll's own setState calls (hundreds of requests/sec, not 1-per-interval).
  const t = useCallback(
    (key) => setAnalyzerDict[lang]?.[key] || setAnalyzerDict.en[key] || key,
    [lang],
  );

  const {
    loadSetEmbed,
    pauseSetEmbed,
    seekSetEmbed,
    embedUrl,
  } = usePlayer();

  const [searchParams] = useSearchParams();
  const autoAnalyzeStarted = useRef(false);

  const [url, setUrl] = useState(() => sessionStorage.getItem('tidal-analyzer-url') || '');
  // Real title (from the source's own metadata) for save/export filenames --
  // without it, deriveSetTitle falls back to guessing from the URL slug,
  // which for hosts like SoundCloud (no word separators in the permalink)
  // produces unreadable names like "Djkittyamor — Kittymontreuxjazzfest".
  const [realTitle, setRealTitle] = useState('');
  // Read via ref (not the reactive state var) inside the polling effect below --
  // that effect's own dependency array is deliberately minimal (a runaway
  // re-poll bug lived here before), so it must not gain a new dependency just
  // to read the latest title once, on completion.
  const realTitleRef = useRef('');
  useEffect(() => { realTitleRef.current = realTitle; }, [realTitle]);
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [setTracks, setSetTracks] = useState([]);
  const [analysisMeta, setAnalysisMeta] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [lastPollAt, setLastPollAt] = useState(null);
  const [error, setError] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const [bulkPlaylistOpen, setBulkPlaylistOpen] = useState(false);
  const [downloadingSet, setDownloadingSet] = useState(false);
  const resumeToastShown = useRef(false);

  const trimmedUrl = url.trim();
  const canPlaySet = canPlaySetUrl(trimmedUrl);

  useEffect(() => {
    setRealTitle('');
    if (!trimmedUrl) return undefined;
    let cancelled = false;
    const saved = readSetLibrary().find(
      (entry) => normalizeSetUrl(entry.url) === normalizeSetUrl(trimmedUrl),
    );
    if (saved?.title) {
      setRealTitle(saved.title);
      return undefined;
    }
    fetchQuickTracklist(trimmedUrl, { lang })
      .then((info) => { if (!cancelled && info?.title) setRealTitle(info.title); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [trimmedUrl, lang]);

  const [savedToLibrary, setSavedToLibrary] = useState(false);
  useEffect(() => {
    const check = () => {
      const norm = normalizeSetUrl(trimmedUrl);
      setSavedToLibrary(!!norm && readSetLibrary().some((entry) => normalizeSetUrl(entry.url) === norm));
    };
    check();
    window.addEventListener('tidal-sets-changed', check);
    return () => window.removeEventListener('tidal-sets-changed', check);
  }, [trimmedUrl]);

  const playableTracks = useMemo(
    () => setTracks.map((row) => normalizeSetMatchedTrack(row)).filter(Boolean),
    [setTracks],
  );

  // While a set track from THIS analyzer session is playing, feed newly-recognized
  // matches (arriving via polling) into the live queue so playback rolls into them
  // instead of stopping at the last match known when the user hit play.
  const prevPlayableCountRef = useRef(0);
  useEffect(() => {
    const activeSetQueue = playlist?.[0]?.__queue_origin === SET_ANALYZER_ORIGIN;
    if (activeSetQueue && appendToQueue && playableTracks.length > prevPlayableCountRef.current) {
      appendToQueue(playableTracks);
    }
    prevPlayableCountRef.current = playableTracks.length;
  }, [playableTracks, playlist, appendToQueue]);

  const isAnalyzing = status === 'running' || status === 'queued';

  const analysisUi = useMemo(
    () => resolveAnalyzerProgress(analysisProgress, {
      status,
      trackCount: setTracks.length,
      analysis: analysisMeta,
    }),
    [analysisProgress, status, setTracks.length, analysisMeta],
  );

  useEffect(() => {
    sessionStorage.setItem('tidal-analyzer-url', url);
  }, [url]);

  const prevUrlParamRef = useRef(null);
  useEffect(() => {
    const urlParam = searchParams.get('url');
    if (!urlParam) return;
    const decoded = decodeURIComponent(urlParam);
    setUrl(decoded);
    const shouldAnalyze = searchParams.get('analyze') === '1';
    if (shouldAnalyze) return;

    // Only reset when the URL actually changed to a different set - navigating
    // straight from one Library entry to another (SPA nav, component doesn't
    // remount) previously left the FIRST set's tracklist showing under the
    // SECOND set's URL whenever the second one had no saved tracks yet.
    if (prevUrlParamRef.current === decoded) return;
    prevUrlParamRef.current = decoded;

    const saved = readSetLibrary().find(
      (entry) => normalizeSetUrl(entry.url) === normalizeSetUrl(decoded),
    );
    if (saved?.setTracks?.length) {
      setSetTracks(dedupeSetTracks(saved.setTracks));
      setStatus('done');
    } else {
      setSetTracks([]);
      setStatus('idle');
    }
    setAnalysisMeta(null);
    setAnalysisProgress(null);
    setError(null);
  }, [searchParams]);

  // Playing a matched Tidal track releases the embed session (mutual
  // exclusion with the main player) - reload it as soon as that happens so
  // the inline embed box never sits empty while a set is loaded.
  useEffect(() => {
    if (!canPlaySet || !trimmedUrl || embedUrl) return;
    loadSetEmbed(trimmedUrl);
  }, [trimmedUrl, canPlaySet, embedUrl, loadSetEmbed]);

  // Shared by the resume effect below AND the auto-analyze effect further down:
  // a job that died mid-flight (server restart, worker crash) without ever
  // clearing its own "active" marker would otherwise clobber an already
  // -completed, saved tracklist with a stale "resuming…" state forever, so a
  // marker only counts as resumable if it's newer than the last successful save.
  const getResumableActiveJob = useCallback((forUrl) => {
    const active = loadActiveAnalyzerJob(forUrl);
    if (!active?.jobId) return null;
    const savedEntry = readSetLibrary().find(
      (entry) => normalizeSetUrl(entry.url) === normalizeSetUrl(forUrl),
    );
    const staleMarker = savedEntry?.setTracks?.length > 0
      && (savedEntry.updatedAt || 0) >= (active.savedAt || 0);
    if (staleMarker) {
      clearActiveAnalyzerJob(forUrl);
      return null;
    }
    return active;
  }, []);

  useEffect(() => {
    if (!trimmedUrl) return;
    const active = getResumableActiveJob(trimmedUrl);
    if (!active) return;
    setJobId(active.jobId);
    setStatus('running');
    if (!resumeToastShown.current) {
      resumeToastShown.current = true;
      showToast(t('analysisResumed'));
    }
  }, [trimmedUrl, t, getResumableActiveJob]);

  const seekSetAt = useCallback((timestamp) => {
    if (!canPlaySet) return;
    const seconds = parseSetTimestamp(timestamp);
    loadSetEmbed(trimmedUrl);
    seekSetEmbed(seconds, { preferEmbed: true, url: trimmedUrl });
  }, [canPlaySet, trimmedUrl, loadSetEmbed, seekSetEmbed]);


  const playTidalTrack = useCallback((track, list) => {
    if (!track?.provider_id) return;
    pauseSetEmbed();
    const queue = (list?.length ? list : playableTracks).filter(Boolean);
    const normalized = normalizeTrack(track);
    if (!normalized) return;
    // Tag the queue as a finite set tracklist so it stops at the end instead of
    // rolling into track-radio (see usePlayerQueue playNext).
    const finalQueue = queue.length ? queue : [normalized];
    const taggedQueue = finalQueue.map((tr, i) => (
      i === 0 ? { ...tr, __queue_origin: SET_ANALYZER_ORIGIN } : tr
    ));
    const play = playQueue || togglePlay;
    play(normalized, taggedQueue);
  }, [pauseSetEmbed, playQueue, togglePlay, playableTracks]);

  const startAnalysis = async () => {
    if (!trimmedUrl) return;
    if (!hasAuthSession()) {
      showToast(t('authRequired'));
      return;
    }
    try {
      setError(null);
      setSetTracks([]);
      setAnalysisMeta(null);
      setAnalysisProgress(null);
      setLastPollAt(null);
      const data = await apiPostJson('/api/jobs', {
        url: trimmedUrl,
        job_type: 'analyze_set',
      }, { auth: true, lang });
      setJobId(data.job_id);
      setStatus(data.status || 'queued');
      saveActiveAnalyzerJob({ jobId: data.job_id, url: trimmedUrl });
    } catch (e) {
      setError(e.message || t('analysisFailed'));
      setStatus('failed');
    }
  };

  useEffect(() => {
    if (searchParams.get('analyze') !== '1') return;
    if (autoAnalyzeStarted.current || !trimmedUrl || isAnalyzing) return;
    autoAnalyzeStarted.current = true;
    // `isAnalyzing` reflects `status` from THIS render, which can still be
    // stale ('idle') on the very render where the resume effect above is
    // about to flip it to 'running' -- both effects run off the same render's
    // values, so without this extra check a fresh startAnalysis() here would
    // win the race and overwrite the resumable job's sessionStorage marker,
    // orphaning the still-running server-side job with no way to find it again.
    if (getResumableActiveJob(trimmedUrl)) return;
    void startAnalysis();
  }, [searchParams, trimmedUrl, isAnalyzing, getResumableActiveJob]);

  const cancelAnalysis = async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId, lang);
      clearActiveAnalyzerJob(trimmedUrl);
      setStatus('cancelled');
      setError(t('analysisCancelled'));
    } catch (e) {
      showToast(e.message || t('analysisFailed'));
    }
  };

  useEffect(() => {
    if (!jobId || (status !== 'queued' && status !== 'running')) return undefined;

    let attempts = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      attempts += 1;
      if (attempts > ANALYZER_MAX_ATTEMPTS) {
        setError(t('analysisTimedOut'));
        setStatus('failed');
        clearActiveAnalyzerJob(trimmedUrl);
        return;
      }
      try {
        const data = await fetchJobStatus(jobId);
        if (!data) return;
        if (data.authExpired) {
          // The job itself keeps running server-side — only the frontend's
          // session died, so tell the user rather than silently 401-looping
          // once a second for the rest of a long analysis.
          setError(t('sessionExpiredDuringAnalysis'));
          clearActiveAnalyzerJob(trimmedUrl);
          cancelled = true;
          return;
        }
        const outcome = resolveAnalyzerJobOutcome(data, t);
        const tracks = dedupeSetTracks(data.set_tracks || []);

        setStatus(outcome.status);
        setSetTracks(tracks);
        setAnalysisMeta(data.analysis || null);
        setAnalysisProgress(
          data.analysis?.label
          || data.tracks?.[0]?.title
          || (outcome.status === 'queued' ? t('waitingQueue') : ''),
        );
        setLastPollAt(Date.now());
        // Always set (not just when truthy) — otherwise a stale error from a
        // previous job (e.g. "Cancelled by user") survives forever once a
        // fresh restart's polls stop reporting one of their own.
        setError(outcome.error || null);

        if (outcome.status === 'done' || outcome.status === 'failed' || outcome.status === 'cancelled') {
          clearActiveAnalyzerJob(trimmedUrl);
        }
        // Auto-save on completion - the job record itself only lives ~24h
        // (Redis TTL), so without this a finished analysis silently vanishes
        // unless the user remembers to click "Save to Library" themselves.
        if (outcome.status === 'done' && tracks.length && hasAuthSession()) {
          upsertSetLibraryEntryAsync({
            url: trimmedUrl,
            title: deriveSetTitle(trimmedUrl, realTitleRef.current),
            setTracks: tracks,
          }, lang).catch(() => {});
        }
      } catch (e) {
        console.error(e);
      }
    };

    void poll();
    const interval = setInterval(poll, ANALYZER_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, status, trimmedUrl, lang, t]);

  const isSoundCloudEmbed = /soundcloud\.com|snd\.sc/i.test(embedUrl || '');

  const saveToLibrary = async () => {
    if (!trimmedUrl) return;
    if (!hasAuthSession()) {
      showToast(t('authRequired'));
      return;
    }
    try {
      await upsertSetLibraryEntryAsync({
        url: trimmedUrl,
        title: deriveSetTitle(trimmedUrl, realTitle),
        setTracks: setTracks.length ? setTracks : undefined,
      }, lang);
      showToast(t('setSavedToLibrary'));
    } catch (e) {
      showToast(e.message || t('analysisFailed'));
    }
  };

  const downloadSet = async () => {
    if (!trimmedUrl || downloadingSet) return;
    if (!hasAuthSession()) {
      showToast(t('authRequired'));
      return;
    }
    setDownloadingSet(true);
    showToast(t('downloadSetPreparing'));
    try {
      const filename = `${deriveSetTitle(trimmedUrl, realTitle)}.mp3`.replace(/[<>:"/\\|?*]+/g, '_');
      await downloadSetAudio(trimmedUrl, { lang, filename });
      showToast(t('downloadStarted'));
    } catch (e) {
      showToast(e.message);
    } finally {
      setDownloadingSet(false);
    }
  };

  const downloadTrack = async (track, e) => {
    e.stopPropagation();
    if (!track?.source_url) return;
    try {
      await startDownloadJob({ url: track.source_url });
    } catch (err) {
      showToast(err.message);
    }
  };

  const downloadAll = async () => {
    let started = 0;
    for (const row of setTracks) {
      if (row.matched_track?.source_url) {
        try {
          await startDownloadJob({ url: row.matched_track.source_url });
          started += 1;
        } catch (e) {
          console.error(e);
        }
      }
    }
    if (started > 0) showToast(t('downloadAllStarted'));
  };

  const copyTracklist = () => {
    const header = `${deriveSetTitle(trimmedUrl, realTitle)}\n${trimmedUrl}\n\n`;
    const text = header + setTracks.map((row) => `${row.timestamp} - ${row.artist} - ${row.title}`).join('\n');
    navigator.clipboard.writeText(text);
  };

  const downloadTracklistM3U8 = () => {
    const setTitle = deriveSetTitle(trimmedUrl, realTitle);
    const lines = [
      '#EXTM3U',
      `# ${setTitle} - ${trimmedUrl}`,
    ];
    for (const row of setTracks) {
      const durationSec = setTrackRowDurationSeconds(row, null, normalizeSetMatchedTrack(row)) || -1;
      lines.push(`#EXTINF:${durationSec},${row.artist} - ${row.title}`);
      const fallbackSearchUrl = `https://music.youtube.com/search?q=${encodeURIComponent(`${row.artist || ''} ${row.title || ''}`.trim())}`;
      lines.push(row.matched_track?.source_url || fallbackSearchUrl);
    }
    const blob = new Blob([lines.join('\n')], { type: 'application/vnd.apple.mpegurl' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${setTitle}.m3u8`.replace(/[<>:"/\\|?*]+/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const addAllToLibrary = () => {
    if (!playableTracks.length) {
      showToast(t('noMatchesYet'));
      return;
    }
    const toLike = playableTracks.filter((tr) => !isTrackLiked(likedTracks, tr));
    if (!toLike.length) {
      showToast(t('alreadyAllLiked'));
      return;
    }
    toLike.forEach((tr) => toggleLike(tr));
    showToast(t('addedToLibrary').replace('{n}', String(toLike.length)));
  };

  const openBulkPlaylist = () => {
    if (!playableTracks.length) {
      showToast(t('noMatchesYet'));
      return;
    }
    setBulkPlaylistOpen(true);
  };

  const pageStyle = {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '1400px',
    margin: '0 auto',
    overflowX: 'hidden',
    boxSizing: 'border-box',
  };

  return (
    <div style={pageStyle}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          {t('title')} <span className="text-gradient">{t('titleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '620px' }}>{t('desc')}</p>
        <Link
          to="/sets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            marginTop: '12px',
            color: 'var(--accent-solid)',
            fontSize: '0.95rem',
            textDecoration: 'none',
          }}
        >
          <Library size={16} />
          {' '}
          {t('openSetLibrary')}
        </Link>
      </motion.div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '24px',
          alignItems: 'stretch',
          width: '100%',
        }}
      >
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', flex: '1 1 320px', minWidth: 0 }}>
          <LinkIcon size={22} color="var(--text-muted)" style={{ marginRight: '12px', flexShrink: 0 }} />
          <input
            type="text"
            placeholder={t('placeholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.05rem', padding: '12px 0', minWidth: 0 }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isAnalyzing && startAnalysis()}
            disabled={isAnalyzing}
          />
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={startAnalysis}
          disabled={isAnalyzing || !trimmedUrl}
          style={{ borderRadius: '24px', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
        >
          {isAnalyzing ? <><Loader2 className="spinner" size={20} /> {t('analyzing')}</> : <><Search size={20} /> {t('analyze')}</>}
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={downloadSet}
          disabled={!trimmedUrl || isAnalyzing || downloadingSet}
          style={{ borderRadius: '24px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          title={t('downloadSet')}
        >
          {downloadingSet ? <Loader2 className="spinner" size={20} /> : <DownloadCloud size={20} />}
          <span className="hide-on-mobile">{t('downloadSet')}</span>
        </button>

        <button
          type="button"
          className="btn-secondary"
          onClick={saveToLibrary}
          disabled={!trimmedUrl}
          style={{
            borderRadius: '24px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0,
            color: savedToLibrary ? 'var(--accent-solid)' : undefined,
          }}
          title={savedToLibrary ? t('setSavedToLibrary') : t('saveToLibrary')}
        >
          <Heart size={20} fill={savedToLibrary ? 'currentColor' : 'none'} />
          <span className="hide-on-mobile">{savedToLibrary ? t('setSavedToLibrary') : t('saveToLibrary')}</span>
        </button>
      </motion.div>

      {trimmedUrl && !canPlaySet && (
        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {t('invalidUrl')}
        </div>
      )}

      {canPlaySet && (
        <SetEmbedAnchor
          style={{
            width: '100%',
            maxWidth: '760px',
            margin: '0 auto 24px',
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#000',
            height: isSoundCloudEmbed ? SOUND_CLOUD_EMBED_HEIGHT : undefined,
            aspectRatio: isSoundCloudEmbed ? undefined : '16/9',
          }}
        />
      )}

      {isAnalyzing && jobId && (
        <AnalyzerProgressPanel
          t={t}
          lang={lang}
          analysisProgress={analysisProgress}
          lastPollAt={lastPollAt}
          trackCount={setTracks.length}
          analysisUi={analysisUi}
          onCancel={cancelAnalysis}
        />
      )}

      {error && (
        <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', marginBottom: '24px' }}>
          {error}
        </div>
      )}

      {setTracks.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '16px', flex: 1, minHeight: 0, width: '100%' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <h2 style={{ fontSize: '1.5rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListMusic size={24} />
              {' '}
              {t('tracklist')}
              {' '}
              (
              {setTracks.length}
              {' '}
              {t('tracksFound')}
              )
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={copyTracklist} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <List size={16} />
                {' '}
                {t('copyText')}
              </button>
              <button type="button" className="btn-secondary" onClick={downloadTracklistM3U8} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <DownloadCloud size={16} />
                {' '}
                {t('downloadM3U8')}
              </button>
              <button type="button" className="btn-secondary" onClick={addAllToLibrary} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <Heart size={16} />
                {' '}
                {t('addAllToLibrary')}
              </button>
              <button type="button" className="btn-secondary" onClick={openBulkPlaylist} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <ListMusic size={16} />
                {' '}
                {t('addAllToPlaylist')}
              </button>
              <button type="button" className="btn-primary" onClick={downloadAll} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <DownloadCloud size={16} />
                {' '}
                {t('downloadAll')}
              </button>
            </div>
          </div>

          <div className="track-list" style={{ overflowY: 'auto', paddingRight: '8px', paddingBottom: '24px' }}>
            {setTracks.map((row, i) => (
              <SetTracklistRow
                key={`${row.timestamp}-${i}`}
                row={row}
                index={i}
                nextRow={setTracks[i + 1]}
                canPlaySet={canPlaySet}
                t={t}
                tApp={tApp}
                playableTracks={playableTracks}
                likedTracks={likedTracks}
                downloadedTracks={downloadedTracks}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                onSeek={seekSetAt}
                onPlayTidal={playTidalTrack}
                onToggleLike={toggleLike}
                onDownload={downloadTrack}
                onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
                onStartRadio={startTrackRadio}
                radioLoadingTrackId={radioLoadingTrackId}
              />
            ))}
          </div>
        </motion.div>
      )}

      {playlistModalTrack && (
        <PlaylistModal
          track={playlistModalTrack}
          onClose={() => setPlaylistModalTrack(null)}
        />
      )}

      {bulkPlaylistOpen && (
        <PlaylistModal
          tracks={playableTracks}
          onClose={() => setBulkPlaylistOpen(false)}
        />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1.2s linear infinite; }
      ` }} />
    </div>
  );
}
