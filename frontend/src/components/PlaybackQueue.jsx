import React from 'react';
import { motion, Reorder } from 'framer-motion';
import { X, Play, Music, Trash2 } from 'lucide-react';

export default function PlaybackQueue({ playlist, currentTrackIndex, setPlaylist, togglePlay, onClose }) {
  const startIndex = currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0;
  const [localPlaylist, setLocalPlaylist] = React.useState((playlist || []).slice(startIndex));

  React.useEffect(() => {
    setLocalPlaylist((playlist || []).slice(startIndex));
  }, [playlist, startIndex]);

  const handleDragEnd = () => {
    if (!playlist) return;
    const newPlaylist = [
      ...playlist.slice(0, startIndex),
      ...localPlaylist
    ];
    setPlaylist(newPlaylist);
  };

  if (!playlist) return null;

  return (
    <motion.div 
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="glass-panel"
      style={{
        position: 'fixed',
        bottom: '100px', // Above player bar
        right: '24px',
        width: '400px',
        maxHeight: '60vh',
        borderRadius: '24px',
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
      }}
    >
      <div style={{ padding: '20px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Music size={20} color="var(--accent-solid)" />
          Up Next
        </h3>
        <button 
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        <Reorder.Group layoutScroll axis="y" values={localPlaylist} onReorder={setLocalPlaylist} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {localPlaylist.map((track, i) => {
            // Find its original index to see if it's currently playing
            const origIndex = playlist.findIndex(t => t.provider_id === track.provider_id);
            const isPlaying = origIndex === currentTrackIndex && currentTrackIndex !== -1;
            
            // Generate a safe key just in case
            const safeKey = track.provider_id ? `${track.provider_id}-${i}` : `track-${i}`;

            return (
              <Reorder.Item key={safeKey} value={track} style={{ marginBottom: '8px' }} onDragEnd={handleDragEnd}>
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '12px', 
                    borderRadius: '12px',
                    background: isPlaying ? 'rgba(37, 117, 252, 0.1)' : 'var(--bg-surface)',
                    border: isPlaying ? '1px solid var(--accent-solid)' : '1px solid transparent',
                    cursor: 'grab'
                  }}
                >
                  <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', marginRight: '12px', position: 'relative' }}>
                    <img src={track.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div 
                      onClick={() => togglePlay(track, playlist)}
                      style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, cursor: 'pointer', transition: 'opacity 0.2s' }}
                      onMouseEnter={(e) => e.currentTarget.style.opacity = 1}
                      onMouseLeave={(e) => e.currentTarget.style.opacity = 0}
                    >
                      <Play size={16} fill="white" />
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: isPlaying ? 'var(--accent-solid)' : 'white', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists?.join(', ')}</div>
                  </div>
                  <button 
                    onClick={() => {
                      const newLocal = [...localPlaylist];
                      newLocal.splice(i, 1);
                      setLocalPlaylist(newLocal);
                      const newFull = [...playlist.slice(0, startIndex), ...newLocal];
                      setPlaylist(newFull);
                    }}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </Reorder.Item>
            );
          })}
        </Reorder.Group>
        {localPlaylist.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
            Queue is empty
          </div>
        )}
      </div>
    </motion.div>
  );
}
