import { AnimatePresence } from 'framer-motion';
import KaraokeMode from '../KaraokeMode';
import DJMode from '../DJMode';
import PlaybackQueue from '../PlaybackQueue';
import Equalizer from '../Equalizer';
import LyricsView from '../LyricsView';
import PlaylistModal from '../PlaylistModal';

export default function PlayerOverlays({
  isKaraokeOpen,
  isDJOpen,
  isQueueOpen,
  isEQOpen,
  isLyricsOpen,
  isPlaylistModalOpenPlayer,
  currentTrack,
  audioRef,
  playlist,
  currentTrackIndex,
  handleReorderQueue,
  togglePlay,
  setIsKaraokeOpen,
  setIsDJOpen,
  setIsQueueOpen,
  setIsEQOpen,
  setIsLyricsOpen,
  setIsPlaylistModalOpenPlayer,
  setLibraryRevision,
}) {
  return (
    <AnimatePresence>
      {isKaraokeOpen && (
        <KaraokeMode currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsKaraokeOpen(false)} />
      )}
      {isDJOpen && (
        <DJMode currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsDJOpen(false)} />
      )}
      {isQueueOpen && (
        <PlaybackQueue
          playlist={playlist}
          currentTrackIndex={currentTrackIndex}
          setPlaylist={handleReorderQueue}
          togglePlay={togglePlay}
          onClose={() => setIsQueueOpen(false)}
        />
      )}
      {isEQOpen && (
        <Equalizer audioCtx={window.audioCtx} audioRef={audioRef} onClose={() => setIsEQOpen(false)} />
      )}
      {isLyricsOpen && currentTrack && (
        <LyricsView currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsLyricsOpen(false)} />
      )}
      {isPlaylistModalOpenPlayer && (
        <PlaylistModal
          track={currentTrack}
          onClose={() => setIsPlaylistModalOpenPlayer(false)}
          onUpdated={() => setLibraryRevision((r) => r + 1)}
        />
      )}
    </AnimatePresence>
  );
}
