import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ListMusic, Plus, Play } from 'lucide-react';
import { showToast } from '../utils/toast';

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const { lang, libraryRevision } = useOutletContext();

  const getToken = () => localStorage.getItem('tidal-token');

  const loadPlaylists = async () => {
    const token = getToken();
    if (!token) return;
    try {
      const res = await fetch('/api/playlists', { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.map(p => ({
          ...p,
          tracks: JSON.parse(p.tracks_json || '[]'),
        })));
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadPlaylists();
  }, [libraryRevision]);

  const createPlaylist = async () => {
    const name = prompt(lang === 'ru' ? 'Введите название плейлиста' : 'Enter playlist name');
    if (!name) return;
    const token = getToken();
    if (!token) {
      showToast(lang === 'ru' ? 'Войдите в аккаунт' : 'Please log in');
      return;
    }
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      await loadPlaylists();
      showToast(lang === 'ru' ? 'Плейлист создан' : 'Playlist created');
    }
  };

  return (
    <div style={{ padding: '24px 40px', paddingBottom: '120px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '32px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', margin: '0 0 8px', background: 'var(--text-gradient)', WebkitBackgroundClip: 'text', color: 'transparent' }}>
            {lang === 'ru' ? 'Мои Плейлисты' : 'My Playlists'}
          </h1>
          <p style={{ color: 'var(--text-secondary)', margin: 0, fontSize: '1.1rem' }}>
            {lang === 'ru' ? 'Ваши коллекции и подборки' : 'Your collections and curations'}
          </p>
        </div>
        <button 
          onClick={createPlaylist}
          className="btn-primary" 
          style={{ padding: '12px 24px', borderRadius: '30px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}
        >
          <Plus size={20} />
          {lang === 'ru' ? 'Новый плейлист' : 'New Playlist'}
        </button>
      </div>

      {playlists.length === 0 ? (
        <div style={{ textAlign: 'center', marginTop: '100px', color: 'var(--text-muted)' }}>
          <ListMusic size={64} style={{ opacity: 0.2, marginBottom: '16px' }} />
          <h2>{lang === 'ru' ? 'У вас пока нет плейлистов' : 'You have no playlists yet'}</h2>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '24px' }}>
          {playlists.map((pl, i) => (
            <motion.div 
              key={pl.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-panel"
              style={{ padding: '16px', cursor: 'pointer', transition: 'all 0.3s ease', display: 'flex', flexDirection: 'column', gap: '12px' }}
              whileHover={{ y: -5, scale: 1.02 }}
            >
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', position: 'relative', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {pl.tracks[0]?.cover_url ? (
                  <img src={pl.tracks[0].cover_url} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <ListMusic size={48} color="var(--text-muted)" />
                )}
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px', fontSize: '1.1rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</h3>
                <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                  {pl.tracks.length} {lang === 'ru' ? 'треков' : 'tracks'}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
