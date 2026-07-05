import { useEffect, useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeftRight, Gauge, Loader2, Music2, RefreshCcw, Search } from 'lucide-react';
import LibraryTrackRow from '../components/LibraryTrackRow';
import MetaBadge from '../components/MetaBadge';
import { apiGetJson, messageForApiError } from '../utils/apiClient';
import { enrichTracksFromApi } from '../utils/libraryApi';
import { normalizeTrack } from '../utils/trackNormalize';
import { tTrans } from '../locales/transitionFinderDict';

function tierColor(tier) {
  switch (tier) {
    case 'perfect': return 'var(--accent-solid)';
    case 'great': return '#22c55e';
    case 'good': return '#eab308';
    case 'ok': return '#94a3b8';
    default: return '#64748b';
  }
}

function tierLabel(tier, t) {
  const map = {
    perfect: t('tierPerfect'),
    great: t('tierGreat'),
    good: t('tierGood'),
    ok: t('tierOk'),
    avoid: t('tierAvoid'),
  };
  return map[tier] || tier;
}

function bpmDiffLabel(diff, t) {
  if (!diff) return t('bpmDiffZero');
  const sign = diff > 0 ? '+' : '';
  return t('bpmDiff').replace('{n}', `${sign}${diff}`);
}

export default function TransitionFinder() {
  const {
    t: globalT,
    lang,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    currentTrackId,
    isPlaying,
    isLoading,
    togglePlay: playerContextTogglePlay,
    djFeaturesActive = false,
    startTrackRadio,
    radioLoadingTrackId,
  } = useOutletContext();

  const t = (k) => tTrans(k, lang);
  const rowT = globalT || ((k) => k);

  const [library, setLibrary] = useState([]);
  const [loadingLibrary, setLoadingLibrary] = useState(true);
  const [seedQuery, setSeedQuery] = useState('');
  const [seedId, setSeedId] = useState(null);
  const [results, setResults] = useState([]);
  const [analyzedResults, setAnalyzedResults] = useState([]);
  const [isFinding, setIsFinding] = useState(false);
  const [error, setError] = useState(null);
  const [bpmTolerance, setBpmTolerance] = useState(6);

  // Load the user's library once on mount.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiGetJson('/api/library', { auth: true, lang });
        if (active && Array.isArray(data)) {
          setLibrary(data.map(normalizeTrack).filter(Boolean));
        }
      } catch (e) {
        if (active) setError(messageForApiError(e, lang) || t('errGeneric'));
      } finally {
        if (active) setLoadingLibrary(false);
      }
    })();
    return () => { active = false; };
    // t intentionally excluded — it's a stable closure over lang
  }, [lang]);

  // Filter library for the seed picker — only tracks with DJ analysis can be seeds.
  const analyzedLibrary = useMemo(
    () => library.filter((tr) => tr?.bpm && tr?.camelot_key),
    [library],
  );

  const seedChoices = useMemo(() => {
    const q = seedQuery.trim().toLowerCase();
    const pool = analyzedLibrary;
    if (!q) return pool.slice(0, 20);
    return pool.filter((tr) => {
      const title = (tr.title || '').toLowerCase();
      const artists = (tr.artists || []).join(' ').toLowerCase();
      return title.includes(q) || artists.includes(q);
    }).slice(0, 20);
  }, [analyzedLibrary, seedQuery]);

  const seedTrack = useMemo(
    () => library.find((tr) => String(tr.provider_id) === String(seedId)) || null,
    [library, seedId],
  );

  // Fetch transitions when a seed is picked.
  const findTransitions = async (id) => {
    if (!id) return;
    setIsFinding(true);
    setError(null);
    try {
      const data = await apiGetJson(
        `/api/transitions/tidal/${encodeURIComponent(id)}?bpm_tolerance=${bpmTolerance}&limit=20`,
        { auth: true, lang },
      );
      const rows = Array.isArray(data?.tracks) ? data.tracks : [];
      const tracks = rows.map((r) => normalizeTrack(r.track)).filter(Boolean);
      const enriched = await enrichTracksFromApi(tracks, lang, { persistLibrary: false });
      // Attach the DJ meta + score from the response to each track.
      const merged = enriched.map((tr, i) => {
        const row = rows[i];
        if (!row) return tr;
        return {
          ...tr,
          bpm: row.bpm,
          camelot_key: row.camelot_key,
          musical_key: row.musical_key,
          __score: row.score,
          __tier: row.tier,
          __bpmDiff: row.bpm_diff,
          __harmonic: row.harmonic,
          __tempo: row.tempo,
        };
      });
      setResults(merged);
      setAnalyzedResults(merged);
    } catch (e) {
      setError(messageForApiError(e, lang) || t('errNet'));
      setResults([]);
      setAnalyzedResults([]);
    } finally {
      setIsFinding(false);
    }
  };

  const handlePickSeed = (tr) => {
    setSeedId(String(tr.provider_id));
    setSeedQuery('');
    findTransitions(String(tr.provider_id));
  };

  const handleRefresh = () => {
    if (seedId) findTransitions(seedId);
  };

  const togglePlay = (track, list) => {
    playerContextTogglePlay(track, list || analyzedResults);
  };

  const seedMissingDj = seedTrack && (!seedTrack.bpm || !seedTrack.camelot_key);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ marginBottom: '32px' }}>
        <h1 style={{ fontSize: '3rem', marginBottom: '16px' }}>
          {t('title')} <span className="text-gradient">{t('titleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem', maxWidth: '620px' }}>
          {t('desc')}
        </p>
      </motion.div>

      {/* Seed picker */}
      <motion.div
        initial={{ scale: 0.97, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15 }}
        style={{ maxWidth: '820px', marginBottom: '24px' }}
      >
        <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderRadius: '24px' }}>
          <Search size={22} color="var(--text-muted)" style={{ marginRight: '14px' }} aria-hidden />
          <input
            type="text"
            placeholder={t('seedPlaceholder')}
            aria-label={t('seedPlaceholder')}
            style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1.05rem', padding: '12px 0' }}
            value={seedQuery}
            onChange={(e) => setSeedQuery(e.target.value)}
          />
        </div>

        {seedQuery.trim() && (
          <div style={{ marginTop: '8px', maxHeight: '320px', overflowY: 'auto', borderRadius: '16px', border: '1px solid var(--border-subtle)' }}>
            {loadingLibrary ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Loader2 size={18} className="spin" /> {t('loading')}
              </div>
            ) : seedChoices.length === 0 ? (
              <div style={{ padding: '20px', color: 'var(--text-muted)' }}>
                {analyzedLibrary.length === 0 ? t('noAnalyzed') : t('noSeed')}
              </div>
            ) : (
              seedChoices.map((tr) => (
                <button
                  type="button"
                  key={tr.provider_id}
                  onClick={() => handlePickSeed(tr)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px', width: '100%',
                    padding: '10px 16px', background: 'transparent', border: 'none',
                    borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer',
                    textAlign: 'left', color: 'var(--text-primary)',
                  }}
                >
                  <Music2 size={18} color="var(--accent-solid)" aria-hidden />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {tr.title}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                      {(tr.artists || []).join(', ')}
                    </div>
                  </div>
                  <MetaBadge variant="soft">{tr.bpm} BPM</MetaBadge>
                  <MetaBadge variant="soft">{tr.camelot_key}</MetaBadge>
                </button>
              ))
            )}
          </div>
        )}
      </motion.div>

      {/* Seed summary + filters */}
      {seedTrack && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="glass-panel"
          style={{ padding: '16px 20px', borderRadius: '20px', maxWidth: '820px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}
        >
          <ArrowLeftRight size={22} color="var(--accent-solid)" aria-hidden />
          <div style={{ flex: 1, minWidth: '200px' }}>
            <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{seedTrack.title}</div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {(seedTrack.artists || []).join(', ')}
            </div>
          </div>
          {seedMissingDj ? (
            <span style={{ color: 'var(--error)', fontSize: '0.95rem' }}>{t('seedMissingDj')}</span>
          ) : (
            <>
              <MetaBadge variant="soft">{seedTrack.bpm} BPM</MetaBadge>
              <MetaBadge variant="soft" title={seedTrack.musical_key}>{seedTrack.camelot_key}</MetaBadge>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                <Gauge size={16} aria-hidden />
                {t('bpmTolerance')}
                <input
                  type="range"
                  min={2}
                  max={20}
                  step={1}
                  value={bpmTolerance}
                  onChange={(e) => setBpmTolerance(Number(e.target.value))}
                  onBlur={handleRefresh}
                  style={{ width: '100px' }}
                />
                <span style={{ minWidth: '24px', textAlign: 'right' }}>±{bpmTolerance}</span>
              </label>
              <button
                type="button"
                onClick={handleRefresh}
                disabled={isFinding}
                className="btn-secondary"
                style={{ borderRadius: '16px', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {isFinding ? <Loader2 size={16} className="spin" /> : <RefreshCcw size={16} />}
                {t('refresh')}
              </button>
            </>
          )}
        </motion.div>
      )}

      {error && (
        <div role="alert" style={{ padding: '14px 18px', borderRadius: '14px', background: 'rgba(239,68,68,0.1)', color: '#ef4444', maxWidth: '820px', marginBottom: '20px' }}>
          {error}
        </div>
      )}

      {/* Results */}
      {!seedTrack && !loadingLibrary && library.length > 0 && analyzedLibrary.length === 0 && (
        <div style={{ color: 'var(--text-muted)', maxWidth: '620px', padding: '20px' }}>
          {t('noAnalyzed')}
        </div>
      )}
      {!seedTrack && !loadingLibrary && library.length === 0 && (
        <div style={{ color: 'var(--text-muted)', maxWidth: '620px', padding: '20px' }}>
          {t('noLibrary')}
        </div>
      )}
      {!seedTrack && !loadingLibrary && library.length > 0 && analyzedLibrary.length > 0 && (
        <div style={{ color: 'var(--text-muted)', maxWidth: '620px', padding: '20px' }}>
          {t('noSeed')}
        </div>
      )}

      {seedTrack && !isFinding && results.length === 0 && !error && (
        <div style={{ color: 'var(--text-muted)', maxWidth: '620px', padding: '20px' }}>
          {t('noResults')}
        </div>
      )}

      {results.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} style={{ width: '100%', maxWidth: '100%' }}>
          <h2 style={{ fontSize: '1.4rem', margin: '0 0 16px', color: 'var(--text-secondary)' }}>
            {t('results')}
          </h2>
          <div className="track-list">
            {results.map((track, i) => {
              const tier = track.__tier || 'avoid';
              const score = track.__score || 0;
              const diff = track.__bpmDiff || 0;
              return (
                <div key={`${track.provider_id}-${i}`} style={{ position: 'relative' }}>
                  <LibraryTrackRow
                    track={track}
                    index={i}
                    list={results}
                    t={rowT}
                    likedTracks={likedTracks}
                    downloadedTracks={downloadedTracks}
                    currentTrackId={currentTrackId}
                    isPlaying={isPlaying}
                    isLoading={isLoading}
                    onTogglePlay={togglePlay}
                    onToggleLike={toggleLike}
                    onDownload={handleDownload}
                    onStartRadio={startTrackRadio}
                    radioLoadingTrackId={radioLoadingTrackId}
                    djFeaturesActive={djFeaturesActive}
                    testIdPrefix="transition"
                  />
                  {/* Score badge overlay on the right */}
                  <div
                    style={{
                      position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)',
                      display: 'flex', alignItems: 'center', gap: '8px', pointerEvents: 'none',
                    }}
                    aria-hidden
                  >
                    <span
                      style={{
                        fontSize: '0.8rem', fontWeight: 700, padding: '4px 10px', borderRadius: '12px',
                        background: `${tierColor(tier)}22`, color: tierColor(tier),
                        border: `1px solid ${tierColor(tier)}55`,
                      }}
                    >
                      {tierLabel(tier, t)} · {score}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', minWidth: '56px', textAlign: 'right' }}>
                      {bpmDiffLabel(diff, t)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
