import { AnimatePresence } from 'framer-motion';
import KaraokeMode from '../KaraokeMode';
import DJMode from '../DJMode';
import PlaybackQueue from '../PlaybackQueue';
import Equalizer from '../Equalizer';
import PlaylistModal from '../PlaylistModal';
import { dispatchLibraryReloadRequest } from '../../utils/libraryPatch';

export default function PlayerOverlays({
  isKaraokeOpen,
  isDJOpen,
  isQueueOpen,
  isEQOpen,
  isPlaylistModalOpenPlayer,
  currentTrack,
  audioRef,
  getMainAudioEl,
  progress,
  playlist,
  currentTrackIndex,
  handleReorderQueue,
  togglePlay,
  closeKaraoke,
  setIsDJOpen,
  setIsQueueOpen,
  setIsEQOpen,
  setIsPlaylistModalOpenPlayer,
  lang = 'en',
}) {
  return (
    <AnimatePresence>
      {isKaraokeOpen && (
        <KaraokeMode
          currentTrack={currentTrack}
          audioRef={audioRef}
          getMainAudioEl={getMainAudioEl}
          progress={progress}
          queueOpen={isQueueOpen}
          lang={lang}
          onClose={closeKaraoke}
        />
      )}

      {isDJOpen && (
        <DJMode currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsDJOpen(false)} />
      )}

      {isQueueOpen && (
        <PlaybackQueue
          playlist={playlist}
          currentTrack={currentTrack}
          currentTrackIndex={currentTrackIndex}
          setPlaylist={handleReorderQueue}
          togglePlay={togglePlay}
          onClose={() => setIsQueueOpen(false)}
          dockedWithKaraoke={isKaraokeOpen}
        />
      )}

      {isEQOpen && (
        <Equalizer audioCtx={window.audioCtx} audioRef={audioRef} onClose={() => setIsEQOpen(false)} />
      )}

      {isPlaylistModalOpenPlayer && (
        <PlaylistModal
          track={currentTrack}
          onClose={() => setIsPlaylistModalOpenPlayer(false)}
          onUpdated={() => dispatchLibraryReloadRequest()}
        />
      )}
    </AnimatePresence>
  );
}
