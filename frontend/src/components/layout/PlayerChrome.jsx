import { memo } from 'react';
import { usePlayer, usePlayerPlayback } from '../../store/usePlayerStore';
import GlobalAudio from '../player/GlobalAudio';
import PlayerOverlays from '../player/PlayerOverlays';
import PlayerBar from '../PlayerBar';
import HotkeyHint from '../HotkeyHint';
import DownloadToast from '../DownloadToast';
import CommandPalette from '../CommandPalette';
import GlobalSetEmbed from '../player/GlobalSetEmbed';

/** Player UI that updates on progress ticks — isolated from AppShell. */
function PlayerChrome({ playbackEnabled = true }) {
  const {
    t,
    lang,
    overlays,
    transport,
    likedTracks,
    toggleLike,
    handleDownload,
    setLibraryRevision,
    effectivePlan,
    shuffleEnabled,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    embedUrl,
    pauseSetEmbed,
    embedPlaying,
    embedEngaged,
    embedTitle,
    toggleSetEmbed,
    setAudioMode,
    setAudioProgress,
    setAudioDuration,
    seekSetAudioPreview,
    seekSetAudioCommit,
  } = usePlayer();

  const {
    currentTrack,
    playlist,
    currentTrackIndex,
    progress,
    getMainAudioEl,
    attachSlotA,
    attachSlotB,
    mainOnSlotA,
    audioRef,
    currentAudioSrc,
    preloadAudioSrc,
    setIsPlaying,
    setIsLoading,
    setProgress,
    restorePendingSeek,
    runFadeIn,
    fadeInPendingRef,
    pendingPlayRef,
    pendingSeekRef,
    skipEndedRef,
    crossfadingRef,
    volume,
    handleStreamError,
    deliveredStream,
    isLoading,
    isPlaying,
    trackDuration,
    playbackQuality,
    streamQuality,
    availableQualities,
    probeData,
    qualitiesReady,
    maxTrackQuality,
    changeQuality,
    setVolume,
    deferPlayUntilReady,
  } = usePlayerPlayback();

  return (
    <>
      {playbackEnabled && (
      <GlobalAudio
        attachSlotA={attachSlotA}
        attachSlotB={attachSlotB}
        mainOnSlotA={mainOnSlotA}
        audioRef={audioRef}
        currentAudioSrc={currentAudioSrc}
        currentTrackId={currentTrack?.provider_id}
        preloadAudioSrc={preloadAudioSrc}
        isPlaying={isPlaying}
        isLoading={isLoading}
        setIsPlaying={setIsPlaying}
        setIsLoading={setIsLoading}
        setProgress={setProgress}
        playNext={transport.playNext}
        restorePendingSeek={restorePendingSeek}
        runFadeIn={runFadeIn}
        fadeInPendingRef={fadeInPendingRef}
        pendingPlayRef={pendingPlayRef}
        pendingSeekRef={pendingSeekRef}
        skipEndedRef={skipEndedRef}
        crossfadingRef={crossfadingRef}
        volume={volume}
        handleStreamError={handleStreamError}
        deferPlayUntilReady={deferPlayUntilReady}
      />
      )}

      <GlobalSetEmbed />

      <PlayerBar
        t={t}
        lang={lang}
        embedUrl={embedUrl}
        embedPlaying={embedPlaying}
        embedEngaged={embedEngaged}
        embedTitle={embedTitle}
        toggleSetEmbed={toggleSetEmbed}
        setAudioMode={setAudioMode}
        setAudioProgress={setAudioProgress}
        setAudioDuration={setAudioDuration}
        seekSetAudioPreview={seekSetAudioPreview}
        seekSetAudioCommit={seekSetAudioCommit}
        currentTrack={currentTrack}
        deliveredStream={deliveredStream}
        isLoading={isLoading}
        isPlaying={isPlaying}
        progress={progress}
        trackDuration={trackDuration}
        volume={volume}
        playbackQuality={playbackQuality}
        streamQuality={streamQuality}
        effectivePlan={effectivePlan}
        availableQualities={availableQualities}
        probeData={probeData}
        qualitiesReady={qualitiesReady}
        maxTrackQuality={maxTrackQuality}
        likedTracks={likedTracks}
        isKaraokeOpen={overlays.isKaraokeOpen}
        isPartyOpen={overlays.isPartyOpen}
        isDJOpen={overlays.isDJOpen}
        isEQOpen={overlays.isEQOpen}
        isQueueOpen={overlays.isQueueOpen}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        togglePlay={transport.togglePlay}
        playPrevious={transport.playPrevious}
        playNext={transport.playNext}
        handleSeekPreview={transport.handleSeekPreview}
        handleSeekCommit={transport.handleSeekCommit}
        beginSeekScrub={transport.beginSeekScrub}
        changeQuality={changeQuality}
        toggleLike={toggleLike}
        setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
        handleDownloadPlayer={() => currentTrack && handleDownload(currentTrack, undefined, { fromPlayer: true })}
        toggleOverlay={overlays.toggleOverlay}
        setVolume={setVolume}
        nextTrack={transport.nextTrack}
        startTrackRadio={transport.startTrackRadio}
        shuffleEnabled={shuffleEnabled}
        repeatMode={repeatMode}
        toggleShuffle={toggleShuffle}
        cycleRepeat={cycleRepeat}
      />

      <PlayerOverlays
        isKaraokeOpen={overlays.isKaraokeOpen}
        isPartyOpen={overlays.isPartyOpen}
        isDJOpen={overlays.isDJOpen}
        isQueueOpen={overlays.isQueueOpen}
        isEQOpen={overlays.isEQOpen}
        isLyricsOpen={overlays.isLyricsOpen}
        isPlaylistModalOpenPlayer={overlays.isPlaylistModalOpenPlayer}
        closeKaraoke={overlays.closeKaraoke}
        closeParty={overlays.closeParty}
        setIsDJOpen={overlays.setIsDJOpen}
        setIsQueueOpen={overlays.setIsQueueOpen}
        setIsEQOpen={overlays.setIsEQOpen}
        setIsLyricsOpen={overlays.setIsLyricsOpen}
        setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
        currentTrack={currentTrack}
        audioRef={audioRef}
        getMainAudioEl={getMainAudioEl}
        progress={progress}
        playlist={playlist}
        currentTrackIndex={currentTrackIndex}
        handleReorderQueue={transport.handleReorderQueue}
        togglePlay={transport.togglePlay}
        isPlaying={isPlaying}
        isLoading={isLoading}
        playNext={transport.playNext}
        toggleLike={toggleLike}
        likedTracks={likedTracks}
        setLibraryRevision={setLibraryRevision}
        lang={lang}
      />

      <HotkeyHint lang={lang} hidden={!currentTrack} />
      <DownloadToast lang={lang} />
      <CommandPalette
        isOpen={overlays.isCommandPaletteOpen}
        onClose={() => overlays.setIsCommandPaletteOpen(false)}
        lang={lang}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onTogglePlay={() => {
          if (embedEngaged) {
            toggleSetEmbed?.();
            return;
          }
          if (!currentTrack) return;
          if (isPlaying) audioRef.current?.pause();
          else {
            pauseSetEmbed?.();
            audioRef.current?.play();
          }
        }}
        onToggleQueue={() => overlays.toggleOverlay('queue')}
        onToggleLyrics={() => overlays.toggleOverlay('lyrics')}
        onToggleEq={() => overlays.toggleOverlay('eq')}
        onToggleDj={() => overlays.toggleOverlay('dj')}
        onToggleKaraoke={() => overlays.toggleOverlay('karaoke')}
        onPlayTrack={transport.togglePlay}
        shuffleEnabled={shuffleEnabled}
        repeatMode={repeatMode}
        onToggleShuffle={toggleShuffle}
        onCycleRepeat={cycleRepeat}
      />
    </>
  );
}

export default memo(PlayerChrome);

