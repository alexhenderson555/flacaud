import { useState, useEffect, Fragment } from 'react';
import { showToast } from '../utils/toast';
import { useParams, useOutletContext, useNavigate, Link } from 'react-router-dom';
import { Play, ChevronLeft, Download, Check, Heart, Plus } from 'lucide-react';
import PlaylistModal from '../components/PlaylistModal';
import { toggleLibraryTrack } from '../utils/library';
import { cacheAudioTrack } from '../utils/cache';

export default function AlbumView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  
  const { togglePlay, playingTrackId, downloadedTracks } = useOutletContext();
  const [libraryIds, setLibraryIds] = useState(new Set());

  useEffect(() => {
    const saved = localStorage.getItem('tidal-library');
    if (saved) {
      try {
        const lib = JSON.parse(saved);
        setLibraryIds(new Set(lib.map(t => t.provider_id)));
      } catch { /* ignore */ }
    }
  }, []);

  const toggleLike = async (track, e) => {
    e.stopPropagation();
    const added = await toggleLibraryTrack(track);
    if (added) {
      libraryIds.add(track.provider_id);
    } else {
      libraryIds.delete(track.provider_id);
    }
    setLibraryIds(new Set(libraryIds));
  };

  const handleDownload = async (track, e) => {
    e.stopPropagation();
    if (downloadedTracks?.has(track.provider_id)) return;
    
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('tidal-token') || ''}` },
        body: JSON.stringify({
          url: track.source_url,
          quality: 'LOSSLESS',
          lyrics: true,
          karaoke: false,
          dj_analyze: false
        })
      });
      if (res.ok) {
        // Cache in browser
        cacheAudioTrack(track, 'LOSSLESS').then(() => {});
        showToast(`Started downloading: ${track.title}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

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

      <div>
        <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px 12px 16px', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px' }}>
          <div style={{ width: '32px', textAlign: 'center' }}>#</div>
          <div style={{ flex: 1, paddingLeft: '16px' }}>Title</div>
          <div style={{ width: '200px', textAlign: 'right', paddingRight: '16px' }}>Actions</div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '12px' }}>
          {tracks.map((track, idx) => (
            <div 
              key={track.provider_id}
              className="glass-panel"
              style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', borderRadius: '12px', transition: 'background 0.2s', cursor: 'pointer', marginBottom: '4px' }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              onClick={() => togglePlay(track, tracks)}
            >
              <div style={{ width: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>{track.track_number || idx + 1}</div>
              
              <div style={{ flex: 1, paddingLeft: '16px', minWidth: 0 }}>
                <div style={{ fontWeight: playingTrackId === track.provider_id ? 700 : 500, color: playingTrackId === track.provider_id ? 'var(--accent-solid)' : 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {track.title}
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {track.artists?.map((artistName, i) => {
                     const artistId = track.artist_ids?.[i];
                     return (
                       <Fragment key={i}>
                         {i > 0 && ", "}
                         {artistId ? (
                           <Link to={`/artist/${artistId}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                             {artistName}
                           </Link>
                         ) : artistName}
                       </Fragment>
                     );
                  })}
                </div>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button onClick={(e) => toggleLike(track, e)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Heart size={20} fill={libraryIds.has(track.provider_id) ? "var(--accent-solid)" : "none"} color={libraryIds.has(track.provider_id) ? "var(--accent-solid)" : "var(--text-muted)"} />
                </button>
                <button onClick={(e) => { e.stopPropagation(); setPlaylistModalTrack(track); }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                  <Plus size={20} color="var(--text-muted)" />
                </button>
                <button 
                  className="btn-primary" 
                  onClick={(e) => handleDownload(track, e)}
                  style={{ padding: '8px', borderRadius: '50%', display: 'flex', alignItems: 'center', opacity: downloadedTracks?.has(track.provider_id) ? 0.7 : 1 }}
                >
                  {downloadedTracks?.has(track.provider_id) ? <Check size={16} /> : <Download size={16} />}
                </button>
              </div>
            </div>
          ))}
        </div>
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
