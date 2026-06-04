import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Mic2, Loader2 } from 'lucide-react';
import { fetchLyricsForTrack, getCachedLyrics, getActiveLyricIndex } from '../utils/lyrics';

export default function KaraokeMode({ currentTrack, audioRef, onClose }) {
  const containerRef = useRef(null);
  const [lyrics, setLyrics] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const activeIdxRef = useRef(0);

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
    if (lyrics.length === 0 || !audioRef?.current) return;

    let rafId;
    const update = () => {
      if (audioRef.current) {
        const newIdx = getActiveLyricIndex(lyrics, audioRef.current.currentTime);
        if (newIdx !== activeIdxRef.current) {
          activeIdxRef.current = newIdx;
          setActiveIndex(newIdx);
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [lyrics, audioRef]);

  useEffect(() => {
    if (containerRef.current) {
      const activeEl = containerRef.current.querySelector('.lyric-active');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeIndex]);

  return (
    <motion.div
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed',
        top: 0, left: 0, right: 0, bottom: '90px',
        background: 'rgba(5, 5, 8, 0.98)',
        zIndex: 15,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '60px 16px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={onClose}
        style={{ position: 'absolute', top: '40px', right: '40px', background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '48px', height: '48px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
      >
        <X size={24} />
      </button>

      <div style={{ position: 'absolute', top: '40px', left: '40px', display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--accent-solid)' }}>
        <Mic2 size={32} />
        <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Karaoke Mode</h2>
      </div>

      <div
        ref={containerRef}
        style={{
          flex: 1,
          width: '100%',
          maxWidth: '1400px',
          padding: '0 20px',
          overflowY: 'auto',
          scrollBehavior: 'smooth',
          display: 'flex',
          flexDirection: 'column',
          gap: '32px',
          paddingBottom: '200px',
          maskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)',
          WebkitMaskImage: 'linear-gradient(transparent, black 15%, black 85%, transparent)',
        }}
      >
        {isLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', color: 'var(--text-muted)' }}>
            <Loader2 className="spin" size={32} />
          </div>
        ) : (
          lyrics.map((line, idx) => (
            <div
              key={idx}
              className={idx === activeIndex ? 'lyric-active' : ''}
              style={{
                fontSize: idx === activeIndex ? 'clamp(1.5rem, 6vw, 2.5rem)' : 'clamp(1.2rem, 5vw, 2rem)',
                fontWeight: idx === activeIndex ? 800 : 600,
                color: idx === activeIndex ? 'white' : 'var(--text-muted)',
                textAlign: 'center',
                transition: 'all 0.3s ease',
                textShadow: idx === activeIndex ? '0 0 20px rgba(255,255,255,0.3)' : 'none',
                transform: idx === activeIndex ? 'scale(1.05)' : 'scale(1)',
              }}
            >
              {line.text}
            </div>
          ))
        )}
      </div>
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes spin { 100% { transform: rotate(360deg); } }
        .spin { animation: spin 2s linear infinite; }
      ` }} />
    </motion.div>
  );
}
