import { Pause, Play, SkipForward, X } from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';
import { normalizeArtists } from '../../utils/trackNormalize';
import '../../styles/cinema.css';

/**
 * Chrome-less now-playing overlay shown in cinema mode: cover + title + artists
 * (bottom-left) and pause / next controls (bottom-right), over the visualizer.
 * The container is click-through except the controls so the view stays clean.
 */
export default function PlayerCinemaOverlay({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onExit,
  lang = 'en',
}) {
  if (!currentTrack) return null;
  const artists = normalizeArtists(currentTrack).join(', ');
  const cover = currentTrack.cover_url ? coverImgSrc(currentTrack.cover_url) : null;

  return (
    <div className="cinema-overlay" data-testid="cinema-overlay">
      <div className="cinema-overlay__info">
        {cover && <img className="cinema-overlay__cover" src={cover} alt="" />}
        <div className="cinema-overlay__meta">
          <div className="cinema-overlay__title">{currentTrack.title || ''}</div>
          {artists && <div className="cinema-overlay__artist">{artists}</div>}
        </div>
      </div>

      <div className="cinema-overlay__controls">
        <button
          type="button"
          className="cinema-overlay__btn"
          onClick={onTogglePlay}
          aria-label={isPlaying ? (lang === 'ru' ? 'Пауза' : 'Pause') : (lang === 'ru' ? 'Играть' : 'Play')}
        >
          {isPlaying ? <Pause size={26} /> : <Play size={26} />}
        </button>
        <button
          type="button"
          className="cinema-overlay__btn"
          onClick={onNext}
          aria-label={lang === 'ru' ? 'Следующий' : 'Next'}
        >
          <SkipForward size={24} />
        </button>
      </div>

      <button
        type="button"
        className="cinema-overlay__exit"
        onClick={onExit}
        aria-label={lang === 'ru' ? 'Выйти' : 'Exit'}
        title={lang === 'ru' ? 'Выйти (Esc или C)' : 'Exit (Esc or C)'}
      >
        <X size={20} />
      </button>
    </div>
  );
}
