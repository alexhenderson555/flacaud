import { lazy, Suspense } from 'react';
import { AnimatePresence } from 'framer-motion';
import KaraokeMode from '../KaraokeMode';
import DJMode from '../DJMode';

const PartyMode = lazy(() => import('../party/PartyMode'));
import PlaybackQueue from '../PlaybackQueue';
import Equalizer from '../Equalizer';
import LyricsView from '../LyricsView';
import PlaylistModal from '../PlaylistModal';
import { dispatchLibraryReloadRequest } from '../../utils/libraryPatch';

export default function PlayerOverlays({
  isKaraokeOpen,
  isPartyOpen,
  isDJOpen,
  isQueueOpen,
  isEQOpen,
  isLyricsOpen,
  isPlaylistModalOpenPlayer,
  currentTrack,
  audioRef,
  getMainAudioEl,
  progress,
  playlist,
  currentTrackIndex,
  handleReorderQueue,
  togglePlay,
  playNext,
  isPlaying,
  isLoading,
  toggleLike,
  likedTracks,
  closeKaraoke,
  closeParty,
  setIsDJOpen,
  setIsQueueOpen,
  setIsEQOpen,
  setIsLyricsOpen,
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

      {isPartyOpen && currentTrack && (
        <Suspense fallback={null}>
          <PartyMode
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            isLoading={isLoading}
            togglePlay={togglePlay}
            playNext={playNext}
            toggleLike={toggleLike}
            likedTracks={likedTracks}
            audioRef={audioRef}
            onClose={closeParty}
            lang={lang}
          />
        </Suspense>
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

      {isLyricsOpen && currentTrack && (
        <LyricsView currentTrack={currentTrack} audioRef={audioRef} onClose={() => setIsLyricsOpen(false)} />
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
