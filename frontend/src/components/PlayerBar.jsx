import { Fragment, useEffect, useRef, useState } from 'react';
import MetaBadge from './MetaBadge';
import { formatTrackYear, normalizeArtists } from '../utils/trackNormalize';
import {
  streamBadgeLabel,
  qualityButtonLabel,
  isQualityAllowedForPlan,
  isPlaybackQualityAvailable,
  isTidalCatalogOnlyLossless,
  qualityUnavailableTooltip,
  resolvePlayerUiQuality,
} from '../utils/qualityPrefs';
import { appDict } from '../locales/appDict';
import { coverImgSrc } from '../utils/coverUrl';
import { apiGetJson } from '../utils/apiClient';
import { usePlayerStore } from '../store/usePlayerStore';
import { useArtistCardStore } from '../store/useArtistCardStore';
import { resolveArtistId } from '../utils/resolveArtist';
import {
  Play, Pause, SkipBack, SkipForward, Heart, Plus, Download, Mic2, Disc3, Sliders,
  ListMusic, Volume2, Waves, Radio, Shuffle, Repeat, Repeat1, ChevronUp, ChevronDown, Sparkles, Loader2,
} from 'lucide-react';
import { REPEAT_ALL, REPEAT_ONE } from '../utils/playbackModes';
import { PLAYER_HOTKEYS, withHotkey } from '../utils/playerHotkeys';
import { isTrackLiked } from '../utils/trackNormalize';
import { motion } from 'framer-motion';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { usePartyModeAvailable } from '../hooks/usePartyModeAvailable';
import PlayerMobileActions from './player/PlayerMobileActions';
import PlayerMarqueeTitle from './player/PlayerMarqueeTitle';

const QUALITY_OPTIONS = [
  { id: 'HIGH', label: '320k', color: 'rgba(255,255,255,0.4)', level: 1 },
  { id: 'LOSSLESS', label: 'Lossless', level: 2 },
];

export default function PlayerBar({
  t,
  lang = 'en',
  embedUrl = '',
  embedPlaying = false,
  embedEngaged = false,
  embedTitle = '',
  toggleSetEmbed,
  setAudioMode = false,
  setAudioProgress = 0,
  setAudioDuration = 0,
  seekSetAudioPreview,
  seekSetAudioCommit,
  currentTrack,
  deliveredStream,
  isLoading,
  isPlaying,
  progress,
  trackDuration,
  volume,
  playbackQuality,
  streamQuality = playbackQuality,
  effectivePlan = 'free',
  availableQualities = ['HIGH', 'LOSSLESS'],
  qualitiesReady = true,
  maxTrackQuality,
  probeData = null,
  likedTracks,
  isKaraokeOpen,
  isPartyOpen = false,
  isDJOpen,
  isEQOpen,
  isQueueOpen,
  playlist,
  nextTrack,
  togglePlay,
  playPrevious,
  playNext,
  handleSeekPreview,
  handleSeekCommit,
  beginSeekScrub,
  changeQuality,
  toggleLike,
  setIsPlaylistModalOpenPlayer,
  handleDownloadPlayer,
  toggleOverlay,
  setVolume,
  startTrackRadio,
  radioLoadingTrackId = null,
  shuffleEnabled = false,
  repeatMode = 'off',
  toggleShuffle,
  cycleRepeat,
}) {
  const isMobile = useMediaQuery('(max-width: 768px)');
  const partyModeAvailable = usePartyModeAvailable();
  const radioLoading = Boolean(
    currentTrack && radioLoadingTrackId === String(currentTrack.provider_id),
  );
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [coverFailed, setCoverFailed] = useState(false);
  const coverRefreshAttempted = useRef(false);
  const setCurrentTrack = usePlayerStore((s) => s.setCurrentTrack);
  const swipeRef = useRef({ startY: 0, active: false });
  const openArtistCard = useArtistCardStore((s) => s.openArtistCard);
  const [resolvingArtist, setResolvingArtist] = useState(null);

  const handlePlayerArtistClick = async (artistName, artistId) => {
    if (resolvingArtist) return;
    let id = artistId ? String(artistId) : null;
    if (!id) {
      setResolvingArtist(artistName);
      try {
        id = await resolveArtistId(artistName, lang);
      } catch {
        return;
      } finally {
        setResolvingArtist(null);
      }
    }
    if (id) openArtistCard(id, artistName);
  };

  const handlePlayerTouchStart = (e) => {
    if (!isMobile) return;
    if (e.target.closest('input, button, a, .player-seek-range, .player-volume-range')) return;
    swipeRef.current = { startY: e.touches[0].clientY, active: true };
  };

  const handlePlayerTouchEnd = (e) => {
    if (!isMobile || !swipeRef.current.active) return;
    swipeRef.current.active = false;
    const dy = e.changedTouches[0].clientY - swipeRef.current.startY;
    if (Math.abs(dy) < 48) return;
    if (dy < 0 && !mobileExpanded) setMobileExpanded(true);
    if (dy > 0 && mobileExpanded) setMobileExpanded(false);
  };

  useEffect(() => {
    setCoverFailed(false);
    coverRefreshAttempted.current = false;
  }, [currentTrack?.provider_id, currentTrack?.cover_url]);

  useEffect(() => {
    if (!isMobile) {
      setMobileExpanded(false);
      document.documentElement.classList.remove('player-mobile-expanded');
      return undefined;
    }
    document.documentElement.classList.toggle('player-mobile-expanded', mobileExpanded);
    return () => document.documentElement.classList.remove('player-mobile-expanded');
  }, [isMobile, mobileExpanded]);

  const handleCoverError = () => {
    setCoverFailed(true);
    if (coverRefreshAttempted.current || !currentTrack?.provider_id) return;
    coverRefreshAttempted.current = true;
    const provider = currentTrack.provider || 'tidal';
    apiGetJson(`/api/track/${provider}/${currentTrack.provider_id}`, { auth: true })
      .then((meta) => {
        if (!meta?.cover_url) return;
        setCoverFailed(false);
        coverRefreshAttempted.current = false;
        setCurrentTrack({ ...currentTrack, cover_url: meta.cover_url });
      })
      .catch(() => {});
  };

  useEffect(() => {
    if (!isMobile || !mobileExpanded) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setMobileExpanded(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isMobile, mobileExpanded]);

  const formatTime = (timeInSeconds) => {
    if (!timeInSeconds || Number.isNaN(timeInSeconds)) return '0:00';
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const seekPct = trackDuration
    ? `${(Math.min(progress, trackDuration) / trackDuration) * 100}%`
    : '0%';

  const mainPlayerClaimsBar = !!currentTrack;
  const setActive = !mainPlayerClaimsBar
    && embedEngaged && !!embedUrl && !!embedTitle
    && (embedPlaying || !isPlaying);
  const setSeekPct = setAudioDuration
    ? `${(Math.min(setAudioProgress, setAudioDuration) / setAudioDuration) * 100}%`
    : '0%';
  const liked = currentTrack && isTrackLiked(likedTracks, currentTrack);
  const showMini = isMobile && !mobileExpanded;
  const showFull = !isMobile || mobileExpanded;
  const setLabel = lang === 'ru' ? 'DJ-сет' : 'DJ set';
  const displayTitle = setActive
    ? embedTitle
    : (currentTrack ? currentTrack.title : t('readyToPlay'));
  const displayArtistTooltip = setActive
    ? setLabel
    : (currentTrack
      ? (() => {
        const names = normalizeArtists(currentTrack);
        return names.length ? names.join(', ') : 'Unknown Artist';
      })()
      : t('selectTrack'));
  const titleTooltip = (setActive && embedTitle) || currentTrack ? displayTitle : undefined;
  const artistTooltip = (setActive && embedTitle) || currentTrack ? displayArtistTooltip : undefined;
  const transportPlaySize = isMobile ? 34 : 42;
  const transportSkipSize = isMobile ? 18 : 22;
  const transportMinorSize = isMobile ? 16 : 20;

  const coverThumb = (size = 56) => (
    <div
      className="player-cover-thumb"
      style={{ width: size, height: size, minWidth: size, borderRadius: size <= 48 ? 8 : 12 }}
    >
      {setActive ? (
        <div className="player-cover-thumb__placeholder player-cover-thumb__placeholder--set">
          <Radio size={size <= 48 ? 20 : 24} color="var(--accent-solid)" />
        </div>
      ) : currentTrack?.cover_url && !coverFailed ? (
        <img
          src={coverImgSrc(currentTrack.cover_url)}
          alt=""
          decoding="async"
          onError={handleCoverError}
        />
      ) : (
        <div className="player-cover-thumb__placeholder">
          <Waves size={size <= 48 ? 20 : 24} color="var(--text-muted)" />
        </div>
      )}
    </div>
  );

  const artistNames = currentTrack ? normalizeArtists(currentTrack) : [];
  const artistLine = setActive ? setLabel : currentTrack ? (
    artistNames.length ? artistNames.map((artistName, i) => {
      const artistId = currentTrack.artist_ids?.[i];
      const isResolving = resolvingArtist === artistName;
      return (
        <Fragment key={i}>
          {i > 0 && ', '}
          <button
            type="button"
            className="player-artist-link"
            disabled={!!resolvingArtist}
            style={{ cursor: isResolving ? 'wait' : 'pointer', opacity: isResolving ? 0.7 : 1 }}
            onClick={() => { void handlePlayerArtistClick(artistName, artistId); }}
          >
            {artistName}
          </button>
        </Fragment>
      );
    }) : 'Unknown Artist'
  ) : t('selectTrack');

  const transportBtn = (size = 40) => {
    const playing = setActive ? embedPlaying : isPlaying;
    const canTransport = setActive || currentTrack;
    return (
      <button
        type="button"
        data-testid="player-transport-btn"
        aria-label={playing ? t('playerPause') : t('playerPlay')}
        disabled={!canTransport}
        onClick={(e) => {
          e.stopPropagation();
          if (setActive) toggleSetEmbed?.();
          else if (currentTrack) togglePlay(currentTrack, playlist?.length ? playlist : null);
        }}
        className="player-transport-btn"
        style={{ width: size, height: size }}
      >
        {!setActive && isLoading ? (
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
            className="player-transport-spinner"
            style={{ width: size * 0.45, height: size * 0.45 }}
          />
        ) : playing ? (
          <Pause size={size * 0.5} fill="currentColor" />
        ) : (
          <Play size={size * 0.5} fill="currentColor" style={{ marginLeft: 2 }} />
        )}
      </button>
    );
  };

  const miniSkipNextBtn = (size = 34) => (
    <button
      type="button"
      data-testid="player-mini-next"
      aria-label={t('playerNext')}
      disabled={setActive || !(playlist.length > 0 && currentTrack)}
      onClick={(e) => {
        e.stopPropagation();
        playNext();
      }}
      className="player-transport-btn player-transport-btn--ghost"
      style={{ width: size, height: size }}
    >
      <SkipForward size={18} />
    </button>
  );

  const handleMiniSeek = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (setActive || !trackDuration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const nextTime = ratio * trackDuration;
    handleSeekPreview(nextTime);
    handleSeekCommit(nextTime);
  };

  const qualityDict = appDict[lang] || appDict.en;

  const uiQualityId = resolvePlayerUiQuality({
    deliveredStream,
    streamQuality,
    playbackQuality,
    qualitiesReady,
    isLoading,
  });

  const activeQualityId = uiQualityId;

  const qualityPicker = (
    <div className="player-quality-picker">
      {QUALITY_OPTIONS.map((q) => {
        const planBlocked = !isQualityAllowedForPlan(q.id, effectivePlan);
        const trackBlocked = qualitiesReady && !isPlaybackQualityAvailable(
          q.id,
          availableQualities,
          maxTrackQuality,
          effectivePlan,
          probeData,
        );
        const isDisabled = planBlocked || trackBlocked || !qualitiesReady;
        const tidalCatalogOnly = isTidalCatalogOnlyLossless(probeData);

        return (
          <button
            type="button"
            key={q.id}
            onClick={() => !isDisabled && changeQuality(q.id)}
            data-testid={`quality-${q.id}`}
            data-available={!isDisabled}
            data-tidal-catalog-only={tidalCatalogOnly && q.id === 'LOSSLESS' ? 'true' : undefined}
            disabled={isDisabled}
            className={`player-quality-option${activeQualityId === q.id ? ' is-active' : ''}`}
            style={{
              ...(q.color ? { '--q-color': q.color } : {}),
              opacity: isDisabled ? 0.35 : 1,
            }}
            title={
              !qualitiesReady
                ? (qualityDict.qualityChecking || (lang === 'ru' ? 'Проверка трека…' : 'Checking track…'))
                : isDisabled
                  ? qualityUnavailableTooltip(lang, {
                    planBlocked,
                    tidalCatalogOnly,
                    tier: q.id,
                    dict: qualityDict,
                  })
                  : (maxTrackQuality === q.id ? `${q.label} (max)` : q.label)
            }
          >
            {qualityButtonLabel(q.id, lang)}
          </button>
        );
      })}
    </div>
  );

  const mobileExpandedActions = !setActive && currentTrack && (
    <PlayerMobileActions
      lang={lang}
      t={t}
      currentTrack={currentTrack}
      liked={liked}
      toggleLike={toggleLike}
      setIsPlaylistModalOpenPlayer={setIsPlaylistModalOpenPlayer}
      startTrackRadio={startTrackRadio}
      radioLoadingTrackId={radioLoadingTrackId}
      handleDownloadPlayer={handleDownloadPlayer}
      toggleOverlay={toggleOverlay}
      isKaraokeOpen={isKaraokeOpen}
      isDJOpen={isDJOpen}
      isEQOpen={isEQOpen}
      isQueueOpen={isQueueOpen}
    />
  );

  const actionIcons = (
    <div className="player-action-icons">
      <Heart
        size={22}
        data-testid="player-like-btn"
        cursor={currentTrack ? 'pointer' : 'default'}
        fill={liked ? 'var(--accent-solid)' : 'none'}
        color={liked ? 'var(--accent-solid)' : 'var(--text-primary)'}
        onClick={(e) => { e.preventDefault(); toggleLike(currentTrack, e); }}
        style={{ transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }}
        title={withHotkey(
          liked ? 'Remove from Library' : 'Add to Library',
          PLAYER_HOTKEYS.like,
        )}
      />
      <Plus
        size={22}
        cursor={currentTrack ? 'pointer' : 'default'}
        onClick={() => currentTrack && setIsPlaylistModalOpenPlayer(true)}
        style={{ color: 'var(--player-text)', transition: 'all 0.2s', opacity: currentTrack ? 1 : 0.5 }}
        title="Add to Playlist"
      />
      <button
        type="button"
        className="player-overlay-btn"
        disabled={!currentTrack || Boolean(radioLoadingTrackId)}
        onClick={() => currentTrack && startTrackRadio(currentTrack)}
        title={withHotkey(
          radioLoading ? (t('trackRadioStarting') || 'Starting radio…') : (t('startTrackRadio') || 'Start Track Radio'),
          PLAYER_HOTKEYS.trackRadio,
        )}
        aria-label={t('startTrackRadio') || 'Start Track Radio'}
      >
        {radioLoading ? <Loader2 size={22} className="spin" /> : <Radio size={22} />}
      </button>
      {currentTrack && (
        <Download
          size={22}
          cursor="pointer"
          title={`Download in ${playbackQuality}`}
          onClick={handleDownloadPlayer}
          style={{ color: 'var(--player-text)', transition: 'color 0.2s' }}
        />
      )}
      <button
        type="button"
        onClick={() => toggleOverlay('karaoke')}
        className="player-overlay-btn"
        data-active={isKaraokeOpen}
        title={withHotkey('Karaoke Mode', PLAYER_HOTKEYS.karaoke)}
      >
        <Mic2 size={22} />
      </button>
      {partyModeAvailable && (
        <button
          type="button"
          onClick={() => toggleOverlay('party')}
          className="player-overlay-btn player-overlay-btn--party"
          data-active={isPartyOpen}
          data-testid="player-party-btn"
          title={withHotkey(lang === 'ru' ? 'Party mode' : 'Party mode', PLAYER_HOTKEYS.party)}
        >
          <Sparkles size={22} />
        </button>
      )}
      <button
        type="button"
        onClick={() => toggleOverlay('dj')}
        className="player-overlay-btn"
        data-active={isDJOpen}
        title={withHotkey('DJ Tools', PLAYER_HOTKEYS.dj)}
      >
        <Disc3 size={22} />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay('eq')}
        className="player-overlay-btn"
        data-active={isEQOpen}
        title={withHotkey('Equalizer', PLAYER_HOTKEYS.eq)}
      >
        <Sliders size={22} />
      </button>
      <button
        type="button"
        onClick={() => toggleOverlay('queue')}
        className="player-overlay-btn"
        data-testid="player-queue-btn"
        data-active={isQueueOpen}
        title={withHotkey('Queue', PLAYER_HOTKEYS.queue)}
      >
        <ListMusic size={22} />
      </button>
    </div>
  );

  const seekRow = setActive ? (
    setAudioMode ? (
      <div className="player-seek-row">
        <span className="player-time">{formatTime(setAudioProgress)}</span>
        <input
          type="range"
          className="player-seek-range"
          min={0}
          max={setAudioDuration || 0}
          step={0.1}
          value={setAudioDuration ? Math.min(setAudioProgress, setAudioDuration) : 0}
          disabled={!setAudioDuration}
          aria-label={t('playerSeek')}
          data-testid="player-set-seek-slider"
          style={{ '--seek-pct': setSeekPct }}
          onInput={(e) => seekSetAudioPreview?.(parseFloat(e.target.value))}
          onChange={(e) => seekSetAudioCommit?.(parseFloat(e.target.value))}
        />
        <span className="player-time player-time--end">{formatTime(setAudioDuration)}</span>
      </div>
    ) : null
  ) : (
    <div className="player-seek-row">
      <span className="player-time">{formatTime(progress)}</span>
      <input
        type="range"
        className="player-seek-range"
        min={0}
        max={trackDuration || 0}
        step={0.1}
        value={trackDuration ? Math.min(progress, trackDuration) : 0}
        disabled={!trackDuration || isLoading}
        aria-label={t('playerSeek')}
        data-testid="player-seek-slider"
        style={{ '--seek-pct': seekPct }}
        onPointerDown={beginSeekScrub}
        onInput={(e) => handleSeekPreview(parseFloat(e.target.value))}
        onChange={(e) => handleSeekCommit(parseFloat(e.target.value))}
      />
      <span className="player-time player-time--end">{formatTime(trackDuration)}</span>
    </div>
  );

  const transportRow = (
    <div className="player-transport-row">
      {!setActive && (
        <button
          type="button"
          data-testid="player-shuffle"
          aria-label={t('playerShuffle')}
          aria-pressed={shuffleEnabled}
          onClick={toggleShuffle}
          className="player-transport-icon"
          data-active={shuffleEnabled}
        >
          <Shuffle size={transportMinorSize} />
        </button>
      )}
      <button
        type="button"
        aria-label={t('playerPrevious')}
        disabled={setActive || !currentTrack}
        onClick={playPrevious}
        className="player-transport-icon"
      >
        <SkipBack size={transportSkipSize} />
      </button>
      {transportBtn(transportPlaySize)}
      <button
        type="button"
        aria-label={t('playerNext')}
        disabled={setActive || !(playlist.length > 0 && currentTrack)}
        onClick={playNext}
        className="player-transport-icon"
      >
        <SkipForward size={transportSkipSize} />
      </button>
      {!setActive && (
        <button
          type="button"
          data-testid="player-repeat"
          aria-label={
            repeatMode === REPEAT_ONE
              ? t('playerRepeatOne')
              : repeatMode === REPEAT_ALL
                ? t('playerRepeatAll')
                : t('playerRepeat')
          }
          aria-pressed={repeatMode !== 'off'}
          onClick={cycleRepeat}
          className="player-transport-icon"
          data-active={repeatMode !== 'off'}
        >
          {repeatMode === REPEAT_ONE ? <Repeat1 size={transportMinorSize} /> : <Repeat size={transportMinorSize} />}
        </button>
      )}
    </div>
  );

  return (
    <>
      {isMobile && mobileExpanded && (
        <button
          type="button"
          className="player-backdrop"
          aria-label={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
          onClick={() => setMobileExpanded(false)}
        />
      )}

      <div
        className={[
          'player-bar',
          'glass-panel',
          isMobile ? 'player-bar--mobile' : '',
          mobileExpanded ? 'player-bar--expanded' : '',
          setActive ? 'player-bar--set-mode' : '',
        ].filter(Boolean).join(' ')}
        data-testid="player-bar"
        data-set-mode={setActive ? 'true' : undefined}
        onTouchStart={handlePlayerTouchStart}
        onTouchEnd={handlePlayerTouchEnd}
      >
        {isMobile && (
          <button
            type="button"
            className="player-bar__progress-rail"
            style={{ '--seek-pct': seekPct }}
            aria-label={t('playerSeek')}
            data-testid="player-mini-seek"
            disabled={!trackDuration || setActive}
            onClick={handleMiniSeek}
            onPointerDown={(e) => e.stopPropagation()}
          />
        )}

        {showMini && (
          <div
            className="player-bar__mini"
            role="button"
            tabIndex={0}
            onClick={() => setMobileExpanded(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setMobileExpanded(true);
              }
            }}
          >
            {coverThumb(44)}
            <div className="player-bar__mini-meta">
              <div className="player-bar__mini-title" title={titleTooltip}>
                {displayTitle}
              </div>
              <div className="player-bar__mini-artist" title={artistTooltip}>{artistLine}</div>
            </div>
            <div className="player-bar__mini-transport">
              {miniSkipNextBtn(34)}
              {transportBtn(36)}
            </div>
            <button
              type="button"
              className="player-bar__expand-btn"
              aria-label={lang === 'ru' ? 'Развернуть плеер' : 'Expand player'}
              onClick={(e) => { e.stopPropagation(); setMobileExpanded(true); }}
            >
              <ChevronUp size={20} />
            </button>
          </div>
        )}

        {showFull && (
          <>
            {isMobile && (
              <button
                type="button"
                className="player-bar__swipe-hint"
                aria-hidden
                tabIndex={-1}
              />
            )}

            {isMobile && (
              <button
                type="button"
                className="player-bar__collapse-btn"
                aria-label={lang === 'ru' ? 'Свернуть плеер' : 'Collapse player'}
                onClick={() => setMobileExpanded(false)}
              >
                <ChevronDown size={22} />
              </button>
            )}

            <div className="player-left">
              {coverThumb(isMobile ? 48 : 48)}
              <div className="player-track-meta">
                <div className="player-track-title">
                  <PlayerMarqueeTitle
                    testId="player-track-title"
                    className="player-track-title__text"
                    title={titleTooltip}
                  >
                    {displayTitle}
                  </PlayerMarqueeTitle>
                </div>
                <div className="player-track-sub">
                  <div className="player-track-artist" title={artistTooltip}>{artistLine}</div>
                  {!setActive && currentTrack && (
                    <div className="player-track-badges">
                      {formatTrackYear(currentTrack) && (
                        <MetaBadge variant="muted">{formatTrackYear(currentTrack)}</MetaBadge>
                      )}
                      {playbackQuality && qualitiesReady && (
                        <MetaBadge
                          className={isMobile && !mobileExpanded ? 'hide-on-mobile' : undefined}
                          variant="solid"
                          title={
                            uiQualityId !== playbackQuality
                              ? `${streamBadgeLabel({ tier: playbackQuality }, playbackQuality)} → ${streamBadgeLabel(deliveredStream, uiQualityId)}`
                              : streamBadgeLabel(deliveredStream, uiQualityId)
                          }
                        >
                          {streamBadgeLabel(deliveredStream, uiQualityId)}
                        </MetaBadge>
                      )}
                    </div>
                  )}
                </div>
                {!setActive && nextTrack && !isMobile && (
                  <div
                    data-testid="player-up-next"
                    className="player-up-next"
                    title={`${nextTrack.title} — ${nextTrack.artists?.join(', ') || ''}`}
                  >
                    Up next: <span>{nextTrack.title}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="player-center">
              {transportRow}
              {seekRow}
              {isMobile && mobileExpanded && mobileExpandedActions}
            </div>

            {!setActive && <div className="player-quality-slot">{qualityPicker}</div>}

            <div className="player-right">
              {!setActive && (
                <div className="player-right__cluster">
                  {isMobile && mobileExpanded ? null : actionIcons}
                </div>
              )}
              <div className={`player-volume-row${isMobile && mobileExpanded ? ' player-volume-row--mobile' : ' hide-on-mobile'}`}>
                <Volume2 size={20} />
                <input
                  type="range"
                  className="player-volume-range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={volume}
                  style={{ '--volume-pct': `${Math.round(volume * 100)}%` }}
                  onInput={(e) => setVolume(parseFloat(e.target.value))}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  aria-label="Volume"
                  data-testid="volume-slider"
                />
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
