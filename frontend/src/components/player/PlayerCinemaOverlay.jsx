import { useEffect, useState } from 'react';
import { Heart, Pause, Play, Shapes, SkipForward, X } from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';
import { sampleCoverTheme } from '../../utils/coverTheme';
import { isTrackLiked, normalizeArtists } from '../../utils/trackNormalize';
import '../../styles/cinema.css';

/**
 * Chrome-less now-playing overlay shown in cinema mode: cover + title + artists
 * (bottom-left) and pause / next controls (bottom-right), over the visualizer.
 * A soft, slowly-drifting glow tinted from the cover art adds ambient motion
 * beyond the bars. The container is click-through except the controls.
 */
export default function PlayerCinemaOverlay({
  currentTrack,
  isPlaying,
  onTogglePlay,
  onNext,
  onExit,
  likedTracks,
  onToggleLike,
  visualMode = 'bars',
  onCycleVisual,
  lang = 'en',
}) {
  const [accent, setAccent] = useState(null);
  const cover = currentTrack?.cover_url ? coverImgSrc(currentTrack.cover_url) : null;

  useEffect(() => {
    let cancelled = false;
    if (!cover) {
      setAccent(null);
      return undefined;
    }
    sampleCoverTheme(cover).then((a) => {
      if (!cancelled) setAccent(a?.solid || null);
    });
    return () => { cancelled = true; };
  }, [cover]);

  if (!currentTrack) return null;
  const artists = normalizeArtists(currentTrack).join(', ');
  const liked = isTrackLiked(likedTracks, currentTrack);
  const visualLabel = {
    bars: lang === 'ru' ? 'Бары' : 'Bars',
    radial: lang === 'ru' ? 'Радиальный' : 'Radial',
    wave: lang === 'ru' ? 'Волна' : 'Wave',
    orb: lang === 'ru' ? 'Сфера' : 'Orb',
  }[visualMode] || visualMode;

  return (
    <div
      className="cinema-overlay"
      data-testid="cinema-overlay"
      style={accent ? { '--cinema-accent': accent } : undefined}
    >
      <div className="cinema-overlay__glow" aria-hidden />

      <div className="cinema-overlay__info">
        {cover && <img className="cinema-overlay__cover" src={cover} alt="" />}
        <div className="cinema-overlay__meta">
          <div className="cinema-overlay__title">{currentTrack.title || ''}</div>
          {artists && <div className="cinema-overlay__artist">{artists}</div>}
        </div>
      </div>

      <div className="cinema-overlay__controls">
        {onCycleVisual && (
          <button
            type="button"
            className="cinema-overlay__btn cinema-overlay__btn--visual"
            onClick={onCycleVisual}
            aria-label={lang === 'ru' ? 'Сменить анимацию' : 'Change visual style'}
            title={`${lang === 'ru' ? 'Анимация' : 'Visual'}: ${visualLabel} · V`}
          >
            <Shapes size={22} />
          </button>
        )}
        {onToggleLike && (
          <button
            type="button"
            className={`cinema-overlay__btn${liked ? ' cinema-overlay__btn--liked' : ''}`}
            onClick={(e) => onToggleLike(e)}
            aria-pressed={liked}
            aria-label={liked
              ? (lang === 'ru' ? 'Убрать из любимых' : 'Unlike')
              : (lang === 'ru' ? 'В любимые' : 'Like')}
          >
            <Heart size={24} fill={liked ? 'currentColor' : 'none'} />
          </button>
        )}
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
