import React from 'react';
import { motion, Reorder } from 'framer-motion';
import { X, Play, Music, Trash2 } from 'lucide-react';


export default function PlaybackQueue({ playlist, currentTrackIndex, setPlaylist, togglePlay, onClose }) {
  const safeIndex = currentTrackIndex >= 0 && currentTrackIndex < (playlist?.length || 0)
    ? currentTrackIndex
    : (playlist || []).findIndex((t, i) => i === 0);

  const nowPlaying = safeIndex >= 0 ? playlist[safeIndex] : null;
  const upNext = safeIndex >= 0 ? (playlist || []).slice(safeIndex + 1) : (playlist || []);
  const [localUpNext, setLocalUpNext] = React.useState(upNext);

  React.useEffect(() => {
    setLocalUpNext(upNext);
  }, [playlist, safeIndex]);

  const handleDragEnd = () => {
    if (!playlist || safeIndex < 0) return;
    setPlaylist([...playlist.slice(0, safeIndex + 1), ...localUpNext]);
  };

  if (!playlist?.length) return null;

  return (
    <motion.div 
      initial={{ y: '100%', opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="glass-panel"
      data-testid="playback-queue-panel"
      style={{
        position: 'fixed',
        bottom: '100px',
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
          Queue
        </h3>
        <button 
          onClick={onClose}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={20} />
        </button>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
        {nowPlaying && (
          <div style={{ marginBottom: '16px' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
              Now Playing
            </div>
            <QueueRow track={nowPlaying} isActive onPlay={() => togglePlay(nowPlaying, playlist)} />
          </div>
        )}

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '8px', paddingLeft: '4px' }}>
          Up Next
        </div>

        {localUpNext.length > 0 ? (
          <Reorder.Group layoutScroll axis="y" values={localUpNext} onReorder={setLocalUpNext} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {localUpNext.map((track, i) => {
              const safeKey = track.provider_id ? `${track.provider_id}-next-${i}` : `track-next-${i}`;
              return (
                <Reorder.Item key={safeKey} value={track} style={{ marginBottom: '8px' }} onDragEnd={handleDragEnd}>
                  <QueueRow
                    track={track}
                    onPlay={() => togglePlay(track, playlist)}
                    onRemove={() => {
                      const next = [...localUpNext];
                      next.splice(i, 1);
                      setLocalUpNext(next);
                      if (safeIndex >= 0) {
                        setPlaylist([...playlist.slice(0, safeIndex + 1), ...next]);
                      }
                    }}
                  />
                </Reorder.Item>
              );
            })}
          </Reorder.Group>
        ) : (
          <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No more tracks in queue
          </div>
        )}
      </div>
    </motion.div>
  );
}

function QueueRow({ track, isActive, onPlay, onRemove }) {
  return (
    <div 
      style={{ 
        display: 'flex', 
        alignItems: 'center', 
        padding: '12px', 
        borderRadius: '12px',
        background: isActive ? 'rgba(37, 117, 252, 0.12)' : 'var(--bg-surface)',
        border: isActive ? '1px solid var(--accent-solid)' : '1px solid transparent',
        cursor: onRemove ? 'grab' : 'default'
      }}
    >
      <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', marginRight: '12px', position: 'relative' }}>
        <img src={track.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <div 
          onClick={onPlay}
          style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, cursor: 'pointer', transition: 'opacity 0.2s' }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = 1; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = 0; }}
        >
          <Play size={16} fill="white" />
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: isActive ? 'var(--accent-solid)' : 'white', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists?.join(', ')}</div>
      </div>
      {onRemove && (
        <button 
          onClick={onRemove}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
        >
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}
