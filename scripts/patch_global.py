code = open('frontend/src/components/player/GlobalAudio.jsx', 'r', encoding='utf-8').read()

code += '''
    };
  }, [audioRef, pendingPlayRef, pendingSeekRef, currentAudioSrc, isPlaying, isLoading, crossfadingRef, setIsLoading, tryStartPlayback]);

  return (
    <>
      {attachSlotA && (
        <audio
          ref={mainOnSlotA ? audioRef : null}
          src={currentAudioSrc || ''}
          style={HIDDEN_AUDIO_STYLE}
          crossOrigin="anonymous"
          preload={PRELOAD_ENABLED ? 'auto' : 'none'}
          onError={(e) => handleStreamError(e.target.error)}
          onCanPlay={() => {
            if (holdUntilLosslessReady()) return;
            if (restorePendingSeek(mainOnSlotA ? audioRef : null)) return;
            tryStartPlayback();
          }}
          onTimeUpdate={() => setProgress(mainOnSlotA ? audioRef.current?.currentTime || 0 : 0)}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
            pendingPlayRef.current = false;
            runFadeIn();
          }}
          onWaiting={() => setIsLoading(true)}
          onEnded={() => {
            if (skipEndedRef.current) return;
            playNext();
          }}
        />
      )}
      {attachSlotB && (
        <audio
          ref={!mainOnSlotA ? audioRef : null}
          src={preloadAudioSrc || ''}
          style={HIDDEN_AUDIO_STYLE}
          crossOrigin="anonymous"
          preload={PRELOAD_ENABLED ? 'auto' : 'none'}
          onError={(e) => handleStreamError(e.target.error)}
          onCanPlay={() => {
            if (holdUntilLosslessReady()) return;
            if (restorePendingSeek(!mainOnSlotA ? audioRef : null)) return;
            tryStartPlayback();
          }}
          onTimeUpdate={() => setProgress(!mainOnSlotA ? audioRef.current?.currentTime || 0 : 0)}
          onPlaying={() => {
            setIsLoading(false);
            setIsPlaying(true);
            pendingPlayRef.current = false;
            runFadeIn();
          }}
          onWaiting={() => setIsLoading(true)}
          onEnded={() => {
            if (skipEndedRef.current) return;
            playNext();
          }}
        />
      )}
    </>
  );
}
'''
with open('frontend/src/components/player/GlobalAudio.jsx', 'w', encoding='utf-8') as f:
    f.write(code)
