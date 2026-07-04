import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Repeat, CheckCircle2, AlertCircle, Eye, ListMusic, Heart, Music2,
} from 'lucide-react';
import PlatformIcon from '../components/sync/PlatformIcon';
import SyncProgressPanel from '../components/sync/SyncProgressPanel';
import ConnectedAccountsPanel from '../components/sync/ConnectedAccountsPanel';
import MatchConfidenceBadge from '../components/MatchConfidenceBadge';
import { syncDict, fmtSync } from '../locales/syncDict';
import {
  SYNC_PLATFORMS,
  detectPlatformFromUrl,
  getSyncPlatform,
  isTransferUrl,
  placeholderForPlatform,
} from '../utils/syncPlatforms';
import { previewTransfer, importTransfer } from '../utils/transferApi';
import { coverImgSrc } from '../utils/coverUrl';
import { formatDurationSeconds } from '../utils/trackDuration';
import { showToast } from '../utils/toast';
import { dispatchLibraryTransferDone } from '../utils/libraryPatch';
import { getAccessToken } from '../utils/tokenStorage';
import '../styles/sync.css';

const MAX_PREVIEW_ROWS = 120;

function artistLine(track) {
  const artists = Array.isArray(track?.artists) ? track.artists.filter(Boolean) : [];
  return artists.length ? artists.join(', ') : 'Unknown';
}

export default function Sync() {
  const outlet = useOutletContext() || {};
  const lang = outlet.lang || 'en';
  const navigate = useNavigate();

  const t = useCallback(
    (key, vars) => fmtSync(key, lang, vars),
    [lang],
  );

  const rowT = useCallback(
    (key, vars) => {
      const fromSync = syncDict[lang]?.[key] || syncDict.en[key];
      if (fromSync) return fmtSync(key, lang, vars);
      return key;
    },
    [lang],
  );

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  const [url, setUrl] = useState('');
  const [preview, setPreview] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [progress, setProgress] = useState(null);
  const [selectedIndices, setSelectedIndices] = useState(() => new Set());
  const [addToLibrary, setAddToLibrary] = useState(true);
  const [createPlaylist, setCreatePlaylist] = useState(true);
  const [downloadFlac, setDownloadFlac] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const platform = getSyncPlatform(selectedPlatform);
  const isLoggedIn = Boolean(getAccessToken());

  useEffect(() => {
    const detected = detectPlatformFromUrl(url);
    if (detected && detected !== selectedPlatform) {
      setSelectedPlatform(detected);
    }
  }, [url, selectedPlatform]);

  useEffect(() => {
    if (preview?.source_title && !playlistName) {
      setPlaylistName(preview.source_title);
    }
  }, [preview?.source_title, playlistName]);

  const flowStep = useMemo(() => {
    if (importResult) return 'import';
    if (preview) return 'preview';
    if (url.trim()) return 'link';
    return 'source';
  }, [importResult, preview, url]);

  const resetPreview = () => {
    setPreview(null);
    setTaskId(null);
    setProgress(null);
    setSelectedIndices(new Set());
    setImportResult(null);
    setError(null);
  };

  const runPreview = async () => {
    const trimmed = url.trim();
    if (!selectedPlatform || !isTransferUrl(trimmed, selectedPlatform)) {
      setError(t('syncInvalidUrl'));
      return;
    }
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoadingPreview(true);
    setError(null);
    setImportResult(null);
    setPreview(null);
    setProgress(null);
    try {
      const result = await previewTransfer(trimmed, lang, {
        signal: ac.signal,
        onProgress: setProgress,
      });
      setPreview(result);
      setTaskId(result.task_id || null);
      const all = new Set((result.tracks || []).map((_, i) => i));
      setSelectedIndices(all);
    } catch (e) {
      if (e?.code === 'aborted') return;
      setError(e?.message || t('syncPreviewFailed'));
    } finally {
      setLoadingPreview(false);
      setProgress(null);
    }
  };

  const toggleIndex = (index) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  };

  const runImport = async () => {
    if (!isLoggedIn) {
      showToast(t('syncLoginRequired'));
      navigate('/account');
      return;
    }
    if (!preview?.tracks?.length || selectedIndices.size === 0) return;
    setImporting(true);
    setError(null);
    try {
      const selectedList = [...selectedIndices].sort((a, b) => a - b);
      const result = await importTransfer(
        {
          url: url.trim(),
          taskId,
          addToLibrary,
          createPlaylist,
          playlistName: playlistName.trim() || preview.source_title || undefined,
          downloadFlac,
          quality: 'LOSSLESS',
          selectedIndices: selectedList,
        },
        lang,
      );
      setImportResult(result);
      dispatchLibraryTransferDone();
      showToast(
        t('syncImportDone', {
          added: result.added_to_library,
          skipped: result.already_in_library,
          total: result.total_tracks,
        }),
      );
    } catch (e) {
      setError(e?.message || t('syncFailed'));
    } finally {
      setImporting(false);
    }
  };

  const previewTracks = preview?.tracks || [];
  const showMany = previewTracks.length > MAX_PREVIEW_ROWS;
  const visibleTracks = showMany ? previewTracks.slice(0, MAX_PREVIEW_ROWS) : previewTracks;
  const unmatched = preview?.unmatched_entries || [];

  return (
    <div className="sync-page page-container">
      <motion.header className="sync-page__header" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <h1>
          {t('syncTitle')}{' '}
          <span className="text-gradient">{t('syncTitleBold')}</span>
        </h1>
        <p style={{ color: 'var(--text-secondary)', marginTop: 8 }}>{t('syncSubtitle')}</p>
      </motion.header>

      <ConnectedAccountsPanel lang={lang} />

      <div className="sync-page__layout">
        <section className="sync-page__sources">
          <h2 className="sync-page__step-title">{t('syncStep1')}</h2>
          <div className="sync-platform-grid">
            {SYNC_PLATFORMS.map((p) => {
              const active = selectedPlatform === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`sync-platform-card${active ? ' sync-platform-card--active' : ''}`}
                  style={{ '--platform-color': p.color }}
                  onClick={() => {
                    setSelectedPlatform(p.id);
                    resetPreview();
                  }}
                  data-testid={`sync-platform-${p.id}`}
                >
                  <span className="sync-platform-card__main">
                    <PlatformIcon id={p.id} size={32} />
                    <span className="sync-platform-card__name">{p.name}</span>
                  </span>
                  {active ? <CheckCircle2 className="sync-platform-card__check" size={22} /> : null}
                </button>
              );
            })}
          </div>
          <p className="sync-page__footnote">{t('syncFootnote')}</p>
        </section>

        <section className="sync-page__panel-wrap">
          <h2 className="sync-page__step-title">{t('syncStep2')}</h2>

          <div className="sync-flow" aria-label={t('syncFlowLabel')}>
            {['link', 'preview', 'import'].map((step) => (
              <span
                key={step}
                className={[
                  'sync-flow__step',
                  flowStep === step ? 'sync-flow__step--active' : '',
                  (step === 'link' && url.trim())
                  || (step === 'preview' && preview)
                  || (step === 'import' && importResult)
                    ? 'sync-flow__step--done'
                    : '',
                ].filter(Boolean).join(' ')}
              >
                <span className="sync-flow__num">
                  {step === 'link' ? '1' : step === 'preview' ? '2' : '3'}
                </span>
                {t(step === 'link' ? 'syncFlowLink' : step === 'preview' ? 'syncFlowPreview' : 'syncFlowImport')}
              </span>
            ))}
          </div>

          <div className="sync-panel glass-panel">
            {!selectedPlatform ? (
              <div className="sync-panel__empty">
                <Repeat size={44} style={{ opacity: 0.45 }} />
                <p>{t('syncSelectFirst')}</p>
              </div>
            ) : (
              <>
                {platform && (
                  <p className="sync-panel__platform-label">
                    {t('syncSelectedPlatform', { name: platform.name })}
                  </p>
                )}

                <div className="sync-panel__hint">
                  <AlertCircle size={18} />
                  <span>{t('syncHint')}</span>
                </div>

                <label className="sync-panel__label" htmlFor="sync-url-input">
                  {t('syncPlaylistLink')}
                </label>
                <input
                  id="sync-url-input"
                  type="url"
                  className="sync-panel__input"
                  placeholder={placeholderForPlatform(selectedPlatform)}
                  value={url}
                  onChange={(e) => {
                    setUrl(e.target.value);
                    if (preview) resetPreview();
                  }}
                  data-testid="sync-url-input"
                />

                <div className="sync-panel__actions-row">
                  <button
                    type="button"
                    className="btn-secondary sync-panel__preview-cta"
                    onClick={runPreview}
                    disabled={loadingPreview || !url.trim()}
                    data-testid="sync-preview-btn"
                  >
                    <Eye size={18} />
                    {preview ? t('syncPreviewAgain') : t('syncPreview')}
                  </button>
                </div>

                {!preview && !loadingPreview && (
                  <p className="sync-panel__next-hint">{t('syncPreviewFirst')}</p>
                )}

                {loadingPreview && (
                  <SyncProgressPanel t={rowT} progress={progress} />
                )}

                {error && (
                  <p className="sync-panel__status" style={{ color: 'var(--danger)' }} role="alert">
                    {error}
                  </p>
                )}

                {preview && !loadingPreview && (
                  <div className="sync-preview" data-testid="sync-preview">
                    <div className="sync-preview__head">
                      <ListMusic size={22} />
                      <div>
                        <div className="sync-preview__title">
                          {preview.source_title || t('syncUntitledSource')}
                        </div>
                        <div className="sync-preview__meta">
                          {t('syncPreviewMeta', {
                            kind: preview.source_kind || 'playlist',
                            matched: preview.total ?? previewTracks.length,
                            source: preview.source_total ?? previewTracks.length,
                          })}
                        </div>
                        {preview.unmatched_count > 0 && (
                          <div className="sync-preview__warn">
                            {t('syncUnmatched', { n: preview.unmatched_count })}
                          </div>
                        )}
                        {preview.skipped_unavailable > 0 && (
                          <div className="sync-preview__warn">
                            {t('syncSkippedUnavailable', { n: preview.skipped_unavailable })}
                          </div>
                        )}
                      </div>
                    </div>

                    {showMany && (
                      <p className="sync-preview__many">
                        {t('syncManyTracks', { n: previewTracks.length })}
                      </p>
                    )}

                    <div className="sync-preview__list">
                      {visibleTracks.map((track, index) => {
                        const selected = selectedIndices.has(index);
                        const dur = track.duration_s
                          ? formatDurationSeconds(track.duration_s)
                          : null;
                        const cover = coverImgSrc(track.cover_url);
                        return (
                          <label
                            key={`${track.provider_id}-${index}`}
                            className={`sync-preview__item sync-preview__item--selectable glass-panel${selected ? ' is-selected' : ''}`}
                            data-testid="sync-preview-row"
                          >
                            <input
                              type="checkbox"
                              className="sync-preview__check"
                              checked={selected}
                              onChange={() => toggleIndex(index)}
                            />
                            {cover ? (
                              <img src={cover} alt="" className="sync-preview__cover" loading="lazy" />
                            ) : (
                              <div className="sync-preview__cover sync-preview__cover--empty">
                                <Music2 size={20} />
                              </div>
                            )}
                            <div className="sync-preview__item-main">
                              <div className="sync-preview__track-title">{track.title}</div>
                              <div className="sync-preview__track-artist">
                                {artistLine(track)}
                                {dur ? ` · ${dur}` : ''}
                              </div>
                            </div>
                            <MatchConfidenceBadge score={track.match_score} />
                          </label>
                        );
                      })}
                    </div>

                    {unmatched.length > 0 && (
                      <>
                        <h3 className="sync-preview__warn" style={{ marginTop: 16 }}>
                          {t('syncSkippedList')}
                        </h3>
                        <div className="sync-preview__list">
                          {unmatched.map((row, i) => (
                            <div
                              key={`${row.source_title}-${i}`}
                              className="sync-preview__item sync-preview__item--unmatched glass-panel"
                              data-testid="sync-skipped-row"
                            >
                              <div className="sync-preview__cover sync-preview__cover--unknown">
                                <span>?</span>
                              </div>
                              <div className="sync-preview__item-main">
                                <div className="sync-preview__track-title">{row.source_title}</div>
                                <div className="sync-preview__track-artist">
                                  {artistLine({ artists: row.source_artists })}
                                </div>
                              </div>
                              <span className="sync-match sync-match--unknown">—</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    <div className="sync-panel__options">
                      <label className="sync-option">
                        <input
                          type="checkbox"
                          checked={addToLibrary}
                          onChange={(e) => setAddToLibrary(e.target.checked)}
                        />
                        <Heart size={16} />
                        <span>{t('syncOptLibrary')}</span>
                      </label>
                      <label className="sync-option">
                        <input
                          type="checkbox"
                          checked={createPlaylist}
                          onChange={(e) => setCreatePlaylist(e.target.checked)}
                        />
                        <ListMusic size={16} />
                        <span>{t('syncOptPlaylist')}</span>
                      </label>
                      {createPlaylist && (
                        <input
                          type="text"
                          className="sync-panel__input sync-panel__input--nested"
                          placeholder={t('syncPlaylistName')}
                          value={playlistName}
                          onChange={(e) => setPlaylistName(e.target.value)}
                        />
                      )}
                      <label className="sync-option">
                        <input
                          type="checkbox"
                          checked={downloadFlac}
                          onChange={(e) => setDownloadFlac(e.target.checked)}
                        />
                        <span>{t('syncOptDownload')}</span>
                      </label>
                    </div>

                    {!isLoggedIn && (
                      <p className="sync-panel__login-hint">{t('syncLoginRequired')}</p>
                    )}

                    <button
                      type="button"
                      className="btn-primary sync-panel__cta sync-panel__cta--import"
                      onClick={runImport}
                      disabled={importing || selectedIndices.size === 0}
                      data-testid="sync-import-btn"
                    >
                      {importing ? t('syncImporting') : t('syncStart')}
                    </button>

                    {importResult && (
                      <div className="sync-result">
                        <CheckCircle2 size={20} />
                        <p>
                          {t('syncImportDone', {
                            added: importResult.added_to_library,
                            skipped: importResult.already_in_library,
                            total: importResult.total_tracks,
                          })}
                        </p>
                        <div className="sync-result__links">
                          <Link to="/library">{t('syncOpenLibrary')}</Link>
                          <Link to="/playlists">{t('syncOpenPlaylists')}</Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
