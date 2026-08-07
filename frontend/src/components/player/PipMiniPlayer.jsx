import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PictureInPicture2 } from 'lucide-react';
import { usePipWindow } from '../../hooks/usePipWindow';
import PipPlayerContent from './PipPlayerContent';
import { withHotkey, PLAYER_HOTKEYS } from '../../utils/playerHotkeys';

/** Toggle button + the floating window itself. Not rendered at all when the
 * browser lacks Document Picture-in-Picture support (Chrome/Edge 116+ only --
 * no Firefox/Safari) rather than showing a button that would just fail. */
export default function PipMiniPlayer({
  currentTrack, isPlaying, isLoading, togglePlay, playPrevious, playNext,
  progress, trackDuration, beginSeekScrub, handleSeekPreview, handleSeekCommit,
  startTrackRadio, radioLoadingTrackId, playlist, likedTracks, toggleLike, lang = 'en',
}) {
  // The window is natively user-resizable (it's a real browser window) --
  // this default (per user-picked "optimal size" screenshot) fits
  // cover/title/seek/transport AND a couple of queue rows with no wasted
  // space; dragging it taller reveals more of the queue list.
  const { pipWindow, isSupported, isOpen, openPip, closePip } = usePipWindow({ width: 350, height: 310 });

  useEffect(() => {
    if (!isSupported) return undefined;
    const handleToggle = () => (isOpen ? closePip() : openPip());
    window.addEventListener('flacaud:toggle-pip', handleToggle);
    return () => window.removeEventListener('flacaud:toggle-pip', handleToggle);
  }, [isSupported, isOpen, openPip, closePip]);

  if (!isSupported) return null;

  return (
    <>
      <button
        type="button"
        className="player-overlay-btn"
        data-active={isOpen}
        data-testid="player-pip-btn"
        onClick={() => (isOpen ? closePip() : openPip())}
        title={withHotkey(
          lang === 'ru' ? 'Мини-плеер поверх окон' : 'Mini player (always on top)',
          PLAYER_HOTKEYS.pip,
        )}
        aria-label={lang === 'ru' ? 'Мини-плеер' : 'Mini player'}
      >
        <PictureInPicture2 size={22} />
      </button>
      {isOpen && pipWindow && createPortal(
        <PipPlayerContent
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          isLoading={isLoading}
          togglePlay={togglePlay}
          playPrevious={playPrevious}
          playNext={playNext}
          progress={progress}
          trackDuration={trackDuration}
          beginSeekScrub={beginSeekScrub}
          handleSeekPreview={handleSeekPreview}
          handleSeekCommit={handleSeekCommit}
          startTrackRadio={startTrackRadio}
          radioLoadingTrackId={radioLoadingTrackId}
          playlist={playlist}
          likedTracks={likedTracks}
          toggleLike={toggleLike}
          lang={lang}
        />,
        pipWindow.document.body,
      )}
    </>
  );
}
