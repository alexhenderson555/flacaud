import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Disc3, FastForward, Rewind, Sliders, Music2 } from 'lucide-react';
import { analyzeTrackFeatures, getCachedTrackFeatures } from '../utils/trackFeatures';

export default function DJMode({ currentTrack, audioRef, onClose }) {
  const [playbackRate, setPlaybackRate] = useState(audioRef.current?.playbackRate || 1);
  const [preservePitch, setPreservePitch] = useState(audioRef.current?.preservesPitch ?? true);
  const [mockBpm, setMockBpm] = useState(null);
  const [mockKey, setMockKey] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= 768,
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    if (!currentTrack) return;

    const cached = getCachedTrackFeatures(currentTrack);
    if (cached) {
      if (Number.isFinite(cached.bpm)) setMockBpm(cached.bpm);
      if (cached.musicalKey) setMockKey(cached.musicalKey);
      return;
    }

    const streamUrl = audioRef.current?.src;
    if (!streamUrl) return;

    let cancelled = false;
    setAnalyzing(true);
    analyzeTrackFeatures(currentTrack, streamUrl)
      .then(({ bpm, musicalKey }) => {
        if (cancelled) return;
        // Analysis can fail to detect tempo (undecodable stream / no clear beat);
        // keep the value null so the UI shows "—" instead of "NaN".
        setMockBpm(Number.isFinite(bpm) ? bpm : null);
        setMockKey(musicalKey || null);
      })
      .finally(() => {
        if (!cancelled) setAnalyzing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrack, audioRef]);

  const handleRateChange = (e) => {
    const val = parseFloat(e.target.value);
    setPlaybackRate(val);
    if (audioRef.current) {
      audioRef.current.playbackRate = val;
    }
  };

  const stepRate = (delta) => {
    let val = playbackRate + delta;
    val = Math.max(0.5, Math.min(1.5, val));
    setPlaybackRate(val);
    if (audioRef.current) {
      audioRef.current.playbackRate = val;
    }
  };

  const togglePreservePitch = () => {
    const newVal = !preservePitch;
    setPreservePitch(newVal);
    if (audioRef.current) {
      audioRef.current.preservesPitch = newVal;
    }
  };

  const resetSpeed = () => {
    setPlaybackRate(1);
    if (audioRef.current) {
      audioRef.current.playbackRate = 1;
    }
  };

  const getShiftedKey = (baseKey, rate, preserve) => {
    if (!baseKey || typeof baseKey !== 'string') return baseKey;
    if (preserve || rate === 1) return baseKey;
    const semitones = Math.round(Math.log2(rate) * 12);
    if (semitones === 0) return baseKey;
    const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const isMinor = baseKey.toLowerCase().endsWith('m') || baseKey.toLowerCase().endsWith('min');
    let notePart = baseKey;
    if (isMinor) notePart = baseKey.replace(/min/i, '').replace(/m/i, '');
    const idx = notes.indexOf(notePart);
    if (idx === -1) return baseKey;
    let newIdx = (idx + semitones) % 12;
    if (newIdx < 0) newIdx += 12;
    return notes[newIdx] + (isMinor ? 'm' : '');
  };

  const effectiveBpm = Number.isFinite(mockBpm) ? Math.round(mockBpm * playbackRate) : null;
  const effectiveKey = mockKey ? getShiftedKey(mockKey, playbackRate, preservePitch) : null;

  return (
    <motion.div
      initial={{ opacity: 0, x: 400 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 400 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        // Full-screen sheet on mobile; right-side panel on desktop. The fixed
        // 400px / bottom:90px panel left the expanded player and its drag handle
        // showing through, so on a phone it read as a floating mid-screen band.
        bottom: isMobile ? 0 : '90px',
        left: isMobile ? 0 : 'auto',
        width: isMobile ? 'auto' : '400px',
        background: 'rgba(5, 5, 8, 0.98)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border-subtle)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        padding: isMobile ? '20px' : '32px',
        overflowY: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', color: 'var(--accent-solid)' }}>
          <Disc3 size={28} />
          <h2 style={{ margin: 0, fontSize: '1.5rem' }}>DJ Tools</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ display: 'flex', gap: '20px', marginBottom: '40px' }}>
        <div className="glass-panel" style={{ flex: 1, padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(37, 117, 252, 0.1)', border: '1px solid var(--accent-solid)' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>BPM</span>
          <span style={{ fontSize: '2.5rem', fontWeight: 800, color: 'white' }}>{analyzing ? '…' : (effectiveBpm ?? '—')}</span>
          {playbackRate !== 1 && !analyzing && Number.isFinite(mockBpm) && <span style={{ fontSize: '0.8rem', color: 'var(--accent-solid)' }}>Original: {mockBpm}</span>}
        </div>

        <div className="glass-panel" style={{ flex: 1, padding: '20px', borderRadius: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Key</span>
          <span style={{ fontSize: 'clamp(1.3rem, 6vw, 2.5rem)', fontWeight: 800, color: 'white', whiteSpace: 'nowrap' }}>{analyzing ? '…' : (effectiveKey ?? '—')}</span>
          <span style={{ fontSize: '0.8rem', color: !preservePitch && playbackRate !== 1 ? 'var(--warning)' : 'var(--text-muted)' }}>
            {!preservePitch && playbackRate !== 1 && mockKey ? `Original: ${mockKey}` : 'Locked'}
          </span>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sliders size={20} color="var(--accent-solid)" /> Tempo / Pitch
          </h3>
          <button type="button" onClick={resetSpeed} style={{ fontSize: '0.85rem', color: 'var(--accent-solid)', background: 'transparent', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Reset</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', color: 'var(--text-primary)', fontWeight: 600, fontSize: '1.5rem' }}>
            <button type="button" onClick={() => stepRate(-0.01)} style={{ display: 'flex', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Rewind size={20} />
            </button>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{playbackRate.toFixed(2)}x</span>
            <button type="button" onClick={() => stepRate(0.01)} style={{ display: 'flex', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <FastForward size={20} />
            </button>
          </div>

          <input
            type="range"
            min="0.5"
            max="1.5"
            step="0.01"
            value={playbackRate}
            onChange={handleRateChange}
            style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--accent-solid)' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-subtle)', paddingTop: '20px' }}>
          <div>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: 'white' }}>
              <Music2 size={18} color="var(--accent-solid)" /> Vinyl Mode
            </h4>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Changing speed alters the pitch</p>
          </div>
          <button
            type="button"
            onClick={togglePreservePitch}
            style={{ background: !preservePitch ? 'var(--accent-solid)' : 'var(--bg-surface-hover)', color: 'white', border: 'none', padding: '6px 16px', borderRadius: '16px', cursor: 'pointer', transition: 'all 0.2s ease', fontWeight: 600 }}
          >
            {!preservePitch ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      <div style={{ flex: 1 }} />
    </motion.div>
  );
}
