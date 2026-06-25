import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Link, useOutletContext, useSearchParams } from 'react-router-dom';
import { showToast } from '../utils/toast';
import {
  Search, ListMusic, Link as LinkIcon, Loader2, List,
  DownloadCloud, Radio, ExternalLink, Library,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { usePlayer } from '../store/usePlayerStore';
import { canPlaySetUrl } from '../components/LazySetPlayer';
import SetEmbedAnchor from '../components/player/SetEmbedAnchor';
import AnalyzerProgressPanel from '../components/setanalyzer/AnalyzerProgressPanel';
import SetTracklistRow from '../components/setanalyzer/SetTracklistRow';
import SetDjInsights from '../components/setanalyzer/SetDjInsights';
import PlaylistModal from '../components/PlaylistModal';
import { useTrackFeaturesForList } from '../hooks/useTrackFeaturesForList';
import { normalizeTrack } from '../utils/trackNormalize';
import { startDownloadJob, cancelJob } from '../utils/downloadJobs';
import { enableDjAnalysisPreference } from '../utils/enableDjAnalysis';
import { apiPostJson } from '../utils/apiClient';
import { getAccessToken } from '../utils/tokenStorage';
import { hasAuthSession } from '../utils/hasAuthSession';
import { setAnalyzerDict } from '../locales/setAnalyzerDict';
import { classifySetUrl, SOUND_CLOUD_EMBED_HEIGHT } from '../utils/setEmbedUrl';
import { normalizeSetUrl, readSetLibrary } from '../utils/setLibrary';
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
} from '../utils/setAnalyzerUtils';

export default function SetAnalyzer() {
  const {
    togglePlay,
    playQueue,
    currentTrackId,
    isPlaying,
    downloadedTracks,
    lang,
    toggleLike,
    likedTracks,
    djFeaturesActive,
    djFeaturesAvailable,
    setDjAnalysisEnabled,
    t: tApp,
  } = useOutletContext();
  const t = (key) => setAnalyzerDict[lang]?.[key] || setAnalyzerDict.en[key] || key;

  const {
    loadSetEmbed,
    pauseSetEmbed,
    seekSetEmbed,
  } = usePlayer();

  const [searchParams] = useSearchParams();
  const autoAnalyzeStarted = useRef(false);

  const [url, setUrl] = useState(() => sessionStorage.getItem('tidal-analyzer-url') || '');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [setTracks, setSetTracks] = useState([]);
  const [analysisMeta, setAnalysisMeta] = useState(null);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const [lastPollAt, setLastPollAt] = useState(null);
  const [error, setError] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const [djAnalyzeRequested, setDjAnalyzeRequested] = useState(false);
  const setPlayerSectionRef = useRef(null);
  const resumeToastShown = useRef(false);

  const trimmedUrl = url.trim();
  const canPlaySet = canPlaySetUrl(trimmedUrl);
  const isSc = classifySetUrl(trimmedUrl) === 'soundcloud';

  const playableTracks = useMemo(
    () => setTracks.map((row) => normalizeSetMatchedTrack(row)).filter(Boolean),
    [setTracks],
  );

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

  useEffect(() => {
    const urlParam = searchParams.get('url');
    if (!urlParam) return;
    const decoded = decodeURIComponent(urlParam);
    setUrl(decoded);
    const shouldAnalyze = searchParams.get('analyze') === '1';
    if (!shouldAnalyze) {
      const saved = readSetLibrary().find(
        (entry) => normalizeSetUrl(entry.url) === normalizeSetUrl(decoded),
      );
      if (saved?.setTracks?.length) {
        setSetTracks(saved.setTracks);
        setStatus('done');
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (!canPlaySet || !trimmedUrl) return;
    loadSetEmbed(trimmedUrl);
  }, [trimmedUrl, canPlaySet, loadSetEmbed]);

  useEffect(() => {
    if (!trimmedUrl) return;
    const active = loadActiveAnalyzerJob(trimmedUrl);
    if (active?.jobId) {
      setJobId(active.jobId);
      setStatus('running');
      if (!resumeToastShown.current) {
        resumeToastShown.current = true;
        showToast(t('analysisResumed'));
      }
    }
  }, [trimmedUrl, t]);

  const seekSetAt = useCallback((timestamp) => {
    if (!canPlaySet) return;
    const seconds = parseSetTimestamp(timestamp);
    loadSetEmbed(trimmedUrl);
    seekSetEmbed(seconds, { preferEmbed: true, url: trimmedUrl });
    setPlayerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [canPlaySet, trimmedUrl, loadSetEmbed, seekSetEmbed]);

  const { pendingCount: djPendingCount, getFeatures: getDjFeatures } = useTrackFeaturesForList(
    playableTracks,
    {
      enabled: djAnalyzeRequested && !!djFeaturesActive,
      analyze: djAnalyzeRequested && !!djFeaturesActive,
      maxAnalyze: Math.max(playableTracks.length, 40),
    },
  );

  const handleDjAnalyzeBatch = useCallback(async () => {
    if (!hasAuthSession()) {
      showToast(t('authRequired'));
      return false;
    }
    if (!djFeaturesAvailable) {
      showToast(t('djAnalyzeNeedPro'));
      return false;
    }
    if (!djFeaturesActive) {
      try {
        const enabled = await enableDjAnalysisPreference(setDjAnalysisEnabled);
        if (!enabled) {
          showToast(t('djAnalyzeNeedPro'));
          return false;
        }
        showToast(t('djAnalyzeEnabledAuto'));
      } catch {
        showToast(t('djAnalyzeEnableFailed'));
        return false;
      }
    }
    setDjAnalyzeRequested(true);
    return true;
  }, [
    djFeaturesActive,
    djFeaturesAvailable,
    setDjAnalysisEnabled,
    t,
  ]);

  const playTidalTrack = useCallback((track, list) => {
    if (!track?.provider_id) return;
    pauseSetEmbed();
    const queue = (list?.length ? list : playableTracks).filter(Boolean);
    const normalized = normalizeTrack(track);
    if (!normalized) return;
    const play = playQueue || togglePlay;
    play(normalized, queue.length ? queue : [normalized]);
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
    void startAnalysis();
  }, [searchParams, trimmedUrl, isAnalyzing]);

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
        const res = await fetch(`/api/jobs/${jobId}`, {
          headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const outcome = resolveAnalyzerJobOutcome(data, t);
        const tracks = data.set_tracks || [];

        setStatus(outcome.status);
        setSetTracks(tracks);
        setAnalysisMeta(data.analysis || null);
        setAnalysisProgress(
          data.analysis?.label
          || data.tracks?.[0]?.title
          || (outcome.status === 'queued' ? t('waitingQueue') : ''),
        );
        setLastPollAt(Date.now());
        if (outcome.error) setError(outcome.error);

        if (outcome.status === 'done' || outcome.status === 'failed' || outcome.status === 'cancelled') {
          clearActiveAnalyzerJob(trimmedUrl);
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

  const downloadSet = async () => {
    if (!trimmedUrl) return;
    try {
      await startDownloadJob({ url: trimmedUrl, quality: 'LOSSLESS' });
      showToast(t('downloadStarted'));
    } catch (e) {
      showToast(e.message);
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
    const text = setTracks.map((row) => `${row.timestamp} - ${row.artist} - ${row.title}`).join('\n');
    navigator.clipboard.writeText(text);
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
          disabled={!trimmedUrl || isAnalyzing}
          style={{ borderRadius: '24px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
          title={t('downloadSet')}
        >
          <DownloadCloud size={20} />
          <span className="hide-on-mobile">{t('downloadSet')}</span>
        </button>
      </motion.div>

      {canPlaySet && (
        <motion.div
          ref={setPlayerSectionRef}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel"
          style={{ padding: '20px', borderRadius: '20px', marginBottom: '28px', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--accent-solid)' }}>
              <Radio size={22} />
              <span style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{t('setPlayer')}</span>
            </div>
            <a
              href={trimmedUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none' }}
            >
              <ExternalLink size={14} />
              {' '}
              {t('openSource')}
            </a>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('setPlayerHint')}</p>
          <SetEmbedAnchor
            testId="set-player-panel"
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000',
              aspectRatio: isSc ? undefined : '16/9',
              height: isSc ? SOUND_CLOUD_EMBED_HEIGHT : undefined,
              maxWidth: '100%',
              minHeight: isSc ? SOUND_CLOUD_EMBED_HEIGHT : 200,
            }}
          />
        </motion.div>
      )}

      {trimmedUrl && !canPlaySet && (
        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {t('invalidUrl')}
        </div>
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
          <SetDjInsights
            rows={setTracks}
            lang={lang}
            pendingCount={djPendingCount}
            totalToAnalyze={playableTracks.length}
            getFeatures={getDjFeatures}
            onAnalyzeBatch={handleDjAnalyzeBatch}
          />

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

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1.2s linear infinite; }
      ` }} />
    </div>
  );
}
