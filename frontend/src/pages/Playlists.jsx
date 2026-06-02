import React, { useState, useEffect } from 'react';
import { useOutletContext } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ListMusic, Plus, Play, MoreVertical } from 'lucide-react';
import { showToast } from '../utils/toast';

export default function Playlists() {
  const [playlists, setPlaylists] = useState([]);
  const { lang, t } = useOutletContext();

  useEffect(() => {
    // In the future, this would fetch from /api/playlists
    // For now, let's load from localStorage
    const saved = localStorage.getItem('tidal-user-playlists');
    if (saved) {
      setPlaylists(JSON.parse(saved));
    }
  }, []);

  const createPlaylist = () => {
    const name = prompt(lang === 'ru' ? 'Введите название плейлиста' : 'Enter playlist name');
    if (name) {
      const newPlaylist = { id: Date.now(), name, tracks: [], cover: 'https://via.placeholder.com/150/1a1a2e/2575fc?text=' + encodeURIComponent(name.charAt(0).toUpperCase()) };
      const updated = [...playlists, newPlaylist];
      setPlaylists(updated);
      localStorage.setItem('tidal-user-playlists', JSON.stringify(updated));
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
          <p>{lang === 'ru' ? 'Создайте свой первый плейлист, чтобы начать собирать любимые треки.' : 'Create your first playlist to start collecting your favorite tracks.'}</p>
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
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                <img src={pl.cover} alt={pl.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                <div className="hover-overlay" style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }}>
                  <button className="btn-primary" style={{ padding: '12px', borderRadius: '50%' }}>
                    <Play fill="currentColor" size={24} />
                  </button>
                </div>
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
      
      <style dangerouslySetInnerHTML={{__html: `
        .glass-panel:hover .hover-overlay {
          opacity: 1 !important;
        }
      `}} />
    </div>
  );
}
