import { showToast } from '../../utils/toast';

export default function GlobalAudio({
  audioRef,
  preloadAudioRef,
  currentAudioSrc,
  preloadAudioSrc,
  setIsPlaying,
  setIsLoading,
  playNext,
  restorePendingSeek,
  runFadeIn,
  fadeInPendingRef,
  pendingPlayRef,
  pendingSeekRef,
  skipEndedRef,
  volume,
  handleStreamError,
  t,
}) {
  return (
    <>
      <audio
        ref={audioRef}
        crossOrigin="anonymous"
        src={currentAudioSrc}
        onPlay={() => {
          setIsPlaying(true);
          setIsLoading(false);
        }}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (skipEndedRef.current) {
            skipEndedRef.current = false;
            return;
          }
          setIsPlaying(false);
          playNext();
        }}
        onWaiting={() => setIsLoading(true)}
        onCanPlay={() => {
          setIsLoading(false);
          restorePendingSeek();
          if (fadeInPendingRef.current) {
            runFadeIn();
          } else if (audioRef.current) {
            audioRef.current.volume = volume;
          }
          if (pendingPlayRef.current && audioRef.current && pendingSeekRef.current == null) {
            pendingPlayRef.current = false;
            audioRef.current.play().catch((e) => {
              if (e.name !== 'AbortError') {
                showToast(t('failedToStream'));
                setIsPlaying(false);
                setIsLoading(false);
              }
            });
          }
        }}
        onLoadedMetadata={() => restorePendingSeek()}
        onError={() => {
          pendingPlayRef.current = false;
          handleStreamError();
        }}
      />
      <audio ref={preloadAudioRef} preload="auto" src={preloadAudioSrc} style={{ display: 'none' }} />
    </>
  );
}
