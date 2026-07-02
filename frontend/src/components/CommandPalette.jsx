import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  Search, Heart, User, Download, Radio, Sparkles,
  ListMusic, Mic2, Sliders, Disc, ListOrdered, Play, Pause, Wand2, Scissors, History,
  Shuffle, Repeat, Repeat1, FileText, Shield, Library,
} from 'lucide-react';
import { REPEAT_ALL, REPEAT_ONE } from '../utils/playbackModes';
import { readRecentlyPlayed } from '../utils/recentlyPlayed';
import { PLAYER_HOTKEYS, withHotkey } from '../utils/playerHotkeys';

const NAV = [
  { id: 'nav-search', title: 'Search & Shazam', keywords: 'find music', icon: Search, path: '/search' },
  { id: 'nav-library', title: 'My Library', keywords: 'liked saved', icon: Heart, path: '/library' },
  { id: 'nav-recs', title: 'Recommendations', keywords: 'discover for you', icon: Sparkles, path: '/recommendations' },
  { id: 'nav-genreverse', title: 'Genreverse', keywords: 'genre radio vibes stations', icon: Radio, path: '/genreverse' },
  { id: 'nav-radio', title: 'Track Radio', keywords: 'similar track station', icon: Radio, path: '/search' },
  { id: 'nav-analyzer', title: 'Set Analyzer', keywords: 'dj mix youtube', icon: Wand2, path: '/analyzer' },
  { id: 'nav-sets', title: 'Set Library', keywords: 'dj sets mix library saved', icon: Library, path: '/sets' },
  { id: 'nav-stems', title: 'Stem Splitter', keywords: 'vocals isolate', icon: Scissors, path: '/splitter' },
  { id: 'nav-sync', title: 'Transfer Music', keywords: 'import playlist', icon: Download, path: '/sync' },
  { id: 'nav-account', title: 'Account Settings', keywords: 'profile quality theme', icon: User, path: '/account' },
  { id: 'nav-terms', title: 'Terms of Use', keywords: 'legal terms conditions', icon: FileText, path: '/terms' },
  { id: 'nav-privacy', title: 'Privacy Policy', keywords: 'legal privacy data gdpr', icon: Shield, path: '/privacy' },
];

function buildCommands({
  lang,
  navigate,
  onClose,
  onToggleQueue,
  onToggleEq,
  onToggleDj,
  onToggleKaraoke,
  currentTrack,
  isPlaying,
  onTogglePlay,
  shuffleEnabled = false,
  repeatMode = 'off',
  onToggleShuffle,
  onCycleRepeat,
}) {
  const t = (en, ru) => (lang === 'ru' ? ru : en);
  const wrap = (fn) => () => { fn(); onClose(); };

  const playback = [];
  if (currentTrack) {
    playback.push({
      id: 'play-toggle',
      title: withHotkey(isPlaying ? t('Pause', 'Пауза') : t('Play', 'Воспроизвести'), PLAYER_HOTKEYS.playPause),
      subtitle: `${currentTrack.artists?.[0] || ''} — ${currentTrack.title}`,
      icon: isPlaying ? Pause : Play,
      action: wrap(onTogglePlay),
    });
  }

  const modes = [];
  if (onToggleShuffle) {
    modes.push({
      id: 'toggle-shuffle',
      title: shuffleEnabled ? t('Shuffle off', 'Выключить shuffle') : t('Shuffle on', 'Включить shuffle'),
      keywords: 's random',
      icon: Shuffle,
      action: wrap(onToggleShuffle),
    });
  }
  if (onCycleRepeat) {
    const repeatTitle = repeatMode === REPEAT_ONE
      ? t('Repeat: one', 'Повтор: один')
      : repeatMode === REPEAT_ALL
        ? t('Repeat: all', 'Повтор: всё')
        : t('Repeat: off', 'Повтор: выкл');
    modes.push({
      id: 'cycle-repeat',
      title: repeatTitle,
      keywords: 'r loop',
      icon: repeatMode === REPEAT_ONE ? Repeat1 : Repeat,
      action: wrap(onCycleRepeat),
    });
  }

  const panels = [
    ...modes,
    { id: 'toggle-queue', title: withHotkey(t('Toggle Queue', 'Очередь'), PLAYER_HOTKEYS.queue), keywords: 'q up next', icon: ListOrdered, action: wrap(onToggleQueue) },
    { id: 'toggle-karaoke', title: withHotkey(t('Toggle Karaoke', 'Караоке'), PLAYER_HOTKEYS.karaoke), keywords: 'k karaoke fullscreen lyrics', icon: Mic2, action: wrap(onToggleKaraoke) },
    { id: 'toggle-eq', title: withHotkey(t('Toggle Equalizer', 'Эквалайзер'), PLAYER_HOTKEYS.eq), keywords: 'e audio', icon: Sliders, action: wrap(onToggleEq) },
    { id: 'toggle-dj', title: withHotkey(t('Toggle DJ Tools', 'DJ-панель'), PLAYER_HOTKEYS.dj), keywords: 'd bpm key', icon: Disc, action: wrap(onToggleDj) },
  ];

  const nav = NAV.map((n) => ({
    id: n.id,
    title: n.title,
    keywords: n.keywords,
    icon: n.icon,
    action: wrap(() => navigate(n.path)),
  }));

  return { playback, panels, nav };
}

export default function CommandPalette({
  isOpen,
  onClose,
  lang = 'en',
  currentTrack,
  isPlaying = false,
  onTogglePlay,
  onToggleQueue,
  onToggleEq,
  onToggleDj,
  onToggleKaraoke,
  onPlayTrack,
  shuffleEnabled = false,
  repeatMode = 'off',
  onToggleShuffle,
  onCycleRepeat,
}) {
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 0);
      const saved = localStorage.getItem('tidal-library');
      if (saved) {
        try { setLibrary(JSON.parse(saved)); } catch { /* ignore */ }
      }
      setSelectedIdx(0);
    } else {
      setQuery('');
      setSelectedIdx(0);
    }
  }, [isOpen]);

  const commands = useMemo(
    () => buildCommands({
      lang,
      navigate,
      onClose,
      onToggleQueue,
      onToggleEq,
      onToggleDj,
      onToggleKaraoke,
      onPlayTrack,
      currentTrack,
      isPlaying,
      onTogglePlay: onTogglePlay || (() => {}),
      shuffleEnabled,
      repeatMode,
      onToggleShuffle,
      onCycleRepeat,
    }),
    [
      lang, navigate, onClose, onToggleQueue, onToggleEq,
      onToggleDj, onToggleKaraoke, onPlayTrack, currentTrack, isPlaying, onTogglePlay,
      shuffleEnabled, repeatMode, onToggleShuffle, onCycleRepeat,
    ],
  );

  const recentResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recentLabel = lang === 'ru' ? 'Недавно слушали' : 'Recently played';
    const list = readRecentlyPlayed();
    const filtered = q
      ? list.filter((t) => {
        const title = (t.title || '').toLowerCase();
        const artists = (t.artists || []).join(' ').toLowerCase();
        return title.includes(q) || artists.includes(q);
      })
      : list;
    return filtered.slice(0, q ? 8 : 6).map((t) => ({
      id: `recent-${t.provider_id}`,
      title: `${(t.artists || []).join(', ')} — ${t.title}`,
      subtitle: recentLabel,
      icon: History,
      action: () => {
        onPlayTrack?.(t, list);
        onClose();
      },
    }));
  }, [query, lang, onPlayTrack, onClose]);

  const libraryResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return library
      .filter((t) => {
        const title = (t.title || '').toLowerCase();
        const artists = (t.artists || []).join(' ').toLowerCase();
        return title.includes(q) || artists.includes(q);
      })
      .slice(0, 8)
      .map((t) => ({
        id: `lib-${t.provider_id}`,
        title: `${(t.artists || []).join(', ')} — ${t.title}`,
        subtitle: t.album || '',
        icon: ListMusic,
        action: () => {
          onPlayTrack?.(t, library);
          onClose();
        },
      }));
  }, [library, query, onPlayTrack, onClose]);

  const filteredNav = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.nav;
    return commands.nav.filter(
      (n) => n.title.toLowerCase().includes(q) || (n.keywords || '').includes(q),
    );
  }, [commands.nav, query]);

  const filteredPanels = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands.panels;
    return commands.panels.filter(
      (p) => p.title.toLowerCase().includes(q) || (p.keywords || '').includes(q),
    );
  }, [commands.panels, query]);

  const results = useMemo(() => {
    if (!query.trim()) {
      return [...commands.playback, ...recentResults, ...commands.panels, ...commands.nav];
    }
    return [...commands.playback, ...recentResults, ...filteredPanels, ...filteredNav, ...libraryResults];
  }, [query, commands, recentResults, filteredPanels, filteredNav, libraryResults]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query, results.length]);

  const runSelected = useCallback(() => {
    const item = results[selectedIdx];
    if (item?.action) item.action();
  }, [results, selectedIdx]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(results.length - 1, i + 1));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, results.length]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        data-testid="command-palette-overlay"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(8px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '10vh',
        }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: -16 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: -16 }}
          onClick={(e) => e.stopPropagation()}
          className="glass-panel"
          data-testid="command-palette"
          style={{
            width: '100%',
            maxWidth: '640px',
            borderRadius: '16px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 24px 48px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.12)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Search size={20} color="var(--text-muted)" />
            <input
              ref={inputRef}
              type="text"
              data-testid="command-palette-input"
              placeholder={lang === 'ru' ? 'Команда или поиск в медиатеке…' : 'Type a command or search library…'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '1.15rem',
                outline: 'none',
                padding: '0 14px',
                fontFamily: 'inherit',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.length > 0) {
                  e.preventDefault();
                  runSelected();
                }
              }}
            />
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.08)', padding: '4px 8px', borderRadius: '6px' }}>ESC</div>
          </div>

          <div style={{ maxHeight: '420px', overflowY: 'auto', padding: '8px' }}>
            {results.length > 0 ? (
              results.map((res, i) => {
                const Icon = res.icon;
                const selected = i === selectedIdx;
                return (
                  <div
                    key={res.id}
                    data-testid={`command-item-${res.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => res.action()}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') res.action(); }}
                    onMouseEnter={() => setSelectedIdx(i)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '11px 14px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      background: selected ? 'rgba(255,255,255,0.12)' : 'transparent',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{ color: selected ? 'var(--accent-solid)' : 'var(--text-muted)', display: 'flex' }}>
                      <Icon size={18} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{res.title}</div>
                      {res.subtitle && (
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {res.subtitle}
                        </div>
                      )}
                    </div>
                    {selected && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>↵</div>}
                  </div>
                );
              })
            ) : (
              <div style={{ padding: '36px', textAlign: 'center', color: 'var(--text-muted)' }}>
                {lang === 'ru' ? `Ничего не найдено: «${query}»` : `No results for "${query}"`}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
