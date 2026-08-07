import { createPortal } from 'react-dom';
import { PictureInPicture2 } from 'lucide-react';
import { usePipWindow } from '../../hooks/usePipWindow';
import PipPlayerContent from './PipPlayerContent';
import { withHotkey } from '../../utils/playerHotkeys';

/** Toggle button + the floating window itself. Not rendered at all when the
 * browser lacks Document Picture-in-Picture support (Chrome/Edge 116+ only --
 * no Firefox/Safari) rather than showing a button that would just fail. */
export default function PipMiniPlayer({
  currentTrack, isPlaying, isLoading, togglePlay, playPrevious, playNext,
  progress, trackDuration, beginSeekScrub, handleSeekPreview, handleSeekCommit,
  startTrackRadio, radioLoadingTrackId, nextTrack, lang = 'en',
}) {
  const { pipWindow, isSupported, isOpen, openPip, closePip } = usePipWindow({ width: 360, height: 224 });

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
          nextTrack={nextTrack}
          lang={lang}
        />,
        pipWindow.document.body,
      )}
    </>
  );
}
