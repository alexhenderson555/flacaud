import { AnimatePresence } from 'framer-motion';
import { usePlayer } from '../../store/usePlayerStore';
import { normalizeTrack } from '../../utils/trackNormalize';
import { useArtistCardStore } from '../../store/useArtistCardStore';
import ArtistCardPanel from './ArtistCardPanel';

export default function ArtistCardHost() {
  const { lang, transport } = usePlayer();
  const artistId = useArtistCardStore((s) => s.artistId);

  const playTrack = (track, list) => {
    if (!track?.provider_id) return;
    const queue = (list || []).filter(Boolean);
    const normalized = normalizeTrack(track);
    if (!normalized) return;
    const play = transport?.playQueue || transport?.togglePlay;
    play?.(normalized, queue.length ? queue : [normalized]);
  };

  return (
    <AnimatePresence>
      {artistId ? (
        <ArtistCardPanel
          key={artistId}
          lang={lang}
          onPlayTrack={playTrack}
          onStartRadio={transport?.startArtistRadio}
          radioLoadingId={transport?.radioLoadingTrackId}
        />
      ) : null}
    </AnimatePresence>
  );
}
