import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Search, Music, Heart, Settings, User, Download, FileAudio } from 'lucide-react';

export default function CommandPalette({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [library, setLibrary] = useState([]);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      const saved = localStorage.getItem('tidal-library');
      if (saved) {
        try { setLibrary(JSON.parse(saved)); } catch (e) {}
      }
    } else {
      setQuery('');
    }
  }, [isOpen]);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const navigationOptions = [
    { id: 'nav-search', title: 'Search & Shazam', icon: <Search size={18} />, action: () => navigate('/search') },
    { id: 'nav-library', title: 'My Library', icon: <Heart size={18} />, action: () => navigate('/library') },
    { id: 'nav-account', title: 'Account Settings', icon: <User size={18} />, action: () => navigate('/account') },
    { id: 'nav-sync', title: 'Transfer Music', icon: <Download size={18} />, action: () => navigate('/sync') },
  ];

  const libraryResults = library
    .filter(t => t.title.toLowerCase().includes(query.toLowerCase()) || t.artists.some(a => a.toLowerCase().includes(query.toLowerCase())))
    .slice(0, 5)
    .map(t => ({
      id: `lib-${t.provider_id}`,
      title: `${t.artists.join(', ')} - ${t.title}`,
      icon: <Music size={18} />,
      action: () => {
        // Play track logic could go here, or navigate to track details
        // For now, just navigate to library
        navigate('/library');
      }
    }));

  const filteredNav = navigationOptions.filter(n => n.title.toLowerCase().includes(query.toLowerCase()));
  
  const results = query ? [...filteredNav, ...libraryResults] : navigationOptions;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(5px)',
          zIndex: 10000,
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '10vh'
        }}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          onClick={e => e.stopPropagation()}
          className="glass-panel"
          style={{
            width: '100%',
            maxWidth: '600px',
            borderRadius: '16px',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.1)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
            <Search size={20} color="var(--text-muted)" />
            <input
              ref={inputRef}
              type="text"
              placeholder="Type a command or search library..."
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                color: 'white',
                fontSize: '1.2rem',
                outline: 'none',
                padding: '0 16px',
                fontFamily: 'inherit'
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && results.length > 0) {
                  results[0].action();
                  onClose();
                }
              }}
            />
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.1)', padding: '4px 8px', borderRadius: '4px' }}>ESC</div>
          </div>

          <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {results.length > 0 ? (
              <div style={{ padding: '8px' }}>
                {results.map((res, i) => (
                  <div
                    key={res.id}
                    className="command-item"
                    onClick={() => {
                      res.action();
                      onClose();
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      padding: '12px 16px',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      color: 'var(--text-primary)',
                      transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div style={{ color: 'var(--text-muted)' }}>{res.icon}</div>
                    <div style={{ flex: 1, fontWeight: 500 }}>{res.title}</div>
                    {i === 0 && <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>ENTER</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>
                No results found for "{query}"
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
