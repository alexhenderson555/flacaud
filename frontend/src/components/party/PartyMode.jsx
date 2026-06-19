import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Play, Pause, Heart, SkipForward, Sparkles, Circle, Waves, LayoutGrid, Aperture, Box,
} from 'lucide-react';
import { coverImgSrc } from '../../utils/coverUrl';
import PartyVisualizer, { MODES } from './PartyVisualizer';

const MODE_META = {
  bars: { icon: Waves, labelEn: 'Bars', labelRu: 'Столбики' },
  orb: { icon: Circle, labelEn: 'Orb', labelRu: 'Сфера' },
  particles: { icon: Sparkles, labelEn: 'Particles', labelRu: 'Частицы' },
  landscape: { icon: Waves, labelEn: 'Landscape', labelRu: 'Ландшафт' },
  gridbars: { icon: LayoutGrid, labelEn: 'Grid Bars', labelRu: 'Сетка' },
  spiral: { icon: Aperture, labelEn: 'Spiral Wave', labelRu: 'Спираль' },
  bouncing: { icon: Box, labelEn: 'Bouncing Cubes', labelRu: 'Кубы' },
};

export default function PartyMode({
  currentTrack,
  isPlaying,
  isLoading,
  togglePlay,
  playNext,
  toggleLike,
  likedTracks,
  audioRef,
  onClose,
  lang = 'en',
  creatorMode = false,
}) {
  const [mode, setMode] = useState('orb');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [uiVisible, setUiVisible] = useState(true);
  const uiTimeoutRef = useRef(null);

  const liked = currentTrack && likedTracks?.has?.(String(currentTrack.provider_id));

  useEffect(() => {
    document.documentElement.classList.add('party-mode-open');
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
    
    const resetUiTimer = () => {
      setUiVisible(true);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      uiTimeoutRef.current = setTimeout(() => {
        setUiVisible(false);
        setPickerOpen(false);
      }, 3000);
    };

    resetUiTimer();

    window.addEventListener('pointermove', resetUiTimer);
    window.addEventListener('click', resetUiTimer);

    return () => {
      document.documentElement.classList.remove('party-mode-open');
      window.removeEventListener('pointermove', resetUiTimer);
      window.removeEventListener('click', resetUiTimer);
      if (uiTimeoutRef.current) clearTimeout(uiTimeoutRef.current);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    };
  }, []);

  if (!currentTrack) return null;

  const artists = currentTrack.artists?.join(', ') || (lang === 'ru' ? 'Неизвестный артист' : 'Unknown Artist');

  return (
    <motion.div
      className={`party-mode${creatorMode ? ' party-mode--creator' : ''}`}
      style={{ backgroundColor: '#050508' }} // Solid background
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      data-testid="party-mode"
    >
      <div
        className="party-mode__bg"
        style={{ 
          backgroundImage: currentTrack.cover_url ? `url(${coverImgSrc(currentTrack.cover_url)})` : undefined,
          opacity: 0.15,
          filter: 'blur(60px)'
        }}
        aria-hidden
      />
      <PartyVisualizer audioRef={audioRef} isPlaying={isPlaying} mode={mode} />

      <AnimatePresence>
        {uiVisible && !creatorMode && (
          <motion.header 
            className="party-mode__top"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ zIndex: 10 }}
          >
            <button type="button" className="party-mode__icon-btn" onClick={() => setPickerOpen((v) => !v)} aria-label="Visual style">
              <Sparkles size={18} />
            </button>
            <button type="button" className="party-mode__icon-btn party-mode__icon-btn--close" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          </motion.header>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {pickerOpen && !creatorMode && uiVisible && (
          <motion.div 
            className="party-mode__picker" 
            role="listbox" 
            aria-label="Visualization"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{ zIndex: 10 }}
          >
            {MODES.map((id) => {
              const Meta = MODE_META[id];
              const Icon = Meta.icon;
              return (
                <button
                  key={id}
                  type="button"
                  role="option"
                  aria-selected={mode === id}
                  className={`party-mode__picker-item${mode === id ? ' party-mode__picker-item--on' : ''}`}
                  onClick={() => { setMode(id); setPickerOpen(false); }}
                >
                  <span className={`party-mode__picker-preview party-mode__picker-preview--${id}`}>
                    <Icon size={20} aria-hidden />
                  </span>
                  <span>{lang === 'ru' ? Meta.labelRu : Meta.labelEn}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {uiVisible && (
          <motion.footer 
            className="party-mode__hud glass-panel"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            style={{ zIndex: 10 }}
          >
            {currentTrack.cover_url && (
              <img src={coverImgSrc(currentTrack.cover_url)} alt="" className="party-mode__cover" />
            )}
            <div className="party-mode__meta">
              <strong>{currentTrack.title}</strong>
              <span>{artists}</span>
            </div>
            {!creatorMode && (
              <div className="party-mode__controls">
                <button type="button" className="party-mode__ctrl" onClick={() => togglePlay(currentTrack)} aria-label={isPlaying ? 'Pause' : 'Play'}>
                  {isPlaying || isLoading ? <Pause size={22} /> : <Play size={22} />}
                </button>
                {!creatorMode && (
                  <button
                    type="button"
                    className={`party-mode__ctrl${liked ? ' party-mode__ctrl--liked' : ''}`}
                    onClick={() => toggleLike?.(currentTrack)}
                    aria-label="Like"
                  >
                    <Heart size={20} fill={liked ? 'currentColor' : 'none'} />
                  </button>
                )}
                <button type="button" className="party-mode__ctrl" onClick={playNext} aria-label="Next">
                  <SkipForward size={20} />
                </button>
              </div>
            )}
          </motion.footer>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
