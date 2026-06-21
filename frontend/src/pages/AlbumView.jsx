import { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { Play, ChevronLeft, Heart } from 'lucide-react';
import PlaylistModal from '../components/PlaylistModal';
import LibraryTrackRow from '../components/LibraryTrackRow';

export default function AlbumView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  
  const {
    togglePlay,
    currentTrackId,
    isPlaying,
    isLoading,
    likedTracks,
    toggleLike,
    handleDownload,
    downloadedTracks,
    t: globalT,
  } = useOutletContext();

  const rowT = globalT || ((k) => k);

  useEffect(() => {
    const fetchAlbum = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/album/${id}`);
        if (res.ok) {
          const d = await res.json();
          setData(d);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchAlbum();
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Loading Album...</h2>
      </div>
    );
  }

  if (!data || !data.album) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Album not found</h2>
      </div>
    );
  }

  const { album, tracks } = data;

  return (
    <div style={{ padding: '0 20px', paddingBottom: '40px', overflowY: 'auto', height: '100%' }} className="hide-scrollbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', marginTop: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '50%', background: 'var(--bg-surface)' }}>
          <ChevronLeft size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '32px', marginBottom: '40px' }}>
        <div style={{ width: '250px', height: '250px', borderRadius: '16px', overflow: 'hidden', flexShrink: 0, boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
          {album.cover_url && (
            <img src={album.cover_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '1rem', color: 'white', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600, marginBottom: '8px' }}>Album</div>
          <h1 style={{ fontSize: '3.5rem', margin: 0, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1.2, marginBottom: '12px' }}>{album.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            {album.artist && (
              <Link to={`/artist/${album.artist.id}`} style={{ color: 'white', textDecoration: 'none', fontWeight: 600 }}>
                {album.artist.name}
              </Link>
            )}
            <span>•</span>
            <span>{album.releaseDate ? album.releaseDate.split('-')[0] : ''}</span>
            <span>•</span>
            <span>{tracks.length} tracks</span>
          </div>
          <div style={{ display: 'flex', gap: '16px', marginTop: '24px' }}>
            <button 
              className="btn-primary" 
              style={{ borderRadius: '24px', padding: '12px 32px', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}
              onClick={() => {
                if (tracks.length > 0) {
                  togglePlay(tracks[0], tracks);
                }
              }}
            >
              <Play size={20} fill="currentColor" /> Play Album
            </button>
            <button 
              className="btn-secondary" 
              style={{ borderRadius: '24px', padding: '12px 24px', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.1)', border: 'none', color: 'white', cursor: 'pointer' }}
              onClick={() => {
                const saved = localStorage.getItem('tidal-playlists');
                let playlists = saved ? JSON.parse(saved) : [];
                playlists.push({
                  id: Date.now().toString(),
                  name: album.title,
                  tracks: tracks,
                  createdAt: new Date().toISOString()
                });
                localStorage.setItem('tidal-playlists', JSON.stringify(playlists));
                showToast(`Album saved to Library as Playlist: ${album.title}`);
              }}
            >
              <Heart size={20} /> Save to Library
            </button>
          </div>
        </div>
      </div>

      <div className="track-list">
        {tracks.map((track, idx) => (
          <LibraryTrackRow
            key={track.provider_id}
            track={track}
            index={idx}
            list={tracks}
            t={rowT}
            likedTracks={likedTracks}
            downloadedTracks={downloadedTracks}
            currentTrackId={currentTrackId}
            isPlaying={isPlaying}
            isLoading={isLoading}
            onTogglePlay={togglePlay}
            onToggleLike={toggleLike}
            onAddToPlaylist={(tr, e) => { e.stopPropagation(); setPlaylistModalTrack(tr); }}
            onDownload={handleDownload}
            testIdPrefix="album"
          />
        ))}
      </div>
      
      {playlistModalTrack && (
        <PlaylistModal 
          track={playlistModalTrack} 
          onClose={() => setPlaylistModalTrack(null)} 
        />
      )}
    </div>
  );
}
