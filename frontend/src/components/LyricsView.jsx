import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';

export default function LyricsView({ currentTrack, audioRef, onClose }) {
  const [lyrics, setLyrics] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeIdx, setActiveIdx] = useState(-1);
  const activeIdxRef = useRef(-1);
  const containerRef = useRef(null);

  useEffect(() => {
    const fetchLyrics = async () => {
      if (!currentTrack) return;
      setIsLoading(true);
      try {
        const query = encodeURIComponent(`${currentTrack.artists[0]} ${currentTrack.title}`);
        const res = await fetch(`/api/lyrics?q=${query}`);
        if (res.ok) {
          const data = await res.json();
          setLyrics(data.lyrics || []);
        } else {
          setLyrics([]);
        }
      } catch (err) {
        setLyrics([]);
      }
      setIsLoading(false);
    };
    fetchLyrics();
  }, [currentTrack]);

  // Sync with audio time
  useEffect(() => {
    if (lyrics.length === 0 || !audioRef?.current) return;
    
    let rafId;
    const update = () => {
      if (audioRef.current) {
        const ct = audioRef.current.currentTime;
        let newIdx = -1;
        for (let i = 0; i < lyrics.length; i++) {
          if (ct >= lyrics[i].time) {
            newIdx = i;
          } else {
            break;
          }
        }
        if (newIdx !== activeIdxRef.current) {
          activeIdxRef.current = newIdx;
          setActiveIdx(newIdx);
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafId);
  }, [lyrics, audioRef]);

  // Auto-scroll logic
  useEffect(() => {
    if (activeIdx >= 0 && containerRef.current) {
      const activeEl = containerRef.current.children[activeIdx];
      if (activeEl) {
        const containerCenter = containerRef.current.clientHeight / 2;
        const scrollTarget = activeEl.offsetTop - containerCenter + (activeEl.clientHeight / 2);
        containerRef.current.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    }
  }, [activeIdx]);

  return (
    <motion.div 
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
        flexDirection: 'column'
      }}
    >
      <button 
        onClick={onClose}
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
          zIndex: 10
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
            paddingBottom: '50vh',
            scrollBehavior: 'smooth'
          }}
          className="hide-scrollbar"
        >
          {isLoading ? (
            <div style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>Searching for lyrics...</div>
          ) : lyrics.length === 0 ? (
            <div style={{ fontSize: '2rem', color: 'var(--text-muted)' }}>No synced lyrics found</div>
          ) : (
            lyrics.map((line, idx) => {
              const isActive = activeIdx === idx;
              return (
                <div 
                  key={idx} 
                  style={{
                    fontSize: isActive ? 'clamp(2rem, 8vw, 3.5rem)' : 'clamp(1.5rem, 6vw, 2.5rem)',
                    fontWeight: 700,
                    color: isActive ? 'white' : 'var(--text-muted)',
                    opacity: isActive ? 1 : 0.5,
                    marginBottom: '32px',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    textShadow: isActive ? '0 0 40px rgba(255,255,255,0.2)' : 'none',
                    lineHeight: 1.2
                  }}
                >
                  {line.text}
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
}
