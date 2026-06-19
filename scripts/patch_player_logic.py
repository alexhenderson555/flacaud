import os
code = open('frontend/src/components/player/PlayerLogic.jsx', 'r', encoding='utf-8').read()

code += '''  ]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}>
      <GlobalAudio
        attachSlotA={true}
        attachSlotB={false}
        mainOnSlotA={true}
        audioRef={transport.audioRef}
        currentAudioSrc={transport.currentAudioSrc}
        currentTrackId={transport.currentTrackId}
        preloadAudioSrc={transport.preloadAudioSrc}
        isPlaying={isPlaying}
        isLoading={isLoading}
        setIsPlaying={transport.setIsPlaying}
        setIsLoading={transport.setIsLoading}
        setProgress={transport.setAudioProgress}
        playNext={transport.playNext}
        restorePendingSeek={transport.restorePendingSeek}
        runFadeIn={transport.runFadeIn}
        fadeInPendingRef={transport.fadeInPendingRef}
        pendingPlayRef={transport.pendingPlayRef}
        pendingSeekRef={transport.pendingSeekRef}
        skipEndedRef={transport.skipEndedRef}
        crossfadingRef={transport.crossfadingRef}
        volume={transport.volume}
        handleStreamError={transport.handleStreamError}
        deferPlayUntilReady={false}
      />
      
      {/* 
        Pass playerContext using the standard React Router Outlet.
        The layout AppShell and sub-pages pull from this outlet context.
      */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {children}
      </div>

      <PlayerOverlays
        isPlaylistModalOpenPlayer={overlays.isPlaylistModalOpenPlayer}
        setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
        isUpgradeModalOpenPlayer={overlays.isUpgradeModalOpenPlayer}
        setIsUpgradeModalOpenPlayer={overlays.setIsUpgradeModalOpenPlayer}
      />

      <PlayerBar
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isLoading={isLoading}
        progress={progress}
        duration={duration}
        volume={transport.volume}
        isMuted={transport.isMuted}
        playbackMode={playbackModes.currentMode}
        hasNext={hasNext}
        hasPrev={hasPrev}
        onPlayPause={transport.handlePlayPause}
        onSeek={transport.seekAudio}
        onNext={transport.playNext}
        onPrev={transport.playPrev}
        onVolumeChange={transport.handleVolumeChange}
        onToggleMute={transport.handleToggleMute}
        onToggleMode={playbackModes.cycleMode}
        setIsPlaylistModalOpenPlayer={overlays.setIsPlaylistModalOpenPlayer}
        handleDownloadPlayer={() => currentTrack && transport.handleDownload(currentTrack)}
      />
    </div>
  );
}
'''
with open('frontend/src/components/player/PlayerLogic.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
