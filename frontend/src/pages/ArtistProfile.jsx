import { useState, useEffect } from 'react';
import { useParams, useOutletContext, useNavigate } from 'react-router-dom';
import { Play, Pause, ChevronLeft, Disc, Download } from 'lucide-react';

export default function ArtistProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [bio, setBio] = useState('');
  const [, setBioLoading] = useState(false);
  
  const { togglePlay, currentTrackId, isPlaying, handleDownload } = useOutletContext();

  const isTrackCurrent = (track) => currentTrackId === String(track.provider_id);
  const showPauseIcon = (track) => isTrackCurrent(track) && isPlaying;

  useEffect(() => {
    const fetchArtist = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/artist/${id}`);
        if (res.ok) {
          const d = await res.json();
          setData(d);
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchArtist();
  }, [id]);

  useEffect(() => {
    if (data && data.artist && data.artist.name) {
      setBioLoading(true);
      const url = `https://en.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&titles=${encodeURIComponent(data.artist.name)}&format=json&origin=*`;
      fetch(url)
        .then(res => res.json())
        .then(d => {
          if (d.query && d.query.pages) {
            const pages = Object.values(d.query.pages);
            if (pages.length > 0 && pages[0].extract) {
              // Strip HTML tags for clean display or inject safely
              setBio(pages[0].extract);
            }
          }
          setBioLoading(false);
        })
        .catch(() => setBioLoading(false));
    }
  }, [data]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Loading Artist...</h2>
      </div>
    );
  }

  if (!data || !data.artist) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
        <h2 style={{ color: 'var(--text-muted)' }}>Artist not found</h2>
      </div>
    );
  }

  const { artist, albums, top_tracks } = data;

  return (
    <div style={{ padding: '0 20px', paddingBottom: '40px', overflowY: 'auto', height: '100%' }} className="hide-scrollbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px', marginTop: '16px' }}>
        <button onClick={() => navigate(-1)} style={{ border: 'none', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '8px', borderRadius: '50%', background: 'var(--bg-surface)' }}>
          <ChevronLeft size={24} />
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '32px', marginBottom: '40px' }}>
        <img 
          src={artist.picture_url || 'https://via.placeholder.com/300'} 
          alt={artist.name} 
          onError={(e) => { e.target.onerror = null; e.target.src = 'https://via.placeholder.com/300?text=No+Photo'; }}
          style={{ width: '250px', height: '250px', borderRadius: '50%', objectFit: 'cover', boxShadow: '0 20px 40px rgba(0,0,0,0.4)', background: 'var(--bg-surface-hover)' }}
        />
        <div>
          <h1 style={{ fontSize: '4rem', margin: 0, fontWeight: 800, textShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>{artist.name}</h1>
          <div style={{ fontSize: '1.2rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Artist</div>
        </div>
      </div>

      {bio && (
        <div style={{ marginBottom: '40px', color: 'var(--text-secondary)', fontSize: '1.1rem', lineHeight: 1.6, maxWidth: '800px' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontWeight: 700, color: 'white' }}>About</h2>
          <div 
            dangerouslySetInnerHTML={{ __html: bio }} 
          />
        </div>
      )}

      {top_tracks && top_tracks.length > 0 && (
        <div style={{ marginBottom: '40px' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '16px', fontWeight: 700 }}>Top Tracks</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {top_tracks.map((track, idx) => (
              <div 
                key={track.provider_id}
                className="glass-panel"
                style={{ display: 'flex', alignItems: 'center', padding: '12px 24px', borderRadius: '16px', transition: 'background 0.2s', cursor: 'pointer' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-surface-hover)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'var(--bg-surface)'}
                onClick={() => togglePlay(track, top_tracks)}
              >
                <div style={{ width: '32px', textAlign: 'center', color: 'var(--text-muted)', fontWeight: 600 }}>{idx + 1}</div>
                <img src={track.cover_url} alt="Cover" style={{ width: '56px', height: '56px', borderRadius: '8px', marginRight: '20px', objectFit: 'cover' }} />
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: 'white', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '1.1rem', marginBottom: '4px' }}>{track.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                    {artist.name} {track.release_date && ` • ${track.release_date.split('-')[0]}`}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                  <button 
                    className="btn-secondary" 
                    onClick={(e) => { e.stopPropagation(); togglePlay(track, top_tracks); }}
                    style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isTrackCurrent(track) ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'white' }}
                  >
                    {showPauseIcon(track) ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                  </button>

                  <button 
                    className="btn-primary" 
                    onClick={(e) => handleDownload(track, e)}
                    style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    title="Download"
                  >
                    <Download size={18} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {albums && albums.length > 0 && (
        <div>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '24px', fontWeight: 700 }}>Albums</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '24px' }}>
            {albums.map((album) => (
              <div 
                key={album.id}
                className="glass-panel"
                style={{ padding: '16px', borderRadius: '16px', cursor: 'pointer', transition: 'transform 0.2s, background 0.2s' }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.background = 'var(--bg-surface-hover)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.background = 'var(--bg-surface)'; }}
                onClick={() => navigate(`/album/${album.id}`)}
              >
                <div style={{ width: '100%', aspectRatio: '1/1', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px', boxShadow: '0 10px 20px rgba(0,0,0,0.3)' }}>
                  {album.cover_url ? (
                    <img src={album.cover_url} alt={album.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: '100%', height: '100%', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Disc size={48} color="var(--text-muted)" />
                    </div>
                  )}
                </div>
                <h3 style={{ fontSize: '1.1rem', margin: '0 0 4px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: 600 }}>{album.title}</h3>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>{album.release_date ? album.release_date.split('-')[0] : 'Album'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
