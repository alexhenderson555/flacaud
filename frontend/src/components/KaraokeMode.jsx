import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Mic2, Loader2 } from 'lucide-react';
import { fetchLyricsForTrack, getCachedLyrics } from '../utils/lyrics';
import { useLyricsActiveIndex } from '../hooks/useLyricsActiveIndex';

export default function KaraokeMode({
  currentTrack,
  audioRef,
  getMainAudioEl,
  progress = 0,
  onClose,
  lang = 'en',
  queueOpen = false,
}) {
  const containerRef = useRef(null);
  const rootRef = useRef(null);
  const [lyrics, setLyrics] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const activeIndex = useLyricsActiveIndex(lyrics, { getMainAudioEl, audioRef, progress });
  // Plain lyrics (no timestamps) have no active line — light every line instead
  // of dimming all-but-the-last.
  const synced = lyrics.some((l) => Number(l?.time) > 0);

  useEffect(() => {
    if (!currentTrack) return;

    const cached = getCachedLyrics(currentTrack);
    if (cached !== null) {
      setLyrics(cached.length > 0 ? cached : [{ time: 0, text: 'Instrumental / Lyrics not found' }]);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    fetchLyricsForTrack(currentTrack)
      .then((lines) => {
        if (cancelled) return;
        if (lines.length > 0) {
          setLyrics(lines);
        } else {
          setLyrics([{ time: 0, text: 'Instrumental / Lyrics not found' }]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics([{ time: 0, text: 'Failed to load lyrics.' }]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || activeIndex < 0) return;
    const activeEl = container.querySelector('.karaoke-mode__line--active');
    if (!activeEl) return;
    const lineTop = activeEl.offsetTop;
    const lineH = activeEl.offsetHeight;
    const viewH = container.clientHeight;
    const targetTop = lineTop - (viewH - lineH) / 2;
    container.scrollTo({
      top: Math.max(0, targetTop),
      behavior: 'smooth',
    });
  }, [activeIndex]);

  useEffect(() => {
    let enteredFullscreen = false;
    document.documentElement.classList.add('karaoke-mode-open');
    const el = rootRef.current || document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) {
      void el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
        enteredFullscreen = true;
      }).catch(() => {});
    }
    return () => {
      document.documentElement.classList.remove('karaoke-mode-open');
      if (enteredFullscreen && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  const title = lang === 'ru' ? 'Караоке' : 'Karaoke';

  return (
    <motion.div
      ref={rootRef}
      className={`karaoke-mode${queueOpen ? ' karaoke-mode--queue-open' : ''}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <header className="karaoke-mode__header">
        <div className="karaoke-mode__brand">
          <Mic2 size={22} aria-hidden />
          <span>{title}</span>
          {currentTrack?.title ? (
            <span className="karaoke-mode__now">
              {currentTrack.title}
              {currentTrack.artists?.length ? ` — ${currentTrack.artists.join(', ')}` : ''}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          className="karaoke-mode__close"
          onClick={onClose}
          aria-label={lang === 'ru' ? 'Закрыть караоке' : 'Close karaoke'}
        >
          <X size={22} />
        </button>
      </header>

      <div ref={containerRef} className="karaoke-mode__lyrics">
        {isLoading ? (
          <div className="karaoke-mode__loading">
            <Loader2 className="spin" size={32} />
          </div>
        ) : (
          <div className="karaoke-mode__lyrics-track">
            {lyrics.map((line, idx) => {
              const isActive = synced ? idx === activeIndex : true;
              const isPast = synced ? idx < activeIndex : false;
              return (
                <motion.div
                  key={`${line.time}-${idx}`}
                  className={`karaoke-mode__line${isActive ? ' karaoke-mode__line--active' : ''}${isPast ? ' karaoke-mode__line--past' : ''}`}
                  animate={{
                    opacity: synced ? (isActive ? 1 : isPast ? 0.34 : 0.58) : 1,
                  }}
                  transition={{ duration: 0.55, ease: [0.4, 0, 0.2, 1] }}
                >
                  <span className="karaoke-mode__text">{line.text}</span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}
