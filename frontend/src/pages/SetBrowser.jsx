import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useOutletContext, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Search, Loader2, ListMusic, DownloadCloud, Heart, ExternalLink,
  ArrowLeft, Sparkles, Radio, Music2, Clock, Eye, ArrowUpDown,
} from 'lucide-react';
import { showToast } from '../utils/toast';
import { usePlayer } from '../store/usePlayerStore';
import { canPlaySetUrl } from '../components/LazySetPlayer';
import { classifySetUrl, SOUND_CLOUD_EMBED_HEIGHT } from '../utils/setEmbedUrl';
import SetEmbedAnchor from '../components/player/SetEmbedAnchor';
import SetTracklistRow from '../components/setanalyzer/SetTracklistRow';
import PlaylistModal from '../components/PlaylistModal';
import { normalizeTrack, isTrackLiked } from '../utils/trackNormalize';
import { normalizeSetMatchedTrack, parseSetTimestamp } from '../utils/setAnalyzerUtils';
import { SET_ANALYZER_ORIGIN } from '../utils/vibeRadio';
import { startDownloadJob } from '../utils/downloadJobs';
import { hasAuthSession } from '../utils/hasAuthSession';
import { messageForApiError } from '../utils/apiClient';
import {
  searchSets, fetchQuickTracklist, fetchSimilarSets, fetchSetRecommendations,
} from '../utils/setSearchApi';
import { analyzerQueryForSet } from '../utils/setLibrary';
import { setBrowserDict } from '../locales/setBrowserDict';

function formatMinutes(seconds, t) {
  if (!seconds) return '';
  const m = Math.round(seconds / 60);
  return `${m} ${t('minutes')}`;
}

function formatCompactNumber(n) {
  if (!n) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}K`;
  return String(n);
}

function formatUploadDate(timestamp, lang) {
  if (!timestamp) return null;
  try {
    return new Date(timestamp * 1000).toLocaleDateString(lang === 'ru' ? 'ru-RU' : 'en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch {
    return null;
  }
}

const SORT_OPTIONS = ['relevance', 'views', 'date'];

function SetResultCard({ set, onSelect, t, lang }) {
  const views = formatCompactNumber(set.view_count);
  const date = formatUploadDate(set.upload_timestamp, lang);
  return (
    <motion.button
      type="button"
      className="glass-panel set-browser__card"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(set)}
      style={{
        display: 'flex', flexDirection: 'column', textAlign: 'left', padding: 0,
        borderRadius: '16px', overflow: 'hidden', border: 'none', cursor: 'pointer', background: 'var(--bg-surface)',
        height: '100%',
      }}
    >
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', flexShrink: 0 }}>
        {set.thumbnail ? (
          <img src={set.thumbnail} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Music2 size={32} color="var(--text-muted)" />
          </div>
        )}
        <span style={{
          position: 'absolute', bottom: '6px', right: '6px', background: 'rgba(0,0,0,0.7)',
          color: '#fff', fontSize: '0.75rem', padding: '2px 6px', borderRadius: '6px',
        }}
        >
          {set.source === 'soundcloud' ? 'SoundCloud' : 'YouTube'}
        </span>
      </div>
      <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', flex: 1 }}>
        <div
          style={{
            fontWeight: 600, fontSize: '0.95rem', marginBottom: '6px',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
            overflow: 'hidden', minHeight: '2.5em',
          }}
        >
          {set.title}
        </div>
        <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {set.channel}
        </div>
        <div style={{ marginTop: 'auto', paddingTop: '8px', fontSize: '0.78rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {set.duration_seconds > 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={12} />
              {formatMinutes(set.duration_seconds, t)}
            </span>
          )}
          {views && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Eye size={12} />
              {views}
            </span>
          )}
          {date && <span>{date}</span>}
        </div>
      </div>
    </motion.button>
  );
}

export default function SetBrowser() {
  const {
    togglePlay, playQueue, currentTrackId, isPlaying,
    downloadedTracks, lang, toggleLike, likedTracks, t: tApp,
  } = useOutletContext();
  const t = useCallback((key) => setBrowserDict[lang]?.[key] || setBrowserDict.en[key] || key, [lang]);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { loadSetEmbed, pauseSetEmbed, seekSetEmbed } = usePlayer();

  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [results, setResults] = useState([]);
  const [sortBy, setSortBy] = useState('relevance');
  const [selected, setSelected] = useState(null);
  const [tracklist, setTracklist] = useState(null);
  const [tracklistLoading, setTracklistLoading] = useState(false);
  const [similarSets, setSimilarSets] = useState([]);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const [recommended, setRecommended] = useState([]);
  const [recommendedLoading, setRecommendedLoading] = useState(false);

  const trimmedUrl = selected?.url || '';
  const canPlaySet = canPlaySetUrl(trimmedUrl);
  const isSc = classifySetUrl(trimmedUrl) === 'soundcloud';

  const sortedResults = useMemo(() => {
    if (sortBy === 'views') return [...results].sort((a, b) => (b.view_count || 0) - (a.view_count || 0));
    if (sortBy === 'date') return [...results].sort((a, b) => (b.upload_timestamp || 0) - (a.upload_timestamp || 0));
    return results;
  }, [results, sortBy]);

  const setTracks = useMemo(() => tracklist?.tracks || [], [tracklist]);
  const playableTracks = useMemo(
    () => setTracks.map((row) => normalizeSetMatchedTrack(row)).filter(Boolean),
    [setTracks],
  );

  useEffect(() => {
    if (!hasAuthSession()) return;
    let cancelled = false;
    setRecommendedLoading(true);
    fetchSetRecommendations({ lang })
      .then((rows) => { if (!cancelled) setRecommended(rows); })
      .catch(() => { if (!cancelled) setRecommended([]); })
      .finally(() => { if (!cancelled) setRecommendedLoading(false); });
    return () => { cancelled = true; };
    // Fetched once per page load — a fresh, re-shuffled set on every visit is
    // the point (discovery), not something that should refetch on re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runSearch = useCallback(async (e) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    if (!hasAuthSession()) {
      showToast(t('authRequired'));
      return;
    }
    setSearching(true);
    setSearchError(null);
    try {
      const rows = await searchSets(q, { lang });
      setResults(rows);
    } catch (err) {
      setSearchError(messageForApiError(err, lang) || t('errGeneric'));
    } finally {
      setSearching(false);
    }
  }, [query, lang, t]);

  // Opening a set pushes a browser-history entry (via the `set` query param) so
  // the native Back button returns here to the results instead of skipping
  // straight past this page to whatever was open before it (e.g. Library) —
  // selecting a set was previously pure client state with no URL change, so
  // Back had nothing of ours to undo.
  useEffect(() => {
    if (!searchParams.get('set') && selected) {
      pauseSetEmbed();
      setSelected(null);
      setTracklist(null);
      setSimilarSets([]);
    }
    // Only react to the URL going "backward" (param disappearing) — forward
    // transitions are already handled by selectSet itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const selectSet = useCallback(async (set) => {
    setSelected(set);
    setTracklist(null);
    setSimilarSets([]);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('set', set.url);
      return next;
    });
    if (canPlaySetUrl(set.url)) loadSetEmbed(set.url);

    setTracklistLoading(true);
    try {
      const data = await fetchQuickTracklist(set.url, { lang });
      setTracklist(data);
    } catch (err) {
      showToast(messageForApiError(err, lang) || t('errGeneric'));
      setTracklist({ source: 'none', tracks: [] });
    } finally {
      setTracklistLoading(false);
    }

    try {
      const similar = await fetchSimilarSets(set.url, { lang });
      setSimilarSets(similar);
    } catch {
      setSimilarSets([]);
    }
  }, [lang, loadSetEmbed, t, setSearchParams]);

  const backToResults = () => {
    // Pop the history entry selectSet pushed, rather than resetting state
    // directly — keeps the in-page "back" button and the browser's own Back
    // button consistent (both undo the same navigation step).
    if (searchParams.get('set')) {
      navigate(-1);
    } else {
      pauseSetEmbed();
      setSelected(null);
      setTracklist(null);
      setSimilarSets([]);
    }
  };

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
    const finalQueue = queue.length ? queue : [normalized];
    const taggedQueue = finalQueue.map((tr, i) => (
      i === 0 ? { ...tr, __queue_origin: SET_ANALYZER_ORIGIN } : tr
    ));
    const play = playQueue || togglePlay;
    play(normalized, taggedQueue);
  }, [pauseSetEmbed, playQueue, togglePlay, playableTracks]);

  const goAnalyze = () => {
    if (!trimmedUrl) return;
    navigate(analyzerQueryForSet(trimmedUrl, { analyze: true }));
  };

  const downloadTrack = async (track, e) => {
    e.stopPropagation();
    if (!track?.source_url) return;
    try {
      await startDownloadJob({ url: track.source_url });
      showToast(t('downloadStarted'));
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
        } catch {
          // continue with the rest
        }
      }
    }
    if (started > 0) showToast(t('downloadAllStarted'));
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

  const pageStyle = {
    height: '100%', display: 'flex', flexDirection: 'column', width: '100%',
    maxWidth: '1400px', margin: '0 auto', overflowX: 'hidden', boxSizing: 'border-box',
  };

  return (
    <div style={pageStyle}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          {t('title')} <span className="text-gradient">{t('titleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '620px' }}>{t('desc')}</p>
      </motion.div>

      {!selected && (
        <>
          <form onSubmit={runSearch} style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px', flex: '1 1 320px', minWidth: 0 }}>
              <Search size={22} color="var(--text-muted)" style={{ marginRight: '12px', flexShrink: 0 }} />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.05rem', padding: '12px 0', minWidth: 0 }}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                disabled={searching}
              />
            </div>
            <button
              type="submit"
              className="btn-primary"
              disabled={searching || !query.trim()}
              style={{ borderRadius: '24px', padding: '12px 28px', display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}
            >
              {searching ? <><Loader2 className="spinner" size={20} /> {t('searching')}</> : <><Search size={20} /> {t('search')}</>}
            </button>
          </form>

          {searchError && (
            <div style={{ padding: '16px', borderRadius: '16px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#ef4444', marginBottom: '24px' }}>
              {searchError}
            </div>
          )}

          {!searching && !results.length && !searchError && !query.trim() && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {recommendedLoading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
                  <Loader2 className="spinner" size={18} />
                  {t('loadingRecommended')}
                </div>
              )}
              {!recommendedLoading && recommended.length > 0 && (
                <>
                  <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={20} />
                    {t('recommendedSets')}
                  </h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gridAutoRows: '1fr', gap: '16px', paddingBottom: '24px' }}>
                    {recommended.map((set) => (
                      <SetResultCard key={set.url} set={set} onSelect={selectSet} t={t} lang={lang} />
                    ))}
                  </div>
                </>
              )}
              {!recommendedLoading && !recommended.length && (
                <p style={{ color: 'var(--text-secondary)' }}>{t('noQuery')}</p>
              )}
            </div>
          )}

          {!searching && query.trim() && results.length === 0 && !searchError && (
            <p style={{ color: 'var(--text-secondary)' }}>{t('noResults')}</p>
          )}

          {results.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <ArrowUpDown size={16} color="var(--text-muted)" />
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="set-browser__sort-select"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{t(`sort_${opt}`)}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gridAutoRows: '1fr', gap: '16px', paddingBottom: '24px' }}>
            {sortedResults.map((set) => (
              <SetResultCard key={set.url} set={set} onSelect={selectSet} t={t} lang={lang} />
            ))}
          </div>
        </>
      )}

      {selected && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, minHeight: 0 }}>
          <button
            type="button"
            onClick={backToResults}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'none', border: 'none', color: 'var(--accent-solid)', cursor: 'pointer', fontSize: '0.95rem', padding: 0, width: 'fit-content' }}
          >
            <ArrowLeft size={16} />
            {t('back')}
          </button>

          <div className="glass-panel" style={{ padding: '16px', borderRadius: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ fontSize: '1.3rem', margin: '0 0 6px' }}>{selected.title}</h2>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{selected.channel}</div>
            </div>
            <a href={selected.url} target="_blank" rel="noopener noreferrer" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)', textDecoration: 'none', flexShrink: 0 }}>
              <ExternalLink size={14} />
              {t('openSource')}
            </a>
          </div>

          {canPlaySet && (
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '20px', width: '100%', boxSizing: 'border-box', overflow: 'hidden' }}>
              <SetEmbedAnchor
                testId="set-browser-player"
                style={{
                  borderRadius: '12px', overflow: 'hidden', background: '#000',
                  aspectRatio: isSc ? undefined : '16/9',
                  height: isSc ? SOUND_CLOUD_EMBED_HEIGHT : undefined,
                  // Capped so a wide-screen 16:9 YouTube embed doesn't dwarf
                  // the page — SoundCloud's flat player bar was already fine
                  // at full width, so only the video gets the cap.
                  width: '100%', maxWidth: isSc ? '100%' : '480px', margin: isSc ? undefined : '0 auto',
                  minHeight: isSc ? SOUND_CLOUD_EMBED_HEIGHT : 200,
                }}
              />
            </div>
          )}

          {tracklistLoading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text-secondary)' }}>
              <Loader2 className="spinner" size={18} />
              {t('loadingTracklist')}
            </div>
          )}

          {!tracklistLoading && tracklist?.source === 'description' && setTracks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', minHeight: 0 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                <h3 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <ListMusic size={22} />
                  {t('tracklist')}
                  {' '}
                  (
                  {setTracks.length}
                  {' '}
                  {t('tracksFound')}
                  )
                </h3>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                  <button type="button" className="btn-secondary" onClick={addAllToLibrary} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                    <Heart size={16} />
                    {t('addAllToLibrary')}
                  </button>
                  <button type="button" className="btn-primary" onClick={downloadAll} style={{ display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '8px 20px' }}>
                    <DownloadCloud size={16} />
                    {t('downloadAll')}
                  </button>
                </div>
              </div>
              <div className="track-list" style={{ overflowY: 'auto', paddingRight: '8px', paddingBottom: '12px' }}>
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
            </div>
          )}

          {!tracklistLoading && tracklist?.source === 'none' && (
            <div className="glass-panel" style={{ padding: '20px', borderRadius: '16px', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', marginBottom: '16px' }}>{t('noTracklistYet')}</p>
              <button
                type="button"
                className="btn-primary"
                onClick={goAnalyze}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '10px 24px' }}
              >
                <Sparkles size={18} />
                {t('sendForAnalysis')}
              </button>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.82rem', marginTop: '10px' }}>{t('sendForAnalysisHint')}</p>
            </div>
          )}

          {similarSets.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Radio size={20} />
                {t('similarSets')}
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gridAutoRows: '1fr', gap: '14px', paddingBottom: '24px' }}>
                {similarSets.map((set) => (
                  <SetResultCard key={set.url} set={set} onSelect={selectSet} t={t} lang={lang} />
                ))}
              </div>
            </div>
          )}
        </motion.div>
      )}

      {playlistModalTrack && (
        <PlaylistModal track={playlistModalTrack} onClose={() => setPlaylistModalTrack(null)} />
      )}

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spinner { animation: spin 1.2s linear infinite; }
      ` }} />
    </div>
  );
}
