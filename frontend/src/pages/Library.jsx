import React, { useState, useEffect } from 'react';
import { showToast } from '../utils/toast';
import { useOutletContext, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Heart, Download, Disc, Play, Pause, Trash2, ListMusic, Plus, ChevronLeft, Check, Search } from 'lucide-react';
import PlaylistModal from '../components/PlaylistModal';
import CamelotWheel from '../components/CamelotWheel';

export default function Library() {
  const [library, setLibrary] = useState([]);
  const [playlists, setPlaylists] = useState([]);
  const [activeTab, setActiveTab] = useState('tracks'); // 'tracks' | 'playlists'
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [playlistModalTrack, setPlaylistModalTrack] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('newest'); // 'newest' | 'oldest' | 'title'
  const [filterKey, setFilterKey] = useState(null);
  const [filterBpmRange, setFilterBpmRange] = useState({ min: 60, max: 200 });
  const [showDjFilters, setShowDjFilters] = useState(false);

  const { togglePlay: playerContextTogglePlay, playingTrackId, downloadedTracks } = useOutletContext();

  const togglePlay = (track, contextList) => {
    playerContextTogglePlay(track, contextList);
  };

  const getToken = () => localStorage.getItem('tidal-token');

  useEffect(() => {
    const fetchData = async () => {
      const token = getToken();
      if (token) {
        try {
          const [libRes, pRes] = await Promise.all([
            fetch('/api/library', { headers: { Authorization: `Bearer ${token}` } }),
            fetch('/api/playlists', { headers: { Authorization: `Bearer ${token}` } })
          ]);
          if (libRes.ok) {
            const data = await libRes.json();
            // Parse artists_json back to artists array
            const mappedLib = data.map(t => ({
              ...t,
              artists: JSON.parse(t.artists_json || '[]')
            }));
            setLibrary(mappedLib);
          }
          if (pRes.ok) {
            const data = await pRes.json();
            const mappedPlaylists = data.map(p => ({
              ...p,
              tracks: JSON.parse(p.tracks_json || '[]')
            }));
            setPlaylists(mappedPlaylists);
          }
        } catch (e) { console.error("Failed to load from DB", e); }
      } else {
        // Fallback to local
        const savedLib = localStorage.getItem('tidal-library');
        if (savedLib) try { setLibrary(JSON.parse(savedLib)); } catch (e) { }
        const savedPlaylists = localStorage.getItem('tidal-playlists');
        if (savedPlaylists) try { setPlaylists(JSON.parse(savedPlaylists)); } catch (e) { }
      }
    };
    fetchData();
  }, []);

  const saveLibrary = async (newLib) => {
    setLibrary(newLib);
    localStorage.setItem('tidal-library', JSON.stringify(newLib));
    // For syncing deletes to DB, we do it in removeFromLibrary instead.
  };

  const savePlaylists = async (newPlaylists) => {
    setPlaylists(newPlaylists);
    localStorage.setItem('tidal-playlists', JSON.stringify(newPlaylists));
  };

  const removeFromLibrary = async (id) => {
    const newLib = library.filter(t => t.provider_id !== id);
    setLibrary(newLib);
    localStorage.setItem('tidal-library', JSON.stringify(newLib));
    
    const token = getToken();
    if (token) {
      // Find the DB track id
      const track = library.find(t => t.provider_id === id);
      if (track && track.id) {
        await fetch(`/api/library/${track.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
    }
  };

  const removeFromPlaylist = async (playlistId, trackId) => {
    let updatedPlaylist = null;
    const newPlaylists = playlists.map(p => {
      if (p.id === playlistId) {
        updatedPlaylist = { ...p, tracks: p.tracks.filter(t => t.provider_id !== trackId) };
        return updatedPlaylist;
      }
      return p;
    });
    setPlaylists(newPlaylists);
    localStorage.setItem('tidal-playlists', JSON.stringify(newPlaylists));
    
    const token = getToken();
    if (token && updatedPlaylist) {
      await fetch(`/api/playlists/${playlistId}?tracks_json=${encodeURIComponent(JSON.stringify(updatedPlaylist.tracks))}`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
    }
  };

  const deletePlaylist = async (playlistId) => {
    if (confirm("Are you sure you want to delete this playlist?")) {
      const newPlaylists = playlists.filter(p => p.id !== playlistId);
      setPlaylists(newPlaylists);
      localStorage.setItem('tidal-playlists', JSON.stringify(newPlaylists));
      
      const token = getToken();
      if (token) {
        await fetch(`/api/playlists/${playlistId}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      savePlaylists(newPlaylists);
      setSelectedPlaylistId(null);
    }
  };

  const handleDownload = async (track, e) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: track.source_url, quality: 'LOSSLESS' })
      });
      if (res.ok) {
        const data = await res.json();
        const saved = localStorage.getItem('tidal-queue-jobs');
        const jobs = saved ? JSON.parse(saved) : [];
        jobs.push(data.job_id);
        localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
        showToast(`Downloading ${track.title} to queue!`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const renderTrack = (track, i, contextList, onRemove) => (
    <motion.div 
      key={`${track.provider_id}-${i}`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: i * 0.05 }}
      className="glass-panel"
      style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '16px 20px', marginBottom: '12px' }}
    >
      <div style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '12px', overflow: 'hidden', flexShrink: 0 }}>
        {track.cover_url ? (
          <img src={track.cover_url} alt="Cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', background: 'var(--bg-surface-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            <Disc size={24} />
          </div>
        )}
      </div>
      
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '1.1rem', fontWeight: 600, color: 'white', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {track.title} {track.version ? `(${track.version})` : ''}
        </div>
        <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {track.artists?.map((artistName, idx) => {
             const artistId = track.artist_ids?.[idx];
             return (
               <React.Fragment key={idx}>
                 {idx > 0 && ", "}
                 {artistId ? (
                   <Link to={`/artist/${artistId}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                     {artistName}
                   </Link>
                 ) : artistName}
               </React.Fragment>
             );
          })}
          {track.album && (
            <>
               <span> • </span>
               {track.album_id ? (
                 <Link to={`/album/${track.album_id}`} onClick={e => e.stopPropagation()} style={{ color: 'inherit', textDecoration: 'none' }} onMouseEnter={e => e.target.style.textDecoration='underline'} onMouseLeave={e => e.target.style.textDecoration='none'}>
                   {track.album}
                 </Link>
               ) : track.album}
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-solid)', fontSize: '0.85rem', fontWeight: 600, background: 'rgba(37, 117, 252, 0.1)', padding: '6px 12px', borderRadius: '12px' }}>
          <Disc size={14} /> {track.quality || 'FLAC'}
        </div>

        <button 
          className="btn-secondary" 
          onClick={(e) => { e.stopPropagation(); togglePlay(track, contextList); }}
          style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: playingTrackId === track.provider_id ? 'var(--accent-glow)' : 'var(--bg-surface-hover)', border: '1px solid var(--border-subtle)', cursor: 'pointer', color: 'white' }}
        >
          {playingTrackId === track.provider_id ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
        </button>

        <button 
          onClick={(e) => { e.stopPropagation(); setPlaylistModalTrack(track); }}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          title="Add to Playlist"
        >
          <Plus size={20} color="var(--text-muted)" />
        </button>

        <button 
          className="btn-primary" 
          onClick={(e) => handleDownload(track, e)}
          style={{ padding: '10px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: downloadedTracks?.has(track.provider_id) ? 0.7 : 1 }}
          title={downloadedTracks?.has(track.provider_id) ? "Downloaded" : "Download"}
        >
          {downloadedTracks?.has(track.provider_id) ? <Check size={18} /> : <Download size={18} />}
        </button>

        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(track.provider_id); }}
          style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          title="Remove"
        >
          <Trash2 size={20} />
        </button>
      </div>
    </motion.div>
  );

  const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);

  const filteredLibrary = library.filter(t => {
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !(t.artists && t.artists.join(', ').toLowerCase().includes(searchQuery.toLowerCase()))) return false;
    if (filterKey && t.key !== filterKey) return false;
    if (t.bpm && (t.bpm < filterBpmRange.min || t.bpm > filterBpmRange.max)) return false;
    return true;
  }).sort((a, b) => {
    if (sortOrder === 'title') return a.title.localeCompare(b.title);
    if (sortOrder === 'oldest') return -1; // Basic reverse of newest
    return 1; // Default is 'newest' (which is the natural order since we prepend on save)
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '24px' }}>
        <h2 style={{ fontSize: '3rem', fontWeight: 700, margin: 0, color: 'white' }}>Your Library</h2>
        <p style={{ color: 'var(--text-secondary)', marginTop: '8px', fontSize: '1.1rem' }}>Saved tracks and custom playlists.</p>
      </div>

      {!selectedPlaylistId ? (
        <>
          <div style={{ display: 'flex', gap: '24px', marginBottom: '24px', borderBottom: '1px solid var(--border)', paddingBottom: '16px' }}>
            <button 
              onClick={() => setActiveTab('tracks')}
              style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', color: activeTab === 'tracks' ? 'var(--accent-solid)' : 'var(--text-secondary)', transition: 'color 0.2s' }}
            >
              Liked Tracks ({library.length})
            </button>
            <button 
              onClick={() => setActiveTab('playlists')}
              style={{ background: 'transparent', border: 'none', fontSize: '1.1rem', fontWeight: 600, cursor: 'pointer', color: activeTab === 'playlists' ? 'var(--accent-solid)' : 'var(--text-secondary)', transition: 'color 0.2s' }}
            >
              Playlists ({playlists.length})
            </button>
          </div>

          <div style={{ display: 'flex', gap: '16px', marginBottom: '24px', alignItems: 'center' }}>
            <div className="glass-panel" style={{ display: 'flex', alignItems: 'center', padding: '4px 16px', borderRadius: '24px', flex: 1 }}>
              <Search size={20} color="var(--text-muted)" style={{ marginRight: '12px' }} />
              <input 
                type="text" 
                placeholder="Search library..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1rem', padding: '8px 0', outline: 'none' }}
              />
            </div>
            
            <div className="glass-panel" style={{ padding: '4px 16px', borderRadius: '24px', display: 'flex', alignItems: 'center' }}>
              <select 
                value={sortOrder} 
                onChange={(e) => setSortOrder(e.target.value)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '1rem', padding: '8px 0', cursor: 'pointer', outline: 'none' }}
              >
                <option value="newest" style={{ background: 'var(--bg-main)' }}>Newest Added</option>
                <option value="oldest" style={{ background: 'var(--bg-main)' }}>Oldest Added</option>
                <option value="title" style={{ background: 'var(--bg-main)' }}>Title (A-Z)</option>
              </select>
            </div>
            <button 
              onClick={() => setShowDjFilters(!showDjFilters)}
              style={{ background: showDjFilters ? 'var(--accent-glow)' : 'var(--bg-surface)', border: 'none', color: showDjFilters ? 'white' : 'var(--text-muted)', padding: '10px 16px', borderRadius: '24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Disc size={20} /> DJ Filters
            </button>
          </div>

          <AnimatePresence>
            {showDjFilters && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                style={{ overflow: 'hidden', marginBottom: '24px' }}
              >
                <div className="glass-panel" style={{ padding: '24px', borderRadius: '24px', display: 'flex', gap: '40px', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: '300px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem' }}>Camelot Key Filter</h3>
                    <CamelotWheel selectedKey={filterKey} onSelectKey={setFilterKey} />
                    {filterKey && (
                      <button onClick={() => setFilterKey(null)} className="btn-secondary" style={{ marginTop: '16px', padding: '6px 16px', borderRadius: '16px', fontSize: '0.9rem' }}>
                        Clear Key
                      </button>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: '300px' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '1.2rem' }}>BPM Range</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
                      <input 
                        type="range" 
                        min="60" max="200" 
                        value={filterBpmRange.min} 
                        onChange={(e) => setFilterBpmRange(p => ({ ...p, min: Math.min(e.target.value, p.max - 1) }))}
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <input 
                        type="range" 
                        min="60" max="200" 
                        value={filterBpmRange.max} 
                        onChange={(e) => setFilterBpmRange(p => ({ ...p, max: Math.max(e.target.value, p.min + 1) }))}
                        style={{ flex: 1 }}
                      />
                    </div>
                    <div style={{ textAlign: 'center', marginTop: '16px', fontSize: '1.2rem', fontWeight: 600, color: 'var(--accent-solid)' }}>
                      {filterBpmRange.min} - {filterBpmRange.max} BPM
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
            {activeTab === 'tracks' && (
              <AnimatePresence>
                {filteredLibrary.length === 0 ? (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {searchQuery ? "No tracks match your search." : "Your library is empty. Go search and save some tracks!"}
                  </motion.div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filteredLibrary.map((track, i) => renderTrack(track, i, filteredLibrary, removeFromLibrary))}
                  </div>
                )}
              </AnimatePresence>
            )}

            {activeTab === 'playlists' && (
              <div>
                <button 
                  onClick={() => setPlaylistModalTrack(true)}
                  className="btn-primary"
                  style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px', borderRadius: '20px', padding: '12px 24px', fontSize: '1rem' }}
                >
                  <Plus size={20} /> Create New Playlist
                </button>
                
                {playlists.length === 0 ? (
                  <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <ListMusic size={48} style={{ opacity: 0.3, marginBottom: '16px' }} />
                    <p>No playlists yet.</p>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                    {playlists.map(p => (
                      <div 
                        key={p.id}
                        onClick={() => setSelectedPlaylistId(p.id)}
                        className="glass-panel"
                        style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', padding: '20px', cursor: 'pointer', transition: 'transform 0.2s' }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                      >
                        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                          {p.tracks.length > 0 && p.tracks[0].cover_url ? (
                            <img src={p.tracks[0].cover_url} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)' }} alt="Playlist cover" />
                          ) : (
                            <div style={{ width: '100%', height: '100%', borderRadius: '12px', background: 'var(--bg-dark)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                              <ListMusic size={48} />
                            </div>
                          )}
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <div style={{ fontWeight: 600, fontSize: '1.1rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{p.tracks.length} tracks</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <button 
            onClick={() => setSelectedPlaylistId(null)}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', background: 'transparent', border: 'none', cursor: 'pointer', marginBottom: '24px', alignSelf: 'flex-start', fontSize: '1rem' }}
          >
            <ChevronLeft size={20} /> Back to Playlists
          </button>
          
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <h2 style={{ fontSize: '2.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '16px', margin: 0 }}>
              <ListMusic color="var(--accent-solid)" size={36} /> {selectedPlaylist?.name}
            </h2>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button 
                onClick={async () => {
                  if (!selectedPlaylist?.tracks.length) return;
                  if (confirm(`Download all ${selectedPlaylist.tracks.length} tracks?`)) {
                    for (const track of selectedPlaylist.tracks) {
                      try {
                        const res = await fetch('/api/jobs', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ url: track.source_url, quality: 'LOSSLESS' })
                        });
                        if (res.ok) {
                          const data = await res.json();
                          const saved = localStorage.getItem('tidal-queue-jobs');
                          const jobs = saved ? JSON.parse(saved) : [];
                          jobs.push(data.job_id);
                          localStorage.setItem('tidal-queue-jobs', JSON.stringify(jobs));
                        }
                      } catch (e) {
                        console.error(e);
                      }
                    }
                    showToast('Playlist download started! Check the Queue tab.');
                  }
                }}
                className="btn-primary"
                style={{ padding: '10px 20px', borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Download size={18} /> Download All
              </button>
              <button 
                onClick={() => deletePlaylist(selectedPlaylist.id)}
                style={{ padding: '10px 20px', borderRadius: '16px', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Trash2 size={18} /> Delete
              </button>
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', paddingRight: '12px' }}>
            {selectedPlaylist?.tracks.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                <p>This playlist is empty.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {selectedPlaylist?.tracks.map((t, i) => renderTrack(t, i, selectedPlaylist.tracks, (trackId) => removeFromPlaylist(selectedPlaylist.id, trackId)))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create Playlist Modal (Empty Track) */}
      {playlistModalTrack === true && (
        <PlaylistModal 
          track={null} 
          onClose={() => {
            setPlaylistModalTrack(null);
            const saved = localStorage.getItem('tidal-playlists');
            if (saved) setPlaylists(JSON.parse(saved));
          }} 
        />
      )}

      {/* Add to Playlist Modal (Specific Track) */}
      {playlistModalTrack && playlistModalTrack !== true && (
        <PlaylistModal 
          track={playlistModalTrack} 
          onClose={() => {
            setPlaylistModalTrack(null);
            const saved = localStorage.getItem('tidal-playlists');
            if (saved) setPlaylists(JSON.parse(saved));
          }} 
        />
      )}
    </div>
  );
}
