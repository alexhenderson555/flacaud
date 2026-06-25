import { useState, useEffect } from 'react';
import { X, Plus, ListMusic } from 'lucide-react';
import { motion } from 'framer-motion';
import { apiGetJson, apiPostJson, apiPutJson } from '../utils/apiClient';
import { getAccessToken } from '../utils/tokenStorage';

export default function PlaylistModal({ track, onClose, onUpdated }) {
  const [playlists, setPlaylists] = useState([]);
  const [newPlaylistName, setNewPlaylistName] = useState('');

  const isLoggedIn = () => Boolean(getAccessToken());

  useEffect(() => {
    const fetchPlaylists = async () => {
      if (isLoggedIn()) {
        try {
          const data = await apiGetJson('/api/playlists', { auth: true });
          setPlaylists(data.map((p) => ({ ...p, tracks: JSON.parse(p.tracks_json || '[]') })));
        } catch (e) { console.error(e); }
      } else {
        const saved = localStorage.getItem('tidal-playlists');
        if (saved) {
          try { setPlaylists(JSON.parse(saved)); } catch (e) { console.error(e); }
        }
      }
    };
    fetchPlaylists();
  }, []);

  const savePlaylists = (newPlaylists) => {
    setPlaylists(newPlaylists);
    localStorage.setItem('tidal-playlists', JSON.stringify(newPlaylists));
  };

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;

    let newPlaylist = { id: Date.now().toString(), name: newPlaylistName, tracks: track ? [track] : [] };

    if (isLoggedIn()) {
      try {
        const dbData = await apiPostJson('/api/playlists', { name: newPlaylistName }, { auth: true });
        const tracks = track ? [track] : [];
        newPlaylist = { ...dbData, tracks };
        if (track) {
          await apiPutJson(`/api/playlists/${newPlaylist.id}`, { tracks }, { auth: true });
        }
      } catch (e) { console.error(e); }
    }

    const newList = [...playlists, newPlaylist];
    savePlaylists(newList);
    setNewPlaylistName('');
    onUpdated?.();
    if (track) onClose();
  };

  const addToPlaylist = async (playlistId) => {
    if (!track) return;

    let updatedPlaylist = null;
    const newPlaylists = playlists.map(p => {
      if (p.id === playlistId) {
        if (!p.tracks.find(t => String(t.provider_id) === String(track.provider_id))) {
          updatedPlaylist = { ...p, tracks: [...p.tracks, track] };
          return updatedPlaylist;
        }
      }
      return p;
    });

    savePlaylists(newPlaylists);

    if (isLoggedIn() && updatedPlaylist) {
      try {
        await apiPutJson(`/api/playlists/${playlistId}`, { tracks: updatedPlaylist.tracks }, { auth: true });
      } catch (e) { console.error(e); }
    }

    onUpdated?.();
    onClose();
  };

  return (
    <div 
      onClick={onClose} 
      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
    >
      <motion.div 
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="glass-panel"
        data-testid="playlist-modal"
        onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: '400px', padding: '24px', borderRadius: '24px', display: 'flex', flexDirection: 'column', gap: '16px', background: 'var(--bg-surface)' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0 }}>
            {track ? 'Add to Playlist' : 'Create Playlist'}
          </h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
            <X size={24} />
          </button>
        </div>

        {track && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px', borderRadius: '16px', background: 'var(--bg-surface-hover)', marginBottom: '8px' }}>
            <img src={track.cover_url} alt="Cover" style={{ width: '48px', height: '48px', borderRadius: '8px', objectFit: 'cover' }} />
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.title}</div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{track.artists?.join(', ')}</div>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '8px' }}>
          <input 
            type="text" 
            placeholder="New Playlist Name..." 
            data-testid="playlist-name-input"
            value={newPlaylistName}
            onChange={e => setNewPlaylistName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && createPlaylist()}
            style={{ flex: 1, height: '48px', padding: '0 16px', borderRadius: '16px', background: 'var(--bg-dark)', border: '1px solid var(--border-subtle)', color: 'white', outline: 'none' }}
          />
          <button 
            onClick={createPlaylist}
            disabled={!newPlaylistName.trim()}
            data-testid="playlist-create-btn"
            className="btn-primary"
            style={{ height: '48px', padding: '0 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '8px', cursor: !newPlaylistName.trim() ? 'not-allowed' : 'pointer' }}
          >
            <Plus size={20} /> {track ? 'Create & Add' : 'Create'}
          </button>
        </div>

        {track && playlists.length > 0 && (
          <div style={{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>Existing Playlists</div>
            {playlists.map(p => (
              <button 
                key={p.id}
                data-testid={`playlist-option-${p.id}`}
                onClick={() => addToPlaylist(p.id)}
                style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '16px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', transition: 'background 0.2s' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--accent-solid)', flexShrink: 0 }}>
                  <ListMusic size={20} />
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'white' }}>{p.name}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{p.tracks.length} tracks</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
