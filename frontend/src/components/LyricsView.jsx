import { useState, useEffect, useRef, useMemo } from 'react';
import { appDict } from '../locales/appDict';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import {
  fetchLyricsForTrack,
  getCachedLyrics,
  invalidateLyricsEmptyCache,
} from '../utils/lyrics';
import { useLyricsActiveIndex } from '../hooks/useLyricsActiveIndex';

export default function LyricsView({
  currentTrack,
  audioRef,
  getMainAudioEl,
  progress = 0,
  onClose,
  lang = 'en',
}) {
  const t = useMemo(() => (k) => appDict[lang]?.[k] || appDict.en[k] || k, [lang]);
  const [lyrics, setLyrics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef(null);
  const activeIdx = useLyricsActiveIndex(lyrics, { getMainAudioEl, audioRef, progress });

  useEffect(() => {
    if (!currentTrack) return;

    const cached = getCachedLyrics(currentTrack);
    if (cached !== null && cached.length > 0) {
      setLyrics(cached);
      setIsLoading(false);
      return;
    }
    if (cached !== null && cached.length === 0) {
      invalidateLyricsEmptyCache(currentTrack);
    }

    let cancelled = false;
    setIsLoading(true);
    fetchLyricsForTrack(currentTrack)
      .then((lines) => {
        if (!cancelled) setLyrics(lines);
      })
      .catch(() => {
        if (!cancelled) setLyrics([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack]);

  useEffect(() => {
    if (activeIdx >= 0 && containerRef.current) {
      const activeEl = containerRef.current.children[activeIdx];
      if (activeEl) {
        const container = containerRef.current;
        const pad = 56;
        let scrollTarget;
        if (activeIdx <= 1) {
          scrollTarget = Math.max(0, activeEl.offsetTop - pad);
        } else {
          const containerCenter = container.clientHeight / 2;
          scrollTarget = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
        }
        container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
      }
    }
  }, [activeIdx]);

  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={t('lyricsPanelTitle')}
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: '90px',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(40px)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label={t('lyricsClose')}
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: 'white',
          borderRadius: '50%',
          width: '48px',
          height: '48px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          zIndex: 10,
        }}
      >
        <X size={24} />
      </button>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '60px 16px', overflow: 'hidden' }}>
        <div
          ref={containerRef}
          style={{
            flex: 1,
            width: '100%',
            maxWidth: '800px',
            overflowY: 'auto',
            textAlign: 'center',
            padding: '40vh 0',
            scrollBehavior: 'smooth',
          }}
          className="hide-scrollbar"
        >
          {isLoading ? (
            <div style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>{t('lyricsLoading')}</div>
          ) : lyrics.length === 0 ? (
            <div style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>{t('lyricsEmpty')}</div>
          ) : (
            lyrics.map((line, idx) => {
              const isActive = activeIdx === idx;
              return (
                <div
                  key={idx}
                  data-testid={isActive ? 'lyric-line-active' : `lyric-line-${idx}`}
                  style={{
                    marginBottom: '32px',
                    minHeight: 'clamp(2.8rem, 7vw, 4.2rem)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 12px',
                  }}
                >
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 'clamp(1.5rem, 5vw, 2.4rem)',
                      fontWeight: 700,
                      color: isActive ? 'white' : 'var(--text-muted)',
                      opacity: isActive ? 1 : 0.5,
                      transform: isActive ? 'scale(1.12)' : 'scale(1)',
                      transformOrigin: 'center center',
                      transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease, color 0.3s ease',
                      textShadow: isActive ? '0 0 40px rgba(255,255,255,0.2)' : 'none',
                      lineHeight: 1.25,
                      maxWidth: '100%',
                    }}
                  >
                    {line.text}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
