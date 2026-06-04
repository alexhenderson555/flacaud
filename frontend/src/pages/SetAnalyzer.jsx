import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { showToast } from '../utils/toast';
import { useOutletContext } from 'react-router-dom';
import {
  Search, ListMusic, Download, Play, Pause, Link, Check, Loader2, List,
  DownloadCloud, Music, Radio, ExternalLink, Heart,
} from 'lucide-react';
import { motion } from 'framer-motion';
import ReactPlayer from 'react-player';
import { startDownloadJob } from '../utils/downloadJobs';
import { normalizeTrack } from '../utils/trackNormalize';

const dict = {
  en: {
    title: 'Set',
    titleBold: 'Analyzer',
    desc: 'Paste a DJ set link, listen to it, and extract the tracklist with Shazam.',
    placeholder: 'Paste YouTube or SoundCloud set URL…',
    analyze: 'Analyze',
    analyzing: 'Analyzing…',
    listenSet: 'Listen to set',
    pauseSet: 'Pause set',
    downloadSet: 'Download set',
    setPlayer: 'DJ set',
    setPlayerHint: 'Use timestamps in the tracklist to jump to a moment in the mix.',
    openSource: 'Open original',
    tracklist: 'Tracklist',
    tracksFound: 'tracks found',
    copyText: 'Copy Text',
    downloadAll: 'Download All Matches',
    notFound: 'Not on Tidal',
    playSetAt: 'Jump to this moment in the set',
    playTidal: 'Play on Tidal',
    downloadStarted: 'Download started — see progress bottom-right',
    downloadAllStarted: 'Started downloading matched tracks',
    analysisFailed: 'Analysis failed',
    authRequired: 'Sign in to analyze sets',
    invalidUrl: 'Paste a YouTube or SoundCloud link to listen',
  },
  ru: {
    title: 'Set',
    titleBold: 'Analyzer',
    desc: 'Вставьте ссылку на сет, слушайте его и получите треклист через Shazam.',
    placeholder: 'Ссылка на YouTube или SoundCloud…',
    analyze: 'Анализ',
    analyzing: 'Анализ…',
    listenSet: 'Слушать сет',
    pauseSet: 'Пауза',
    downloadSet: 'Скачать сет',
    setPlayer: 'DJ-сет',
    setPlayerHint: 'Нажмите время в треклисте — перемотка к этому моменту в миксе.',
    openSource: 'Открыть оригинал',
    tracklist: 'Треклист',
    tracksFound: 'треков',
    copyText: 'Копировать',
    downloadAll: 'Скачать все совпадения',
    notFound: 'Нет на Tidal',
    playSetAt: 'Перейти к моменту в сете',
    playTidal: 'Слушать на Tidal',
    downloadStarted: 'Загрузка началась — прогресс справа внизу',
    downloadAllStarted: 'Запущена загрузка совпадений',
    analysisFailed: 'Ошибка анализа',
    authRequired: 'Войдите, чтобы анализировать сеты',
    invalidUrl: 'Нужна ссылка YouTube или SoundCloud',
  },
};

function parseTimestamp(ts) {
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

function isSoundCloudUrl(url) {
  return /soundcloud\.com|snd\.sc/i.test(url);
}

export default function SetAnalyzer() {
  const { togglePlay, currentTrackId, isPlaying, downloadedTracks, lang, audioRef, toggleLike, likedTracks } = useOutletContext();
  const t = (key) => dict[lang]?.[key] || dict.en[key] || key;

  const [url, setUrl] = useState(() => sessionStorage.getItem('tidal-analyzer-url') || '');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState('idle');
  const [setTracks, setSetTracks] = useState([]);
  const [error, setError] = useState(null);
  const [setPlaying, setSetPlaying] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(null);
  const playerRef = useRef(null);
  const setPlayerSectionRef = useRef(null);

  const trimmedUrl = url.trim();
  const canPlaySet = trimmedUrl.length > 0 && ReactPlayer.canPlay(trimmedUrl);
  const isSc = isSoundCloudUrl(trimmedUrl);

  const playableTracks = useMemo(
    () => setTracks.map((row) => normalizeTrack(row.matched_track)).filter(Boolean),
    [setTracks]
  );

  useEffect(() => {
    sessionStorage.setItem('tidal-analyzer-url', url);
  }, [url]);

  const pauseMainPlayer = useCallback(() => {
    if (audioRef?.current) {
      audioRef.current.pause();
    }
  }, [audioRef]);

  const playSet = useCallback((seekSeconds = 0) => {
    if (!canPlaySet) {
      showToast(t('invalidUrl'));
      return;
    }
    pauseMainPlayer();
    setSetPlaying(true);
    setPlayerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.setTimeout(() => {
      playerRef.current?.seekTo(seekSeconds, 'seconds');
    }, 250);
  }, [canPlaySet, pauseMainPlayer, t]);

  const toggleSetPlay = () => {
    if (!canPlaySet) return;
    if (setPlaying) {
      setSetPlaying(false);
    } else {
      playSet(playerRef.current?.getCurrentTime?.() || 0);
    }
  };

  const seekSetAt = (timestamp) => {
    playSet(parseTimestamp(timestamp));
  };

  const playTidalTrack = (track, e) => {
    e?.stopPropagation();
    setSetPlaying(false);
    togglePlay(track, playableTracks);
  };

  const startAnalysis = async () => {
    if (!trimmedUrl) return;
    const token = localStorage.getItem('tidal-token');
    if (!token) {
      showToast(t('authRequired'));
      return;
    }
    try {
      setError(null);
      setSetTracks([]);
      setAnalysisProgress(null);
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url: trimmedUrl, job_type: 'analyze_set' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || 'Failed to start analysis');
      }
      const data = await res.json();
      setJobId(data.job_id);
      setStatus(data.status);
    } catch (e) {
      setError(e.message);
      setStatus('failed');
    }
  };

  useEffect(() => {
    let interval;
    let attempts = 0;
    const maxAttempts = 180;
    if (jobId && (status === 'queued' || status === 'running')) {
      interval = setInterval(async () => {
        attempts += 1;
        if (attempts > maxAttempts) {
          clearInterval(interval);
          setError(t('analysisFailed'));
          setStatus('failed');
          return;
        }
        try {
          const res = await fetch(`/api/jobs/${jobId}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
          });
          if (!res.ok) return;
          const data = await res.json();
          setStatus(data.status);
          setSetTracks(data.set_tracks || []);
          if (data.tracks?.length) {
            const tp = data.tracks[0];
            if (tp.title) setAnalysisProgress(tp.title);
          }
          if (data.status === 'failed') {
            setError(data.tracks?.[0]?.error || t('analysisFailed'));
          }
          if (data.status === 'done' || data.status === 'failed') {
            clearInterval(interval);
          }
        } catch (e) {
          console.error(e);
        }
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [jobId, status, t]);

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

  const isAnalyzing = status === 'running' || status === 'queued';

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

  const trackRowGrid = {
    display: 'grid',
    gridTemplateColumns: 'minmax(84px, 92px) 64px minmax(0, 1fr) auto',
    gap: '16px',
    alignItems: 'center',
    padding: '16px',
    borderRadius: '16px',
    marginBottom: '12px',
    width: '100%',
    boxSizing: 'border-box',
  };

  return (
    <div style={pageStyle}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          {t('title')} <span className="text-gradient">{t('titleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '620px' }}>{t('desc')}</p>
      </motion.div>

      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.1, duration: 0.4 }}
        style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '24px', alignItems: 'stretch', width: '100%' }}
      >
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', flex: '1 1 320px', minWidth: 0 }}>
          <Link size={22} color="var(--text-muted)" style={{ marginRight: '12px', flexShrink: 0 }} />
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
          className="btn-secondary"
          onClick={toggleSetPlay}
          disabled={!canPlaySet}
          data-testid="listen-set-btn"
          style={{ borderRadius: '24px', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, opacity: canPlaySet ? 1 : 0.5 }}
          title={canPlaySet ? (setPlaying ? t('pauseSet') : t('listenSet')) : t('invalidUrl')}
        >
          {setPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          <span className="hide-on-mobile">{setPlaying ? t('pauseSet') : t('listenSet')}</span>
        </button>

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
          data-testid="set-player-panel"
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
              <ExternalLink size={14} /> {t('openSource')}
            </a>
          </div>
          <p style={{ margin: '0 0 16px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('setPlayerHint')}</p>
          <div
            style={{
              borderRadius: '12px',
              overflow: 'hidden',
              background: '#000',
              aspectRatio: isSc ? undefined : '16/9',
              height: isSc ? 166 : undefined,
              maxWidth: '100%',
            }}
          >
            <ReactPlayer
              ref={playerRef}
              url={trimmedUrl}
              width="100%"
              height="100%"
              controls
              playing={setPlaying}
              onPlay={() => {
                pauseMainPlayer();
                setSetPlaying(true);
              }}
              onPause={() => setSetPlaying(false)}
              config={{
                soundcloud: { visual: isSc },
                youtube: { playerVars: { modestbranding: 1, rel: 0 } },
              }}
            />
          </div>
        </motion.div>
      )}

      {trimmedUrl && !canPlaySet && (
        <div style={{ padding: '12px 16px', borderRadius: '12px', background: 'var(--bg-surface-hover)', color: 'var(--text-secondary)', marginBottom: '24px', fontSize: '0.9rem' }}>
          {t('invalidUrl')}
        </div>
      )}

      {isAnalyzing && (
        <div className="glass-panel" style={{ padding: '16px 20px', borderRadius: '16px', marginBottom: '24px', display: 'flex', flexDirection: 'column', gap: '10px' }} data-testid="analyzer-progress">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <Loader2 className="spinner" size={20} color="var(--accent-solid)" />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, marginBottom: '4px' }}>{t('analyzing')}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{analysisProgress || '…'}</div>
            </div>
            {setTracks.length > 0 && (
              <span style={{ fontSize: '0.85rem', color: 'var(--accent-solid)', fontWeight: 600 }}>{setTracks.length} {t('tracksFound')}</span>
            )}
          </div>
          <div style={{ width: '100%', height: '6px', background: 'var(--bg-surface-hover)', borderRadius: '4px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (() => {
                const m = String(analysisProgress || '').match(/(\d+)%/);
                if (m) return parseInt(m[1], 10);
                if (analysisProgress?.includes('Downloading')) return 8;
                if (setTracks.length) return Math.min(95, 20 + setTracks.length * 3);
                return 5;
              })())}%`,
              background: 'var(--accent-gradient)',
              transition: 'width 0.4s ease',
            }} />
          </div>
        </div>
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
              <ListMusic size={24} /> {t('tracklist')} ({setTracks.length} {t('tracksFound')})
            </h2>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              <button type="button" className="btn-secondary" onClick={copyTracklist} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <List size={16} /> {t('copyText')}
              </button>
              <button type="button" className="btn-primary" onClick={downloadAll} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                <DownloadCloud size={16} /> {t('downloadAll')}
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', paddingRight: '8px', paddingBottom: '24px' }}>
            {setTracks.map((row, i) => {
              const track = normalizeTrack(row.matched_track);
              const isTidalPlaying = track && currentTrackId === String(track.provider_id) && isPlaying;

              return (
                <motion.div
                  key={`${row.timestamp}-${i}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.02 }}
                  className="glass-panel"
                  style={trackRowGrid}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
                >
                  <button
                    type="button"
                    onClick={() => seekSetAt(row.timestamp)}
                    style={{
                      width: '100%',
                      maxWidth: '92px',
                      color: 'var(--accent-solid)',
                      fontWeight: 600,
                      fontFamily: 'monospace',
                      fontSize: '0.82rem',
                      background: 'rgba(37,117,252,0.12)',
                      border: '1px solid rgba(37,117,252,0.25)',
                      borderRadius: '10px',
                      padding: '8px 4px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '4px',
                      flexShrink: 0,
                      boxSizing: 'border-box',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                    }}
                    title={t('playSetAt')}
                  >
                    <Play size={12} style={{ flexShrink: 0 }} />
                    <span>{row.timestamp}</span>
                  </button>

                  {track?.cover_url ? (
                    <img src={track.cover_url} alt="" style={{ width: '64px', height: '64px', borderRadius: '8px', objectFit: 'cover', display: 'block' }} />
                  ) : (
                    <div style={{ width: '64px', height: '64px', borderRadius: '8px', background: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                      <Music size={22} />
                    </div>
                  )}

                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <div style={{ fontSize: '1.05rem', fontWeight: 600, color: 'white', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.title}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.artist}</div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
                    {track ? (
                      <>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(e) => playTidalTrack(track, e)}
                          style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isTidalPlaying ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', color: 'white' }}
                          title={t('playTidal')}
                        >
                          {isTidalPlaying ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                        </button>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={(e) => toggleLike(track, e)}
                          style={{
                            padding: '10px',
                            borderRadius: '50%',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: likedTracks?.has(String(track.provider_id)) ? 'var(--accent-glow)' : 'var(--bg-surface-hover)',
                            border: '1px solid var(--border-subtle)',
                            color: likedTracks?.has(String(track.provider_id)) ? 'var(--accent-solid)' : 'white',
                            cursor: 'pointer',
                          }}
                          title={likedTracks?.has(String(track.provider_id)) ? 'Remove from Library' : 'Add to Library'}
                        >
                          <Heart
                            size={18}
                            fill={likedTracks?.has(String(track.provider_id)) ? 'var(--accent-solid)' : 'none'}
                          />
                        </button>
                        <button
                          type="button"
                          className="btn-primary"
                          onClick={(e) => downloadTrack(track, e)}
                          style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: downloadedTracks?.has(track.provider_id) ? 0.7 : 1 }}
                          title={downloadedTracks?.has(track.provider_id) ? 'Downloaded' : 'Download'}
                        >
                          {downloadedTracks?.has(track.provider_id) ? <Check size={18} /> : <Download size={18} />}
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('notFound')}</span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </motion.div>
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1.2s linear infinite; }
      ` }} />
    </div>
  );
}
